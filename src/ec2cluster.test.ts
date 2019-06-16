import { SynthUtils } from "@aws-cdk/assert"
import { Stack } from "@aws-cdk/cdk"
import { Ec2Cluster } from "./ec2cluster"
import { Vpc } from "@aws-cdk/aws-ec2"

describe("ec2cluster", () => {
  test("default", () => {
    const stack = new Stack()
    const vpc = new Vpc(stack, "VPC")

    new Ec2Cluster(stack, "Ec2Cluster", {
      vpc,
      instanceTypes: ["t3.medium"],
    })

    expect(SynthUtils.toCloudFormation(stack)).toMatchSnapshot()
  })

  test("can set OnDemandPercentageAboveBaseCapacity for the spot instance", () => {
    const stack = new Stack()
    const vpc = new Vpc(stack, "VPC")

    new Ec2Cluster(stack, "Ec2Cluster", {
      vpc,
      instanceTypes: ["t3.medium", "t2.medium"],
      onDemandPercentage: 20,
    })

    expect(SynthUtils.toCloudFormation(stack)).toMatchSnapshot()
  })

  test("can set UserData", () => {
    const stack = new Stack()
    const vpc = new Vpc(stack, "VPC")

    new Ec2Cluster(stack, "Ec2Cluster", {
      vpc,
      instanceTypes: ["t3.medium"],
      extraUserData: ["echo 1"],
    })

    expect(SynthUtils.toCloudFormation(stack)).toMatchSnapshot()
  })

  test("can set tags", () => {
    const stack = new Stack()
    const vpc = new Vpc(stack, "VPC")

    new Ec2Cluster(stack, "Ec2Cluster", {
      vpc,
      instanceTypes: ["t3.medium"],
      tags: {
        Service: "example",
        Env: "develop",
        roles: "develop:personal,misc:misc"
      },
    })

    expect(SynthUtils.toCloudFormation(stack)).toMatchSnapshot()
  })

  test("error when specifying a single instance type with spot", () => {
    const stack = new Stack()
    const vpc = new Vpc(stack, "VPC")

    expect(() => {
      new Ec2Cluster(stack, "Ec2Cluster", {
        vpc,
        instanceTypes: ["t3.medium"],
        onDemandPercentage: 20,
      })
    }).toThrow(new Error("When using spot instances, please set multiple instance types."))
  })

  test("error when specifying multiple instance types with on-demand", () => {
    const stack = new Stack()
    const vpc = new Vpc(stack, "VPC")

    expect(() => {
      new Ec2Cluster(stack, "Ec2Cluster", {
        vpc,
        instanceTypes: ["t3.medium", "t2.medium"],
      })
    }).toThrow(new Error("When using on-demand instances, please set single instance type."))
  })

  test("error when specifying multiple instance types with onDemandPercentage: 100", () => {
    const stack = new Stack()
    const vpc = new Vpc(stack, "VPC")

    expect(() => {
      new Ec2Cluster(stack, "Ec2Cluster", {
        vpc,
        instanceTypes: ["t3.medium", "t2.medium"],
        onDemandPercentage: 100,
      })
    }).toThrow(new Error("When using on-demand instances, please set single instance type."))
  })
})
