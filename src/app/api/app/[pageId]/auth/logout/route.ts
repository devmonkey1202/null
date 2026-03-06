import { NextResponse } from "next/server";
import { logoutAppUser, getAppUserByToken } from "@/lib/app-auth";
import { withErrorHandler } from "@/lib/api-handler";
import { cookies } from "next/headers";
import { logAppAudit } from "@/lib/app-audit";
import { logSecurityEvent } from "@/lib/security-log";

export const POST = withErrorHandler(
  async (req: Request, context: { params: Promise<{ pageId: string }> }) => {
    const { pageId } = await context.params;
    const cookieStore = await cookies();
    const token = cookieStore.get(`app_token_${pageId}`)?.value;
    if (token) {
      const appUser = await getAppUserByToken(token);
      await logoutAppUser(token);
      if (appUser) {
        await logAppAudit({
          pageId,
          action: "app_user_logout",
          targetType: "app_user",
          targetId: appUser.id,
          meta: { email: appUser.email },
          actor: { appUserId: appUser.id },
        });
        logSecurityEvent({
          action: "app_user_logout",
          req,
          actor: { appUserId: appUser.id },
          meta: { pageId, email: appUser.email },
        });
      }
    }
    const res = NextResponse.json({ ok: true });
    res.cookies.set(`app_token_${pageId}`, "", { maxAge: 0, path: "/" });
    return res;
  }
);
