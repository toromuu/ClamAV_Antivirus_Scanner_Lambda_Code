const NodeClam = require("clamscan");  // Import NodeClam module for virus scanning
const fs = require("fs");  // Import fs module for file system operations
const AWS = require("aws-sdk");  // Import AWS SDK for S3 operations
const path = require("path");  // Import path module for file path operations

const region = process.env.AWS_REGION;  // Get AWS region from environment variable
const production_bucket = process.env.S3_PRODUCTION_BUCKET;  // Get production or destionation S3 bucket from environment variable

const s3 = new AWS.S3({  // Initialize S3 client
  region: region,
});

const options = {  // Options for virus scanning
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
      console.log(`ClamAV Version: ${version}`);
      const { err, file, isInfected, viruses } = await clamscan.isInfected(localPath);

      // If malware is detected, maintain the object in the quarantine bucket
      if (isInfected === true) {
        console.log("INFECTED");
        const timestamp = new Date().toISOString();
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
      } else {
          // If no malware is detected, tag the object with the scan result and timestamp
          console.log("CLEAN");    
          await s3.copyObject({
            Bucket: production_bucket,
            CopySource: `${sourceBucket}/${objectKey}`,
            Key: objectKey,
          }).promise();
          const timestamp = new Date().toISOString();
          // Tag the object with the scan result, virus found and timestamp
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
