import { NextResponse } from "next/server";
import { apiErrorJson } from "@/lib/api-error";
import { resolveOwnedPageAccess } from "@/lib/owned-page-access";
import { parseJsonObject } from "@/lib/validation";
import {
  executeServiceRuntimeFunction,
  listServiceRuntimeExtensions,
  loadServiceRuntimeModules,
  upsertServiceRuntimeFunction,
  upsertServiceRuntimeModule,
} from "@/lib/service-runtime-extensions";

type Params = { pageId: string };

function asString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.map((item) => String(item ?? "").trim()).filter(Boolean) : [];
}

function actorFromAccess(access: Awaited<ReturnType<typeof resolveOwnedPageAccess>>) {
  return { userId: access.user?.id ?? null, anonId: access.anonUserId ?? null };
}

async function requireOwnerPage(req: Request, pageId: string) {
  const access = await resolveOwnedPageAccess(req, pageId);
  if (!access.user) return { error: apiErrorJson("user_not_found", 404) };
  if (!access.page) return { error: apiErrorJson("not_found", 404) };
  return { access };
}

export async function GET(req: Request, context: { params: Promise<Params> }) {
  const { pageId } = await context.params;
  if (!pageId) return apiErrorJson("bad_page_id", 400);

  const gate = await requireOwnerPage(req, pageId);
  if ("error" in gate) return gate.error;

  const extensions = await listServiceRuntimeExtensions(pageId);
  return NextResponse.json({ ok: true, ...extensions });
}

export async function POST(req: Request, context: { params: Promise<Params> }) {
  const { pageId } = await context.params;
  if (!pageId) return apiErrorJson("bad_page_id", 400);

  const gate = await requireOwnerPage(req, pageId);
  if ("error" in gate) return gate.error;

  const parsed = await parseJsonObject(req);
  if (parsed.error) return parsed.error;
  const body = parsed.data as Record<string, unknown>;
  const action = asString(body.action) ?? "";
  const actor = actorFromAccess(gate.access);

  try {
    if (action === "module.upsert") {
      const runtimeModule = await upsertServiceRuntimeModule({
        pageId,
        key: asString(body.key) ?? "",
        name: asString(body.name) ?? "",
        kind: asString(body.kind) ?? "generic",
        enabled: typeof body.enabled === "boolean" ? body.enabled : true,
        sandbox: body.sandbox,
        metadata: body.metadata,
        actor,
      });
      return NextResponse.json({ ok: true, module: runtimeModule });
    }

    if (action === "function.upsert") {
      const runtimeFunction = await upsertServiceRuntimeFunction({
        pageId,
        key: asString(body.key) ?? "",
        name: asString(body.name) ?? "",
        target: asString(body.target) ?? "generic",
        enabled: typeof body.enabled === "boolean" ? body.enabled : true,
        moduleKey: asString(body.moduleKey) ?? asString(body.module_key) ?? null,
        code: asString(body.code) ?? "",
        timeoutMs: Number(body.timeoutMs ?? body.timeout_ms ?? 10000),
        memoryMb: Number(body.memoryMb ?? body.memory_mb ?? 128),
        networkMode: asString(body.networkMode) ?? asString(body.network_mode) ?? "inherit",
        networkAllow: asStringArray(body.networkAllow ?? body.network_allow),
        networkDeny: asStringArray(body.networkDeny ?? body.network_deny),
        secretKeys: asStringArray(body.secretKeys ?? body.secret_keys),
        metadata: body.metadata,
        actor,
      });
      return NextResponse.json({ ok: true, function: runtimeFunction });
    }

    if (action === "module.load") {
      const result = await loadServiceRuntimeModules(pageId);
      return NextResponse.json({ ok: true, ...result });
    }

    if (action === "function.execute") {
      const key = asString(body.key) ?? "";
      if (!key) return apiErrorJson("bad_request", 400);
      const result = await executeServiceRuntimeFunction({
        pageId,
        key,
        inputs: body.inputs,
        context: {
          variables: body.variables && typeof body.variables === "object" && !Array.isArray(body.variables)
            ? (body.variables as Record<string, unknown>)
            : undefined,
          triggerData: body.triggerData ?? body.trigger_data ?? null,
        },
        actor,
      });
      return NextResponse.json({ ok: true, ...result });
    }

    return apiErrorJson("invalid_action", 400);
  } catch (error) {
    const code = error instanceof Error ? error.message : "service_runtime_extensions_failed";
    return apiErrorJson(code, 400);
  }
}
