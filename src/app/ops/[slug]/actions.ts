"use server";

import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import { ReportAction, ReportStatus, type AdminRole } from "@prisma/client";
import { clearAdminSession, createAdminSession, isAdminUiConfigured, requireAdminSession, verifyAdminKey } from "@/lib/admin-session";
import { logAdminAudit } from "@/lib/admin-audit";
import { logSecurityEvent } from "@/lib/security-log";

/**
 * Server Actions for Admin UI
 * - Avoids calling admin APIs (which are header-protected).
 * - Enforces admin session cookie.
 */

async function assertAdmin(slug: string, roles?: AdminRole[]) {
  if (!isAdminUiConfigured()) notFound();
  if (slug !== process.env.ADMIN_SECRET_SLUG) notFound();

  const gate = await requireAdminSession({ roles });
  if (!gate.ok) {
    // UI route exists but access denied. Keep semantics minimal:
    // - If not configured or wrong slug => 404 (handled above)
    // - If no session => allow page to render login UI
    // Actions themselves require session:
    throw new Error("ADMIN_SESSION_REQUIRED");
  }
  return gate.admin;
}

export async function adminLoginAction(slug: string, formData: FormData) {
  if (!isAdminUiConfigured()) notFound();
  if (slug !== process.env.ADMIN_SECRET_SLUG) notFound();

  const key = String(formData.get("key") ?? "");
  if (!verifyAdminKey(key)) {
    logSecurityEvent({
      action: "admin_login_failed",
      meta: { reason: "bad_key" },
    });
    return { ok: false as const, error: "BAD_KEY" as const };
  }

  const admin = await createAdminSession();
  logSecurityEvent({
    action: "admin_login_success",
    actor: { adminId: admin.id },
    meta: { username: admin.username },
  });
  await logAdminAudit({
    adminId: admin.id,
    action: "admin_login",
    targetType: "admin",
    targetId: admin.id,
    meta: { username: admin.username },
  });
  return { ok: true as const };
}

export async function adminLogoutAction(slug: string) {
  if (!isAdminUiConfigured()) notFound();
  if (slug !== process.env.ADMIN_SECRET_SLUG) notFound();
  const gate = await requireAdminSession();
  if (gate.ok) {
    logSecurityEvent({
      action: "admin_logout",
      actor: { adminId: gate.admin.id },
    });
    await logAdminAudit({
      adminId: gate.admin.id,
      action: "admin_logout",
      targetType: "admin",
      targetId: gate.admin.id,
    });
  }
  await clearAdminSession();
  return { ok: true as const };
}

export async function hidePageAction(slug: string, formData: FormData) {
  const admin = await assertAdmin(slug, ["owner", "staff"]);

  const pageId = String(formData.get("pageId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 500) || "admin_hide";
  if (!pageId) return { ok: false as const, error: "BAD_PAGE" as const };

  await prisma.page.update({
    where: { id: pageId },
    data: {
      is_hidden: true,
      hidden_at: new Date(),
      hidden_reason: reason,
      hidden_by_admin_id: admin.id,
    },
  });

  await logAdminAudit({
    adminId: admin.id,
    action: "page_hide",
    targetType: "page",
    targetId: pageId,
    meta: { reason },
  });

  return { ok: true as const };
}

export async function forceExpirePageAction(slug: string, formData: FormData) {
  const admin = await assertAdmin(slug, ["owner", "staff"]);

  const pageId = String(formData.get("pageId") ?? "");
  if (!pageId) return { ok: false as const, error: "BAD_PAGE" as const };

  await prisma.page.update({
    where: { id: pageId },
    data: {
      status: "expired",
      forced_expired_at: new Date(),
      forced_by_admin_id: admin.id,
    },
  });

  await logAdminAudit({
    adminId: admin.id,
    action: "page_force_expire",
    targetType: "page",
    targetId: pageId,
  });

  return { ok: true as const };
}

export async function handleReportAction(slug: string, formData: FormData) {
  const admin = await assertAdmin(slug, ["owner", "staff"]);

  const reportId = String(formData.get("reportId") ?? "");
  const statusRaw = String(formData.get("status") ?? "resolved");
  const actionRaw = String(formData.get("action") ?? "none");
  const status =
    Object.values(ReportStatus).includes(statusRaw as ReportStatus) ? (statusRaw as ReportStatus) : "resolved";
  const action =
    Object.values(ReportAction).includes(actionRaw as ReportAction) ? (actionRaw as ReportAction) : "none";
  const adminNote = String(formData.get("admin_note") ?? "").slice(0, 2000) || null;

  if (!reportId) return { ok: false as const, error: "BAD_REPORT" as const };

  const report = await prisma.report.findUnique({
    where: { id: reportId },
    include: { abuses: { take: 1, orderBy: { created_at: "desc" } }, page: true },
  });
  if (!report) return { ok: false as const, error: "NOT_FOUND" as const };

  const now = new Date();

  if (action === "hide_page") {
    await prisma.page.update({
      where: { id: report.page_id },
      data: {
        is_hidden: true,
        hidden_at: now,
        hidden_reason: report.reason ?? "reported",
        hidden_by_admin_id: admin.id,
      },
    });
  }

  if (action === "force_expire") {
    await prisma.page.update({
      where: { id: report.page_id },
      data: { status: "expired", forced_expired_at: now, forced_by_admin_id: admin.id },
    });
  }

  if (action === "ban_ip") {
    const abuse = report.abuses?.[0];
    if (abuse?.ip_hash) {
      // 정책확정: 신고 기반 IP 차단 시 30일 만료.
      const IP_BLOCK_DAYS = 30;
      const expiresAt = new Date(Date.now() + IP_BLOCK_DAYS * 24 * 60 * 60 * 1000);
      await prisma.ipBlock.upsert({
        where: { ip_hash: abuse.ip_hash },
        update: {
          reason: adminNote ?? "report-ban",
          expires_at: expiresAt,
        },
        create: {
          ip_hash: abuse.ip_hash,
          reason: adminNote ?? "report-ban",
          expires_at: expiresAt,
        },
      });
    }
  }

  await prisma.report.update({
    where: { id: reportId },
    data: {
      status,
      action,
      admin_note: adminNote,
      handled_at: now,
      handled_by_admin_id: admin.id,
    },
  });

  await logAdminAudit({
    adminId: admin.id,
    action: "report_handle",
    targetType: "report",
    targetId: reportId,
    meta: { action, status },
  });

  return { ok: true as const };
}
