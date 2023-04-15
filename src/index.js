const NodeClam = require("clamscan");
const fs = require("fs");
const AWS = require("aws-sdk");
const path = require("path");

const region = process.env.AWS_REGION;
const quarantine_bucket = process.env.S3_BUCKET_QUARANTINE;

const s3 = new AWS.S3({
  region: region,
});

const options = {
  preference: "clamscan",
};

module.exports.handler = async (s3Event) => {
  console.log(
    "Received S3 event - handling virus scan",
    JSON.stringify(s3Event)
  );

  const sourceBucket = s3Event.Records[0].s3.bucket.name;
  const objectKey = decodeURIComponent(
    s3Event.Records[0].s3.object.key.replace(/\+/g, " ")
  );

  const objectToScan = await s3
    .getObject({
      Bucket: sourceBucket,
      Key: objectKey,
    })
    .promise();

  const localPath = `/tmp/${objectKey}`;
  // Create any necessary local folders
  const localDir = path.dirname(localPath);
  fs.mkdirSync(localDir, { recursive: true });

  fs.writeFileSync(`/tmp/${objectKey}`, objectToScan.Body);
  console.log(`File ${objectKey} written successfully\n`);

  ClamScan = new NodeClam();

  await ClamScan.init(options)
    .then(async (clamscan) => {
      try {
        console.log(clamscan);
        const version = await clamscan.getVersion();
        console.log(`ClamAV Version: ${version}`);
        const { err, file, isInfected, viruses } = await clamscan.isInfected(
          localPath
        );

        // If malware is detected, move the object to the quarantine bucket
        if (isInfected === true) {
          await s3
            .copyObject({
              Bucket: quarantine_bucket,
              CopySource: `${sourceBucket}/${objectKey}`,
              Key: objectKey,
            })
            .promise();

          const timestamp = new Date().toISOString();

          await s3
            .putObjectTagging({
              Bucket: quarantine_bucket,
              Key: objectKey,
              Tagging: {
                TagSet: [
                  { Key: "Status", Value: "Dirty" },
                  { Key: "ScanTimestamp", Value: timestamp },
                  { Key: "Virus", Value: viruses.toString() },
                ],
              },
            })
            .promise();

          await s3
            .deleteObject({
              Bucket: sourceBucket,
              Key: objectKey,
            })
            .promise();

          console.log(`Virus found, ${objectKey} removed from ${sourceBucket}`);
        } else {
          // If no malware is detected, tag the object with the scan result and timestamp
          console.log("CLEAN");
          const timestamp = new Date().toISOString();
          await s3
            .putObjectTagging({
              Bucket: sourceBucket,
              Key: objectKey,
              Tagging: {
                TagSet: [
                  { Key: "Status", Value: "Clean" },
                  { Key: "ScanTimestamp", Value: timestamp },
                ],
              },
            })
            .promise();
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
