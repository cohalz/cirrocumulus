"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const cdk_1 = require("@aws-cdk/cdk");
const aws_autoscalingplans_1 = require("@aws-cdk/aws-autoscalingplans");
class ScalingPlan extends cdk_1.Construct {
    constructor(scope, id, props) {
        super(scope, id);
        const minCapacity = props.minCapacity ? props.minCapacity : 1;
        const maxCapacity = props.maxCapacity ? props.maxCapacity : minCapacity;
        new aws_autoscalingplans_1.CfnScalingPlan(scope, 'AutoScalingPlan', {
            applicationSource: {
                tagFilters: props.tagFilters
            },
            scalingInstructions: [{
                    minCapacity,
                    maxCapacity,
                    resourceId: `autoScalingGroup/${props.autoScalingGroupName}`,
                    scalableDimension: "autoscaling:autoScalingGroup:DesiredCapacity",
                    scalingPolicyUpdateBehavior: "ReplaceExternalPolicies",
                    serviceNamespace: "autoscaling",
                    targetTrackingConfigurations: [{
                            predefinedScalingMetricSpecification: {
                                predefinedScalingMetricType: "ASGAverageCPUUtilization"
                            },
                            estimatedInstanceWarmup: 300,
                            targetValue: props.targetPercentage ? props.targetPercentage : 50
                        }]
                }]
        });
    }
}
exports.ScalingPlan = ScalingPlan;
