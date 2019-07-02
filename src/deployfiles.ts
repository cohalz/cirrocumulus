import { ReadWriteType, Trail } from "@aws-cdk/aws-cloudtrail"
import { IRuleTarget, Rule, Schedule } from "@aws-cdk/aws-events"
import {
  ManagedPolicy,
  PolicyStatement,
  Role,
  ServicePrincipal,
} from "@aws-cdk/aws-iam"
import { BlockPublicAccess, Bucket } from "@aws-cdk/aws-s3"
import { BucketDeployment, Source } from "@aws-cdk/aws-s3-deployment"
import { CfnAssociation, CfnDocument } from "@aws-cdk/aws-ssm"
import { Aws, Construct } from "@aws-cdk/core"

import * as path from "path"

export interface DeployFilesProps {
  /**
   * The Local directory to deploy to instance
   *
   */
  readonly source: string

  /**
   * The instance role
   *
   */
  readonly instanceRole: Role

  /**
   * The targets that the SSM document sends commands to
   *
   */
  readonly targets: CfnAssociation.TargetProperty[]

  /**
   * Schedule for executing command
   *
   * @default Do not schedule
   */
  readonly schedule?: Schedule
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

    props.instanceRole.addManagedPolicy(
      ManagedPolicy.fromAwsManagedPolicyName("service-role/AmazonEC2RoleforSSM")
    )

    const document = this.createDocumentToDeploy(scope, props.source)

    this.createEventToAutoDeploy(
      scope,
      this.bucket,
      document.ref,
      props.targets
    )

    const scheduleExpression = props.schedule
      ? props.schedule.expressionString
      : undefined

    const association = new CfnAssociation(scope, "AssociationToDeploy", {
      name: document.ref,
      scheduleExpression,
      targets: props.targets,
    })
  }

  private createBucketToDeploy(
    scope: Construct,
    instanceRole: Role,
    source: string
  ) {
    const dirName = `${path.basename(source)}/`

    const bucket = new Bucket(scope, "BucketToDeploy", {
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
    })

    const s3Policy = new PolicyStatement()
    s3Policy.addActions("s3:Get*", "s3:List*")
    s3Policy.addResources(bucket.bucketArn, bucket.arnForObjects("*"))
    instanceRole.addToPolicy(s3Policy)

    const bucketDeployment = new BucketDeployment(scope, "BucketDeployment", {
      destinationBucket: bucket,
      destinationKeyPrefix: dirName,
      source: Source.asset(source),
    })

    return bucket
  }

  private createDocumentToDeploy(scope: Construct, source: string) {
    const dirName = `${path.basename(source)}/`
    const s3Path = `${this.bucket.bucketName}/${dirName}`

    const commands = [
      "#!/bin/bash",
      "set -eux",
      `aws --region ${Aws.REGION} s3 sync --delete --exact-timestamps s3://${s3Path} ${s3Path}`,
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
      managementEvents: ReadWriteType.WRITE_ONLY,
    })

    trail.addS3EventSelector([`${bucket.bucketArn}/`], {
      readWriteType: ReadWriteType.WRITE_ONLY,
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

    const eventPolicyStatement = new PolicyStatement()
    eventPolicyStatement.addActions("ssm:SendCommand")
    eventPolicyStatement.addResources(
      `arn:aws:ssm:${Aws.REGION}:*:document/*`,
      `arn:aws:ec2:${Aws.REGION}:*:instance/*`
    )

    const eventRole = new Role(scope, "EventRoleForAutoDeploy", {
      assumedBy: new ServicePrincipal("events.amazonaws.com"),
    })

    eventRole.addToPolicy(eventPolicyStatement)

    const target: IRuleTarget = {
      bind: () => ({
        arn: `arn:aws:ssm:${Aws.REGION}:${Aws.ACCOUNT_ID}:document/${documentName}`,
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
