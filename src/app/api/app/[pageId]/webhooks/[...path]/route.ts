import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { withErrorHandler } from "@/lib/api-handler";
import { triggerWorkflowsForEvent } from "@/lib/app-workflow";
import { prisma } from "@/lib/db";
import { logAppAudit } from "@/lib/app-audit";
import { resolveAnonUserId } from "@/lib/anon";

type Params = { pageId: string; path?: string[] };

function resolveWebhookPath(params: Params) {
  return (params.path ?? []).join("/").trim();
}

async function getWebhookSecret(pageId: string) {
  try {
    const row = await prisma.pageSetting.findUnique({
      where: { page_id_key: { page_id: pageId, key: "webhook_secret" } },
      select: { value: true },
    });
    const secret = typeof row?.value === "string" ? row.value.trim() : "";
    return secret || null;
  } catch {
    return null;
  }
}

function normalizeSignature(signature: string) {
  return signature.startsWith("sha256=") ? signature.slice(7) : signature;
}

const SIGNATURE_ERROR_MESSAGES: Record<string, string> = {
  signature_required: "signature_required",
  invalid_timestamp: "invalid_timestamp",
  timestamp_out_of_range: "timestamp_out_of_range",
  signature_mismatch: "signature_mismatch",
};

function signatureErrorMessage(code?: string | null) {
  if (!code) return "signature_verification_failed";
  return SIGNATURE_ERROR_MESSAGES[code] ?? "signature_verification_failed";
}

function verifySignature(secret: string, timestamp: string | null, rawBody: string, signature: string | null) {
  if (!timestamp || !signature) return { ok: false, error: "signature_required" };
  const tsNum = Number(timestamp);
  if (!Number.isFinite(tsNum)) return { ok: false, error: "invalid_timestamp" };
  const timestampMs = tsNum > 1e12 ? tsNum : tsNum * 1000;
  if (Math.abs(Date.now() - timestampMs) > 5 * 60 * 1000) {
    return { ok: false, error: "timestamp_out_of_range" };
  }
  const base = `${timestamp}.${rawBody}`;
  const expected = createHmac("sha256", secret).update(base).digest("hex");
  const received = normalizeSignature(signature);
  if (expected.length !== received.length) return { ok: false, error: "signature_mismatch" };
  const ok = timingSafeEqual(Buffer.from(expected), Buffer.from(received));
  return ok ? { ok: true } : { ok: false, error: "signature_mismatch" };
}

export const POST = withErrorHandler(async (req: Request, context: { params: Promise<Params> }) => {
  const params = await context.params;
  const webhookPath = resolveWebhookPath(params);
  if (!webhookPath) {
    return NextResponse.json({ error: "path_required" }, { status: 400 });
  }

  const rawBody = await req.text();
  const secret = await getWebhookSecret(params.pageId);
  if (secret) {
    const check = verifySignature(secret, req.headers.get("x-null-timestamp"), rawBody, req.headers.get("x-null-signature"));
    if (!check.ok) {
      await logAppAudit({
        pageId: params.pageId,
        action: "webhook_rejected",
        targetType: "webhook",
        targetId: webhookPath,
        meta: { error: check.error },
        actor: { anonId: (await resolveAnonUserId(req)) ?? null },
      });
      return NextResponse.json(
        { error: check.error, message: signatureErrorMessage(check.error) },
        { status: 401 }
      );
    }
  }
  let body: Record<string, unknown> | null = null;
  if (rawBody.trim()) {
    try {
      body = JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
      body = null;
    }
  }
  const results = await triggerWorkflowsForEvent(
    params.pageId,
    "webhook",
    { path: webhookPath },
    body ?? {}
  );
  await logAppAudit({
    pageId: params.pageId,
    action: "webhook_received",
    targetType: "webhook",
    targetId: webhookPath,
    meta: { triggered: results.length },
    actor: { anonId: (await resolveAnonUserId(req)) ?? null },
  });
  return NextResponse.json({ ok: true, results, signatureVerified: Boolean(secret) });
});

export const GET = withErrorHandler(async (req: Request, context: { params: Promise<Params> }) => {
  const params = await context.params;
  const webhookPath = resolveWebhookPath(params);
  if (!webhookPath) {
    return NextResponse.json({ error: "path_required" }, { status: 400 });
  }

  const secret = await getWebhookSecret(params.pageId);
  if (secret) {
    const check = verifySignature(secret, req.headers.get("x-null-timestamp"), "", req.headers.get("x-null-signature"));
    if (!check.ok) {
      await logAppAudit({
        pageId: params.pageId,
        action: "webhook_rejected",
        targetType: "webhook",
        targetId: webhookPath,
        meta: { error: check.error },
        actor: { anonId: (await resolveAnonUserId(req)) ?? null },
      });
      return NextResponse.json(
        { error: check.error, message: signatureErrorMessage(check.error) },
        { status: 401 }
      );
    }
  }
  const results = await triggerWorkflowsForEvent(
    params.pageId,
    "webhook",
    { path: webhookPath }
  );
  await logAppAudit({
    pageId: params.pageId,
    action: "webhook_received",
    targetType: "webhook",
    targetId: webhookPath,
    meta: { triggered: results.length },
    actor: { anonId: (await resolveAnonUserId(req)) ?? null },
  });
  return NextResponse.json({ ok: true, results, signatureVerified: Boolean(secret) });
});