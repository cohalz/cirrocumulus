import { Construct } from "@aws-cdk/cdk";
import { IVpc } from "@aws-cdk/aws-ec2";
import { Cluster } from "@aws-cdk/aws-ecs";
import { Role } from "@aws-cdk/aws-iam";
export interface ClusterProps {
    /**
     * The VPC where your ECS instances will be running or your ENIs will be deployed
     *
     */
    vpc: IVpc;
    /**
     * The instance types
     *
     * When using spot instances, must set multiple instance types
     */
    instanceTypes: string[];
    /**
     * A name for the cluster
     *
     * @default CloudFormation-generated name
     */
    name?: string;
    /**
     * Minimum number of instances in the fleet
     *
     * @default 1
     */
    minCapacity?: number;
    /**
     * Maximum number of instances in the fleet
     *
     * @default desiredCapacity
     */
    maxCapacity?: number;
    /**
     * Initial amount of instances in the fleet
     *
     * @default 1
     */
    desiredCapacity?: number;
    /**
     * The percentage of On-Demand Instances for your capacity when using Spot Instances
     *
     * @default 100 (All instances are On Demand)
     */
    onDemandPercentage?: number;
    /**
     * Userdata that you want to execute additionally
     *
     */
    extraUserData?: string[];
    /**
     * Tags to be applied to the Auto Scaling Group
     *
     */
    tags?: {
        [key: string]: string;
    };
}
export declare class Ec2Cluster extends Construct {
    readonly cluster: Cluster;
    autoScalingGroupName: string;
    instanceRole: Role;
    spot: boolean;
    constructor(scope: Construct, id: string, props: ClusterProps);
    private createAutoScalingGroup;
    private overrideAsg;
}
