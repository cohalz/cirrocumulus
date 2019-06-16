import { Construct, Aws, Stack } from "@aws-cdk/cdk"
import { Role, AwsManagedPolicy, PolicyDocument, PolicyStatement, CfnManagedPolicy, ServicePrincipal } from "@aws-cdk/aws-iam"
import { Bucket, BlockPublicAccess } from "@aws-cdk/aws-s3"
import { BucketDeployment, Source } from "@aws-cdk/aws-s3-deployment"

import { CfnDocument, CfnAssociation } from "@aws-cdk/aws-ssm"
import { Trail, ReadWriteType } from "@aws-cdk/aws-cloudtrail"
import { Rule, IRuleTarget } from "@aws-cdk/aws-events"

import * as path from "path"

export interface DeployFilesProps {
  /**
   * The Local directory to deploy to instance
   *
   */
  source: string

  /**
   * The instance role
   *
   */
  instanceRole: Role

  /**
   * The targets that the SSM document sends commands to
   *
   */
  targets: CfnAssociation.TargetProperty[]
}

export class DeployFiles extends Construct {
  public bucket: Bucket

  constructor(scope: Construct, id: string, props: DeployFilesProps) {
    super(scope, id)

    this.bucket = this.createBucketToDeploy(scope, props.instanceRole, props.source)

    props.instanceRole.attachManagedPolicy(new AwsManagedPolicy("service-role/AmazonEC2RoleforSSM", scope).policyArn)

    const s3Path = `${this.bucket.bucketName}/${props.source}`

    const document = this.createDocumentToDeploy(scope, s3Path)

    this.createEventToAutoDeploy(scope, this.bucket, document.documentName, props.targets)

    new CfnAssociation(scope, "AssociationToDeploy", {
      name: document.ref,
      scheduleExpression: "cron(0 10 ? * * *)",
      targets: props.targets
    })
  }

  private createBucketToDeploy(scope: Construct, instanceRole: Role, localDir: string, s3prefix?: string) {
    const bucket = new Bucket(scope, "BucketToDeploy", {
      blockPublicAccess: BlockPublicAccess.BlockAll
    })

    instanceRole.addToPolicy(new PolicyStatement()
      .addActions(
        "s3:Get*",
        "s3:List*",
      ).addResources(
        bucket.bucketArn,
        bucket.arnForObjects("*")
      )
    )

    const absolutePath = path.join(process.cwd(), localDir)
    new BucketDeployment(scope, "BucketDeployment", {
      source: Source.asset(absolutePath),
      destinationBucket: bucket,
      destinationKeyPrefix: s3prefix
    })

    return bucket
  }

  private createDocumentToDeploy(scope: Construct, s3Path: string) {
    const commands = [
      'set -e',
      `aws --region ${Aws.region} s3 sync --delete --exact-timestamps s3://${s3Path} ${s3Path}`,
      `cd ${s3Path}`,
      'chmod -R +x bin/',
      'find bin/ -type f | xargs -n 1 bash',
    ]

    return new CfnDocument(scope, "DeployCommands", {
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
    })
  }

  private createEventToAutoDeploy(scope: Construct, bucket: Bucket, documentName: string, targets: CfnAssociation.TargetProperty[]): void {
    const trail = new Trail(scope, "CloudTrailToDeploy", {
      enableFileValidation: false,
      includeGlobalServiceEvents: false,
      isMultiRegionTrail: false,
      managementEvents: ReadWriteType.WriteOnly,
    })

    trail.addS3EventSelector(
      [`${bucket.bucketArn}/`],
      { readWriteType: ReadWriteType.WriteOnly }
    )

    const rule = new Rule(scope, "RuleToAutoDeploy", {
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
    })

    const eventPolicyDoc = new PolicyDocument()
      .addStatement(new PolicyStatement()
        .addAction("ssm:SendCommand")
        .addResources(
          `arn:aws:ssm:${Aws.region}:*:document/*`,
          `arn:aws:ec2:${Aws.region}:*:instance/*`
        )
      )

    const eventPolicy = new CfnManagedPolicy(scope, "PolicyForAutoDeploy", {
      policyDocument: Stack.of(scope).resolve(eventPolicyDoc)
    })

    const eventRole = new Role(scope, "EventRoleForAutoDeploy", {
      assumedBy: new ServicePrincipal("events.amazonaws.com"),
      managedPolicyArns: [eventPolicy.ref]
    })

    const target: IRuleTarget = {
      bind: () => ({
        id: documentName,
        arn: `arn:aws:ssm:${Aws.region}:${Aws.accountId}:document/${documentName}`,
        role: eventRole,
        runCommandParameters: {
          runCommandTargets: targets,
        },
      })
    }
    rule.addTarget(target)
  }
}
