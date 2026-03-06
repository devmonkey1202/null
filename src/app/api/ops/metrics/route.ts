import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdminAccess } from "@/lib/admin-session";

export async function GET(req: Request) {
  const gate = await requireAdminAccess(req);
  if (!gate.ok) {
    return NextResponse.json({ ok: false, error: gate.code }, { status: 401 });
  }

  const now = new Date();
  const since1h = new Date(now.getTime() - 60 * 60 * 1000);
  const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const [
    pages,
    users,
    liveSessions,
    events1h,
    events24h,
    comments24h,
    appUsers,
    appRecords,
  ] = await Promise.all([
    prisma.page.count({ where: { is_deleted: false } }),
    prisma.user.count(),
    prisma.liveSession.count(),
    prisma.event.count({ where: { ts: { gte: since1h } } }),
    prisma.event.count({ where: { ts: { gte: since24h } } }),
    prisma.comment.count({ where: { created_at: { gte: since24h } } }),
    prisma.appUser.count(),
    prisma.appRecord.count(),
  ]);

  return NextResponse.json({
    ok: true,
    timestamp: now.toISOString(),
    counts: {
      pages,
      users,
      live_sessions: liveSessions,
      app_users: appUsers,
      app_records: appRecords,
    },
    events: {
      last_1h: events1h,
      last_24h: events24h,
    },
    comments: {
      last_24h: comments24h,
    },
  });
}
