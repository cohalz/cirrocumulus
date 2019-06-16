import { ReadWriteType, Trail } from "@aws-cdk/aws-cloudtrail"
import { IRuleTarget, Rule } from "@aws-cdk/aws-events"
import {
  AwsManagedPolicy,
  CfnManagedPolicy,
  PolicyDocument,
  PolicyStatement,
  Role,
  ServicePrincipal,
} from "@aws-cdk/aws-iam"
import { BlockPublicAccess, Bucket } from "@aws-cdk/aws-s3"
import { BucketDeployment, Source } from "@aws-cdk/aws-s3-deployment"
import { CfnAssociation, CfnDocument } from "@aws-cdk/aws-ssm"
import { Aws, Construct, Stack } from "@aws-cdk/cdk"

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

    this.bucket = this.createBucketToDeploy(
      scope,
      props.instanceRole,
      props.source
    )

    props.instanceRole.attachManagedPolicy(
      new AwsManagedPolicy("service-role/AmazonEC2RoleforSSM", scope).policyArn
    )

    const s3Path = `${this.bucket.bucketName}/${props.source}`

    const document = this.createDocumentToDeploy(scope, s3Path)

    this.createEventToAutoDeploy(
      scope,
      this.bucket,
      document.documentName,
      props.targets
    )

    const association = new CfnAssociation(scope, "AssociationToDeploy", {
      name: document.ref,
      scheduleExpression: "cron(0 10 ? * * *)",
      targets: props.targets,
    })
  }

  private createBucketToDeploy(
    scope: Construct,
    instanceRole: Role,
    localDir: string
  ) {
    const bucket = new Bucket(scope, "BucketToDeploy", {
      blockPublicAccess: BlockPublicAccess.BlockAll,
    })

    instanceRole.addToPolicy(
      new PolicyStatement()
        .addActions("s3:Get*", "s3:List*")
        .addResources(bucket.bucketArn, bucket.arnForObjects("*"))
    )

    const absolutePath = path.join(process.cwd(), localDir)
    const bucketDeployment = new BucketDeployment(scope, "BucketDeployment", {
      destinationBucket: bucket,
      destinationKeyPrefix: localDir,
      source: Source.asset(absolutePath),
    })

    return bucket
  }

  private createDocumentToDeploy(scope: Construct, s3Path: string) {
    const commands = [
      "set -eux",
      `aws --region ${Aws.region} s3 sync --delete --exact-timestamps s3://${s3Path} ${s3Path}`,
      `cd ${s3Path}`,
      "chmod -R +x bin/",
      "find bin/ -type f | xargs -n 1 bash",
    ]

    return new CfnDocument(scope, "DeployCommands", {
      content: {
        description: "document",
        mainSteps: [
          {
            action: "aws:runShellScript",
            inputs: {
              runCommand: commands,
              timeoutSeconds: "60",
              workingDirectory: "/home/ec2-user",
            },
            name: "runShellScript",
          },
        ],
        schemaVersion: "2.2",
      },
      documentType: "Command",
    })
  }

  private createEventToAutoDeploy(
    scope: Construct,
    bucket: Bucket,
    documentName: string,
    targets: CfnAssociation.TargetProperty[]
  ): void {
    const trail = new Trail(scope, "CloudTrailToDeploy", {
      enableFileValidation: false,
      includeGlobalServiceEvents: false,
      isMultiRegionTrail: false,
      managementEvents: ReadWriteType.WriteOnly,
    })

    trail.addS3EventSelector([`${bucket.bucketArn}/`], {
      readWriteType: ReadWriteType.WriteOnly,
    })

    const rule = new Rule(scope, "RuleToAutoDeploy", {
      eventPattern: {
        detail: {
          eventName: ["PutObject"],
          eventSource: ["s3.amazonaws.com"],
          requestParameters: {
            bucketName: [bucket.bucketName],
          },
        },
        detailType: ["AWS API Call via CloudTrail"],
        source: ["aws.s3"],
      },
    })

    const eventPolicyDoc = new PolicyDocument().addStatement(
      new PolicyStatement()
        .addAction("ssm:SendCommand")
        .addResources(
          `arn:aws:ssm:${Aws.region}:*:document/*`,
          `arn:aws:ec2:${Aws.region}:*:instance/*`
        )
    )

    const eventPolicy = new CfnManagedPolicy(scope, "PolicyForAutoDeploy", {
      policyDocument: Stack.of(scope).resolve(eventPolicyDoc),
    })

    const eventRole = new Role(scope, "EventRoleForAutoDeploy", {
      assumedBy: new ServicePrincipal("events.amazonaws.com"),
      managedPolicyArns: [eventPolicy.ref],
    })

    const target: IRuleTarget = {
      bind: () => ({
        arn: `arn:aws:ssm:${Aws.region}:${Aws.accountId}:document/${documentName}`,
        id: documentName,
        role: eventRole,
        runCommandParameters: {
          runCommandTargets: targets,
        },
      }),
    }
    rule.addTarget(target)
  }
}
