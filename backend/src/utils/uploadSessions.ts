import { getRedisClient } from "./redis";

export const UPLOAD_SESSION_TTL_SECONDS = 2 * 60 * 60;

export interface UploadSession {
  id: string;
  user_id: string;
  vendor_id: string;
  purpose: "kyc" | "product";
  product_id?: string;
  object_key: string;
  content_type: string;
  status: "issued" | "confirmed";
  url_expires_at: string;
  expires_at: string;
}

const sessionKey = (id: string) => `upload-session:${id}`;

export async function createUploadSession(session: UploadSession): Promise<void> {
  const redis = await getRedisClient();
  const value = JSON.stringify(session);
  const remainingTtl = Math.min(
    UPLOAD_SESSION_TTL_SECONDS,
    Math.ceil((Date.parse(session.expires_at) - Date.now()) / 1000)
  );
  if (remainingTtl <= 0) throw new Error("Upload session has expired");
  await redis.set(sessionKey(session.id), value, { EX: remainingTtl });
}

export async function getUploadSession(id: string): Promise<UploadSession | null> {
  const redis = await getRedisClient();
  const value = await redis.get(sessionKey(id));
  return value ? JSON.parse(value) as UploadSession : null;
}

export async function updateUploadSession(session: UploadSession): Promise<void> {
  const redis = await getRedisClient();
  const remainingTtl = Math.ceil((Date.parse(session.expires_at) - Date.now()) / 1000);
  if (remainingTtl <= 0) {
    await redis.del(sessionKey(session.id));
    return;
  }
  await redis.set(sessionKey(session.id), JSON.stringify(session), { EX: remainingTtl });
}

export async function deleteUploadSession(id: string): Promise<void> {
  const redis = await getRedisClient();
  await redis.del(sessionKey(id));
}
