import { SynthUtils } from "@aws-cdk/assert"
import { InstanceClass, InstanceSize, Vpc } from "@aws-cdk/aws-ec2"
import { Role } from "@aws-cdk/aws-iam"
import { Stack } from "@aws-cdk/core"

import { DeployFiles } from "./deployfiles"
import { Ec2Cluster } from "./ec2cluster"

describe("ec2cluster", () => {
  test("default", () => {
    const stack = new Stack()
    const vpc = new Vpc(stack, "VPC")

    const ec2Cluster = new Ec2Cluster(stack, "Ec2Cluster", {
      instancePairs: [
        {
          class: InstanceClass.T3,
          size: InstanceSize.MEDIUM,
        },
      ],
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

    expect(SynthUtils.toCloudFormation(stack)).toMatchSnapshot()
  })
})
