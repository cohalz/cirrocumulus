"use strict";
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const cdk_1 = require("@aws-cdk/cdk");
const aws_iam_1 = require("@aws-cdk/aws-iam");
const aws_s3_1 = require("@aws-cdk/aws-s3");
const aws_s3_deployment_1 = require("@aws-cdk/aws-s3-deployment");
const aws_ssm_1 = require("@aws-cdk/aws-ssm");
const aws_cloudtrail_1 = require("@aws-cdk/aws-cloudtrail");
const aws_events_1 = require("@aws-cdk/aws-events");
const path = __importStar(require("path"));
class DeployFiles extends cdk_1.Construct {
    constructor(scope, id, props) {
        super(scope, id);
        this.bucket = this.createBucketToDeploy(scope, props.instanceRole, props.source);
        props.instanceRole.attachManagedPolicy(new aws_iam_1.AwsManagedPolicy("service-role/AmazonEC2RoleforSSM", scope).policyArn);
        const s3Path = `${this.bucket.bucketName}/${props.source}`;
        const document = this.createDocumentToDeploy(scope, s3Path);
        this.createEventToAutoDeploy(scope, this.bucket, document.documentName, props.targets);
        new aws_ssm_1.CfnAssociation(scope, "AssociationToDeploy", {
            name: document.ref,
            scheduleExpression: "cron(0 10 ? * * *)",
            targets: props.targets
        });
    }
    createBucketToDeploy(scope, instanceRole, localDir, s3prefix) {
        const bucket = new aws_s3_1.Bucket(scope, "BucketToDeploy", {
            blockPublicAccess: aws_s3_1.BlockPublicAccess.BlockAll
        });
        instanceRole.addToPolicy(new aws_iam_1.PolicyStatement()
            .addActions("s3:Get*", "s3:List*").addResources(bucket.bucketArn, bucket.arnForObjects("*")));
        const absolutePath = path.join(process.cwd(), localDir);
        new aws_s3_deployment_1.BucketDeployment(scope, "BucketDeployment", {
            source: aws_s3_deployment_1.Source.asset(absolutePath),
            destinationBucket: bucket,
            destinationKeyPrefix: s3prefix
        });
        return bucket;
    }
    createDocumentToDeploy(scope, s3Path) {
        const commands = [
            'set -e',
            `aws --region ${cdk_1.Aws.region} s3 sync --delete --exact-timestamps s3://${s3Path} ${s3Path}`,
            `cd ${s3Path}`,
            'chmod -R +x bin/',
            'find bin/ -type f | xargs -n 1 bash',
        ];
        return new aws_ssm_1.CfnDocument(scope, "DeployCommands", {
            documentType: "Command",
            content: {
                "schemaVersion": "2.2",
                "description": "document",
                "mainSteps": [
                    {
                        "action": "aws:runShellScript",
                        "name": "runShellScript",
                        "inputs": {
                            "runCommand": commands,
                            "workingDirectory": "/home/ec2-user",
                            "timeoutSeconds": "60"
                        }
                    }
                ]
            }
        });
    }
    createEventToAutoDeploy(scope, bucket, documentName, targets) {
        const trail = new aws_cloudtrail_1.Trail(scope, "CloudTrailToDeploy", {
            enableFileValidation: false,
            includeGlobalServiceEvents: false,
            isMultiRegionTrail: false,
            managementEvents: aws_cloudtrail_1.ReadWriteType.WriteOnly,
        });
        trail.addS3EventSelector([`${bucket.bucketArn}/`], { readWriteType: aws_cloudtrail_1.ReadWriteType.WriteOnly });
        const rule = new aws_events_1.Rule(scope, "RuleToAutoDeploy", {
            eventPattern: {
                source: ["aws.s3"],
                detailType: ["AWS API Call via CloudTrail"],
                detail: {
                    eventSource: ["s3.amazonaws.com"],
                    eventName: ["PutObject"],
                    requestParameters: {
                        bucketName: [bucket.bucketName]
                    }
                }
            },
        });
        const eventPolicyDoc = new aws_iam_1.PolicyDocument()
            .addStatement(new aws_iam_1.PolicyStatement()
            .addAction("ssm:SendCommand")
            .addResources(`arn:aws:ssm:${cdk_1.Aws.region}:*:document/*`, `arn:aws:ec2:${cdk_1.Aws.region}:*:instance/*`));
        const eventPolicy = new aws_iam_1.CfnManagedPolicy(scope, "PolicyForAutoDeploy", {
            policyDocument: cdk_1.Stack.of(scope).resolve(eventPolicyDoc)
        });
        const eventRole = new aws_iam_1.Role(scope, "EventRoleForAutoDeploy", {
            assumedBy: new aws_iam_1.ServicePrincipal("events.amazonaws.com"),
            managedPolicyArns: [eventPolicy.ref]
        });
        const target = {
            bind: () => ({
                id: documentName,
                arn: `arn:aws:ssm:${cdk_1.Aws.region}:${cdk_1.Aws.accountId}:document/${documentName}`,
                role: eventRole,
                runCommandParameters: {
                    runCommandTargets: targets,
                },
            })
        };
        rule.addTarget(target);
    }
}
exports.DeployFiles = DeployFiles;
