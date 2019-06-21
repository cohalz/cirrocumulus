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
  extraUserData?: string[]

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
  public spot: boolean

  constructor(scope: Construct, id: string, props: ClusterProps) {
    super(scope, id)

    this.cluster = new Cluster(this, "Cluster", {
      clusterName: props.name,
      vpc: props.vpc,
    })

    this.spot =
      typeof props.onDemandPercentage !== "undefined" &&
      props.onDemandPercentage! < 100
        ? true
        : false

    const asg = this.createAutoScalingGroup(
      scope,
      this.cluster.clusterName,
      props.vpc,
      props
    )

    const cfnAsg = asg.node.findChild("ASG") as CfnAutoScalingGroup

    this.autoScalingGroupName = cfnAsg.autoScalingGroupName

    this.instanceRole = asg.node.findChild("InstanceRole") as Role

    this.cluster.addAutoScalingGroup(asg)
  }

  private createAutoScalingGroup = (
    scope: Construct,
    clusterName: string,
    vpc: IVpc,
    props: ClusterProps
  ) => {
    if (this.spot) {
      if (props.instanceTypes.length <= 1) {
        throw new Error(
          "When using spot instances, please set multiple instance types."
        )
      }
    } else {
      if (props.instanceTypes.length > 1) {
        throw new Error(
          "When using on-demand instances, please set single instance type."
        )
      }
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

    this.instanceRole = asg.node.findChild("InstanceRole") as Role

    const cfnAsg = asg.node.findChild("ASG") as CfnAutoScalingGroup

    this.autoScalingGroupName = cfnAsg.autoScalingGroupName

    const cfnInstanceProfile = asg.node.findChild(
      "InstanceProfile"
    ) as CfnInstanceProfile

    const securityGroup = asg.node.findChild(
      "InstanceSecurityGroup"
    ) as SecurityGroup

    this.instanceRole.addToPolicy(
      new PolicyStatement()
        .addActions("ec2:CreateTags", "ec2:DescribeInstances")
        .addAllResources()
    )

    const tags = [
      {
        key: "ClusterName",
        value: clusterName,
      },
    ]

    if (props.tags) {
      for (const key of Object.keys(props.tags)) {
        tags.push({ key, value: props.tags[key] })
      }
    }

    const userData = Fn.base64(
      [
        "#!/bin/sh",
        "yum update -y",
        'sed -i "/After=cloud-final.service/d" /usr/lib/systemd/system/ecs.service',
        "systemctl daemon-reload",
        "exec 2>>/var/log/ecs-agent-reload.log",
        `echo ECS_CLUSTER=${clusterName} >> /etc/ecs/ecs.config`,
        "cat << EOF >> /etc/ecs/ecs.config",
        'ECS_AVAILABLE_LOGGING_DRIVERS=["json-file","awslogs","fluentd","syslog","journald","gelf","logentries","splunk"]',
        "ECS_ENABLE_CONTAINER_METADATA=true",
        "ECS_ENGINE_TASK_CLEANUP_WAIT_DURATION=30m",
        "EOF",
        "yum install -y aws-cfn-bootstrap aws-cli jq",
        `yum install -y https://amazon-ssm-${Aws.region}.s3.amazonaws.com/latest/linux_amd64/amazon-ssm-agent.rpm`,
        "systemctl start amazon-ssm-agent",
        "instance_id=$(curl -s http://169.254.169.254/latest/meta-data/instance-id)",
        `host_name=${clusterName}--$(echo $instance_id)`,
        "hostnamectl set-hostname $host_name",
        `aws ec2 create-tags --region ${Aws.region} --resources $instance_id --tags Key=Name,Value=$host_name`,
        "until metadata=$(curl -s --fail http://localhost:51678/v1/metadata); do sleep 1; done;",
        "systemctl restart docker",
        "systemctl restart ecs",
        'container_instance_arn=$(echo "${metadata}" | jq -er ".ContainerInstanceArn")',
        `aws ec2 create-tags --region ${Aws.region} --resources $instance_id --tags Key=ContainerInstanceArn,Value=$container_instance_arn`,
        ...(props.extraUserData || []),
        `/opt/aws/bin/cfn-signal -e $? --stack ${Aws.stackName} --resource ${cfnAsg.logicalId} --region ${Aws.region}`,
      ].join("\n")
    )

    const launchTemplate = new CfnLaunchTemplate(
      scope,
      "AutoScalingGroupLaunchTemplate",
      {
        launchTemplateData: {
          iamInstanceProfile: { name: cfnInstanceProfile.ref },
          imageId: ami.getImage(scope).imageId,
          instanceType: props.instanceTypes[0],
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

    this.overrideAsg(asg, launchTemplate, props)

    return asg
  }
  private overrideAsg = (
    asg: AutoScalingGroup,
    launchTemplate: CfnLaunchTemplate,
    props: ClusterProps
  ) => {
    const cfnAsg = asg.node.findChild("ASG") as CfnAutoScalingGroup

    // XXX https://github.com/awslabs/aws-cdk/issues/1408
    cfnAsg.addPropertyDeletionOverride("LaunchConfigurationName")

    cfnAsg.options.creationPolicy = {
      resourceSignal: {
        count: props.minCapacity ? props.minCapacity : 1,
        timeout: "PT7M",
      },
    }

    cfnAsg.options.updatePolicy = {
      autoScalingRollingUpdate: {
        maxBatchSize: 1,
        minInstancesInService: props.minCapacity ? props.minCapacity : 1,
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

    if (!this.spot) {
      cfnAsg.addPropertyOverride("LaunchTemplate", {
        LaunchTemplateId: launchTemplate.ref,
        Version: launchTemplate.launchTemplateLatestVersionNumber,
      })
    } else {
      cfnAsg.addPropertyOverride("MixedInstancesPolicy", {
        InstancesDistribution: {
          OnDemandPercentageAboveBaseCapacity: props.onDemandPercentage,
        },
        LaunchTemplate: {
          LaunchTemplateSpecification: {
            LaunchTemplateId: launchTemplate.ref,
            Version: launchTemplate.launchTemplateLatestVersionNumber,
          },
          Overrides: props.instanceTypes.map(instanceType => ({
            InstanceType: instanceType,
          })),
        },
      })
    }
  }
}
