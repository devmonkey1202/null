import { prisma } from "@/lib/db";

const MAX_CODE_CHARS = 80_000;
const MAX_INPUT_BYTES = 200_000;
const MAX_SECRET_KEYS = 50;
const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_TIMEOUT_MS = 30_000;
const MIN_TIMEOUT_MS = 100;
const DEFAULT_MEMORY_MB = 128;
const MAX_MEMORY_MB = 1024;
const MIN_MEMORY_MB = 64;

export type ServerlessExecutorResponse = {
  ok: boolean;
  result?: unknown;
  logs?: string[];
  error?: string;
};

export type ServerlessExecutorRequest = {
  code: string;
  inputs?: unknown;
  context?: { variables?: Record<string, unknown>; triggerData?: unknown; pageId?: string };
  secrets?: Record<string, string>;
  timeoutMs?: number;
  memoryMb?: number;
  policy?: {
    network?: { allow?: string[]; deny?: string[] };
  };
};

function clampTimeout(raw?: number) {
  if (!Number.isFinite(raw)) return DEFAULT_TIMEOUT_MS;
  return Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, Number(raw)));
}

function clampMemory(raw?: number) {
  if (!Number.isFinite(raw)) return DEFAULT_MEMORY_MB;
  return Math.min(MAX_MEMORY_MB, Math.max(MIN_MEMORY_MB, Number(raw)));
}

function sizeOfJson(value: unknown) {
  try {
    return Buffer.byteLength(JSON.stringify(value ?? null), "utf8");
  } catch {
    return MAX_INPUT_BYTES + 1;
  }
}

export async function executeServerlessNode(options: {
  pageId: string;
  code: string;
  inputs?: unknown;
  secrets?: string[];
  timeoutMs?: number;
  memoryMb?: number;
  variables?: Record<string, unknown>;
  triggerData?: unknown;
}): Promise<ServerlessExecutorResponse> {
  const executorUrl = process.env.SERVERLESS_EXECUTOR_URL;
  if (!executorUrl) {
    throw new Error("serverless_executor_not_configured");
  }

  const code = String(options.code ?? "");
  if (!code.trim()) {
    throw new Error("serverless_code_required");
  }
  if (code.length > MAX_CODE_CHARS) {
    throw new Error("serverless_code_too_large");
  }

  if (sizeOfJson(options.inputs) > MAX_INPUT_BYTES) {
    throw new Error("serverless_inputs_too_large");
  }

  const secretKeys = (options.secrets ?? []).filter((k) => typeof k === "string" && k.trim());
  if (secretKeys.length > MAX_SECRET_KEYS) {
    throw new Error("serverless_secrets_limit_exceeded");
  }

  const secrets = secretKeys.length
    ? await prisma.appSecret.findMany({
        where: { page_id: options.pageId, key: { in: secretKeys } },
      })
    : [];

  const secretMap: Record<string, string> = {};
  secrets.forEach((s) => {
    secretMap[s.key] = s.value;
  });

  const payload: ServerlessExecutorRequest = {
    code,
    inputs: options.inputs,
    context: {
      pageId: options.pageId,
      variables: options.variables ?? {},
      triggerData: options.triggerData ?? null,
    },
    secrets: secretMap,
    timeoutMs: clampTimeout(options.timeoutMs),
    memoryMb: clampMemory(options.memoryMb),
    policy: {
      network: {
        allow: process.env.SERVERLESS_EXECUTOR_ALLOWED_HOSTS
          ? process.env.SERVERLESS_EXECUTOR_ALLOWED_HOSTS.split(/[,\s]+/).filter(Boolean)
          : undefined,
        deny: process.env.SERVERLESS_EXECUTOR_DENIED_HOSTS
          ? process.env.SERVERLESS_EXECUTOR_DENIED_HOSTS.split(/[,\s]+/).filter(Boolean)
          : undefined,
      },
    },
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), payload.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (process.env.SERVERLESS_EXECUTOR_TOKEN) {
    headers["Authorization"] = `Bearer ${process.env.SERVERLESS_EXECUTOR_TOKEN}`;
  }

  try {
    const res = await fetch(executorUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const data = (await res.json().catch(() => null)) as ServerlessExecutorResponse | null;
    if (!data || typeof data.ok !== "boolean") {
      return { ok: false, error: "serverless_invalid_response" };
    }
    return data;
  } catch (err) {
    const message = err instanceof Error ? err.message : "serverless_executor_failed";
    return { ok: false, error: message };
  } finally {
    clearTimeout(timeoutId);
  }
}
