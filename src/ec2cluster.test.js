"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert_1 = require("@aws-cdk/assert");
const cdk_1 = require("@aws-cdk/cdk");
const ec2cluster_1 = require("./ec2cluster");
const aws_ec2_1 = require("@aws-cdk/aws-ec2");
describe("ec2cluster", () => {
    test("default", () => {
        const stack = new cdk_1.Stack();
        const vpc = new aws_ec2_1.Vpc(stack, "VPC");
        new ec2cluster_1.Ec2Cluster(stack, "Ec2Cluster", {
            vpc,
            instanceTypes: ["t3.medium"],
        });
        expect(assert_1.SynthUtils.toCloudFormation(stack)).toMatchSnapshot();
    });
    test("can set OnDemandPercentageAboveBaseCapacity for the spot instance", () => {
        const stack = new cdk_1.Stack();
        const vpc = new aws_ec2_1.Vpc(stack, "VPC");
        new ec2cluster_1.Ec2Cluster(stack, "Ec2Cluster", {
            vpc,
            instanceTypes: ["t3.medium", "t2.medium"],
            onDemandPercentage: 20,
        });
        expect(assert_1.SynthUtils.toCloudFormation(stack)).toMatchSnapshot();
    });
    test("can set UserData", () => {
        const stack = new cdk_1.Stack();
        const vpc = new aws_ec2_1.Vpc(stack, "VPC");
        new ec2cluster_1.Ec2Cluster(stack, "Ec2Cluster", {
            vpc,
            instanceTypes: ["t3.medium"],
            extraUserData: ["echo 1"],
        });
        expect(assert_1.SynthUtils.toCloudFormation(stack)).toMatchSnapshot();
    });
    test("can set tags", () => {
        const stack = new cdk_1.Stack();
        const vpc = new aws_ec2_1.Vpc(stack, "VPC");
        new ec2cluster_1.Ec2Cluster(stack, "Ec2Cluster", {
            vpc,
            instanceTypes: ["t3.medium"],
            tags: {
                Service: "example",
                Env: "develop",
                roles: "develop:personal,misc:misc"
            },
        });
        expect(assert_1.SynthUtils.toCloudFormation(stack)).toMatchSnapshot();
    });
    test("error when specifying a single instance type with spot", () => {
        const stack = new cdk_1.Stack();
        const vpc = new aws_ec2_1.Vpc(stack, "VPC");
        expect(() => {
            new ec2cluster_1.Ec2Cluster(stack, "Ec2Cluster", {
                vpc,
                instanceTypes: ["t3.medium"],
                onDemandPercentage: 20,
            });
        }).toThrow(new Error("When using spot instances, please set multiple instance types."));
    });
    test("error when specifying multiple instance types with on-demand", () => {
        const stack = new cdk_1.Stack();
        const vpc = new aws_ec2_1.Vpc(stack, "VPC");
        expect(() => {
            new ec2cluster_1.Ec2Cluster(stack, "Ec2Cluster", {
                vpc,
                instanceTypes: ["t3.medium", "t2.medium"],
            });
        }).toThrow(new Error("When using on-demand instances, please set single instance type."));
    });
    test("error when specifying multiple instance types with onDemandPercentage: 100", () => {
        const stack = new cdk_1.Stack();
        const vpc = new aws_ec2_1.Vpc(stack, "VPC");
        expect(() => {
            new ec2cluster_1.Ec2Cluster(stack, "Ec2Cluster", {
                vpc,
                instanceTypes: ["t3.medium", "t2.medium"],
                onDemandPercentage: 100,
            });
        }).toThrow(new Error("When using on-demand instances, please set single instance type."));
    });
});
