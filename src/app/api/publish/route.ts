import { NextResponse } from "next/server";
import { z } from "zod";
import { getRedis } from "@/lib/redis";
import { logWithThrottle } from "@/lib/logger";
import { parseJsonBody, parseSearchParams } from "@/lib/validation";

const store = new Map<string, unknown>();
const REDIS_KEY_PREFIX = "publish:doc";

async function setDoc(slug: string, doc: unknown) {
  const redis = getRedis();
  if (redis) {
    try {
      const payload = JSON.stringify(doc);
      await redis.set(`${REDIS_KEY_PREFIX}:${slug}`, payload);
      return;
    } catch (error) {
      logWithThrottle("warn", "publish:redis:set", "publish redis set failed", {
        error: String(error),
      });
    }
  }
  store.set(slug, doc);
}

async function getDoc(slug: string) {
  const redis = getRedis();
  if (redis) {
    try {
      const raw = await redis.get(`${REDIS_KEY_PREFIX}:${slug}`);
      if (raw !== null) {
        return JSON.parse(raw) as unknown;
      }
    } catch (error) {
      logWithThrottle("warn", "publish:redis:get", "publish redis get failed", {
        error: String(error),
      });
    }
  }
  return store.get(slug) ?? null;
}

export async function POST(req: Request) {
  const parsed = await parseJsonBody(
    req,
    z
      .object({
        slug: z.string().min(1),
        doc: z.unknown(),
      })
      .passthrough()
  );
  if (parsed.error) return parsed.error;
  const { slug, doc } = parsed.data;
  await setDoc(String(slug), doc);
  return NextResponse.json({ ok: true });
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const parsed = parseSearchParams(
    searchParams,
    z.object({ slug: z.string().min(1) }),
    "invalid_query",
    "slug 파라미터가 필요합니다."
  );
  if (parsed.error) return parsed.error;
  const { slug } = parsed.data;
  const doc = await getDoc(String(slug));
  return NextResponse.json(doc ?? null);
}
