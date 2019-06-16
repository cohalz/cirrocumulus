import { Construct } from "@aws-cdk/cdk"

import { CfnScalingPlan } from "@aws-cdk/aws-autoscalingplans"

export interface ScalingPlanProps {
  /**
   * Rhe name of the Auto Scaling group
   *
   */
  autoScalingGroupName: string

  /**
   * A set of tags
   *
   */
  tagFilters: CfnScalingPlan.TagFilterProperty[]

  /**
   * The minimum capacity of the resource
   *
   * @default 1
   */
  minCapacity?: number

  /**
   * The maximum capacity of the resource
   *
   * @default 1
   */
  maxCapacity?: number

  /**
   * The target value for the metric
   *
   * @default 50
   */
  targetPercentage?: number
}

export class ScalingPlan extends Construct {
  constructor(scope: Construct, id: string, props: ScalingPlanProps) {
    super(scope, id)

    const minCapacity = props.minCapacity ? props.minCapacity! : 1
    const maxCapacity = props.maxCapacity ? props.maxCapacity! : minCapacity

    const scalingPlan = new CfnScalingPlan(scope, "Resource", {
      applicationSource: {
        tagFilters: props.tagFilters,
      },
      scalingInstructions: [
        {
          maxCapacity,
          minCapacity,
          resourceId: `autoScalingGroup/${props.autoScalingGroupName}`,
          scalableDimension: "autoscaling:autoScalingGroup:DesiredCapacity",
          scalingPolicyUpdateBehavior: "ReplaceExternalPolicies",
          serviceNamespace: "autoscaling",
          targetTrackingConfigurations: [
            {
              estimatedInstanceWarmup: 300,
              predefinedScalingMetricSpecification: {
                predefinedScalingMetricType: "ASGAverageCPUUtilization",
              },
              targetValue: props.targetPercentage ? props.targetPercentage : 50,
            },
          ],
        },
      ],
    })
  }
}
