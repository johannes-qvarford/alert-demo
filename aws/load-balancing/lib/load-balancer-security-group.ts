import { aws_ec2 as ec2 } from 'aws-cdk-lib';
import { Construct } from 'constructs';

const personalIp = "92.35.130.126/24"

export interface LoadBalancerSecurityGroupProps {
    vpc: ec2.Vpc
}

export class LoadBalancerSecurityGroup extends Construct {

    securityGroup: ec2.SecurityGroup

    constructor(scope: Construct, id: string, props: LoadBalancerSecurityGroupProps) {
        super(scope, id)

        this.securityGroup = new ec2.SecurityGroup(this, id, {
            vpc: props.vpc,
            allowAllIpv6Outbound: true,
            allowAllOutbound: true,
            description: id,
          });
    }
}