# Cirrocumulus

![Build Status](https://travis-ci.org/cohalz/cirrocumulus.png?branch=master)

## Libraries
### Ec2Cluster
- A ECS cluster configuration such as userdata
### DeployFiles
- Deploy local files to all instances of the ECS cluster
### ScalingPlan
- CPU-based auto-scaling configuration using AWS Auto Scaling

## Synopsis

```typescript
import * as cdk from '@aws-cdk/cdk'
import * as ec2 from '@aws-cdk/aws-ec2'
import * as ecs from '@aws-cdk/aws-ecs'
import * as ecsPatterns from '@aws-cdk/aws-ecs-patterns'

import { Ec2Cluster, DeployFiles, ScalingPlan } from '@cohalz/cirrocumulus'

export class SampleStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props)

    const vpcProvider = new ec2.VpcNetworkProvider(this, { tags: { 'tag:Env': 'Prod' } })
    const vpc = ec2.Vpc.fromVpcAttributes(this, 'ExternalVpc', vpcProvider.vpcProps)

    const ec2Cluster = new Ec2Cluster(stack, "Ec2Cluster", {
      instanceTypes: ["t3.medium"],
      vpc,
    })

    const instanceRole = ec2Cluster.autoScalingGroup.node.findChild(
      "InstanceRole"
    ) as Role

    const deployFiles = new DeployFiles(stack, "UpdateFiles", {
      instanceRole,
      source: "examples/",
      targets: [
        {
          key: "tag:ClusterName",
          values: [ec2Cluster.cluster.clusterName],
        },
      ],
    })

    const scalingPlan = new ScalingPlan(stack, "ScalingPlan", {
      autoScalingGroupName: ec2Cluster.autoScalingGroup.autoScalingGroupName,
      tagFilters: [
        {
          key: "ClusterName",
          values: [ec2Cluster.cluster.clusterName],
        },
      ],
    })

    const ecsService = new ecsPatterns.LoadBalancedEc2Service(this, "Ec2Service", {
      cluster: ec2Cluster.cluster,
      memoryLimitMiB: 512,
      image: ecs.ContainerImage.fromRegistry("amazon/amazon-ecs-sample"),
    })

    new cdk.CfnOutput(this, 'LoadBalancerDNS', { value: ecsService.loadBalancer.loadBalancerDnsName })
  }
}
```

## License

cirrocumulus is distributed under the [Apache License, Version 2.0](https://www.apache.org/licenses/LICENSE-2.0).

See [LICENSE](./LICENSE) and [NOTICE](./NOTICE) for more information.
