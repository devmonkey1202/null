import { prisma } from "@/lib/db";
import { executeServerlessNode, type ServerlessExecutorResponse } from "@/lib/serverless-executor";
import { createHmac, timingSafeEqual } from "crypto";
import { logAppAudit, type AppAuditActor } from "@/lib/app-audit";
import { apiErrorJson } from "@/lib/api-error";

const BLOCKED_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "169.254.169.254", "[::1]"]);
const DEFAULT_HTTP_TIMEOUT_MS = 15_000;
const MAX_HTTP_TIMEOUT_MS = 30_000;
const DEFAULT_HTTP_RETRY_DELAY_MS = 750;
const DEFAULT_RETRY_ON = [429, 500, 502, 503, 504];
const WEBHOOK_SECRET_SETTING_KEY = "webhook_secret";
const WEBHOOK_SIGNATURE_MAX_SKEW_MS = 5 * 60 * 1000;

export type ServiceRuntimeContext = {
  pageId?: string;
  idempotencyKey?: string | null;
  variables?: Record<string, unknown>;
  triggerData?: unknown;
  metadata?: Record<string, unknown>;
};

export type ServiceRuntimeHttpAction = {
  type: "http_request";
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
  retryOn?: number[];
  allowPrivateHosts?: boolean;
  parseAs?: "auto" | "json" | "text";
};

export type ServiceRuntimeServerlessAction = {
  type: "serverless_node";
  code: string;
  inputs?: unknown;
  timeoutMs?: number;
  memoryMb?: number;
  secrets?: string[];
};

export type ServiceRuntimeAction = ServiceRuntimeHttpAction | ServiceRuntimeServerlessAction;

export type ServiceRuntimeResult = {
  ok: boolean;
  kind: ServiceRuntimeAction["type"] | "background_job";
  statusCode?: number;
  data?: unknown;
  error?: string;
  errorCode?: string;
  logs: string[];
  meta?: Record<string, unknown>;
};

export type BackgroundJobRuntimeInput = {
  id: string;
  type: string;
  payload: unknown;
  pageId?: string | null;
};

export type BackgroundJobRuntimeHandler = (
  job: BackgroundJobRuntimeInput,
  context: ServiceRuntimeContext,
) => Promise<ServiceRuntimeResult | void>;

export type ServiceRuntimeAuditInput = {
  pageId: string;
  action: string;
  runtimeKind: string;
  targetType?: string | null;
  targetId?: string | null;
  actor?: AppAuditActor;
  ok?: boolean | null;
  statusCode?: number | null;
  errorCode?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type ServiceWebhookSignatureResult =
  | { ok: true }
  | { ok: false; errorCode: "signature_required" | "invalid_timestamp" | "timestamp_out_of_range" | "signature_mismatch" };

const backgroundJobHandlers = new Map<string, BackgroundJobRuntimeHandler>();

function clampTimeout(raw?: number) {
  if (!Number.isFinite(raw)) return DEFAULT_HTTP_TIMEOUT_MS;
  return Math.min(MAX_HTTP_TIMEOUT_MS, Math.max(100, Number(raw)));
}

function clampRetries(raw?: number) {
  if (!Number.isFinite(raw)) return 0;
  return Math.min(5, Math.max(0, Number(raw)));
}

function clampRetryDelay(raw?: number) {
  if (!Number.isFinite(raw)) return DEFAULT_HTTP_RETRY_DELAY_MS;
  return Math.min(30_000, Math.max(0, Number(raw)));
}

function sleep(ms: number) {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function safeRuntimeHost(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

export function isBlockedRuntimeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return BLOCKED_HOSTS.has(parsed.hostname) || parsed.hostname.endsWith(".internal");
  } catch {
    return true;
  }
}

function normalizeWebhookSignature(signature: string) {
  return signature.startsWith("sha256=") ? signature.slice(7) : signature;
}

async function resolveRuntimeSecrets(pageId: string | undefined, text: string): Promise<string> {
  if (!pageId || typeof text !== "string" || !text.includes("{{secrets.")) return text;
  const matches = text.match(/\{\{secrets\.([^}]+)\}\}/g);
  if (!matches?.length) return text;

  const keys = Array.from(new Set(matches.map((match) => match.replace("{{secrets.", "").replace("}}", ""))));
  const secrets = await prisma.appSecret.findMany({
    where: { page_id: pageId, key: { in: keys } },
    select: { key: true, value: true },
  });
  const valueByKey = new Map(secrets.map((secret) => [secret.key, secret.value]));
  let resolved = text;
  for (const key of keys) {
    resolved = resolved.replaceAll(`{{secrets.${key}}}`, valueByKey.get(key) ?? "");
  }
  return resolved;
}

async function resolveRuntimeValue(pageId: string | undefined, value: unknown): Promise<unknown> {
  if (typeof value === "string") return resolveRuntimeSecrets(pageId, value);
  if (Array.isArray(value)) {
    const next = [];
    for (const item of value) {
      next.push(await resolveRuntimeValue(pageId, item));
    }
    return next;
  }
  if (value && typeof value === "object") {
    const next: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      next[key] = await resolveRuntimeValue(pageId, nested);
    }
    return next;
  }
  return value;
}

function stringifyBody(body: unknown) {
  if (body == null) return undefined;
  if (typeof body === "string") return body;
  return JSON.stringify(body);
}

async function parseHttpResponse(
  response: Response,
  parseAs: ServiceRuntimeHttpAction["parseAs"],
): Promise<unknown> {
  if (parseAs === "text") return response.text().catch(() => "");
  if (parseAs === "json") return response.json().catch(() => null);

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return response.json().catch(() => null);
  }
  return response.text().catch(() => "");
}

async function executeHttpRequestAction(
  action: ServiceRuntimeHttpAction,
  context: ServiceRuntimeContext,
): Promise<ServiceRuntimeResult> {
  const pageId = context.pageId;
  const logs: string[] = [];
  const retries = clampRetries(action.retries);
  const retryDelayMs = clampRetryDelay(action.retryDelayMs);
  const retryOn = Array.isArray(action.retryOn) && action.retryOn.length ? action.retryOn : DEFAULT_RETRY_ON;

  const urlValue = await resolveRuntimeValue(pageId, action.url);
  const url = typeof urlValue === "string" ? urlValue : "";
  if (!action.allowPrivateHosts && isBlockedRuntimeUrl(url)) {
    return {
      ok: false,
      kind: "http_request",
      error: "blocked_host",
      errorCode: "blocked_host",
      logs,
      meta: { host: safeRuntimeHost(url) },
    };
  }

  const resolvedHeadersValue = await resolveRuntimeValue(pageId, action.headers ?? {});
  const resolvedHeaders = (resolvedHeadersValue ?? {}) as Record<string, string>;
  const method = String(action.method ?? "GET").toUpperCase();
  const resolvedBody = await resolveRuntimeValue(pageId, action.body);
  const timeoutMs = clampTimeout(action.timeoutMs);
  if (
    context.idempotencyKey &&
    method !== "GET" &&
    method !== "HEAD" &&
    !resolvedHeaders["Idempotency-Key"] &&
    !resolvedHeaders["idempotency-key"]
  ) {
    resolvedHeaders["Idempotency-Key"] = context.idempotencyKey;
  }
  if (!resolvedHeaders["Content-Type"] && resolvedBody != null && method !== "GET" && method !== "HEAD") {
    resolvedHeaders["Content-Type"] = "application/json";
  }

  let lastError = "http_request_failed";
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        method,
        headers: resolvedHeaders,
        body: method === "GET" || method === "HEAD" ? undefined : stringifyBody(resolvedBody),
        signal: controller.signal,
      });
      const data = await parseHttpResponse(response, action.parseAs ?? "auto");
      logs.push(`attempt:${attempt + 1}:status:${response.status}`);
      if (!response.ok && retryOn.includes(response.status) && attempt < retries) {
        lastError = `http_status_${response.status}`;
        await sleep(retryDelayMs);
        continue;
      }
      return {
        ok: response.ok,
        kind: "http_request",
        statusCode: response.status,
        data,
        error: response.ok ? undefined : `http_status_${response.status}`,
        errorCode: response.ok ? undefined : `http_status_${response.status}`,
        logs,
        meta: { host: safeRuntimeHost(url), method },
      };
    } catch (error) {
      lastError = error instanceof Error ? error.message : "http_request_failed";
      logs.push(`attempt:${attempt + 1}:error:${lastError}`);
      if (attempt >= retries) {
        return {
          ok: false,
          kind: "http_request",
          error: lastError,
          errorCode: lastError,
          logs,
          meta: { host: safeRuntimeHost(url), method },
        };
      }
      await sleep(retryDelayMs);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  return {
    ok: false,
    kind: "http_request",
    error: lastError,
    errorCode: lastError,
    logs,
    meta: { host: safeRuntimeHost(url), method },
  };
}

async function executeServerlessAction(
  action: ServiceRuntimeServerlessAction,
  context: ServiceRuntimeContext,
): Promise<ServiceRuntimeResult> {
  if (!context.pageId) {
    return {
      ok: false,
      kind: "serverless_node",
      error: "page_id_required",
      errorCode: "page_id_required",
      logs: [],
    };
  }
  const result: ServerlessExecutorResponse = await executeServerlessNode({
    pageId: context.pageId,
    code: action.code,
    inputs: action.inputs,
    timeoutMs: action.timeoutMs,
    memoryMb: action.memoryMb,
    secrets: action.secrets,
    variables: context.variables,
    triggerData: context.triggerData,
  });
  return {
    ok: result.ok,
    kind: "serverless_node",
    data: result.result,
    error: result.error,
    errorCode: result.error,
    logs: result.logs ?? [],
  };
}

export async function executeServiceAction(
  action: ServiceRuntimeAction,
  context: ServiceRuntimeContext = {},
): Promise<ServiceRuntimeResult> {
  if (action.type === "http_request") {
    return executeHttpRequestAction(action, context);
  }
  if (action.type === "serverless_node") {
    return executeServerlessAction(action, context);
  }
  throw new Error("unsupported_service_action");
}

export async function logServiceRuntimeAudit(input: ServiceRuntimeAuditInput) {
  await logAppAudit({
    pageId: input.pageId,
    action: input.action,
    targetType: input.targetType ?? null,
    targetId: input.targetId ?? null,
    actor: input.actor,
    meta: {
      runtime: true,
      runtime_kind: input.runtimeKind,
      ok: input.ok ?? null,
      status_code: input.statusCode ?? null,
      error_code: input.errorCode ?? null,
      ...(input.metadata ?? {}),
    },
  });
}

export function serviceRuntimeErrorJson(
  error: string,
  status: number,
  options?: {
    message?: string;
    detail?: unknown;
    extra?: Record<string, unknown>;
    runtimeKind?: string;
    stage?: string;
  },
) {
  return apiErrorJson(error, status, {
    message: options?.message,
    detail: options?.detail,
    extra: {
      runtime: true,
      ...(options?.runtimeKind ? { runtime_kind: options.runtimeKind } : {}),
      ...(options?.stage ? { runtime_stage: options.stage } : {}),
      ...(options?.extra ?? {}),
    },
  });
}

export async function getServiceWebhookSecret(pageId: string) {
  try {
    const row = await prisma.pageSetting.findUnique({
      where: { page_id_key: { page_id: pageId, key: WEBHOOK_SECRET_SETTING_KEY } },
      select: { value: true },
    });
    const secret = typeof row?.value === "string" ? row.value.trim() : "";
    return secret || null;
  } catch {
    return null;
  }
}

export function verifyServiceWebhookSignature(input: {
  secret: string;
  timestamp: string | null;
  rawBody: string;
  signature: string | null;
  now?: number;
}): ServiceWebhookSignatureResult {
  const { secret, timestamp, rawBody, signature } = input;
  if (!timestamp || !signature) return { ok: false, errorCode: "signature_required" };
  const tsNum = Number(timestamp);
  if (!Number.isFinite(tsNum)) return { ok: false, errorCode: "invalid_timestamp" };
  const timestampMs = tsNum > 1e12 ? tsNum : tsNum * 1000;
  const now = input.now ?? Date.now();
  if (Math.abs(now - timestampMs) > WEBHOOK_SIGNATURE_MAX_SKEW_MS) {
    return { ok: false, errorCode: "timestamp_out_of_range" };
  }
  const base = `${timestamp}.${rawBody}`;
  const expected = createHmac("sha256", secret).update(base).digest("hex");
  const received = normalizeWebhookSignature(signature);
  if (expected.length !== received.length) return { ok: false, errorCode: "signature_mismatch" };
  const ok = timingSafeEqual(Buffer.from(expected), Buffer.from(received));
  return ok ? { ok: true } : { ok: false, errorCode: "signature_mismatch" };
}

export function parseServiceWebhookJson(rawBody: string): Record<string, unknown> | null {
  if (!rawBody.trim()) return null;
  try {
    const parsed = JSON.parse(rawBody);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function registerBackgroundJobHandler(type: string, handler: BackgroundJobRuntimeHandler) {
  backgroundJobHandlers.set(type, handler);
}

export async function executeBackgroundJob(
  job: BackgroundJobRuntimeInput,
  context: ServiceRuntimeContext = {},
): Promise<ServiceRuntimeResult> {
  const handler = backgroundJobHandlers.get(job.type);
  if (!handler) {
    return {
      ok: false,
      kind: "background_job",
      error: `unknown_job_type:${job.type}`,
      errorCode: "unknown_job_type",
      logs: [],
      meta: { jobType: job.type },
    };
  }
  const result = await handler(job, { ...context, pageId: context.pageId ?? job.pageId ?? undefined });
  if (result) return result;
  return { ok: true, kind: "background_job", logs: [], meta: { jobType: job.type } };
}

registerBackgroundJobHandler("noop", async (job) => ({
  ok: true,
  kind: "background_job",
  logs: [`noop:${job.id}`],
  meta: { jobType: job.type },
}));

registerBackgroundJobHandler("log", async (job) => ({
  ok: true,
  kind: "background_job",
  logs: [`log:${JSON.stringify(job.payload ?? {})}`],
  meta: { jobType: job.type },
}));
