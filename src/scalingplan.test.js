"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert_1 = require("@aws-cdk/assert");
const cdk_1 = require("@aws-cdk/cdk");
const scalingplan_1 = require("./scalingplan");
describe("scalingplan", () => {
    test("default", () => {
        const stack = new cdk_1.Stack();
        new scalingplan_1.ScalingPlan(stack, "ScalingPlan", {
            autoScalingGroupName: "my-asg",
            tagFilters: [{
                    key: "aws:cloudformation:stack-name",
                    values: [stack.name]
                }]
        });
        expect(assert_1.SynthUtils.toCloudFormation(stack)).toMatchSnapshot();
    });
    test("can set capacities", () => {
        const stack = new cdk_1.Stack();
        new scalingplan_1.ScalingPlan(stack, "ScalingPlan", {
            autoScalingGroupName: "my-asg",
            minCapacity: 2,
            maxCapacity: 4,
            tagFilters: [{
                    key: "aws:cloudformation:stack-name",
                    values: [stack.name]
                }]
        });
        expect(assert_1.SynthUtils.toCloudFormation(stack)).toMatchSnapshot();
    });
    test("can set a targetPercentage", () => {
        const stack = new cdk_1.Stack();
        new scalingplan_1.ScalingPlan(stack, "ScalingPlan", {
            autoScalingGroupName: "my-asg",
            targetPercentage: 60,
            tagFilters: [{
                    key: "aws:cloudformation:stack-name",
                    values: [stack.name]
                }]
        });
        expect(assert_1.SynthUtils.toCloudFormation(stack)).toMatchSnapshot();
    });
});
