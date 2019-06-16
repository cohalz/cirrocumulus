import { Construct } from "@aws-cdk/cdk";
import { CfnScalingPlan } from "@aws-cdk/aws-autoscalingplans";
export interface ScalingPlanProps {
    /**
     * Rhe name of the Auto Scaling group
     *
     */
    autoScalingGroupName: string;
    /**
     * A set of tags
     *
     */
    tagFilters: CfnScalingPlan.TagFilterProperty[];
    /**
     * The minimum capacity of the resource
     *
     * @default 1
     */
    minCapacity?: number;
    /**
     * The maximum capacity of the resource
     *
     * @default 1
     */
    maxCapacity?: number;
    /**
     * The target value for the metric
     *
     * @default 50
     */
    targetPercentage?: number;
}
export declare class ScalingPlan extends Construct {
    constructor(scope: Construct, id: string, props: ScalingPlanProps);
}
