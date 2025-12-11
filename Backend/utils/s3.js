const AWS = require('aws-sdk');

const s3Client = new AWS.S3({
  endpoint: process.env.S3_ENDPOINT || undefined,
  accessKeyId: process.env.S3_ACCESS_KEY || undefined,
  secretAccessKey: process.env.S3_SECRET_KEY || undefined,
  s3ForcePathStyle: true
});

async function uploadToS3({ buffer, filename, mimeType }) {
  if (!process.env.S3_BUCKET) throw new Error('No S3 bucket configured');
  const Key = `${Date.now()}_${filename}`;
  const params = {
    Bucket: process.env.S3_BUCKET,
    Key,
    Body: buffer,
    ContentType: mimeType,
    ACL: 'public-read'
  };
  const data = await s3Client.upload(params).promise();
  return data.Location;
}

module.exports = { uploadToS3 };
