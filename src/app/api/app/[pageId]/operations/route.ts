import { NextResponse } from "next/server";
import { apiErrorJson } from "@/lib/api-error";
import type { AppRole } from "@/lib/app-permissions";
import { ensureServiceRoutePermission, resolveServiceRouteAccess } from "@/lib/service-route-access";
import { parseJsonObject } from "@/lib/validation";
import {
  buildServiceOperationsOverview,
  generateServiceRunbook,
  getServiceOperationsProfile,
  planServiceRollback,
  recordServiceBackupSnapshot,
  recordServiceReleaseSnapshot,
  type ServiceOpsProfilePatch,
  upsertServiceOperationsProfile,
} from "@/lib/service-operations";

type Params = { pageId: string };
const OPERATOR_ROLES: AppRole[] = ["admin", "editor"];

function asString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function actorFromAccess(access: { userId: string | null; anonUserId: string | null }) {
  return {
    userId: access.userId ?? null,
    anonId: access.anonUserId ?? null,
  };
}

async function requireOwnerPage(req: Request, pageId: string) {
  const gate = await resolveServiceRouteAccess(req, pageId);
  if ("error" in gate) return gate;
  const permissionError = ensureServiceRoutePermission(gate.access, { allowedRoles: OPERATOR_ROLES });
  if (permissionError) return { error: permissionError };
  return { access: gate.access };
}

export async function GET(req: Request, context: { params: Promise<Params> }) {
  const { pageId } = await context.params;
  if (!pageId) return apiErrorJson("bad_page_id", 400);

  const gate = await requireOwnerPage(req, pageId);
  if ("error" in gate) return gate.error;

  const [profile, overview, runbook] = await Promise.all([
    getServiceOperationsProfile(pageId),
    buildServiceOperationsOverview(pageId),
    generateServiceRunbook(pageId),
  ]);
  return NextResponse.json({ ok: true, profile, overview, runbook });
}

export async function PUT(req: Request, context: { params: Promise<Params> }) {
  const { pageId } = await context.params;
  if (!pageId) return apiErrorJson("bad_page_id", 400);

  const gate = await requireOwnerPage(req, pageId);
  if ("error" in gate) return gate.error;

  const parsed = await parseJsonObject(req);
  if (parsed.error) return parsed.error;

  const body = parsed.data as Record<string, unknown>;
  const patch: ServiceOpsProfilePatch = {
    environments: Array.isArray(body.environments) ? body.environments : undefined,
    releasePolicy: asRecord(body.releasePolicy) as ServiceOpsProfilePatch["releasePolicy"],
    recoveryPolicy: asRecord(body.recoveryPolicy) as ServiceOpsProfilePatch["recoveryPolicy"],
    migrationPolicy: asRecord(body.migrationPolicy) as ServiceOpsProfilePatch["migrationPolicy"],
    incidentPolicy: asRecord(body.incidentPolicy) as ServiceOpsProfilePatch["incidentPolicy"],
    runbookNotes: (Array.isArray(body.runbookNotes) ? body.runbookNotes : undefined) as ServiceOpsProfilePatch["runbookNotes"],
  };

  const profile = await upsertServiceOperationsProfile({
    pageId,
    patch,
    actor: actorFromAccess(gate.access),
  });
  return NextResponse.json({ ok: true, profile });
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
    if (action === "release.record") {
      const result = await recordServiceReleaseSnapshot({
        pageId,
        environmentKey: (asString(body.environmentKey) as "dev" | "staging" | "prod" | undefined) ?? "prod",
        versionId: asString(body.versionId) ?? null,
        deployHash: asString(body.deployHash) ?? null,
        deployUrl: asString(body.deployUrl) ?? null,
        deployed: typeof body.deployed === "boolean" ? body.deployed : true,
        note: asString(body.note) ?? null,
        actor,
      });
      return NextResponse.json({ ok: true, release: result.release, profile: result.profile });
    }

    if (action === "backup.record") {
      const countsSource = asRecord(body.counts) ?? {};
      const counts = Object.fromEntries(
        Object.entries(countsSource).map(([key, value]) => [key, Number(value ?? 0)]),
      ) as Record<string, number>;
      const result = await recordServiceBackupSnapshot({
        pageId,
        kind: (asString(body.kind) as "export" | "restore" | undefined) ?? "export",
        backupVersion: Number(body.backupVersion ?? 1),
        counts,
        note: asString(body.note) ?? null,
        actor,
      });
      return NextResponse.json({ ok: true, backup: result.backup, profile: result.profile });
    }

    if (action === "rollback.plan") {
      const plan = await planServiceRollback({
        pageId,
        environmentKey: (asString(body.environmentKey) as "dev" | "staging" | "prod" | undefined) ?? "prod",
        currentVersionId: asString(body.currentVersionId) ?? null,
        targetReleaseId: asString(body.targetReleaseId) ?? null,
        targetVersionId: asString(body.targetVersionId) ?? null,
        actor,
      });
      return NextResponse.json({ ok: true, plan });
    }

    if (action === "runbook.generate") {
      const runbook = await generateServiceRunbook(pageId);
      const overview = await buildServiceOperationsOverview(pageId);
      return NextResponse.json({ ok: true, runbook, overview });
    }

    return apiErrorJson("invalid_action", 400);
  } catch (error) {
    const code = error instanceof Error ? error.message : "service_operations_failed";
    return apiErrorJson(code, 400);
  }
}
