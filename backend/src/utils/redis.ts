import { createClient } from "redis";

let client: ReturnType<typeof createClient> | undefined;
let connectPromise: Promise<void> | undefined;

export async function getRedisClient() {
  if (!client) {
    const url = process.env.REDIS_URL;
    if (!url) throw new Error("REDIS_URL must be configured");
    client = createClient({ url });
    client.on("error", (error) => console.error("Redis connection error:", error));
  }

  if (!client.isOpen) {
    connectPromise ??= client.connect().then(() => undefined).finally(() => { connectPromise = undefined; });
    await connectPromise;
  }
  return client;
}
