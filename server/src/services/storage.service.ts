import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "../config/env.js";
import { AppError } from "../utils/AppError.js";

// Backblaze B2 speaks the S3 API, so the AWS SDK works with B2's endpoint.
let client: S3Client | null = null;
function s3() {
  const { B2_KEY_ID, B2_APPLICATION_KEY, B2_BUCKET, B2_ENDPOINT, B2_REGION } = env;
  if (!B2_KEY_ID || !B2_APPLICATION_KEY || !B2_BUCKET || !B2_ENDPOINT || !B2_REGION)
    throw new AppError(503, "STORAGE_NOT_CONFIGURED", "Recording storage isn't set up, so the recording will be saved to your computer.");
  client ??= new S3Client({
    region: B2_REGION,
    endpoint: B2_ENDPOINT,
    credentials: { accessKeyId: B2_KEY_ID, secretAccessKey: B2_APPLICATION_KEY },
    // presigned URLs must not include checksum params the browser won't send
    requestChecksumCalculation: "WHEN_REQUIRED",
  });
  return { client, bucket: B2_BUCKET };
}

/** Link the browser uses to upload one file (PUT) directly to the bucket. */
export async function uploadUrl(key: string, contentType: string) {
  const { client, bucket } = s3();
  return getSignedUrl(client, new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType }), { expiresIn: 3600 });
}

/** Link to play (or, with a filename, download) a stored file. Valid for 1 hour. */
export async function downloadUrl(key: string, filename?: string) {
  const { client, bucket } = s3();
  return getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      ...(filename ? { ResponseContentDisposition: `attachment; filename="${filename.replace(/[^\w\- .]/g, "")}"` } : {}),
    }),
    { expiresIn: 3600 },
  );
}

/** Size of a stored file, or null if it isn't there. */
export async function storedSize(key: string) {
  const { client, bucket } = s3();
  try {
    const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return head.ContentLength ?? 0;
  } catch {
    return null;
  }
}

