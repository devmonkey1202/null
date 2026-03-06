import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { resolveAnonUserId } from "@/lib/anon";
import { apiErrorJson } from "@/lib/api-error";
import { logAppAudit } from "@/lib/app-audit";

type Params = { pageId: string };

async function requireOwner(pageId: string, req: Request) {
  const anonUserId = await resolveAnonUserId(req);
  if (!anonUserId) return { userId: null as null, anonId: null as string | null, error: apiErrorJson("anon_required", 401) };
  const user = await prisma.user.findUnique({ where: { anon_id: anonUserId }, select: { id: true } });
  if (!user) return { userId: null as null, anonId: null as string | null, error: apiErrorJson("user_not_found", 404) };
  const page = await prisma.page.findFirst({
    where: { id: pageId, owner_id: user.id, is_deleted: false },
    select: { id: true },
  });
  if (!page) return { userId: null as null, anonId: null as string | null, error: apiErrorJson("not_found", 404) };
  return { userId: user.id, anonId: anonUserId, error: null };
}

const bodySchema = z.object({
  versionId: z.string().min(1),
}).passthrough();

async function nextWorkflowVersion(workflowId: string) {
  const latest = await prisma.appWorkflowVersion.findFirst({
    where: { workflow_id: workflowId },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  return (latest?.version ?? 0) + 1;
}

export async function POST(req: Request, context: { params: Promise<Params> }) {
  const { pageId } = await context.params;
  if (!pageId) return apiErrorJson("bad_page_id", 400);

  const { error, userId, anonId } = await requireOwner(pageId, req);
  if (error) return error;

  const parsed = await req.json().catch(() => null);
  const body = bodySchema.safeParse(parsed);
  if (!body.success) return apiErrorJson("invalid_body", 400);

  const version = await prisma.appWorkflowVersion.findFirst({
    where: { id: body.data.versionId, page_id: pageId },
  });
  if (!version) return apiErrorJson("not_found", 404);

  const workflow = await prisma.appWorkflow.findFirst({
    where: { id: version.workflow_id, page_id: pageId },
  });
  if (!workflow) return apiErrorJson("not_found", 404);

  const updated = await prisma.appWorkflow.update({
    where: { id: workflow.id },
    data: {
      name: version.name,
      trigger: version.trigger as object,
      steps: version.steps as object,
      enabled: version.enabled,
    },
  });

  const nextVersion = await nextWorkflowVersion(updated.id);
  await prisma.appWorkflowVersion.create({
    data: {
      page_id: pageId,
      workflow_id: updated.id,
      name: updated.name,
      trigger: updated.trigger as object,
      steps: updated.steps as object,
      enabled: updated.enabled,
      version: nextVersion,
      actor_user_id: userId,
      actor_anon_id: anonId,
    },
  });

  await logAppAudit({
    pageId,
    action: "workflow_restore",
    targetType: "workflow",
    targetId: updated.id,
    meta: { versionId: body.data.versionId, name: updated.name },
    actor: { userId, anonId },
  });

  return NextResponse.json({ ok: true, workflow: updated, version: nextVersion });
}