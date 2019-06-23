import { SynthUtils } from "@aws-cdk/assert"
import { Vpc } from "@aws-cdk/aws-ec2"
import { Role } from "@aws-cdk/aws-iam"
import { Stack } from "@aws-cdk/cdk"

import { DeployFiles } from "./deployfiles"
import { Ec2Cluster } from "./ec2cluster"
import { ScalingPlan } from "./scalingplan"

describe("ec2cluster", () => {
  test("default", () => {
    const stack = new Stack()
    const vpc = new Vpc(stack, "VPC")

    const ec2Cluster = new Ec2Cluster(stack, "Ec2Cluster", {
      instanceTypes: ["t3.medium"],
      vpc,
    })

    const instanceRole = ec2Cluster.autoScalingGroup.node.findChild(
      "InstanceRole"
    ) as Role

    const deployFiles = new DeployFiles(stack, "UpdateFiles", {
      instanceRole,
      source: "examples/",
      targets: [
        {
          key: "tag:ClusterName",
          values: [ec2Cluster.cluster.clusterName],
        },
      ],
    })

    const scalingPlan = new ScalingPlan(stack, "ScalingPlan", {
      autoScalingGroupName: ec2Cluster.autoScalingGroup.autoScalingGroupName,
      tagFilters: [
        {
          key: "ClusterName",
          values: [ec2Cluster.cluster.clusterName],
        },
      ],
    })
    expect(SynthUtils.toCloudFormation(stack)).toMatchSnapshot()
  })
})
