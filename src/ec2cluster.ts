import {
  AutoScalingGroup,
  AutoScalingGroupProps,
  CfnAutoScalingGroup,
  UpdateType,
} from "@aws-cdk/aws-autoscaling"
import {
  CfnLaunchTemplate,
  InstanceClass,
  InstanceSize,
  InstanceType,
  SecurityGroup,
  UserData,
} from "@aws-cdk/aws-ec2"
import { Cluster, EcsOptimizedAmi } from "@aws-cdk/aws-ecs"
import { CfnInstanceProfile, PolicyStatement } from "@aws-cdk/aws-iam"
import { Aws, Construct, Fn } from "@aws-cdk/core"
import { ImportedImage } from "./lib/imported-image"

export interface InstancePair {
  readonly class: InstanceClass
  readonly size: InstanceSize
}

export interface Ec2ClusterProps
  extends Pick<
    AutoScalingGroupProps,
    Exclude<keyof AutoScalingGroupProps, "instanceType" | "machineImage">
  > {
  /**
   * The instance types
   *
   * When using spot instances, must set multiple instance types
   */
  readonly instancePairs: InstancePair[]

  /**
   * A name for the cluster
   *
   * @default CloudFormation-generated name
   */
  readonly name?: string

  /**
   * The percentage of On-Demand Instances for your capacity when using Spot Instances
   *
   * @default 100 (All instances are On Demand)
   */
  readonly onDemandPercentage?: number

  /**
   * Userdata that you want to execute additionally
   *
   * @default No additional userdata
   */
  readonly userData?: UserData

  /**
   * Tags to be applied to the Auto Scaling Group
   *
   * @default No additional tags
   */
  readonly tags?: { [key: string]: string }
}

export class Ec2Cluster extends Construct {
  public readonly autoScalingGroup: AutoScalingGroup
  public readonly cluster: Cluster
  private readonly amiId: string
  private readonly onDemandOnly: boolean

  constructor(scope: Construct, id: string, props: Ec2ClusterProps) {
    super(scope, id)

    this.cluster = new Cluster(this, "Cluster", {
      clusterName: props.name,
      vpc: props.vpc,
    })

    if (
      typeof props.onDemandPercentage === "undefined" ||
      props.onDemandPercentage >= 100
    ) {
      this.onDemandOnly = true
    } else {
      this.onDemandOnly = false
    }

    const ami = new EcsOptimizedAmi()
    this.amiId = ami.getImage(this).imageId

    this.autoScalingGroup = this.createAutoScalingGroup(scope, props)
    this.cluster.addAutoScalingGroup(this.autoScalingGroup, {
      canContainersAccessInstanceRole: true,
    })

    const userData = this.configureUserData(props.userData)

    const launchTemplate = this.createLaunchTemplate(
      scope,
      props.instancePairs[0],
      userData,
      props.tags
    )

    this.useLaunchTemplate(
      launchTemplate,
      props.instancePairs,
      props.onDemandPercentage
    )

    this.addCfnPolicy(props.minCapacity)
  }

  private createAutoScalingGroup = (
    scope: Construct,
    props: Ec2ClusterProps
  ) => {
    if (this.onDemandOnly && props.instancePairs.length > 1) {
      throw new Error(
        "When using on-demand instances, please set single instance type."
      )
    }
    if (!this.onDemandOnly && props.instancePairs.length <= 1) {
      throw new Error(
        "When using spot instances, please set multiple instance types."
      )
    }

    return new AutoScalingGroup(scope, "AutoScalingGroup", {
      instanceType: InstanceType.of(
        props.instancePairs[0].class,
        props.instancePairs[0].size
      ),
      machineImage: new ImportedImage(this.amiId),
      updateType: UpdateType.REPLACING_UPDATE,
      ...props,
    })
  }

  private createLaunchTemplate(
    scope: Construct,
    instancePair: InstancePair,
    userData: UserData,
    extraTags?: { [key: string]: string }
  ) {
    const cfnAsg = this.autoScalingGroup.node.findChild(
      "ASG"
    ) as CfnAutoScalingGroup

    const cfnInstanceProfile = this.autoScalingGroup.node.findChild(
      "InstanceProfile"
    ) as CfnInstanceProfile

    const securityGroup = this.autoScalingGroup.node.findChild(
      "InstanceSecurityGroup"
    ) as SecurityGroup

    const instancePolicy = new PolicyStatement()
    instancePolicy.addActions("ec2:CreateTags", "ec2:DescribeInstances")
    instancePolicy.addAllResources()
    this.autoScalingGroup.addToRolePolicy(instancePolicy)

    const tags = [
      {
        key: "ClusterName",
        value: this.cluster.clusterName,
      },
    ]

    if (extraTags) {
      for (const key of Object.keys(extraTags)) {
        tags.push({ key, value: extraTags[key] })
      }
    }

    return new CfnLaunchTemplate(scope, "AutoScalingGroupLaunchTemplate", {
      launchTemplateData: {
        iamInstanceProfile: { name: cfnInstanceProfile.ref },
        imageId: this.amiId,
        instanceType: InstanceType.of(
          instancePair.class,
          instancePair.size
        ).toString(),
        securityGroupIds: [securityGroup.securityGroupId],
        tagSpecifications: [
          {
            resourceType: "instance",
            tags,
          },
          {
            resourceType: "volume",
            tags,
          },
        ],
        userData: Fn.base64(userData.render()),
      },
    })
  }

  private configureUserData(extraUserData?: UserData) {
    const cfnAsg = this.autoScalingGroup.node.findChild(
      "ASG"
    ) as CfnAutoScalingGroup

    const userData = UserData.forLinux()

    const init = [
      "yum update -y",
      "yum install -y aws-cfn-bootstrap aws-cli jq",
      `yum install -y https://amazon-ssm-${Aws.REGION}.s3.amazonaws.com/latest/linux_amd64/amazon-ssm-agent.rpm`,
    ]

    // https://github.com/aws/amazon-ecs-agent/issues/1707#issuecomment-490498502
    const configureECSService = [
      'sed -i "/After=cloud-final.service/d" /usr/lib/systemd/system/ecs.service',
      "systemctl daemon-reload",
      "exec 2>>/var/log/ecs-agent-reload.log",
    ]

    const ecsConfig = [
      `echo ECS_CLUSTER=${this.cluster.clusterName} >> /etc/ecs/ecs.config`,
      "cat << EOF >> /etc/ecs/ecs.config",
      'ECS_AVAILABLE_LOGGING_DRIVERS=["json-file","awslogs","fluentd","syslog","journald","gelf","logentries","splunk"]',
      "ECS_ENABLE_CONTAINER_METADATA=true",
      "ECS_ENGINE_TASK_CLEANUP_WAIT_DURATION=30m",
      "EOF",
    ]

    const setHostName = [
      "instance_id=$(curl -s http://169.254.169.254/latest/meta-data/instance-id)",
      `host_name=${this.cluster.clusterName}--$(echo $instance_id)`,
      "hostnamectl set-hostname $host_name",
      `aws ec2 create-tags --region ${Aws.REGION} --resources $instance_id --tags Key=Name,Value=$host_name`,
    ]

    const setArnTag = [
      "until metadata=$(curl -s --fail http://localhost:51678/v1/metadata); do sleep 1; done;",
      'container_instance_arn=$(echo "${metadata}" | jq -er ".ContainerInstanceArn")',
      `aws ec2 create-tags --region ${Aws.REGION} --resources $instance_id --tags Key=ContainerInstanceArn,Value=$container_instance_arn`,
    ]

    userData.addCommands(
      ...init,
      ...configureECSService,
      ...ecsConfig,
      ...setHostName,
      ...setArnTag
    )

    if (extraUserData) {
      userData.addCommands(extraUserData.render())
    }

    userData.addCommands(
      `/opt/aws/bin/cfn-signal -e $? --stack ${Aws.STACK_NAME} --resource ${cfnAsg.logicalId} --region ${Aws.REGION}`
    )

    return userData
  }

  private addCfnPolicy = (minCapacity?: number) => {
    const cfnAsg = this.autoScalingGroup.node.findChild(
      "ASG"
    ) as CfnAutoScalingGroup

    cfnAsg.cfnOptions.creationPolicy = {
      resourceSignal: {
        count: minCapacity ? minCapacity : 1,
        timeout: "PT7M",
      },
    }

    cfnAsg.cfnOptions.updatePolicy = {
      autoScalingRollingUpdate: {
        maxBatchSize: 1,
        minInstancesInService: minCapacity ? minCapacity : 1,
        suspendProcesses: [
          "HealthCheck",
          "ReplaceUnhealthy",
          "AZRebalance",
          "AlarmNotification",
          "ScheduledActions",
        ],
        waitOnResourceSignals: true,
      },
    }
  }

  // use LaunchTemplate instead of LaunchConfiguration
  private useLaunchTemplate = (
    launchTemplate: CfnLaunchTemplate,
    instancePairs: InstancePair[],
    onDemandPercentage?: number
  ) => {
    const cfnAsg = this.autoScalingGroup.node.findChild(
      "ASG"
    ) as CfnAutoScalingGroup

    // XXX https://github.com/awslabs/aws-cdk/issues/1408
    cfnAsg.addPropertyDeletionOverride("LaunchConfigurationName")

    if (this.onDemandOnly) {
      cfnAsg.addPropertyOverride("LaunchTemplate", {
        LaunchTemplateId: launchTemplate.ref,
        Version: launchTemplate.attrLatestVersionNumber,
      })
    } else {
      cfnAsg.addPropertyOverride("MixedInstancesPolicy", {
        InstancesDistribution: {
          OnDemandPercentageAboveBaseCapacity: onDemandPercentage,
        },
        LaunchTemplate: {
          LaunchTemplateSpecification: {
            LaunchTemplateId: launchTemplate.ref,
            Version: launchTemplate.attrLatestVersionNumber,
          },
          Overrides: instancePairs.map(instancePair => ({
            InstanceType: InstanceType.of(
              instancePair.class,
              instancePair.size
            ).toString(),
          })),
        },
      })
    }
  }
}
