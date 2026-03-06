import { NextResponse } from "next/server";
import { loginAppUser } from "@/lib/app-auth";
import { triggerWorkflowsForEvent } from "@/lib/app-workflow";
import { withErrorHandler, safeParseBody } from "@/lib/api-handler";
import { logAppAudit } from "@/lib/app-audit";
import { logSecurityEvent } from "@/lib/security-log";

export const POST = withErrorHandler(
  async (req: Request, context: { params: Promise<{ pageId: string }> }) => {
    const { pageId } = await context.params;
    const body = (await safeParseBody(req)) as Record<string, unknown> | null;
    if (!body) return NextResponse.json({ error: "body_required" }, { status: 400 });

    const email = String(body.email ?? "");
    const password = String(body.password ?? "");
    const otp = typeof body.otp === "string" ? body.otp : typeof body.otp_code === "string" ? body.otp_code : "";
    const otpBackup =
      typeof body.otp_backup === "string"
        ? body.otp_backup
        : typeof body.backup_code === "string"
          ? body.backup_code
          : "";

    try {
      const result = await loginAppUser(pageId, email, password, { otp, otpBackup });
      await logAppAudit({
        pageId,
        action: "app_user_login",
        targetType: "app_user",
        targetId: result.user.id,
        meta: { email: result.user.email },
        actor: { appUserId: result.user.id },
      });
      logSecurityEvent({
        action: "app_user_login_success",
        req,
        actor: { appUserId: result.user.id },
        meta: { pageId, email: result.user.email },
      });
      const res = NextResponse.json({ ok: true, user: result.user, token: result.token });
      res.cookies.set(`app_token_${pageId}`, result.token, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 30 * 24 * 60 * 60,
      });
      triggerWorkflowsForEvent(pageId, "user_logged_in", undefined, {
        user: result.user,
        email,
      }).catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[workflow] user_logged_in failed: ${msg}`);
      });
      return res;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "login_failed";
      logSecurityEvent({
        action: "app_user_login_failed",
        req,
        meta: { pageId, email, error: msg },
      });
      return NextResponse.json({ error: msg }, { status: 401 });
    }
  }
);
