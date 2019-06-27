import {
  IMachineImage,
  MachineImageConfig,
  OperatingSystemType,
} from "@aws-cdk/aws-ec2"
import { Construct } from "@aws-cdk/core"

export class ImportedImage implements IMachineImage {
  constructor(private readonly amiId: string) {}
  public getImage(scope: Construct): MachineImageConfig {
    return {
      imageId: this.amiId,
      osType: OperatingSystemType.LINUX,
    }
  }
}
