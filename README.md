# Cirrocumulus

![Build Status](https://travis-ci.org/cohalz/cirrocumulus.png?branch=master)

## Libraries
### Ec2Cluster
- A ECS cluster configuration such as userdata
### DeployFiles
- Deploy local files to all instances of the ECS cluster

## Synopsis

```typescript
import { SynthUtils } from "@aws-cdk/assert"
import { InstanceClass, InstanceSize, Vpc } from "@aws-cdk/aws-ec2"
import { Role } from "@aws-cdk/aws-iam"
import { Stack } from "@aws-cdk/core"
import { Ec2Cluster, DeployFiles, ScalingPlan } from '@cohalz/cirrocumulus'
import * as path from "path"

const stack = new Stack()
const vpc = new Vpc(stack, "VPC")

const ec2Cluster = new Ec2Cluster(stack, "Ec2Cluster", {
  instanceTypes: [new InstanceType("t3.medium")],
  vpc,
})

const deployFiles = new DeployFiles(stack, "DeployFiles", {
  source: path.join(process.cwd(), "examples/"),
  targets: [
    {
      key: "tag:ClusterName",
      values: [ec2Cluster.cluster.clusterName],
    },
  ],
})

const instanceRole = ec2Cluster.autoScalingGroup.node.findChild(
  "InstanceRole"
) as Role
instanceRole.addToPolicy(deployFiles.deployPolicy())

const ecsService = new ecsPatterns.LoadBalancedEc2Service(this, "Ec2Service", {
  cluster: ec2Cluster.cluster,
  memoryLimitMiB: 512,
  image: ecs.ContainerImage.fromRegistry("amazon/amazon-ecs-sample"),
})

new cdk.CfnOutput(this, 'LoadBalancerDNS', { value: ecsService.loadBalancer.loadBalancerDnsName })
```

## License

cirrocumulus is distributed under the [Apache License, Version 2.0](https://www.apache.org/licenses/LICENSE-2.0).

See [LICENSE](./LICENSE) and [NOTICE](./NOTICE) for more information.
