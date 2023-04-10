import * as cdk from 'aws-cdk-lib';
import { CloudFormationInit, InitCommand, InitFile, InitPackage, InitService, InstanceClass, InstanceSize, InstanceType, MachineImage, ServiceManager } from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';

const REGION = 'eu-north-1'
const AVAILABILITY_ZONE = 'eu-north-1a'

export class Example1Stack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

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

    const sg = new cdk.aws_ec2.SecurityGroup(this, "MySecurityGroup", {
      vpc: myVpc,
      allowAllIpv6Outbound: true,
      allowAllOutbound: true,
      description: "My Security Group",
      securityGroupName: "My Security Group",
    });
    sg.addIngressRule(cdk.aws_ec2.Peer.ipv4("92.35.130.126/24"), cdk.aws_ec2.Port.tcp(22), "SSH Ingress")
    sg.addIngressRule(cdk.aws_ec2.Peer.anyIpv4(), cdk.aws_ec2.Port.tcp(80), "HTTP Ingress")
    sg.addIngressRule(cdk.aws_ec2.Peer.anyIpv4(), cdk.aws_ec2.Port.tcp(443), "HTTPS Ingress")


    /*
    InitPackage.apt("nginx"),
        InitService.enable("nginx", {serviceManager: ServiceManager.SYSTEMD}),
        InitCommand.shellCommand("echo hello world"),
        */
    const configSets = CloudFormationInit.fromConfigSets({
      configSets: {
        "full_install": ["install_and_enable_cfn_hup", "install-nginx"],
      },
      configs: {
        "install_and_enable_cfn_hup": new cdk.aws_ec2.InitConfig([
          InitFile.fromString("/etc/cfn/cfn-hup.conf",
          cdk.Fn.join('\n', [
            "[main]",
            `stack=${id}`,
            cdk.Fn.join("", ["region=", this.region])
          ]), {
            mode: "000400",
            owner: "root",
            group: "root"
          }),
          InitFile.fromString("/etc/cfn/hooks.d/cfn-auto-reloader.conf",
            cdk.Fn.join("\n", [
              "[cfn-auto-reloader-hook]",
              "triggers=post.update",
              "path=Resources.MyInstance00EC2Instance.Metadata.AWS::CloudFormation::Init",
              cdk.Fn.join("", [
                "action=/usr/local/bin/cfn-init -v --stack ${id} --resource MyInstance00EC2Instance --configsets full_install --region ",
                this.region
              ]),
              "runas=root"
            ]), {
            mode: "000400",
            owner: "root",
            group: "root"
          }),
          InitFile.fromString("/lib/systemd/system/cfn-hup.service",`
            [Unit]
            Description=cfn-hup daemon
            [Service]
            Type=simple
            ExecStart=/usr/local/bin/cfn-hup
            Restart=always
            [Install]
            WantedBy=multi-user.target
          `.replace(/^ +/, ""), {
            mode: "000400",
            owner: "root",
            group: "root"
          }),
          InitCommand.shellCommand("systemctl enable cfn-hup.service", { key: "01enable_cfn_hup" }),
          InitCommand.shellCommand("systemctl start cfn-hup.service", { key: "02start_cfn_hup" })
        ]),
        "install-nginx": new cdk.aws_ec2.InitConfig([
          InitPackage.apt("nginx"),
          InitService.enable("nginx", {serviceManager: ServiceManager.SYSTEMD}),
          InitCommand.shellCommand("echo hello world"),
        ])
      }
    })

    // /usr/local/bin/cfn-init -v --stack Example1Stack --resource MyInstance --configsets full_install --region eu-north-1
    const userData = cdk.aws_ec2.UserData.forLinux({})
    userData.addCommands(
      `sudo apt-get update -y`,
      `sudo apt-get -y install python3-pip`,
      `mkdir -p /opt/aws/`,
      `sudo pip3 install https://s3.amazonaws.com/cloudformation-examples/aws-cfn-bootstrap-py3-latest.tar.gz`,
      `sudo ln -s /usr/local/init/ubuntu/cfn-hup /etc/init.d/cfn-hup`,
      // /usr/local/bin/cfn-init -v --stack Example1Stack --resource MyInstance00EC2Instance --configsets full_install --region eu-north-1
      cdk.Fn.join("", [`/usr/local/bin/cfn-init -v --stack ${id} --resource MyInstance00EC2Instance --configsets full_install --region `, this.region]),
      cdk.Fn.join("", [`/usr/local/bin/cfn-signal -e $? --stack ${id} --resource MyInstance00EC2Instance --region `, this.region]))

    const instance = new cdk.aws_ec2.Instance(this, "MyInstance", {
      instanceType: InstanceType.of(InstanceClass.T4G, InstanceSize.NANO),
      machineImage: MachineImage.genericLinux({
        [REGION]: 'ami-0bf31a929ffb5e8d7', // Ubuntu 22.04 LTS 
      }),
      vpc: myVpc,
      // storage default comes from ami
      // no detailed monitoring
      init: configSets,
      instanceName: "MyInstance",
      keyName: "MyKeyPair",
      // privateIpAddress - if you need the same ip within the subnet to reach it every time.
      securityGroup: sg,
      // ssmSessionPermissions - also need to install and SSM agent if you want to do this.
      vpcSubnets: {
        subnetGroupName: 'main',
      },
      userData: userData
    })
    instance.instance.overrideLogicalId("MyInstance00EC2Instance")
  }
}
