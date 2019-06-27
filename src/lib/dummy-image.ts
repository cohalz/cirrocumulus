import {
  IMachineImage,
  MachineImageConfig,
  OperatingSystemType,
} from "@aws-cdk/aws-ec2"
import { Construct } from "@aws-cdk/core"

export class DummyImage implements IMachineImage {
  public getImage(scope: Construct): MachineImageConfig {
    return {
      imageId: "",
      osType: OperatingSystemType.LINUX,
    }
  }
}
