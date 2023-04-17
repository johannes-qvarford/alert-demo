import * as cdk from 'aws-cdk-lib';
import { InstanceClass, InstanceSize, InstanceType } from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';
import { WebsiteSecurityGroup } from './website-security-group';
import { Ubuntu2004Ec2Instance } from './ubuntu-2004-ec2-instance';
import { ManagedPolicy, ServicePrincipal } from 'aws-cdk-lib/aws-iam';

const REGION = 'eu-north-1'
const AVAILABILITY_ZONE = 'eu-north-1a'

export class Example1Stack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Just an example for how to create an IAM user that cloudformation can assume to create anything on the user's behalf.
    const user = new cdk.aws_iam.Role(this, "MyRole", {
      managedPolicies: [
        ManagedPolicy.fromAwsManagedPolicyName("arn:aws:iam::aws:policy/AdministratorAccess")
      ],
      assumedBy: new ServicePrincipal('cloudformation.amazonaws.com'),
      inlinePolicies: undefined,
      roleName: "MyRole",
    })

    const myVpc = new cdk.aws_ec2.Vpc(this, "MyVpc", {
      availabilityZones: [AVAILABILITY_ZONE],
      enableDnsHostnames: true,
      enableDnsSupport: true,
      // subnets should have either a NAT gateway, and internet gateway or neither.
      //gatewayEndpoints
      //natGatewayProvider: cdk.aws_ec2.NatProvider.gateway(),
      ipAddresses: cdk.aws_ec2.IpAddresses.cidr("10.0.0.0/16"),
      
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'main',
          subnetType: cdk.aws_ec2.SubnetType.PUBLIC,
        },
     ],
     vpcName: "MyVpc"
    });

    const sg = new WebsiteSecurityGroup(this, "MySecurityGroup", { vpc: myVpc })

    const instance = new Ubuntu2004Ec2Instance(this, "MyInstance", {
      instanceType: InstanceType.of(InstanceClass.T4G, InstanceSize.NANO),
      vpc: myVpc,
      // storage default comes from ami
      // no detailed monitoring
      instanceName: "MyInstance",
      keyName: "MyKeyPair",
      // privateIpAddress - if you need the same ip within the subnet to reach it every time.
      securityGroup: sg.securityGroup,
      // ssmSessionPermissions - also need to install and SSM agent if you want to do this.
      vpcSubnets: {
        subnetGroupName: 'main',
      },
      region: REGION,
      stackId: id
    })
  }
}
