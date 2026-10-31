import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client, type PutObjectCommandInput } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export type ObjectStorageBody = NonNullable<PutObjectCommandInput["Body"]>;

export interface UploadObjectOptions {
  /** Full object key, including a feature namespace such as `kyc/...` or `products/...`. */
  key: string;
  body: ObjectStorageBody;
  contentType?: string;
  bucket?: string;
  metadata?: Record<string, string>;
}

export interface PresignedUploadOptions {
  key: string;
  contentType: string;
  expiresIn?: number;
  bucket?: string;
}

export interface StoredObjectInfo {
  contentType?: string;
  contentLength?: number;
}


let storageClient: S3Client | undefined;

function getStorageClient(): S3Client {
  if (storageClient) return storageClient;

  const provider = (process.env.OBJECT_STORAGE_PROVIDER || "s3").toLowerCase();
  if (provider !== "s3" && provider !== "r2") {
    throw new Error("OBJECT_STORAGE_PROVIDER must be either 's3' or 'r2'");
  }

  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
  if (Boolean(accessKeyId) !== Boolean(secretAccessKey)) {
    throw new Error("S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY must be configured together");
  }

  const accountId = process.env.R2_ACCOUNT_ID;
  const endpoint = process.env.S3_ENDPOINT || (provider === "r2" && accountId
    ? `https://${accountId}.r2.cloudflarestorage.com`
    : undefined);

  if (provider === "r2" && (!endpoint || !accessKeyId || !secretAccessKey)) {
    throw new Error("R2 requires R2_ACCOUNT_ID (or S3_ENDPOINT) and S3-compatible credentials");
  }

  storageClient = new S3Client({
    region: process.env.S3_REGION || (provider === "r2" ? "auto" : "us-east-1"),
    endpoint,
    ...(accessKeyId && secretAccessKey
      ? { credentials: { accessKeyId, secretAccessKey } }
      : {}),
  });

  return storageClient;
}

export async function uploadObject({
  key,
  body,
  contentType,
  bucket = process.env.OBJECT_STORAGE_BUCKET,
  metadata,
}: UploadObjectOptions): Promise<{ bucket: string; key: string; etag?: string }> {
  const normalizedKey = key.trim();
  if (
    !normalizedKey ||
    normalizedKey.startsWith("/") ||
    normalizedKey.split("/").some((segment) => segment === "." || segment === "..") ||
    Buffer.byteLength(normalizedKey, "utf8") > 1024
  ) {
    throw new Error("Invalid object storage key");
  }

  if (!bucket) {
    throw new Error("OBJECT_STORAGE_BUCKET must be configured or a bucket must be provided");
  }

  const result = await getStorageClient().send(new PutObjectCommand({
    Bucket: bucket,
    Key: normalizedKey,
    Body: body,
    ContentType: contentType,
    Metadata: metadata,
  }));

  return { bucket, key: normalizedKey, etag: result.ETag };
}

export async function createPresignedUploadUrl({
  key,
  contentType,
  expiresIn = 600,
  bucket = process.env.OBJECT_STORAGE_BUCKET,
}: PresignedUploadOptions): Promise<string> {
  const normalizedKey = key.trim();
  if (
    !normalizedKey ||
    normalizedKey.startsWith("/") ||
    normalizedKey.split("/").some((segment) => !segment || segment === "." || segment === "..") ||
    Buffer.byteLength(normalizedKey, "utf8") > 1024
  ) {
    throw new Error("Invalid object storage key");
  }
  if (!bucket) throw new Error("OBJECT_STORAGE_BUCKET must be configured or a bucket must be provided");
  if (!Number.isInteger(expiresIn) || expiresIn < 1 || expiresIn > 604800) {
    throw new Error("Presigned URL expiry must be between 1 and 604800 seconds");
  }

  return getSignedUrl(
    getStorageClient(),
    new PutObjectCommand({ Bucket: bucket, Key: normalizedKey, ContentType: contentType }),
    { expiresIn }
  );
}

export async function createPresignedDownloadUrl(key: string, expiresIn = 300): Promise<string> {
  const normalizedKey = key.trim();
  if (!normalizedKey || normalizedKey.startsWith("/") || normalizedKey.split("/").some((segment) => !segment || segment === "." || segment === "..") || Buffer.byteLength(normalizedKey, "utf8") > 1024) {
    throw new Error("Invalid object storage key");
  }
  const bucket = process.env.OBJECT_STORAGE_BUCKET;
  if (!bucket) throw new Error("OBJECT_STORAGE_BUCKET must be configured");
  if (!Number.isInteger(expiresIn) || expiresIn < 1 || expiresIn > 3600) throw new Error("Download URL expiry must be between 1 and 3600 seconds");
  return getSignedUrl(getStorageClient(), new GetObjectCommand({ Bucket: bucket, Key: normalizedKey }), { expiresIn });
}

export async function getUploadedObjectInfo(key: string): Promise<StoredObjectInfo> {
  const bucket = process.env.OBJECT_STORAGE_BUCKET;
  if (!bucket) throw new Error("OBJECT_STORAGE_BUCKET must be configured");
  const result = await getStorageClient().send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
  return { contentType: result.ContentType, contentLength: result.ContentLength };
}

export async function deleteStoredObject(key: string): Promise<void> {
  const bucket = process.env.OBJECT_STORAGE_BUCKET;
  if (!bucket) throw new Error("OBJECT_STORAGE_BUCKET must be configured");
  await getStorageClient().send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}
