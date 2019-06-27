import {
  AutoScalingGroup,
  AutoScalingGroupProps,
  CfnAutoScalingGroup,
  UpdateType,
} from "@aws-cdk/aws-autoscaling"
import {
  CfnLaunchTemplate,
  InstanceType,
  SecurityGroup,
  UserData,
} from "@aws-cdk/aws-ec2"
import { Cluster, EcsOptimizedAmi } from "@aws-cdk/aws-ecs"
import { CfnInstanceProfile, PolicyStatement } from "@aws-cdk/aws-iam"
import { Aws, Construct, Fn } from "@aws-cdk/core"
import { DummyImage } from "./dummy-image"

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
  instanceTypes: string[]

  /**
   * A name for the cluster
   *
   * @default CloudFormation-generated name
   */
  name?: string

  /**
   * The percentage of On-Demand Instances for your capacity when using Spot Instances
   *
   * @default 100 (All instances are On Demand)
   */
  onDemandPercentage?: number

  /**
   * Userdata that you want to execute additionally
   *
   */
  userData?: UserData

  /**
   * Tags to be applied to the Auto Scaling Group
   *
   */
  tags?: { [key: string]: string }
}

export class Ec2Cluster extends Construct {
  public readonly ami: EcsOptimizedAmi
  public readonly autoScalingGroup: AutoScalingGroup
  public readonly cluster: Cluster
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

    this.ami = new EcsOptimizedAmi()

    this.autoScalingGroup = this.createAutoScalingGroup(scope, props)

    const launchTemplate = this.createLaunchTemplate(
      scope,
      props.instanceTypes[0],
      props.tags,
      props.userData
    )

    this.useLaunchTemplate(
      launchTemplate,
      props.instanceTypes,
      props.onDemandPercentage
    )

    this.addCfnPolicy(props.minCapacity)

    this.cluster.addAutoScalingGroup(this.autoScalingGroup)
  }

  private createAutoScalingGroup = (
    scope: Construct,
    props: Ec2ClusterProps
  ) => {
    if (this.onDemandOnly && props.instanceTypes.length > 1) {
      throw new Error(
        "When using on-demand instances, please set single instance type."
      )
    }
    if (!this.onDemandOnly && props.instanceTypes.length <= 1) {
      throw new Error(
        "When using spot instances, please set multiple instance types."
      )
    }

    return new AutoScalingGroup(scope, "AutoScalingGroup", {
      instanceType: new InstanceType(props.instanceTypes[0]),
      machineImage: new DummyImage(),
      updateType: UpdateType.REPLACING_UPDATE,
      ...props,
    })
  }

  private createLaunchTemplate(
    scope: Construct,
    instanceType: string,
    extraTags?: { [key: string]: string },
    extraUserData?: UserData
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

    const userData = this.configureUserData(
      this.cluster.clusterName,
      cfnAsg.logicalId,
      extraUserData
    )

    return new CfnLaunchTemplate(scope, "AutoScalingGroupLaunchTemplate", {
      launchTemplateData: {
        iamInstanceProfile: { name: cfnInstanceProfile.ref },
        imageId: this.ami.getImage(scope).imageId,
        instanceType,
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
        userData,
      },
    })
  }

  private configureUserData(
    clusterName: string,
    logicalId: string,
    userData?: UserData
  ) {
    // https://github.com/aws/amazon-ecs-agent/issues/1707#issuecomment-490498502
    const configureECSService = [
      'sed -i "/After=cloud-final.service/d" /usr/lib/systemd/system/ecs.service',
      "systemctl daemon-reload",
      "exec 2>>/var/log/ecs-agent-reload.log",
    ]

    const ecsConfig = [
      `echo ECS_CLUSTER=${clusterName} >> /etc/ecs/ecs.config`,
      "cat << EOF >> /etc/ecs/ecs.config",
      'ECS_AVAILABLE_LOGGING_DRIVERS=["json-file","awslogs","fluentd","syslog","journald","gelf","logentries","splunk"]',
      "ECS_ENABLE_CONTAINER_METADATA=true",
      "ECS_ENGINE_TASK_CLEANUP_WAIT_DURATION=30m",
      "EOF",
    ]

    const setHostName = [
      "instance_id=$(curl -s http://169.254.169.254/latest/meta-data/instance-id)",
      `host_name=${clusterName}--$(echo $instance_id)`,
      "hostnamectl set-hostname $host_name",
      `aws ec2 create-tags --region ${Aws.REGION} --resources $instance_id --tags Key=Name,Value=$host_name`,
    ]

    const setArnTag = [
      "until metadata=$(curl -s --fail http://localhost:51678/v1/metadata); do sleep 1; done;",
      'container_instance_arn=$(echo "${metadata}" | jq -er ".ContainerInstanceArn")',
      `aws ec2 create-tags --region ${Aws.REGION} --resources $instance_id --tags Key=ContainerInstanceArn,Value=$container_instance_arn`,
    ]

    return Fn.base64(
      [
        "#!/bin/sh",
        "yum update -y",
        "yum install -y aws-cfn-bootstrap aws-cli jq",
        `yum install -y https://amazon-ssm-${Aws.REGION}.s3.amazonaws.com/latest/linux_amd64/amazon-ssm-agent.rpm`,
        ...configureECSService,
        ...ecsConfig,
        ...setHostName,
        ...setArnTag,
        userData,
        `/opt/aws/bin/cfn-signal -e $? --stack ${Aws.STACK_NAME} --resource ${logicalId} --region ${Aws.REGION}`,
      ].join("\n")
    )
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
    instanceTypes: string[],
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
          Overrides: instanceTypes.map(instanceType => ({
            InstanceType: instanceType,
          })),
        },
      })
    }
  }
}
