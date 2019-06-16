# Cirrocumulus

##
- userdata configuration including ecs.config
- 

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

    const ec2Cluster = new Ec2Cluster(this, "Ec2Cluster", {
      vpc,
      instanceTypes: ['t3.medium'],
      desiredCapacity: 1,
      maxCapacity: 2,
      tags: {
        Service: "sample",
        Env: "develop",
        roles: "develop:personal,misc:misc"
      }
    })

    new DeployFiles(this, "UpdateFiles", {
      source: "example",
      instanceRole: ec2Cluster.instanceRole,
      targets: [{
        key: 'tag:ClusterName',
        values: [ec2Cluster.cluster.clusterName]
      }]
    })

    new ScalingPlan(this, "ScalingPlan", {
      autoScalingGroupName: ec2Cluster.autoScalingGroupName,
      tagFilters: [{
        key: 'ClusterName',
        values: [ec2Cluster.cluster.clusterName]
      }]
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
