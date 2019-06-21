import { SynthUtils } from "@aws-cdk/assert"
import { Role, ServicePrincipal } from "@aws-cdk/aws-iam"
import { Stack } from "@aws-cdk/cdk"

import { DeployFiles } from "./deployfiles"

describe("deployfiles", () => {
  test("default", () => {
    const stack = new Stack()
    const instanceRole = new Role(stack, "Role", {
      assumedBy: new ServicePrincipal("ec2.amazonaws.com"),
    })

    const deployFiles = new DeployFiles(stack, "DeployFiles", {
      instanceRole,
      source: "examples/",
      targets: [
        {
          key: "aws:cloudformation:stack-name",
          values: [stack.stackName],
        },
      ],
    })

    expect(SynthUtils.toCloudFormation(stack)).toMatchSnapshot()
  })
})
