import { aws_ec2 as ec2 } from 'aws-cdk-lib';
import { Construct } from 'constructs';

const personalIp = "92.35.130.126/24"

export interface WebsiteSecurityGroupProps {
    vpc: ec2.Vpc
}

export class WebsiteSecurityGroup extends Construct {

    securityGroup: ec2.SecurityGroup

    constructor(scope: Construct, id: string, props: WebsiteSecurityGroupProps) {
        super(scope, id)

        this.securityGroup = new ec2.SecurityGroup(this, id, {
            vpc: props.vpc,
            allowAllIpv6Outbound: true,
            allowAllOutbound: true,
            description: "My Security Group 2",
            securityGroupName: "My Security Group 2",
          });
        
        this.securityGroup.addIngressRule(ec2.Peer.ipv4(personalIp), ec2.Port.tcp(22), "SSH Ingress")
        this.securityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), "HTTP Ingress")
        this.securityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443), "HTTPS Ingress")
    }
}