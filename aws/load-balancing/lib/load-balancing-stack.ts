import { aws_ec2 as ec2, aws_apigateway as apigw, aws_elasticloadbalancingv2 as elbv2, aws_autoscaling as as, Stack, StackProps, Duration } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { WebsiteSecurityGroup } from './website-security-group';
import { Ubuntu2004Ec2Instance } from './ubuntu-2004-ec2-instance';
import { LoadBalancerSecurityGroup } from './load-balancer-security-group';
import { readFileSync } from 'fs'
import * as YAML from 'yaml'
import { SubnetType } from 'aws-cdk-lib/aws-ec2';
import { TargetType } from 'aws-cdk-lib/aws-elasticloadbalancingv2';

const AVAILABILITY_ZONES = ['eu-north-1a','eu-north-1b']
const REGION = 'eu-north-1'

export class LoadBalancingStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const myVpc = new ec2.Vpc(this, "MyVpc", {
      availabilityZones: AVAILABILITY_ZONES,
      enableDnsHostnames: true,
      enableDnsSupport: true,
      ipAddresses: ec2.IpAddresses.cidr("10.0.0.0/16"),
      
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'public',
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          cidrMask: 24,
          name: 'private',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        },
     ],
     vpcName: "MyVpc"
    });

    // Load balancer can talk to ec2 instance (through port 80) even though only port 22 is open in the security group.
    const websiteSecurityGroup = new WebsiteSecurityGroup(this, "MySecurityGroup", { vpc: myVpc })

    // https://stackoverflow.com/a/51626887
    // https://stackoverflow.com/a/70433392
    // https://stackoverflow.com/a/71702119
    // API Gateway, connected to Application Load Balancer, through HTTP.
    // Don't use a Network Load Balancer, because it does not understand HTTP (a 500 is still a "successful" TCP stream)

    const userData = ec2.UserData.forLinux({})
    userData.addCommands(
      `sudo apt-get update -y`,
      `sudo apt-get install -y nginx`,
      `sudo systemctl enable nginx`,
      `sudo systemctl start nginx`
    )

    const applicationTargetGroup = new elbv2.ApplicationTargetGroup(this, "MyApplicationTargetGroup", {
        
      // Need to add a certificate and HTTPS config to nginx to listen to HTTPS
      protocol: elbv2.ApplicationProtocol.HTTP,
      // stickinessCookieName
      targetGroupName: "MyApplicationTargetGroup", // Maybe hard-coding the name is bad, when it has to be recreated instead of just updated?

      // Can't use ALB or IP, needs to be instance for the autoscaling group to fill it.
      targetType: TargetType.INSTANCE,
      
      // The AutoScalingGroup will connect with this target group, and add instances as they are created and removed
      vpc: myVpc
    })

    const autoscalingGroup = new as.AutoScalingGroup(this, "AutoScalingGroup", {
      vpc: myVpc,
      allowAllOutbound: true,

      // true while debugging
      associatePublicIpAddress: true,
      vpcSubnets: {
        subnetType: SubnetType.PUBLIC
      },

      autoScalingGroupName: "AutoScalingGroup",
      capacityRebalance: true,
      // cooldown
      // defaultInstanceWarmup
      // groupMetrics
      // healthCheck
      healthCheck: as.HealthCheck.elb({
        grace: Duration.seconds(60)
      }),
      maxCapacity: 3,
      minCapacity: 2,
      securityGroup: websiteSecurityGroup.securityGroup,
      machineImage: ec2.MachineImage.genericLinux({
        [REGION]: 'ami-0bf31a929ffb5e8d7', // Ubuntu 22.04 LTS 
      }),
      userData: userData,
      keyName: "MyKeyPair",
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.NANO)
    })

    autoscalingGroup.attachToApplicationTargetGroup(applicationTargetGroup)

    // https://repost.aws/knowledge-center/api-gateway-application-load-balancers
    // NEED TO USE HTTP INTEGRATION

    // Underlying "generic" resource is CfnLoadBalancer for gateways, networks and application load balancing.
    const lb = new elbv2.ApplicationLoadBalancer(this, "MyApplicationLoadBalancer", {
      vpc: myVpc,
      // This affects if it adds itself to a private or public subnet
      internetFacing: true,
      securityGroup: new LoadBalancerSecurityGroup(this, "ApplicationLoadBalancerSecurityGroup", {
        vpc: myVpc
      }).securityGroup,
      // dropInvalidHeaderFields
      // desyncMitigationMode
      loadBalancerName: "MyApplicationLoadBalancer", // Maybe hard-coding the name is bad, when it has to be recreated instead of just updated?

    })
    const _ = (lb.node.defaultChild as elbv2.CfnLoadBalancer).overrideLogicalId("MyApplicationLoadBalancer")

    const listener = new elbv2.ApplicationListener(this, "ApplicationListener", {
      loadBalancer: lb,
      // HTTPS requires a certificate
      protocol: elbv2.ApplicationProtocol.HTTP,
      defaultTargetGroups: [
        applicationTargetGroup
      ]
    })

    const openapiYaml = readFileSync("openapi.yml").toString('utf-8')
    const openapiJson = YAML.parse(openapiYaml)

    // Useful if you need per-client usage keys
    // HttpApi allows you to wrap individual operations, and forward them to a lambda or http endpoint.
    // you are also allowed to secure endpoints in HttpApi, but I guess the point is that you don't get automatic validation,
    // transformation etc. like with RestApi?
    const restApi = new apigw.SpecRestApi(this, "RestApi", {
      //minCompressionSize
      retainDeployments: true,
      // Refer to MyApplicationLoadBalancer Arn and DnsName in the file to redirect traffic.
      // unless you want to use a network load balancer, all traffic need an IP.
      // Guessing if a private ECS or Fargate cluster is used, it will also have to expose an ip.
      // IMPORTANT THAT IT IS INLINE!
      // IF NOT, SUBSTITUTION DOESNT APPEAR TO BE PERFORMED
      apiDefinition: apigw.ApiDefinition.fromInline(openapiJson) //apigw.ApiDefinition.fromAsset("openapi.yml"),
    })

    // We need to make sure that the load balancer is created before reading its' DNS Name
    // NOT 100% sure this is needed.
    restApi.node.addDependency(lb)
  }
}
