"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const cdk_1 = require("@aws-cdk/cdk");
const aws_ec2_1 = require("@aws-cdk/aws-ec2");
const aws_ecs_1 = require("@aws-cdk/aws-ecs");
const aws_iam_1 = require("@aws-cdk/aws-iam");
const aws_autoscaling_1 = require("@aws-cdk/aws-autoscaling");
class Ec2Cluster extends cdk_1.Construct {
    constructor(scope, id, props) {
        super(scope, id);
        this.createAutoScalingGroup = (scope, clusterName, vpc, props) => {
            this.spot =
                props.onDemandPercentage && props.onDemandPercentage != 100
                    ? true
                    : false;
            if (this.spot) {
                if (props.instanceTypes.length <= 1)
                    throw new Error("When using spot instances, please set multiple instance types.");
            }
            else {
                if (props.instanceTypes.length > 1)
                    throw new Error("When using on-demand instances, please set single instance type.");
            }
            const ami = new aws_ecs_1.EcsOptimizedAmi({ generation: aws_ec2_1.AmazonLinuxGeneration.AmazonLinux2 });
            const asg = new aws_autoscaling_1.AutoScalingGroup(scope, "AutoScalingGroup", {
                vpc,
                instanceType: new aws_ec2_1.InstanceType(props.instanceTypes[0]),
                machineImage: ami,
                updateType: aws_autoscaling_1.UpdateType.ReplacingUpdate,
                desiredCapacity: props.desiredCapacity,
                minCapacity: props.minCapacity,
                maxCapacity: props.maxCapacity,
            });
            this.instanceRole = asg.node.findChild("InstanceRole");
            const cfnAsg = asg.node.findChild("ASG");
            this.autoScalingGroupName = cfnAsg.autoScalingGroupName;
            const cfnInstanceProfile = asg.node.findChild("InstanceProfile");
            const securityGroup = asg.node.findChild("InstanceSecurityGroup");
            this.instanceRole.addToPolicy(new aws_iam_1.PolicyStatement().addActions("ec2:CreateTags", "ec2:DescribeInstances").addAllResources());
            const tags = [{
                    key: "ClusterName",
                    value: clusterName,
                }];
            if (props.tags) {
                for (const key of Object.keys(props.tags)) {
                    tags.push({ key, value: props.tags[key] });
                }
            }
            const userData = cdk_1.Fn.base64([
                '#!/bin/sh',
                'yum update -y',
                'sed -i "/After=cloud-final.service/d" /usr/lib/systemd/system/ecs.service',
                'systemctl daemon-reload',
                'exec 2>>/var/log/ecs-agent-reload.log',
                `echo ECS_CLUSTER=${clusterName} >> /etc/ecs/ecs.config`,
                'cat << EOF >> /etc/ecs/ecs.config',
                'ECS_AVAILABLE_LOGGING_DRIVERS=["json-file","awslogs","fluentd","syslog","journald","gelf","logentries","splunk"]',
                'ECS_ENABLE_CONTAINER_METADATA=true',
                'ECS_ENGINE_TASK_CLEANUP_WAIT_DURATION=30m',
                'EOF',
                'yum install -y aws-cfn-bootstrap aws-cli jq',
                `yum install -y https://amazon-ssm-${cdk_1.Aws.region}.s3.amazonaws.com/latest/linux_amd64/amazon-ssm-agent.rpm`,
                'systemctl start amazon-ssm-agent',
                'instance_id=$(curl -s http://169.254.169.254/latest/meta-data/instance-id)',
                `host_name=${clusterName}-$(echo $instance_id)`,
                'hostnamectl set-hostname $host_name',
                `aws ec2 create-tags --region ${cdk_1.Aws.region} --resources $instance_id --tags Key=Name,Value=$host_name`,
                'until metadata=$(curl -s --fail http://localhost:51678/v1/metadata); do sleep 1; done;',
                'systemctl restart docker',
                'systemctl restart ecs',
                'container_instance_arn=$(echo "${metadata}" | jq -er ".ContainerInstanceArn")',
                `aws ec2 create-tags --region ${cdk_1.Aws.region} --resources $instance_id --tags Key=ContainerInstanceArn,Value=$container_instance_arn`,
                ...(props.extraUserData || []),
                `/opt/aws/bin/cfn-signal -e $? --stack ${cdk_1.Aws.stackName} --resource ${cfnAsg.logicalId} --region ${cdk_1.Aws.region}`,
            ].join("\n"));
            const launchTemplate = new aws_ec2_1.CfnLaunchTemplate(scope, "AutoScalingGroupLaunchTemplate", {
                launchTemplateData: {
                    imageId: ami.getImage(scope).imageId,
                    instanceType: props.instanceTypes[0],
                    iamInstanceProfile: { name: cfnInstanceProfile.ref },
                    securityGroupIds: [securityGroup.securityGroupId],
                    userData,
                    tagSpecifications: [{
                            resourceType: "instance",
                            tags,
                        },
                        {
                            resourceType: "volume",
                            tags,
                        }]
                }
            });
            this.overrideAsg(asg, launchTemplate, props);
            return asg;
        };
        this.overrideAsg = (asg, launchTemplate, props) => {
            const cfnAsg = asg.node.findChild("ASG");
            // XXX https://github.com/awslabs/aws-cdk/issues/1408
            cfnAsg.addPropertyDeletionOverride("LaunchConfigurationName");
            cfnAsg.options.creationPolicy = {
                resourceSignal: {
                    count: props.minCapacity ? props.minCapacity : 1,
                    timeout: "PT7M"
                }
            };
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
                    waitOnResourceSignals: true
                }
            };
            if (!this.spot) {
                cfnAsg.addPropertyOverride("LaunchTemplate", {
                    LaunchTemplateId: launchTemplate.ref,
                    Version: launchTemplate.launchTemplateLatestVersionNumber
                });
            }
            else {
                cfnAsg.addPropertyOverride("MixedInstancesPolicy", {
                    InstancesDistribution: {
                        OnDemandPercentageAboveBaseCapacity: props.onDemandPercentage,
                    },
                    LaunchTemplate: {
                        LaunchTemplateSpecification: {
                            LaunchTemplateId: launchTemplate.ref,
                            Version: launchTemplate.launchTemplateLatestVersionNumber,
                        },
                        Overrides: props.instanceTypes.map(InstanceType => ({ InstanceType })),
                    },
                });
            }
        };
        this.cluster = new aws_ecs_1.Cluster(this, "Cluster", {
            clusterName: props.name,
            vpc: props.vpc,
        });
        const asg = this.createAutoScalingGroup(scope, this.cluster.clusterName, props.vpc, props);
        this.cluster.addAutoScalingGroup(asg);
    }
}
exports.Ec2Cluster = Ec2Cluster;
