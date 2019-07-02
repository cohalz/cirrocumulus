import { SynthUtils } from "@aws-cdk/assert"
import { Schedule } from "@aws-cdk/aws-events"
import { Role, ServicePrincipal } from "@aws-cdk/aws-iam"
import { Bucket } from "@aws-cdk/aws-s3"

import { Stack } from "@aws-cdk/core"
import { DeployFiles } from "./deployfiles"

import * as path from "path"

describe("deployfiles", () => {
  test("default", () => {
    const stack = new Stack()
    const instanceRole = new Role(stack, "Role", {
      assumedBy: new ServicePrincipal("ec2.amazonaws.com"),
    })

    // const bucket = new Bucket(stack, "Bucket")

    const deployFiles = new DeployFiles(stack, "DeployFiles", {
      // bucket,
      instanceRole,
      source: path.join(process.cwd(), "examples/"),
      targets: [
        {
          key: "aws:cloudformation:stack-name",
          values: [stack.stackName],
        },
      ],
    })

    expect(SynthUtils.toCloudFormation(stack)).toMatchSnapshot()
  })

  test("can set scheduleExpression", () => {
    const stack = new Stack()
    const instanceRole = new Role(stack, "Role", {
      assumedBy: new ServicePrincipal("ec2.amazonaws.com"),
    })

    const deployFiles = new DeployFiles(stack, "DeployFiles", {
      instanceRole,
      schedule: Schedule.cron({ minute: "0", hour: "10" }),
      source: path.join(process.cwd(), "examples/"),
      targets: [
        {
          key: "aws:cloudformation:stack-name",
          values: [stack.stackName],
        },
      ],
    })

    expect(SynthUtils.toCloudFormation(stack)).toMatchSnapshot()
  })

  test("can set s3Prefix", () => {
    const stack = new Stack()
    const instanceRole = new Role(stack, "Role", {
      assumedBy: new ServicePrincipal("ec2.amazonaws.com"),
    })

    const deployFiles = new DeployFiles(stack, "DeployFiles", {
      instanceRole,
      s3Prefix: "tmp/",
      source: path.join(process.cwd(), "examples/"),
      targets: [
        {
          key: "aws:cloudformation:stack-name",
          values: [stack.stackName],
        },
      ],
    })

    expect(SynthUtils.toCloudFormation(stack)).toMatchSnapshot()
  })

  test("can set bucket", () => {
    const stack = new Stack()
    const instanceRole = new Role(stack, "Role", {
      assumedBy: new ServicePrincipal("ec2.amazonaws.com"),
    })
    const bucket = new Bucket(stack, "Bucket")

    const deployFiles = new DeployFiles(stack, "DeployFiles", {
      bucket,
      instanceRole,
      source: path.join(process.cwd(), "examples/"),
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
