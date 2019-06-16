import { Construct } from "@aws-cdk/cdk";
import { Role } from "@aws-cdk/aws-iam";
import { Bucket } from "@aws-cdk/aws-s3";
import { CfnAssociation } from "@aws-cdk/aws-ssm";
export interface DeployFilesProps {
    /**
     * The Local directory to deploy to instance
     *
     */
    source: string;
    /**
     * The instance role
     *
     */
    instanceRole: Role;
    /**
     * The targets that the SSM document sends commands to
     *
     */
    targets: CfnAssociation.TargetProperty[];
}
export declare class DeployFiles extends Construct {
    bucket: Bucket;
    constructor(scope: Construct, id: string, props: DeployFilesProps);
    private createBucketToDeploy;
    private createDocumentToDeploy;
    private createEventToAutoDeploy;
}
