aws cloudformation create-stack --stack-name AlertDemo --template-body file://path/to/template.yaml

# AccountID

767764876960

deffon_non_root

# Approach

* Create ec2 instance based on AMI
  * Check what is free?
  * script for generating AMI (name partially based on date and time)
    * dynamically lookup AMI version in CF? For later maybe. https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/walkthrough-custom-resources-lambda-lookup-amiids.html
  * need experimentation first.
  * nginx and java
* install nginx and java.
  * Configure lightsail to listen on https port?
  * Is there a startup-script option?
  * Maybe create a reusable image.
* script for scp:ing uberjar file and starting it.
* create iam-user specifically for updating stack, and for creating image?