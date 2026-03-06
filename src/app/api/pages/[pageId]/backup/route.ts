import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma, type PageStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { resolveAnonUserId } from "@/lib/anon";
import { apiErrorJson } from "@/lib/api-error";
import { parseJsonBody } from "@/lib/validation";
import { logPageAudit } from "@/lib/page-audit";

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

export async function GET(req: Request, context: { params: Promise<Params> }) {
  const { pageId } = await context.params;
  if (!pageId) return apiErrorJson("bad_page_id", 400);
  const { error, userId, anonId } = await requireOwner(pageId, req);
  if (error) return error;

  const page = await prisma.page.findFirst({ where: { id: pageId, is_deleted: false } });
  if (!page) return apiErrorJson("not_found", 404);

  const [
    versions,
    settings,
    collections,
    records,
    secrets,
    workflows,
    appUsers,
    pageDomains,
    segments,
    todos,
    calendarEvents,
    kanbanColumns,
    kanbanCards,
    note,
    chatMessages,
  ] = await Promise.all([
    prisma.pageVersion.findMany({ where: { page_id: pageId }, orderBy: { created_at: "asc" } }),
    prisma.pageSetting.findMany({ where: { page_id: pageId } }),
    prisma.appCollection.findMany({ where: { page_id: pageId } }),
    prisma.appRecord.findMany({ where: { page_id: pageId } }),
    prisma.appSecret.findMany({ where: { page_id: pageId } }),
    prisma.appWorkflow.findMany({ where: { page_id: pageId } }),
    prisma.appUser.findMany({ where: { page_id: pageId } }),
    prisma.pageDomain.findMany({ where: { page_id: pageId } }),
    prisma.segment.findMany({ where: { page_id: pageId } }),
    prisma.todo.findMany({ where: { page_id: pageId } }),
    prisma.calendarEvent.findMany({ where: { page_id: pageId } }),
    prisma.kanbanColumn.findMany({ where: { page_id: pageId } }),
    prisma.kanbanCard.findMany({ where: { page_id: pageId } }),
    prisma.note.findUnique({ where: { page_id: pageId } }),
    prisma.chatMessage.findMany({ where: { page_id: pageId } }),
  ]);

  await logPageAudit({
    pageId,
    action: "backup_export",
    targetType: "page_backup",
    targetId: pageId,
    meta: { counts: { versions: versions.length, records: records.length, secrets: secrets.length } },
    actor: { userId: userId ?? null, anonId: anonId ?? null },
  });

  return NextResponse.json({
    ok: true,
    backup_version: 1,
    exported_at: new Date().toISOString(),
    page,
    versions,
    settings,
    collections,
    records,
    secrets,
    workflows,
    app_users: appUsers,
    page_domains: pageDomains,
    segments,
    todos,
    calendar_events: calendarEvents,
    kanban_columns: kanbanColumns,
    kanban_cards: kanbanCards,
    note,
    chat_messages: chatMessages,
  });
}

const restoreSchema = z.object({
  backup: z.unknown().optional(),
}).passthrough();

export async function POST(req: Request, context: { params: Promise<Params> }) {
  const { pageId } = await context.params;
  if (!pageId) return apiErrorJson("bad_page_id", 400);
  const { error, userId, anonId } = await requireOwner(pageId, req);
  if (error) return error;

  const parsed = await parseJsonBody(req, restoreSchema);
  if (parsed.error) return parsed.error;

  const raw = parsed.data as { backup?: unknown };
  const backup = (raw.backup ?? raw) as Record<string, unknown>;
  const page = backup.page as Record<string, unknown> | undefined;
  if (!page) return apiErrorJson("backup_required", 400, "backup.page가 필요합니다.");

  const versions = (backup.versions as Record<string, unknown>[] | undefined) ?? [];
  const settings = (backup.settings as Record<string, unknown>[] | undefined) ?? [];
  const collections = (backup.collections as Record<string, unknown>[] | undefined) ?? [];
  const records = (backup.records as Record<string, unknown>[] | undefined) ?? [];
  const secrets = (backup.secrets as Record<string, unknown>[] | undefined) ?? [];
  const workflows = (backup.workflows as Record<string, unknown>[] | undefined) ?? [];
  const appUsers = (backup.app_users as Record<string, unknown>[] | undefined) ?? [];
  const pageDomains = (backup.page_domains as Record<string, unknown>[] | undefined) ?? [];
  const segments = (backup.segments as Record<string, unknown>[] | undefined) ?? [];
  const todos = (backup.todos as Record<string, unknown>[] | undefined) ?? [];
  const calendarEvents = (backup.calendar_events as Record<string, unknown>[] | undefined) ?? [];
  const kanbanColumns = (backup.kanban_columns as Record<string, unknown>[] | undefined) ?? [];
  const kanbanCards = (backup.kanban_cards as Record<string, unknown>[] | undefined) ?? [];
  const note = (backup.note as Record<string, unknown> | null | undefined) ?? null;
  const chatMessages = (backup.chat_messages as Record<string, unknown>[] | undefined) ?? [];

  if (pageDomains.length) {
    const domains = pageDomains.map((d) => String(d.domain ?? "")).filter(Boolean);
    if (domains.length) {
      const conflicts = await prisma.pageDomain.findMany({
        where: { domain: { in: domains }, page_id: { not: pageId } },
        select: { domain: true },
      });
      if (conflicts.length) {
        return apiErrorJson("domain_conflict", 409, "다른 페이지에서 사용 중인 도메인이 포함되어 있습니다.");
      }
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.page.update({
      where: { id: pageId },
      data: { current_version_id: null },
    });

    await tx.kanbanCard.deleteMany({ where: { page_id: pageId } });
    await tx.kanbanColumn.deleteMany({ where: { page_id: pageId } });
    await tx.calendarEvent.deleteMany({ where: { page_id: pageId } });
    await tx.todo.deleteMany({ where: { page_id: pageId } });
    await tx.segment.deleteMany({ where: { page_id: pageId } });
    await tx.chatMessage.deleteMany({ where: { page_id: pageId } });
    await tx.note.deleteMany({ where: { page_id: pageId } });
    await tx.appSession.deleteMany({ where: { page_id: pageId } });
    await tx.appUser.deleteMany({ where: { page_id: pageId } });
    await tx.appRecord.deleteMany({ where: { page_id: pageId } });
    await tx.appCollection.deleteMany({ where: { page_id: pageId } });
    await tx.appSecret.deleteMany({ where: { page_id: pageId } });
    await tx.appWorkflow.deleteMany({ where: { page_id: pageId } });
    await tx.pageDomain.deleteMany({ where: { page_id: pageId } });
    await tx.pageSetting.deleteMany({ where: { page_id: pageId } });
    await tx.pageVersion.deleteMany({ where: { page_id: pageId } });

    const pageStatus = (page.status as PageStatus | undefined) ?? "draft";
    const pageUpdate = {
      title: (page.title as string | null) ?? null,
      status: pageStatus,
      live_started_at: page.live_started_at ? new Date(String(page.live_started_at)) : null,
      live_expires_at: page.live_expires_at ? new Date(String(page.live_expires_at)) : null,
      deployed_at: page.deployed_at ? new Date(String(page.deployed_at)) : null,
      scheduled_report_enabled: Boolean(page.scheduled_report_enabled ?? false),
      auto_drop_alert: Boolean(page.auto_drop_alert ?? false),
      snapshot_thumbnail: (page.snapshot_thumbnail as string | null) ?? null,
      constraints_version: (page.constraints_version as string | undefined) ?? "v1",
      collab_invite_code: (page.collab_invite_code as string | null) ?? null,
      collab_invite_enabled: Boolean(page.collab_invite_enabled ?? false),
      collab_invite_updated_at: page.collab_invite_updated_at ? new Date(String(page.collab_invite_updated_at)) : null,
      total_visits: Number(page.total_visits ?? 0),
      unique_sessions: Number(page.unique_sessions ?? 0),
      total_clicks: Number(page.total_clicks ?? 0),
      total_duration_ms: Number(page.total_duration_ms ?? 0),
      avg_duration_ms: Number(page.avg_duration_ms ?? 0),
      bounce_count: Number(page.bounce_count ?? 0),
      bounce_rate: Number(page.bounce_rate ?? 0),
      upvote_count: Number(page.upvote_count ?? 0),
      report_count: Number(page.report_count ?? 0),
      abuse_score: Number(page.abuse_score ?? 0),
      is_hidden: Boolean(page.is_hidden ?? false),
      hidden_at: page.hidden_at ? new Date(String(page.hidden_at)) : null,
      hidden_reason: (page.hidden_reason as string | null) ?? null,
      forced_expired_at: page.forced_expired_at ? new Date(String(page.forced_expired_at)) : null,
    };

    await tx.page.update({ where: { id: pageId }, data: pageUpdate });

    if (versions.length) {
      await tx.pageVersion.createMany({
        data: versions.map((v) => ({
          id: String(v.id),
          page_id: pageId,
          content_json: (v.content_json ?? {}) as Prisma.InputJsonValue,
          created_at: v.created_at ? new Date(String(v.created_at)) : new Date(),
        })),
      });
    }

    if (settings.length) {
      await tx.pageSetting.createMany({
        data: settings.map((s) => ({
          id: String(s.id),
          page_id: pageId,
          key: String(s.key),
          value: (s.value ?? {}) as Prisma.InputJsonValue,
          updated_at: s.updated_at ? new Date(String(s.updated_at)) : new Date(),
        })),
      });
    }

    if (collections.length) {
      await tx.appCollection.createMany({
        data: collections.map((c) => ({
          id: String(c.id),
          page_id: pageId,
          slug: String(c.slug),
          name: String(c.name),
          strict: Boolean(c.strict ?? false),
          fields: (c.fields ?? []) as Prisma.InputJsonValue,
          created_at: c.created_at ? new Date(String(c.created_at)) : new Date(),
          updated_at: c.updated_at ? new Date(String(c.updated_at)) : new Date(),
        })),
      });
    }

    if (records.length) {
      await tx.appRecord.createMany({
        data: records.map((r) => ({
          id: String(r.id),
          page_id: pageId,
          collection_slug: String(r.collection_slug),
          data: (r.data ?? {}) as Prisma.InputJsonValue,
          app_user_id: r.app_user_id ? String(r.app_user_id) : null,
          updated_at: r.updated_at ? new Date(String(r.updated_at)) : new Date(),
        })),
      });
    }

    if (secrets.length) {
      await tx.appSecret.createMany({
        data: secrets.map((s) => ({
          id: String(s.id),
          page_id: pageId,
          key: String(s.key),
          value: String(s.value ?? ""),
          created_at: s.created_at ? new Date(String(s.created_at)) : new Date(),
          updated_at: s.updated_at ? new Date(String(s.updated_at)) : new Date(),
        })),
      });
    }

    if (workflows.length) {
      await tx.appWorkflow.createMany({
        data: workflows.map((w) => ({
          id: String(w.id),
          page_id: pageId,
          name: String(w.name),
          trigger: (w.trigger ?? {}) as Prisma.InputJsonValue,
          steps: (w.steps ?? []) as Prisma.InputJsonValue,
          enabled: Boolean(w.enabled ?? true),
          created_at: w.created_at ? new Date(String(w.created_at)) : new Date(),
          updated_at: w.updated_at ? new Date(String(w.updated_at)) : new Date(),
        })),
      });
    }

    if (appUsers.length) {
      await tx.appUser.createMany({
        data: appUsers.map((u) => ({
          id: String(u.id),
          page_id: pageId,
          email: String(u.email),
          password_hash: String(u.password_hash),
          display_name: (u.display_name as string | null) ?? null,
          avatar_url: (u.avatar_url as string | null) ?? null,
          role: String(u.role ?? "user"),
          metadata: u.metadata == null ? Prisma.DbNull : (u.metadata as Prisma.InputJsonValue),
          created_at: u.created_at ? new Date(String(u.created_at)) : new Date(),
          updated_at: u.updated_at ? new Date(String(u.updated_at)) : new Date(),
        })),
      });
    }

    if (pageDomains.length) {
      await tx.pageDomain.createMany({
        data: pageDomains.map((d) => ({
          id: String(d.id),
          page_id: pageId,
          domain: String(d.domain),
          status: String(d.status ?? "pending"),
          verified_at: d.verified_at ? new Date(String(d.verified_at)) : null,
          force_https: Boolean(d.force_https ?? false),
          redirect_www: Boolean(d.redirect_www ?? false),
          last_checked_at: d.last_checked_at ? new Date(String(d.last_checked_at)) : null,
          last_error: (d.last_error as string | null) ?? null,
          created_at: d.created_at ? new Date(String(d.created_at)) : new Date(),
          updated_at: d.updated_at ? new Date(String(d.updated_at)) : new Date(),
        })),
      });
    }

    if (segments.length) {
      await tx.segment.createMany({
        data: segments.map((s) => ({
          id: String(s.id),
          page_id: pageId,
          name: String(s.name),
          conditions: (s.conditions ?? {}) as Prisma.InputJsonValue,
          created_at: s.created_at ? new Date(String(s.created_at)) : new Date(),
          updated_at: s.updated_at ? new Date(String(s.updated_at)) : new Date(),
        })),
      });
    }

    if (todos.length) {
      await tx.todo.createMany({
        data: todos.map((t) => ({
          id: String(t.id),
          page_id: pageId,
          title: String(t.title),
          done: Boolean(t.done ?? false),
          sort_order: Number(t.sort_order ?? 0),
          created_at: t.created_at ? new Date(String(t.created_at)) : new Date(),
          updated_at: t.updated_at ? new Date(String(t.updated_at)) : new Date(),
        })),
      });
    }

    if (calendarEvents.length) {
      await tx.calendarEvent.createMany({
        data: calendarEvents.map((e) => ({
          id: String(e.id),
          page_id: pageId,
          title: String(e.title),
          start_at: e.start_at ? new Date(String(e.start_at)) : new Date(),
          end_at: e.end_at ? new Date(String(e.end_at)) : null,
          all_day: Boolean(e.all_day ?? false),
          meta: e.meta == null ? Prisma.DbNull : (e.meta as Prisma.InputJsonValue),
          created_at: e.created_at ? new Date(String(e.created_at)) : new Date(),
          updated_at: e.updated_at ? new Date(String(e.updated_at)) : new Date(),
        })),
      });
    }

    if (kanbanColumns.length) {
      await tx.kanbanColumn.createMany({
        data: kanbanColumns.map((c) => ({
          id: String(c.id),
          page_id: pageId,
          title: String(c.title),
          sort_order: Number(c.sort_order ?? 0),
          created_at: c.created_at ? new Date(String(c.created_at)) : new Date(),
          updated_at: c.updated_at ? new Date(String(c.updated_at)) : new Date(),
        })),
      });
    }

    if (kanbanCards.length) {
      await tx.kanbanCard.createMany({
        data: kanbanCards.map((c) => ({
          id: String(c.id),
          page_id: pageId,
          column_id: String(c.column_id),
          title: String(c.title),
          body: (c.body as string | null) ?? null,
          sort_order: Number(c.sort_order ?? 0),
          created_at: c.created_at ? new Date(String(c.created_at)) : new Date(),
          updated_at: c.updated_at ? new Date(String(c.updated_at)) : new Date(),
        })),
      });
    }

    if (note) {
      await tx.note.create({
        data: {
          id: String(note.id),
          page_id: pageId,
          author_user_id: (note.author_user_id as string | null) ?? null,
          author_anon_id: (note.author_anon_id as string | null) ?? null,
          content: String(note.content ?? ""),
          created_at: note.created_at ? new Date(String(note.created_at)) : new Date(),
          updated_at: note.updated_at ? new Date(String(note.updated_at)) : new Date(),
        },
      });
    }

    if (chatMessages.length) {
      await tx.chatMessage.createMany({
        data: chatMessages.map((m) => ({
          id: String(m.id),
          page_id: pageId,
          sender_user_id: (m.sender_user_id as string | null) ?? null,
          sender_anon_id: (m.sender_anon_id as string | null) ?? null,
          content: String(m.content ?? ""),
          created_at: m.created_at ? new Date(String(m.created_at)) : new Date(),
        })),
      });
    }

    const currentVersionId = page.current_version_id ? String(page.current_version_id) : null;
    if (currentVersionId) {
      await tx.page.update({
        where: { id: pageId },
        data: { current_version_id: currentVersionId },
      });
    }
  });

  await logPageAudit({
    pageId,
    action: "backup_restore",
    targetType: "page_backup",
    targetId: pageId,
    meta: { restored: true },
    actor: { userId: userId ?? null, anonId: anonId ?? null },
  });

  return NextResponse.json({ ok: true });
}
