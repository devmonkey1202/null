import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withErrorHandler, safeParseBody } from "@/lib/api-handler";
import { getAppUserByTokenForPage, enforceAppUserOtp } from "@/lib/app-auth";
import { apiErrorJson } from "@/lib/api-error";
import {
  buildOtpAuthUrl,
  generateBackupCodes,
  generateOtpSecret,
  hashBackupCode,
  normalizeBackupCode,
  normalizeOtpToken,
  verifyTotp,
} from "@/lib/otp";
import { verifyPassword } from "@/lib/auth";
import { logAppAudit } from "@/lib/app-audit";
import { logSecurityEvent } from "@/lib/security-log";
import { cookies } from "next/headers";

async function getToken(pageId: string, req: Request): Promise<string | undefined> {
  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) return authHeader.slice(7);
  const cookieStore = await cookies();
  return cookieStore.get(`app_token_${pageId}`)?.value;
}

async function getAuthedUser(pageId: string, req: Request) {
  const token = await getToken(pageId, req);
  if (!token) return null;
  const user = await getAppUserByTokenForPage(pageId, token);
  if (!user) return null;
  return prisma.appUser.findFirst({ where: { id: user.id, page_id: pageId } });
}

export const GET = withErrorHandler(async (req: Request, context: { params: Promise<{ pageId: string }> }) => {
  const { pageId } = await context.params;
  const user = await getAuthedUser(pageId, req);
  if (!user) return NextResponse.json({ error: "auth_required" }, { status: 401 });

  const backups = Array.isArray(user.otp_backup_codes)
    ? user.otp_backup_codes.filter((v) => typeof v === "string").length
    : 0;
  return NextResponse.json({
    ok: true,
    enabled: Boolean(user.otp_enabled),
    has_secret: Boolean(user.otp_secret),
    backup_remaining: backups,
  });
});

export const POST = withErrorHandler(async (req: Request, context: { params: Promise<{ pageId: string }> }) => {
  const { pageId } = await context.params;
  const user = await getAuthedUser(pageId, req);
  if (!user) return apiErrorJson("auth_required", 401);

  const body = (await safeParseBody(req)) as Record<string, unknown> | null;
  if (!body) return apiErrorJson("body_required", 400);

  const action = typeof body.action === "string" ? body.action : "setup";
  const now = new Date();

  if (action === "setup") {
    const password = String(body.password ?? "");
    if (!password) return apiErrorJson("password_required", 400);
    if (!verifyPassword(password, user.password_hash)) return apiErrorJson("password_invalid", 403);

    const secret = generateOtpSecret();
    const backupCodes = generateBackupCodes();
    const hashed = backupCodes.map(hashBackupCode);
    await prisma.appUser.update({
      where: { id: user.id },
      data: {
        otp_secret: secret,
        otp_backup_codes: hashed,
        otp_enabled: false,
        otp_last_used_at: null,
      },
    });

    const issuer = typeof body.issuer === "string" && body.issuer.trim() ? body.issuer.trim() : "NULL";
    const label =
      typeof body.label === "string" && body.label.trim()
        ? body.label.trim()
        : user.email || user.id;
    const otpauthUrl = buildOtpAuthUrl({ issuer, account: label, secret });

    await logAppAudit({
      pageId,
      action: "app_user_otp_setup",
      targetType: "app_user",
      targetId: user.id,
      meta: { issuer, label },
      actor: { appUserId: user.id },
    });

    return NextResponse.json({
      ok: true,
      enabled: false,
      secret,
      otpauth_url: otpauthUrl,
      backup_codes: backupCodes,
    });
  }

  if (action === "enable") {
    if (!user.otp_secret) return apiErrorJson("otp_not_setup", 400);
    const otp = normalizeOtpToken(body.otp);
    if (!otp) return apiErrorJson("otp_required", 400);

    const verified = verifyTotp({ secret: user.otp_secret, token: otp, timestamp: now.getTime(), window: 1 });
    if (!verified.valid) return apiErrorJson("otp_invalid", 400);
    const lastStep = user.otp_last_used_at ? Math.floor(user.otp_last_used_at.getTime() / 1000 / 30) : null;
    if (lastStep !== null && verified.counter <= lastStep) return apiErrorJson("otp_reused", 400);

    await prisma.appUser.update({
      where: { id: user.id },
      data: { otp_enabled: true, otp_last_used_at: now },
    });
    await logAppAudit({
      pageId,
      action: "app_user_otp_enable",
      targetType: "app_user",
      targetId: user.id,
      meta: null,
      actor: { appUserId: user.id },
    });
    logSecurityEvent({
      action: "app_user_otp_enabled",
      req,
      actor: { appUserId: user.id },
      meta: { pageId },
    });
    return NextResponse.json({ ok: true, enabled: true });
  }

  if (action === "disable") {
    const password = String(body.password ?? "");
    if (!password) return apiErrorJson("password_required", 400);
    if (!verifyPassword(password, user.password_hash)) return apiErrorJson("password_invalid", 403);

    if (user.otp_enabled) {
      const otp = typeof body.otp === "string" ? body.otp : "";
      const otpBackup = typeof body.otp_backup === "string" ? body.otp_backup : typeof body.backup_code === "string" ? body.backup_code : "";
      try {
        await enforceAppUserOtp(
          {
            id: user.id,
            otp_enabled: Boolean(user.otp_enabled),
            otp_secret: user.otp_secret ?? null,
            otp_backup_codes: user.otp_backup_codes ?? null,
            otp_last_used_at: user.otp_last_used_at ?? null,
          },
          { otp, otpBackup },
          { now }
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : "otp_invalid";
        return apiErrorJson(msg, 400);
      }
    }

    await prisma.appUser.update({
      where: { id: user.id },
      data: { otp_enabled: false, otp_secret: null, otp_backup_codes: null, otp_last_used_at: null },
    });
    await logAppAudit({
      pageId,
      action: "app_user_otp_disable",
      targetType: "app_user",
      targetId: user.id,
      meta: null,
      actor: { appUserId: user.id },
    });
    return NextResponse.json({ ok: true, enabled: false });
  }

  if (action === "regenerate_backup") {
    if (!user.otp_enabled || !user.otp_secret) return apiErrorJson("otp_not_enabled", 400);
    const otp = normalizeOtpToken(body.otp);
    const backupCode = normalizeBackupCode(body.otp_backup ?? body.backup_code);
    try {
      await enforceAppUserOtp(
        {
          id: user.id,
          otp_enabled: Boolean(user.otp_enabled),
          otp_secret: user.otp_secret ?? null,
          otp_backup_codes: user.otp_backup_codes ?? null,
          otp_last_used_at: user.otp_last_used_at ?? null,
        },
        { otp, otpBackup: backupCode },
        { now }
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "otp_invalid";
      return apiErrorJson(msg, 400);
    }

    const backupCodes = generateBackupCodes();
    await prisma.appUser.update({
      where: { id: user.id },
      data: { otp_backup_codes: backupCodes.map(hashBackupCode) },
    });

    await logAppAudit({
      pageId,
      action: "app_user_otp_backup_regenerate",
      targetType: "app_user",
      targetId: user.id,
      meta: { count: backupCodes.length },
      actor: { appUserId: user.id },
    });

    return NextResponse.json({ ok: true, backup_codes: backupCodes });
  }

  return apiErrorJson("otp_action_invalid", 400);
});
