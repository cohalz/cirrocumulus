import { SynthUtils } from "@aws-cdk/assert"
import { UserData, Vpc } from "@aws-cdk/aws-ec2"
import { Stack } from "@aws-cdk/core"

import { Ec2Cluster } from "./ec2cluster"

describe("ec2cluster", () => {
  test("default", () => {
    const stack = new Stack()
    const vpc = new Vpc(stack, "VPC")

    const ec2Cluster = new Ec2Cluster(stack, "Ec2Cluster", {
      instanceTypes: ["t3.medium"],
      vpc,
    })

    expect(SynthUtils.toCloudFormation(stack)).toMatchSnapshot()
  })

  test("can set OnDemandPercentageAboveBaseCapacity for the spot instance", () => {
    const stack = new Stack()
    const vpc = new Vpc(stack, "VPC")

    const ec2Cluster = new Ec2Cluster(stack, "Ec2Cluster", {
      instanceTypes: ["t3.medium", "t2.medium"],
      onDemandPercentage: 20,
      vpc,
    })

    expect(SynthUtils.toCloudFormation(stack)).toMatchSnapshot()
  })

  test("can set UserData", () => {
    const stack = new Stack()
    const vpc = new Vpc(stack, "VPC")

    const userData = UserData.forLinux({ shebang: "" })
    userData.addCommands("echo 1", "echo 2")

    const ec2Cluster = new Ec2Cluster(stack, "Ec2Cluster", {
      instanceTypes: ["t3.medium"],
      userData,
      vpc,
    })

    expect(SynthUtils.toCloudFormation(stack)).toMatchSnapshot()
  })

  test("can set tags", () => {
    const stack = new Stack()
    const vpc = new Vpc(stack, "VPC")

    const ec2Cluster = new Ec2Cluster(stack, "Ec2Cluster", {
      instanceTypes: ["t3.medium"],
      tags: {
        Env: "develop",
        Service: "example",
        roles: "develop:personal,misc:misc",
      },
      vpc,
    })

    expect(SynthUtils.toCloudFormation(stack)).toMatchSnapshot()
  })

  test("error when specifying a single instance type with spot", () => {
    const stack = new Stack()
    const vpc = new Vpc(stack, "VPC")

    expect(() => {
      const ec2Cluster = new Ec2Cluster(stack, "Ec2Cluster", {
        instanceTypes: ["t3.medium"],
        onDemandPercentage: 20,
        vpc,
      })
    }).toThrow(
      new Error(
        "When using spot instances, please set multiple instance types."
      )
    )
  })

  test("error when specifying a single instance type with onDemandPercentage: 0", () => {
    const stack = new Stack()
    const vpc = new Vpc(stack, "VPC")

    expect(() => {
      const ec2Cluster = new Ec2Cluster(stack, "Ec2Cluster", {
        instanceTypes: ["t3.medium"],
        onDemandPercentage: 0,
        vpc,
      })
    }).toThrow(
      new Error(
        "When using spot instances, please set multiple instance types."
      )
    )
  })

  test("error when specifying multiple instance types with on-demand", () => {
    const stack = new Stack()
    const vpc = new Vpc(stack, "VPC")

    expect(() => {
      const ec2Cluster = new Ec2Cluster(stack, "Ec2Cluster", {
        instanceTypes: ["t3.medium", "t2.medium"],
        vpc,
      })
    }).toThrow(
      new Error(
        "When using on-demand instances, please set single instance type."
      )
    )
  })

  test("error when specifying multiple instance types with onDemandPercentage: 100", () => {
    const stack = new Stack()
    const vpc = new Vpc(stack, "VPC")

    expect(() => {
      const ec2Cluster = new Ec2Cluster(stack, "Ec2Cluster", {
        instanceTypes: ["t3.medium", "t2.medium"],
        onDemandPercentage: 100,
        vpc,
      })
    }).toThrow(
      new Error(
        "When using on-demand instances, please set single instance type."
      )
    )
  })
})
