"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert_1 = require("@aws-cdk/assert");
const cdk_1 = require("@aws-cdk/cdk");
const deployfiles_1 = require("./deployfiles");
const aws_iam_1 = require("@aws-cdk/aws-iam");
describe("deployfiles", () => {
    test("default", () => {
        const stack = new cdk_1.Stack();
        const instanceRole = new aws_iam_1.Role(stack, "Role", {
            assumedBy: new aws_iam_1.ServicePrincipal("ec2.amazonaws.com")
        });
        new deployfiles_1.DeployFiles(stack, "DeployFiles", {
            source: "examples",
            instanceRole,
            targets: [{
                    key: "aws:cloudformation:stack-name",
                    values: [stack.name]
                }]
        });
        expect(assert_1.SynthUtils.toCloudFormation(stack)).toMatchSnapshot();
    });
});
