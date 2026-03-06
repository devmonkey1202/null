import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withErrorHandler, safeParseBody } from "@/lib/api-handler";
import { triggerWorkflowsForEvent } from "@/lib/app-workflow";
import { logAppAudit } from "@/lib/app-audit";
import { requireWorkflowAdmin } from "@/lib/workflow-access";
import { parseWorkflowCreate, parseWorkflowUpdate } from "@/lib/workflow-schema";

async function nextWorkflowVersion(workflowId: string) {
  const latest = await prisma.appWorkflowVersion.findFirst({
    where: { workflow_id: workflowId },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  return (latest?.version ?? 0) + 1;
}

async function createWorkflowVersion(
  workflow: { id: string; page_id: string; name: string; trigger: object; steps: object; enabled: boolean },
  actor: { userId: string | null; anonId: string | null; appUserId: string | null },
) {
  const version = await nextWorkflowVersion(workflow.id);
  await prisma.appWorkflowVersion.create({
    data: {
      page_id: workflow.page_id,
      workflow_id: workflow.id,
      name: workflow.name,
      trigger: workflow.trigger as object,
      steps: workflow.steps as object,
      enabled: workflow.enabled,
      version,
      actor_user_id: actor.userId,
      actor_app_user_id: actor.appUserId,
      actor_anon_id: actor.anonId,
    },
  });
}

export const GET = withErrorHandler(
  async (_req: Request, context: { params: Promise<{ pageId: string }> }) => {
    const { pageId } = await context.params;
    const access = await requireWorkflowAdmin(pageId, _req);
    if (access.error) return access.error;
    const workflows = await prisma.appWorkflow.findMany({
      where: { page_id: pageId },
      orderBy: { created_at: "desc" },
    });
    return NextResponse.json({ workflows });
  }
);

export const POST = withErrorHandler(
  async (req: Request, context: { params: Promise<{ pageId: string }> }) => {
    const { pageId } = await context.params;
    const body = (await safeParseBody(req)) as Record<string, unknown> | null;
    if (!body) return NextResponse.json({ error: "body_required", message: "request body required"}, { status: 400 });

    if (body.action === "trigger") {
      const triggerType = String(body.triggerType ?? "");
      const triggerMeta = (body.meta as Record<string, string>) ?? {};
      const triggerData = body.data;
      const results = await triggerWorkflowsForEvent(pageId, triggerType, triggerMeta, triggerData);
      return NextResponse.json({ ok: true, results });
    }

    const parsed = parseWorkflowCreate(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "workflow_invalid", message: "workflow payload invalid", detail: parsed.error.format() },
        { status: 400 },
      );
    }
    const { name, trigger, steps, enabled } = parsed.data;
    const access = await requireWorkflowAdmin(pageId, req);
    if (access.error) return access.error;

    const workflow = await prisma.appWorkflow.create({
      data: {
        page_id: pageId,
        name,
        trigger: trigger as object,
        steps: (steps ?? []) as object,
        enabled: enabled !== false,
      },
    });
    await createWorkflowVersion(
      {
        id: workflow.id,
        page_id: workflow.page_id,
        name: workflow.name,
        trigger: workflow.trigger as object,
        steps: workflow.steps as object,
        enabled: workflow.enabled,
      },
      access.actor!,
    );
    await logAppAudit({
      pageId,
      action: "workflow_create",
      targetType: "workflow",
      targetId: workflow.id,
      meta: { name: workflow.name },
      actor: {
        userId: access.actor!.userId,
        anonId: access.actor!.anonId,
        appUserId: access.actor!.appUserId,
      },
    });
    return NextResponse.json({ ok: true, workflow });
  }
);

export const PATCH = withErrorHandler(
  async (req: Request, context: { params: Promise<{ pageId: string }> }) => {
    const { pageId } = await context.params;
    const body = (await safeParseBody(req)) as Record<string, unknown> | null;
    if (!body?.id) return NextResponse.json({ error: "id_required", message: "id required"}, { status: 400 });
    const parsed = parseWorkflowUpdate(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "workflow_invalid", message: "workflow payload invalid", detail: parsed.error.format() },
        { status: 400 },
      );
    }
    const access = await requireWorkflowAdmin(pageId, req);
    if (access.error) return access.error;

    const data: Record<string, unknown> = {};
    if (parsed.data.name !== undefined) data.name = String(parsed.data.name);
    if (parsed.data.trigger !== undefined) data.trigger = parsed.data.trigger as object;
    if (parsed.data.steps !== undefined) data.steps = parsed.data.steps as object;
    if (parsed.data.enabled !== undefined) data.enabled = Boolean(parsed.data.enabled);

    const workflow = await prisma.appWorkflow.update({
      where: { id: String(body.id) },
      data,
    });
    await createWorkflowVersion(
      {
        id: workflow.id,
        page_id: workflow.page_id,
        name: workflow.name,
        trigger: workflow.trigger as object,
        steps: workflow.steps as object,
        enabled: workflow.enabled,
      },
      access.actor!,
    );
    await logAppAudit({
      pageId: workflow.page_id,
      action: "workflow_update",
      targetType: "workflow",
      targetId: workflow.id,
      meta: { name: workflow.name },
      actor: {
        userId: access.actor!.userId,
        anonId: access.actor!.anonId,
        appUserId: access.actor!.appUserId,
      },
    });
    return NextResponse.json({ ok: true, workflow });
  }
);

export const DELETE = withErrorHandler(
  async (req: Request, context: { params: Promise<{ pageId: string }> }) => {
    const { pageId } = await context.params;
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id_required", message: "id required"}, { status: 400 });
    const access = await requireWorkflowAdmin(pageId, req);
    if (access.error) return access.error;
    const existing = await prisma.appWorkflow.findUnique({ where: { id } });
    await prisma.appWorkflow.delete({ where: { id } });
    if (existing) {
      await logAppAudit({
        pageId: existing.page_id,
        action: "workflow_delete",
        targetType: "workflow",
        targetId: existing.id,
        meta: { name: existing.name },
        actor: {
          userId: access.actor!.userId,
          anonId: access.actor!.anonId,
          appUserId: access.actor!.appUserId,
        },
      });
    }
    return NextResponse.json({ ok: true });
  }
);
