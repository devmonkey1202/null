import { NextResponse } from "next/server";

import { clearAdminSession, createAdminSession, isAdminUiConfigured, requireAdminSession, verifyAdminKey } from "@/lib/admin-session";
import { logAdminAudit } from "@/lib/admin-audit";
import { logSecurityEvent } from "@/lib/security-log";

function invalidRouteResponse() {
  return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
}

function readSecretSlug() {
  return process.env.ADMIN_SECRET_SLUG ?? "";
}

export async function POST(req: Request) {
  if (!isAdminUiConfigured()) {
    return invalidRouteResponse();
  }

  const payload = (await req.json().catch(() => null)) as { slug?: string; key?: string } | null;
  const slug = String(payload?.slug ?? "");
  const key = String(payload?.key ?? "");
  if (!slug || slug !== readSecretSlug()) {
    return invalidRouteResponse();
  }

  if (!verifyAdminKey(key)) {
    logSecurityEvent({
      action: "admin_login_failed",
      meta: { reason: "bad_key" },
    });
    return NextResponse.json({ ok: false, error: "BAD_KEY" }, { status: 401 });
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

  return NextResponse.json({
    ok: true,
    admin: { id: admin.id, username: admin.username, role: admin.role },
  });
}

export async function DELETE(req: Request) {
  if (!isAdminUiConfigured()) {
    return invalidRouteResponse();
  }

  const payload = (await req.json().catch(() => null)) as { slug?: string } | null;
  const slug = String(payload?.slug ?? "");
  if (!slug || slug !== readSecretSlug()) {
    return invalidRouteResponse();
  }

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
  return NextResponse.json({ ok: true });
}
