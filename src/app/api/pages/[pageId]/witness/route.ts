import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { expireStalePages } from "@/lib/expire";
import { apiErrorJson } from "@/lib/api-error";
import { getSystemNumber } from "@/lib/system-settings";

type Params = { pageId: string };

function clampInt(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

/**
 * Witness endpoint (production-grade v1)
 *
 * Goals:
 * - "Last witness" should feel like an event, not a metric.
 * - "Density" should reflect time-occupancy, not just visit counts.
 *
 * Data sources (confirmed in your codebase):
 * - liveSession.started_at / ended_at / duration_ms (set on disconnect)
 * - no text inputs, no screen capture, no eye tracking.
 */
export async function GET(_req: Request, context: { params: Promise<Params> }) {
  await expireStalePages();

  const { pageId } = await context.params;
  if (!pageId) return apiErrorJson("BAD_PAGE", 400);

  const page = await prisma.page.findUnique({
    where: { id: pageId },
    select: {
      id: true,
      status: true,
      is_deleted: true,
      is_hidden: true,
      live_expires_at: true,
    },
  });

  if (!page || page.is_deleted) return apiErrorJson("NOT_FOUND", 404);
  if (page.is_hidden) return apiErrorJson("NOT_FOUND", 404);
  if (page.status !== "live") return apiErrorJson("NOT_FOUND", 404);
  if (page.live_expires_at && page.live_expires_at <= new Date()) {
    return apiErrorJson("NOT_FOUND", 404);
  }

  // last_seen_at: prefer last ended session; fallback to last started session
  const lastEnded = await prisma.liveSession.findFirst({
    where: { page_id: pageId, ended_at: { not: null } },
    orderBy: { ended_at: "desc" },
    select: { started_at: true, ended_at: true, duration_ms: true },
  });

  const lastStartedOnly =
    lastEnded ??
    (await prisma.liveSession.findFirst({
      where: { page_id: pageId },
      orderBy: { started_at: "desc" },
      select: { started_at: true, ended_at: true, duration_ms: true },
    }));

  const lastSeenAt = (lastEnded?.ended_at ?? lastStartedOnly?.started_at) ?? null;

  // Density buckets: last 24 hours, per hour
  const nowMs = Date.now();
  const windowMs = 24 * 60 * 60 * 1000;
  const bucketMs = 60 * 60 * 1000;
  const buckets = 24;
  const startMs = nowMs - windowMs;

  // We use duration-weighted density:
  // - ended sessions contribute duration_ms (capped)
  // - ongoing sessions contribute (now - started_at) (capped)
  // Cap to avoid 1 long session dominating.
  const capMinutes = await getSystemNumber("witness_cap_minutes", 20, { min: 1, max: 120, integer: true });
  const CAP_MS = capMinutes * 60 * 1000;

  const sessions = await prisma.liveSession.findMany({
    where: { page_id: pageId, started_at: { gte: new Date(startMs) } },
    select: { started_at: true, ended_at: true, duration_ms: true },
  });

  const weight = new Array<number>(buckets).fill(0);
  const counts = new Array<number>(buckets).fill(0);

  for (const s of sessions) {
    const t = s.started_at.getTime();
    const idx = clampInt(Math.floor((t - startMs) / bucketMs), 0, buckets - 1);

    counts[idx] += 1;

    let dur = typeof s.duration_ms === "number" ? s.duration_ms : null;
    if (dur === null) {
      // ongoing session -> estimate
      dur = nowMs - t;
    }
    dur = clamp(dur, 0, CAP_MS);

    // Weighting curve: seconds -> soften (sqrt) so not purely linear.
    const w = Math.sqrt(dur / 1000);
    weight[idx] += w;
  }

  // Normalize 0..1 for UI
  const maxW = Math.max(1, ...weight);
  const density = weight.map((w) => clamp(w / maxW, 0, 1));

  return NextResponse.json({
    ok: true,

    // "Last witness"
    last_seen_at: lastSeenAt ? lastSeenAt.toISOString() : null,
    last_session_started_at: lastStartedOnly?.started_at ? lastStartedOnly.started_at.toISOString() : null,
    last_session_ended_at: lastStartedOnly?.ended_at ? lastStartedOnly.ended_at.toISOString() : null,
    last_session_duration_ms: typeof lastStartedOnly?.duration_ms === "number" ? lastStartedOnly.duration_ms : null,

    // "Temporal density"
    density, // 0..1 (duration-weighted)
    bucket_counts: counts, // raw counts (for future UI)
    window_hours: 24,
    bucket_minutes: 60,

  });
}
