import {
  AutoScalingGroup,
  CfnAutoScalingGroup,
  UpdateType,
} from "@aws-cdk/aws-autoscaling"
import {
  AmazonLinuxGeneration,
  CfnLaunchTemplate,
  InstanceType,
  IVpc,
  SecurityGroup,
} from "@aws-cdk/aws-ec2"
import { Cluster, EcsOptimizedAmi } from "@aws-cdk/aws-ecs"
import { CfnInstanceProfile, PolicyStatement, Role } from "@aws-cdk/aws-iam"
import { Aws, Construct, Fn } from "@aws-cdk/cdk"

export interface ClusterProps {
  /**
   * The VPC where your ECS instances will be running or your ENIs will be deployed
   *
   */
  vpc: IVpc

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
   * Minimum number of instances in the fleet
   *
   * @default 1
   */
  minCapacity?: number

  /**
   * Maximum number of instances in the fleet
   *
   * @default desiredCapacity
   */
  maxCapacity?: number

  /**
   * Initial amount of instances in the fleet
   *
   * @default 1
   */
  desiredCapacity?: number

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
  userData?: string[]

  /**
   * Tags to be applied to the Auto Scaling Group
   *
   */
  tags?: { [key: string]: string }
}

export class Ec2Cluster extends Construct {
  public readonly cluster: Cluster
  public autoScalingGroupName: string
  public instanceRole: Role
  public onDemandOnly: boolean

  constructor(scope: Construct, id: string, props: ClusterProps) {
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

    const asg = this.createAutoScalingGroup(
      scope,
      this.cluster.clusterName,
      props.vpc,
      props
    )

    const cfnAsg = asg.node.findChild("ASG") as CfnAutoScalingGroup

    this.addCfnPolicy(asg, props.minCapacity)

    this.autoScalingGroupName = cfnAsg.refAsString

    this.instanceRole = asg.node.findChild("InstanceRole") as Role

    this.cluster.addAutoScalingGroup(asg)
  }

  private createAutoScalingGroup = (
    scope: Construct,
    clusterName: string,
    vpc: IVpc,
    props: ClusterProps
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

    const ami = new EcsOptimizedAmi({
      generation: AmazonLinuxGeneration.AmazonLinux2,
    })

    const asg = new AutoScalingGroup(scope, "AutoScalingGroup", {
      desiredCapacity: props.desiredCapacity,
      instanceType: new InstanceType(props.instanceTypes[0]),
      machineImage: ami,
      maxCapacity: props.maxCapacity,
      minCapacity: props.minCapacity,
      updateType: UpdateType.ReplacingUpdate,
      vpc,
    })

    const launchTemplate = this.createLaunchTemplate(
      scope,
      clusterName,
      asg,
      ami,
      props.instanceTypes[0],
      props.tags,
      props.userData
    )

    this.useLaunchTemplate(
      asg,
      launchTemplate,
      props.instanceTypes,
      props.onDemandPercentage
    )

    return asg
  }

  private createLaunchTemplate(
    scope: Construct,
    clusterName: string,
    asg: AutoScalingGroup,
    ami: EcsOptimizedAmi,
    instanceType: string,
    tags2?: { [key: string]: string },
    userData2?: string[]
  ) {
    this.instanceRole = asg.node.findChild("InstanceRole") as Role

    const cfnAsg = asg.node.findChild("ASG") as CfnAutoScalingGroup

    this.autoScalingGroupName = cfnAsg.refAsString

    const cfnInstanceProfile = asg.node.findChild(
      "InstanceProfile"
    ) as CfnInstanceProfile

    const securityGroup = asg.node.findChild(
      "InstanceSecurityGroup"
    ) as SecurityGroup

    const instancePolicy = new PolicyStatement()
    instancePolicy.addActions("ec2:CreateTags", "ec2:DescribeInstances")
    instancePolicy.addAllResources()
    this.instanceRole.addToPolicy(instancePolicy)

    const tags = [
      {
        key: "ClusterName",
        value: clusterName,
      },
    ]

    if (tags2) {
      for (const key of Object.keys(tags2)) {
        tags.push({ key, value: tags2[key] })
      }
    }

    const userData = this.configureUserData(
      clusterName,
      cfnAsg.logicalId,
      userData2
    )

    const launchTemplate = new CfnLaunchTemplate(
      scope,
      "AutoScalingGroupLaunchTemplate",
      {
        launchTemplateData: {
          iamInstanceProfile: { name: cfnInstanceProfile.refAsString },
          imageId: ami.getImage(scope).imageId,
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
      }
    )

    return launchTemplate
  }

  private configureUserData(
    clusterName: string,
    logicalId: string,
    userData?: string[]
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
      `aws ec2 create-tags --region ${Aws.region} --resources $instance_id --tags Key=Name,Value=$host_name`,
    ]

    const setArnTag = [
      "until metadata=$(curl -s --fail http://localhost:51678/v1/metadata); do sleep 1; done;",
      'container_instance_arn=$(echo "${metadata}" | jq -er ".ContainerInstanceArn")',
      `aws ec2 create-tags --region ${Aws.region} --resources $instance_id --tags Key=ContainerInstanceArn,Value=$container_instance_arn`,
    ]

    return Fn.base64(
      [
        "#!/bin/sh",
        "yum update -y",
        "yum install -y aws-cfn-bootstrap aws-cli jq",
        `yum install -y https://amazon-ssm-${Aws.region}.s3.amazonaws.com/latest/linux_amd64/amazon-ssm-agent.rpm`,
        ...configureECSService,
        ...ecsConfig,
        ...setHostName,
        ...setArnTag,
        ...(userData || []),
        `/opt/aws/bin/cfn-signal -e $? --stack ${Aws.stackName} --resource ${logicalId} --region ${Aws.region}`,
      ].join("\n")
    )
  }

  private addCfnPolicy = (asg: AutoScalingGroup, minCapacity?: number) => {
    const cfnAsg = asg.node.findChild("ASG") as CfnAutoScalingGroup

    cfnAsg.options.creationPolicy = {
      resourceSignal: {
        count: minCapacity ? minCapacity : 1,
        timeout: "PT7M",
      },
    }

    cfnAsg.options.updatePolicy = {
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

  private useLaunchTemplate = (
    asg: AutoScalingGroup,
    launchTemplate: CfnLaunchTemplate,
    instanceTypes: string[],
    onDemandPercentage?: number
  ) => {
    const cfnAsg = asg.node.findChild("ASG") as CfnAutoScalingGroup

    // XXX https://github.com/awslabs/aws-cdk/issues/1408
    cfnAsg.addPropertyDeletionOverride("LaunchConfigurationName")

    if (this.onDemandOnly) {
      cfnAsg.addPropertyOverride("LaunchTemplate", {
        LaunchTemplateId: launchTemplate.refAsString,
        Version: launchTemplate.attrLatestVersionNumber,
      })
    } else {
      cfnAsg.addPropertyOverride("MixedInstancesPolicy", {
        InstancesDistribution: {
          OnDemandPercentageAboveBaseCapacity: onDemandPercentage,
        },
        LaunchTemplate: {
          LaunchTemplateSpecification: {
            LaunchTemplateId: launchTemplate.refAsString,
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
