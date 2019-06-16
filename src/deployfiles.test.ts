import { SynthUtils } from "@aws-cdk/assert"
import { Stack } from "@aws-cdk/cdk"
import { DeployFiles } from "./deployfiles"
import { Role, ServicePrincipal } from "@aws-cdk/aws-iam"

describe("deployfiles", () => {
  test("default", () => {
    const stack = new Stack()
    const instanceRole = new Role(stack, "Role", {
      assumedBy: new ServicePrincipal("ec2.amazonaws.com")
    })

    new DeployFiles(stack, "DeployFiles", {
      source: "examples",
      instanceRole,
      targets: [{
        key: "aws:cloudformation:stack-name",
        values: [stack.name]
      }]
    })

    expect(SynthUtils.toCloudFormation(stack)).toMatchSnapshot()
  })
})
