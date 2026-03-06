import { prisma } from "@/lib/db";

export type AppAuditActor = {
  userId?: string | null;
  appUserId?: string | null;
  anonId?: string | null;
};

export type AppAuditInput = {
  pageId: string;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  meta?: Record<string, unknown> | null;
  actor?: AppAuditActor;
};

export async function logAppAudit(input: AppAuditInput) {
  try {
    if (!input.pageId) return;
    const page = await prisma.page.findUnique({
      where: { id: input.pageId },
      select: { id: true },
    });
    if (!page) return;
    await prisma.appAuditLog.create({
      data: {
        page_id: input.pageId,
        action: input.action,
        target_type: input.targetType ?? null,
        target_id: input.targetId ?? null,
        actor_user_id: input.actor?.userId ?? null,
        actor_app_user_id: input.actor?.appUserId ?? null,
        actor_anon_id: input.actor?.anonId ?? null,
        meta: input.meta ? (input.meta as object) : undefined,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[app-audit] ${input.action} failed: ${msg}`);
  }
}
