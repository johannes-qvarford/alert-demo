import { Construct } from "constructs";
import { aws_ec2 as ec2 } from "aws-cdk-lib"

function noIndent(strings: TemplateStringsArray, ...placeholders: string[]) {
  let withSpace = strings.reduce((result, string, i) => (result + placeholders[i - 1] + string));
  let withoutSpace = withSpace.replace(/^\s*/gm, '');
  return withoutSpace;
}

type UbuntuEc2InstanceProps = Omit<ec2.InstanceProps, "machineImage" | "init" | "userData"> & {
    region: string,
    stackId: string
}

export class Ubuntu2004Ec2Instance extends Construct {
    constructor(scope: Construct, id: string, props: UbuntuEc2InstanceProps) {
      super(scope, id)

      const instanceLogicalId = id;

      const configSets = ec2.CloudFormationInit.fromConfigSets({
        configSets: {
          "full_install": ["install_and_enable_cfn_hup", "install-nginx"],
        },
        configs: {
          "install_and_enable_cfn_hup": new ec2.InitConfig([
            ec2.InitFile.fromString("/etc/cfn/cfn-hup.conf",
              noIndent`
                [main]
                stack=${id}
                region=${props.region}
              `,
              {
                mode: "000400",
                owner: "root",
                group: "root"
              }),
            ec2.InitFile.fromString("/etc/cfn/hooks.d/cfn-auto-reloader.conf",
              noIndent`
                [cfn-auto-reloader-hook]
                triggers=post.update
                path=Resources.${instanceLogicalId}.Metadata.AWS::CloudFormation::Init
                action=/usr/local/bin/cfn-init -v --stack ${props.stackId} --resource ${instanceLogicalId} --configsets full_install --region ${props.region}
                runas=root
              `,
              {
                mode: "000400",
                owner: "root",
                group: "root"
              }),
            ec2.InitFile.fromString("/lib/systemd/system/cfn-hup.service",
              noIndent`
              [Unit]
              Description=cfn-hup daemon
              [Service]
              Type=simple
              ExecStart=/usr/local/bin/cfn-hup
              Restart=always
              [Install]
              WantedBy=multi-user.target
            `,
            {
              mode: "000400",
              owner: "root",
              group: "root"
            }),
            ec2.InitCommand.shellCommand("systemctl enable cfn-hup.service", { key: "01enable_cfn_hup" }),
            ec2.InitCommand.shellCommand("systemctl start cfn-hup.service", { key: "02start_cfn_hup" })
          ]),
          "install-nginx": new ec2.InitConfig([
            ec2.InitPackage.apt("nginx"),
            ec2.InitService.enable("nginx", {serviceManager: ec2.ServiceManager.SYSTEMD}),
            ec2.InitCommand.shellCommand("echo hello world"),
          ])
        }
      })
    
      // /usr/local/bin/cfn-init -v --stack Example1Stack --resource MyInstance --configsets full_install --region eu-north-1
      const userData = ec2.UserData.forLinux({})
      userData.addCommands(
        `sudo apt-get update -y`,
        `sudo apt-get -y install python3-pip`,
        `mkdir -p /opt/aws/`,
        `sudo pip3 install https://s3.amazonaws.com/cloudformation-examples/aws-cfn-bootstrap-py3-latest.tar.gz`,
        `sudo ln -s /usr/local/init/ubuntu/cfn-hup /etc/init.d/cfn-hup`,
        `/usr/local/bin/cfn-init -v --stack ${props.stackId} --resource ${instanceLogicalId} --configsets full_install --region ${props.region}`,
        `/usr/local/bin/cfn-signal -e $? --stack ${props.stackId} --resource ${instanceLogicalId} --region ${props.region}`
      )

      const instance = new ec2.Instance(this, "MyInstance", {
        machineImage: ec2.MachineImage.genericLinux({
          [props.region]: 'ami-0bf31a929ffb5e8d7', // Ubuntu 22.04 LTS 
        }),
        // storage default comes from ami
        // no detailed monitoring
        init: configSets,
        instanceName: instanceLogicalId,
        userData: userData,
        ...props
      })
      instance.instance.overrideLogicalId(instanceLogicalId)
    }
}