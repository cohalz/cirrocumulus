import { SynthUtils } from "@aws-cdk/assert"
import { Stack } from "@aws-cdk/cdk"
import { ScalingPlan } from "./scalingplan"

describe("scalingplan", () => {
  test("default", () => {
    const stack = new Stack()

    new ScalingPlan(stack, "ScalingPlan", {
      autoScalingGroupName: "my-asg",
      tagFilters: [{
        key: "aws:cloudformation:stack-name",
        values: [stack.name]
      }]
    })

    expect(SynthUtils.toCloudFormation(stack)).toMatchSnapshot()
  })

  test("can set capacities", () => {
    const stack = new Stack()

    new ScalingPlan(stack, "ScalingPlan", {
      autoScalingGroupName: "my-asg",
      minCapacity: 2,
      maxCapacity: 4,
      tagFilters: [{
        key: "aws:cloudformation:stack-name",
        values: [stack.name]
      }]
    })

    expect(SynthUtils.toCloudFormation(stack)).toMatchSnapshot()
  })

  test("can set a targetPercentage", () => {
    const stack = new Stack()

    new ScalingPlan(stack, "ScalingPlan", {
      autoScalingGroupName: "my-asg",
      targetPercentage: 60,
      tagFilters: [{
        key: "aws:cloudformation:stack-name",
        values: [stack.name]
      }]
    })

    expect(SynthUtils.toCloudFormation(stack)).toMatchSnapshot()
  })
})
