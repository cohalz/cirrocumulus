import { SynthUtils } from "@aws-cdk/assert"
import { Stack } from "@aws-cdk/cdk"
import { ScalingPlan } from "./scalingplan"

describe("scalingplan", () => {
  test("default", () => {
    const stack = new Stack()

    const scalingPlan = new ScalingPlan(stack, "ScalingPlan", {
      autoScalingGroupName: "my-asg",
      tagFilters: [
        {
          key: "aws:cloudformation:stack-name",
          values: [stack.name],
        },
      ],
    })

    expect(SynthUtils.toCloudFormation(stack)).toMatchSnapshot()
  })

  test("can set capacities", () => {
    const stack = new Stack()

    const scalingPlan = new ScalingPlan(stack, "ScalingPlan", {
      autoScalingGroupName: "my-asg",
      maxCapacity: 4,
      minCapacity: 2,
      tagFilters: [
        {
          key: "aws:cloudformation:stack-name",
          values: [stack.name],
        },
      ],
    })

    expect(SynthUtils.toCloudFormation(stack)).toMatchSnapshot()
  })

  test("can set a targetPercentage", () => {
    const stack = new Stack()

    const scalingPlan = new ScalingPlan(stack, "ScalingPlan", {
      autoScalingGroupName: "my-asg",
      tagFilters: [
        {
          key: "aws:cloudformation:stack-name",
          values: [stack.name],
        },
      ],
      targetPercentage: 60,
    })

    expect(SynthUtils.toCloudFormation(stack)).toMatchSnapshot()
  })
})
