import { NextResponse } from "next/server";
import { withErrorHandler, safeParseBody } from "@/lib/api-handler";
import { resolveAnonUserId } from "@/lib/anon";
import {
  executeServiceAction,
  logServiceRuntimeAudit,
  safeRuntimeHost,
  serviceRuntimeErrorJson,
} from "@/lib/service-runtime";

export const POST = withErrorHandler(
  async (req: Request, context: { params: Promise<{ pageId: string }> }) => {
    const { pageId } = await context.params;
    const anonUserId = await resolveAnonUserId(req);
    const body = (await safeParseBody(req)) as Record<string, unknown> | null;
    if (!body || typeof body.url !== "string") {
      return serviceRuntimeErrorJson("url_required", 400, {
        runtimeKind: "http_request",
        stage: "proxy.validate",
      });
    }

    const url = String(body.url);
    const method = String(body.method ?? "GET").toUpperCase();
    const rawHeaders = (body.headers as Record<string, string>) ?? {};
    const rawBody = body.body;

    const result = await executeServiceAction(
      {
        type: "http_request",
        url,
        method,
        headers: rawHeaders,
        body: rawBody,
        timeoutMs: 15_000,
        retries: 1,
        retryOn: [429, 500, 502, 503, 504],
      },
      {
        pageId,
        idempotencyKey: req.headers.get("x-null-idempotency-key"),
      },
    );

    if (!result.ok && result.errorCode === "blocked_host") {
      await logServiceRuntimeAudit({
        pageId,
        action: "proxy_blocked",
        runtimeKind: "http_request",
        targetType: "proxy",
        targetId: safeRuntimeHost(url),
        actor: { anonId: anonUserId ?? null },
        errorCode: "blocked_host",
        metadata: { method },
      });
      return serviceRuntimeErrorJson("blocked_host", 403, {
        runtimeKind: "http_request",
        stage: "proxy.guard",
        extra: { host: safeRuntimeHost(url) },
      });
    }

    await logServiceRuntimeAudit({
      pageId,
      action: result.ok ? "proxy_call" : "proxy_failed",
      runtimeKind: "http_request",
      targetType: "proxy",
      targetId: safeRuntimeHost(url),
      actor: { anonId: anonUserId ?? null },
      ok: result.ok,
      statusCode: result.statusCode ?? null,
      errorCode: result.errorCode ?? null,
      metadata: {
        method,
        detail: result.error ?? null,
      },
    });

    if (!result.ok) {
      return serviceRuntimeErrorJson("proxy_failed", 502, {
        runtimeKind: "http_request",
        stage: "proxy.execute",
        extra: { detail: result.error ?? "proxy_failed" },
      });
    }

    return NextResponse.json({
      ok: true,
      status: result.statusCode ?? 200,
      data: result.data ?? null,
    });
  }
);
