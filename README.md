# ClamAV_Antivirus_Scanner_Lambda_Code

This repository contains: 

- The javascript code to scan an object in an s3 bucket using the ClamAV antivirus engine, and determine if the object is infected or not. If infected, an email is sent to an sns topic, and if safe, it is moved to a production bucket.

- The definition of a github actions workflow to scheduledly create an image and upload a docker image to an ECR repository.


![Architecture Diagram](./readme/S3-malware-scanner-diagram.png)

## Solution Flow


1. A user uploads a file to the S3 bucket of quarantine.
2. S3 triggers a notification, which in turn triggers a Lambda function.
3. The Lambda function downloads the file and scans it using the clamav engine.
4. If the file is infected, the Lambda function sends an email using an SNS topic to notify an administrator that the file is infected and needs to be dealt with.
5. If the file is clean, the Lambda function moves the file to the production bucket for use in the production environment.

## Build Process

There is also a scheduled process that runs each midnight, which uses GitHub actions to build, tag, and push an image to an ECR private repository. This image is used as the environment and code for the Lambda function.

The Dockerfile used to build the image starts from public.ecr.aws/lambda/nodejs:16 and installs the clamav tool. It then updates the virus database definition and uses a JavaScript file as a handler for the Lambda function.

## Installation and Usage

To install and use this architecture, you will need to:

1. Create an S3 bucket of quarantine.
2. Create an SNS topic and subscribe an email address to it.
3. Create an IAM role for the Lambda function with permissions to access the S3 buckets and the SNS topic.
4. Deploy the Lambda function using the image built and pushed to the ECR private repository.
5. Configure the S3 bucket of quarantine to trigger the Lambda function when a file is uploaded.

For deploy this resources you can use IaC approach https://github.com/toromuu/ClamAV_Antivirus_Scanner_Terragrunt-Infrastructure-Live


## Configure github actions 

The workflow need the AWS Credentials to perform the push to ECR and update the lambda. So you have to set it manually:

1. Open your GitHub repository and go to the "Settings" tab.
2. Click on "Secrets" in the left sidebar.
3. Click on "New Repository Secret" to create a new secret.
4. Name your secret as "AWS_ACCESS_KEY_ID" and paste your AWS access key ID in the "Value" field.
5. Click on "Add Secret" to save the secret.
6. Repeat steps 3-5 to create another secret named "AWS_SECRET_ACCESS_KEY" and paste your AWS secret access key in the "Value" field.


## License

This architecture is released under the MIT License. See `LICENSE` for more information.

