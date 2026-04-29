import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { expireStalePages } from "@/lib/expire";
import { apiErrorJson } from "@/lib/api-error";
import { checkRateLimit } from "@/lib/rate-limit";
import { parseJsonBody } from "@/lib/validation";

type Params = { pageId: string };

const EVENT_TYPES = ["enter", "leave", "move", "click", "scroll", "error", "custom"] as const;

/**
 * §31.0/32.2 외부 배포 후 연속: 외부 사이트에서 이벤트 수집.
 * POST { session_id?: string, events: [ { event_id?, type, x?, y?, payload? } ] }
 * CORS 허용. pageId만으로 호출(공개 수집). 요청당 1개 synthetic LiveSession 생성 후 Event 저장.
 */
export async function POST(req: Request, context: { params: Promise<Params> }) {
  await expireStalePages();

  const rl = await checkRateLimit(req, 60, 60_000);
  if (!rl.allowed) {
    return apiErrorJson("rate_limit", 429, "분당 60회까지 가능합니다.");
  }

  const { pageId } = await context.params;
  const page = await prisma.page.findUnique({
    where: { id: pageId, is_deleted: false },
    select: { id: true },
  });
  if (!page) return apiErrorJson("not_found", 404);

  const parsed = await parseJsonBody(
    req,
    z
      .object({
        session_id: z.string().optional(),
        events: z.array(z.unknown()).optional(),
      })
      .passthrough()
  );
  if (parsed.error) return parsed.error;

  const events = Array.isArray(parsed.data.events) ? parsed.data.events.slice(0, 100) : [];
  if (events.length === 0) return NextResponse.json({ ok: true, received: 0 });
  for (const e of events) {
    if (!e || typeof e !== "object" || Array.isArray(e)) {
      return apiErrorJson("invalid_event", 400);
    }
    const payloadValue = (e as { payload?: unknown }).payload;
    if ("payload" in e && payloadValue != null && (typeof payloadValue !== "object" || Array.isArray(payloadValue))) {
      return apiErrorJson("invalid_payload", 400);
    }
  }

  const sessionId =
    typeof parsed.data.session_id === "string" && parsed.data.session_id.length > 0
      ? `ext-${parsed.data.session_id.slice(0, 64)}`
      : `ext-${randomUUID()}`;

  const startedAt = new Date();
  const ls = await prisma.liveSession.create({
    data: {
      session_id: sessionId,
      page_id: pageId,
      started_at: startedAt,
      ended_at: startedAt,
      duration_ms: 0,
    },
  });

  for (let i = 0; i < events.length; i++) {
    const e = events[i] as {
      event_id?: string;
      type?: string;
      x?: number;
      y?: number;
      payload?: Record<string, unknown>;
    };
    const type = EVENT_TYPES.includes((e?.type as (typeof EVENT_TYPES)[number]) ?? "")
      ? (e!.type as (typeof EVENT_TYPES)[number])
      : "custom";
    const x = typeof e?.x === "number" && !Number.isNaN(e.x) ? e.x : null;
    const y = typeof e?.y === "number" && !Number.isNaN(e.y) ? e.y : null;
    const payload = typeof e?.payload === "object" && e.payload !== null ? (e.payload as Record<string, unknown>) : null;
    const eventIdRaw = typeof e?.event_id === "string" ? e.event_id.trim() : "";
    const eventId = eventIdRaw.length > 0 ? eventIdRaw.slice(0, 128) : `ev_${randomUUID()}`;
    await prisma.event
      .create({
        data: {
          event_id: eventId,
          page_id: pageId,
          live_session_id: ls.id,
          type,
          x,
          y,
          payload: payload ? { ...payload, ts: (payload.ts as number) ?? i * 0.1 } : { ts: i * 0.1 },
        },
      })
      .catch(() => null);
  }

  return NextResponse.json(
    { ok: true, received: events.length, session_id: ls.session_id },
    { headers: { "Access-Control-Allow-Origin": "*" } }
  );
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  });
}
