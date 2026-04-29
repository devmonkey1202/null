import { NextResponse } from "next/server";
import { z } from "zod";
import { withErrorHandler, safeParseBody } from "@/lib/api-handler";
import { requireWorkflowAdmin } from "@/lib/workflow-access";
import {
  createServiceStateMachine,
  deleteServiceStateMachine,
  listServiceStateMachines,
  parseServiceStateMachineDefinition,
  updateServiceStateMachine,
} from "@/lib/service-state-machine";

const createSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  definition: z.unknown(),
  enabled: z.boolean().optional(),
});

const updateSchema = z.object({
  id: z.string().min(1),
  key: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  definition: z.unknown().optional(),
  enabled: z.boolean().optional(),
});

export const GET = withErrorHandler(async (req: Request, context: { params: Promise<{ pageId: string }> }) => {
  const { pageId } = await context.params;
  const access = await requireWorkflowAdmin(pageId, req);
  if (access.error) return access.error;
  const machines = await listServiceStateMachines(pageId);
  return NextResponse.json({ machines });
});

export const POST = withErrorHandler(async (req: Request, context: { params: Promise<{ pageId: string }> }) => {
  const { pageId } = await context.params;
  const access = await requireWorkflowAdmin(pageId, req);
  if (access.error) return access.error;
  const body = await safeParseBody(req);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "state_machine_invalid", detail: parsed.error.format() }, { status: 400 });
  }
  const definition = parseServiceStateMachineDefinition(parsed.data.definition);
  if (!definition.success) {
    return NextResponse.json({ error: "state_machine_definition_invalid", detail: definition.error.format() }, { status: 400 });
  }
  const machine = await createServiceStateMachine({
    pageId,
    key: parsed.data.key,
    name: parsed.data.name,
    definition: definition.data,
    enabled: parsed.data.enabled,
    actor: {
      userId: access.actor?.userId ?? null,
      anonId: access.actor?.anonId ?? null,
      appUserId: access.actor?.appUserId ?? null,
    },
  });
  return NextResponse.json({ ok: true, machine });
});

export const PATCH = withErrorHandler(async (req: Request, context: { params: Promise<{ pageId: string }> }) => {
  const { pageId } = await context.params;
  const access = await requireWorkflowAdmin(pageId, req);
  if (access.error) return access.error;
  const body = await safeParseBody(req);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "state_machine_invalid", detail: parsed.error.format() }, { status: 400 });
  }
  const definition =
    parsed.data.definition === undefined
      ? undefined
      : parseServiceStateMachineDefinition(parsed.data.definition);
  if (definition && !definition.success) {
    return NextResponse.json({ error: "state_machine_definition_invalid", detail: definition.error.format() }, { status: 400 });
  }
  const machine = await updateServiceStateMachine({
    pageId,
    machineId: parsed.data.id,
    key: parsed.data.key,
    name: parsed.data.name,
    definition: definition?.data,
    enabled: parsed.data.enabled,
    actor: {
      userId: access.actor?.userId ?? null,
      anonId: access.actor?.anonId ?? null,
      appUserId: access.actor?.appUserId ?? null,
    },
  });
  return NextResponse.json({ ok: true, machine });
});

export const DELETE = withErrorHandler(async (req: Request, context: { params: Promise<{ pageId: string }> }) => {
  const { pageId } = await context.params;
  const access = await requireWorkflowAdmin(pageId, req);
  if (access.error) return access.error;
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id_required" }, { status: 400 });
  const machine = await deleteServiceStateMachine({
    pageId,
    machineId: id,
    actor: {
      userId: access.actor?.userId ?? null,
      anonId: access.actor?.anonId ?? null,
      appUserId: access.actor?.appUserId ?? null,
    },
  });
  return NextResponse.json({ ok: true, machine });
});
