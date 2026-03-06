import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { apiErrorJson } from "@/lib/api-error";
import { requireWorkflowAdmin } from "@/lib/workflow-access";

type Params = { pageId: string };

export async function GET(req: Request, context: { params: Promise<Params> }) {
  const { pageId } = await context.params;
  if (!pageId) return apiErrorJson("bad_page_id", 400);
  const access = await requireWorkflowAdmin(pageId, req);
  if (access.error) return access.error;

  const { searchParams } = new URL(req.url);
  const workflowId = searchParams.get("workflowId");
  const limitRaw = searchParams.get("limit");
  const cursorRaw = searchParams.get("cursor");

  const limit = z.number().int().min(1).max(200).catch(50).parse(limitRaw ? Number(limitRaw) : undefined);
  const cursor = cursorRaw ? new Date(cursorRaw) : null;

  const logs = await prisma.appWorkflowLog.findMany({
    where: {
      page_id: pageId,
      ...(workflowId ? { workflow_id: workflowId } : {}),
      ...(cursor ? { started_at: { lt: cursor } } : {}),
    },
    orderBy: { started_at: "desc" },
    take: limit,
    select: {
      id: true,
      workflow_id: true,
      status: true,
      input: true,
      output: true,
      error: true,
      started_at: true,
      finished_at: true,
    },
  });

  const nextCursor = logs.length ? logs[logs.length - 1].started_at.toISOString() : null;
  return NextResponse.json({ logs, nextCursor });
}
