import { NextResponse } from "next/server";
import { withErrorHandler } from "@/lib/api-handler";
import { triggerWorkflowsForEvent } from "@/lib/app-workflow";
import { resolveAnonUserId } from "@/lib/anon";
import {
  getServiceWebhookSecret,
  logServiceRuntimeAudit,
  parseServiceWebhookJson,
  serviceRuntimeErrorJson,
  verifyServiceWebhookSignature,
} from "@/lib/service-runtime";

type Params = { pageId: string; path?: string[] };

function resolveWebhookPath(params: Params) {
  return (params.path ?? []).join("/").trim();
}

export const POST = withErrorHandler(async (req: Request, context: { params: Promise<Params> }) => {
  const params = await context.params;
  const webhookPath = resolveWebhookPath(params);
  if (!webhookPath) {
    return serviceRuntimeErrorJson("path_required", 400, {
      runtimeKind: "webhook",
      stage: "webhook.validate",
    });
  }

  const actor = { anonId: (await resolveAnonUserId(req)) ?? null };
  const rawBody = await req.text();
  const secret = await getServiceWebhookSecret(params.pageId);
  if (secret) {
    const check = verifyServiceWebhookSignature({
      secret,
      timestamp: req.headers.get("x-null-timestamp"),
      rawBody,
      signature: req.headers.get("x-null-signature"),
    });
    if (!check.ok) {
      await logServiceRuntimeAudit({
        pageId: params.pageId,
        action: "webhook_rejected",
        runtimeKind: "webhook",
        targetType: "webhook",
        targetId: webhookPath,
        actor,
        errorCode: check.errorCode,
        metadata: { phase: "signature" },
      });
      return serviceRuntimeErrorJson(check.errorCode, 401, {
        runtimeKind: "webhook",
        stage: "webhook.signature",
      });
    }
  }
  const body = parseServiceWebhookJson(rawBody);
  const results = await triggerWorkflowsForEvent(
    params.pageId,
    "webhook",
    { path: webhookPath },
    body ?? {}
  );
  await logServiceRuntimeAudit({
    pageId: params.pageId,
    action: "webhook_received",
    runtimeKind: "webhook",
    targetType: "webhook",
    targetId: webhookPath,
    actor,
    ok: true,
    metadata: { triggered: results.length, signatureVerified: Boolean(secret) },
  });
  return NextResponse.json({ ok: true, results, signatureVerified: Boolean(secret) });
});

export const GET = withErrorHandler(async (req: Request, context: { params: Promise<Params> }) => {
  const params = await context.params;
  const webhookPath = resolveWebhookPath(params);
  if (!webhookPath) {
    return serviceRuntimeErrorJson("path_required", 400, {
      runtimeKind: "webhook",
      stage: "webhook.validate",
    });
  }

  const actor = { anonId: (await resolveAnonUserId(req)) ?? null };
  const secret = await getServiceWebhookSecret(params.pageId);
  if (secret) {
    const check = verifyServiceWebhookSignature({
      secret,
      timestamp: req.headers.get("x-null-timestamp"),
      rawBody: "",
      signature: req.headers.get("x-null-signature"),
    });
    if (!check.ok) {
      await logServiceRuntimeAudit({
        pageId: params.pageId,
        action: "webhook_rejected",
        runtimeKind: "webhook",
        targetType: "webhook",
        targetId: webhookPath,
        actor,
        errorCode: check.errorCode,
        metadata: { phase: "signature" },
      });
      return serviceRuntimeErrorJson(check.errorCode, 401, {
        runtimeKind: "webhook",
        stage: "webhook.signature",
      });
    }
  }
  const results = await triggerWorkflowsForEvent(
    params.pageId,
    "webhook",
    { path: webhookPath }
  );
  await logServiceRuntimeAudit({
    pageId: params.pageId,
    action: "webhook_received",
    runtimeKind: "webhook",
    targetType: "webhook",
    targetId: webhookPath,
    actor,
    ok: true,
    metadata: { triggered: results.length, signatureVerified: Boolean(secret) },
  });
  return NextResponse.json({ ok: true, results, signatureVerified: Boolean(secret) });
});
