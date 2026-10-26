import { randomUUID } from "node:crypto";
import { getRedisClient } from "./redis.js";

const RELEASE_SCRIPT = `
  if redis.call("GET", KEYS[1]) == ARGV[1] then
    return redis.call("DEL", KEYS[1])
  end
  return 0
`;

const RENEW_SCRIPT = `
  if redis.call("GET", KEYS[1]) == ARGV[1] then
    return redis.call("PEXPIRE", KEYS[1], ARGV[2])
  end
  return 0
`;

export class RedisMutexTimeoutError extends Error {
  constructor(key: string) {
    super(`Timed out waiting for Redis mutex: ${key}`);
    this.name = "RedisMutexTimeoutError";
  }
}

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export const acquireRedisMutex = async (key: string, timeoutMs = 10_000, leaseMs = 60_000) => {
  const redis = await getRedisClient();
  const redisKey = `marketly:mutex:${key}`;
  const ownerToken = randomUUID();
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const acquired = await redis.set(redisKey, ownerToken, {
      expiration: { type: "PX", value: leaseMs },
      condition: "NX",
    });
    if (acquired === "OK") {
      let lost = false;
      let renewing = false;
      const heartbeat = setInterval(async () => {
        if (renewing || lost) return;
        renewing = true;
        try {
          const renewed = await redis.eval(RENEW_SCRIPT, {
            keys: [redisKey],
            arguments: [ownerToken, String(leaseMs)],
          });
          if (Number(renewed) !== 1) lost = true;
        } catch {
          lost = true;
        } finally {
          renewing = false;
        }
      }, Math.max(1000, Math.floor(leaseMs / 3)));
      heartbeat.unref();

      return async () => {
        clearInterval(heartbeat);
        while (renewing) await delay(10);
        const released = await redis.eval(RELEASE_SCRIPT, { keys: [redisKey], arguments: [ownerToken] });
        if (lost || Number(released) !== 1) throw new Error(`Redis mutex lease was lost: ${key}`);
      };
    }
    await delay(20 + Math.floor(Math.random() * 30));
  }
  throw new RedisMutexTimeoutError(key);
};

export const acquireRedisMutexes = async (keys: string[]) => {
  const releases: Array<() => Promise<void>> = [];
  try {
    for (const key of [...new Set(keys)].sort()) releases.push(await acquireRedisMutex(key));
  } catch (error) {
    for (const release of releases.reverse()) await release();
    throw error;
  }
  return async () => {
    for (const release of releases.reverse()) await release();
  };
};
