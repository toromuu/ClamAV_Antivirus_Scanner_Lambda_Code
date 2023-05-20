const NodeClam = require("clamscan");  // Import NodeClam module for virus scanning
const fs = require("fs");  // Import fs module for file system operations
const AWS = require("aws-sdk");  // Import AWS SDK for S3 operations
const path = require("path");  // Import path module for file path operations

const region = process.env.AWS_REGION;  // Get AWS region from environment variable
const production_bucket = process.env.S3_PRODUCTION_BUCKET;  // Get production or destionation S3 bucket from environment variable
const sns_topic_arn = process.env.SNS_ARN_TOPIC; // Get topic for send email

const sns = new AWS.SNS(); // Initialize SNS client

const s3 = new AWS.S3({  // Initialize S3 client
  region: region,
});

const options = {  // Options for virus scanning, by default uses clamdscan deamon
  preference: "clamscan",
};

// Lambda function handler for S3 events
module.exports.handler = async (s3Event) => {
  console.log("Received S3 event - Handling virus scan", JSON.stringify(s3Event));

  // Get source bucket and object key from S3 event
  const sourceBucket = s3Event.Records[0].s3.bucket.name;
  const objectKey = decodeURIComponent(s3Event.Records[0].s3.object.key.replace(/\+/g, " "));

  // Download object from S3 and save it to a localtemporal file
  const objectToScan = await s3.getObject({
    Bucket: sourceBucket,
    Key: objectKey,
  }).promise();

  // Need to recreate the same folder structure if user upload entire folder
  const localPath = `/tmp/${objectKey}`;
  const localDir = path.dirname(localPath);
  fs.mkdirSync(localDir, { recursive: true });
  fs.writeFileSync(`/tmp/${objectKey}`, objectToScan.Body);
  console.log(`File ${objectKey} written successfully\n`);

  // Initialize virus scanner and perform scan
  const ClamScan = new NodeClam();

  await ClamScan.init(options)
    .then(async (clamscan) => {
     try {   
      console.log(clamscan);

      const version = await clamscan.getVersion();
      // Log the version of virus database, like 1-2 days is updated with new definitions
      console.log(`ClamAV Version: ${version}`);

      // Scan the object
      const { err, file, isInfected, viruses } = await clamscan.isInfected(localPath);

      // If malware is detected, maintain the object in the quarantine bucket
      if (isInfected === true) {
        console.log("INFECTED");
        const timestamp = new Date().toISOString();

        // Add tags to the objects in S3
        await s3.putObjectTagging({
          Bucket: sourceBucket,
          Key: objectKey,
          Tagging: {
            TagSet: [
              { Key: "Status", Value: "INFECTED" },
              { Key: "Timestamp", Value: timestamp },
              { Key: "Virus", Value: viruses.toString() },
                ],
              },
            })
            .promise();
          console.log(`Virus found, ${objectKey}`);

          // Send the email with the notification of virus found to the PDL of admins
          //const message = `<!DOCTYPE html><html><body><h1>[Critical AWS]: Virus Found in S3 Bucket</h1><p>Hello Security Champions,<br><br>This email is to notify you that a virus has been found in the S3 bucket. Immediate action is required to investigate and mitigate the issue.</p><p>Details:<ul><li>Object: ${objectKey}</li><li>Virus name:${viruses.toString()}</li><li>Timestamp: ${timestamp}</li></ul></p><p>Please take appropriate measures to secure the S3 bucket and remove the virus promptly.</p><p>Best regards,<br>ClamAV Antivirus Scanner</p></body></html>`;
          const message = `Content-Type: text/html; charset=utf-8

          <!DOCTYPE html>
          <html>
          <body>
              <h1>[Critical AWS]: Virus Found in S3 Bucket</h1>
              <p>
                  Hello Security Champions,
                  <br><br>
                  This email is to notify you that a virus has been found in the S3 bucket. Immediate action is required to investigate and mitigate the issue.
              </p>
              <p>
                  Details:
                  <ul>
                      <li>Object: ${objectKey}</li>
                      <li>Virus name: ${viruses.toString()}</li>
                      <li>Timestamp: ${timestamp}</li>
                  </ul>
              </p>
              <p>
                  Please take appropriate measures to secure the S3 bucket and remove the virus promptly.
              </p>
              <p>
                  Best regards,<br>
                  ClamAV Antivirus Scanner
              </p>
          </body>
          </html>`;
          
          const params = {
              Message: message,
              Subject: 'AWS Notification',
              TopicArn: sns_topic_arn
          };
          try {
              const result = await sns.publish(params).promise();
              console.log('SNS message sent:', result);
              return {
                  statusCode: 200,
                  body: 'SNS message sent successfully'
              };
          } catch (error) {
              console.error(error);
              return {
                  statusCode: 500,
                  body: 'Error sending SNS message'
              };
          }
      } else {

          // If no malware is detected move the object to the production bucket
          console.log("CLEAN");    
          await s3.copyObject({
            Bucket: production_bucket,
            CopySource: `${sourceBucket}/${objectKey}`,
            Key: objectKey,
          }).promise();

           // Tag the object with the scan result, virus found and timestamp
          const timestamp = new Date().toISOString();
          await s3.putObjectTagging({
            Bucket: production_bucket,
            Key: objectKey,
            Tagging: {
              TagSet: [
                { Key: "Status", Value: "CLEAN" },
                { Key: "Timestamp", Value: timestamp }
              ],
            },
          }).promise();
          
          // Delete object from the quarantine bucket
          await s3.deleteObject({
            Bucket: sourceBucket,
            Key: objectKey,
          }).promise();
        }
      } catch (err) {
        console.log("Errors have occurred during scanning: ");
        console.error(err);
      }
    })
    .catch((err) => {
      console.log("Errors have occurred during initialization: ");
      console.error(err);
    });
};
