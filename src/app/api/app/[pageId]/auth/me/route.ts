import { NextResponse } from "next/server";
import { getAppUserByTokenForPage, updateAppUserProfile, changeAppUserPassword } from "@/lib/app-auth";
import { withErrorHandler, safeParseBody } from "@/lib/api-handler";
import { cookies } from "next/headers";
import { logAppAudit } from "@/lib/app-audit";

async function getToken(pageId: string, req: Request): Promise<string | undefined> {
  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) return authHeader.slice(7);
  const cookieStore = await cookies();
  return cookieStore.get(`app_token_${pageId}`)?.value;
}

export const GET = withErrorHandler(
  async (req: Request, context: { params: Promise<{ pageId: string }> }) => {
    const { pageId } = await context.params;
    const token = await getToken(pageId, req);
    if (!token) return NextResponse.json({ user: null });

    const user = await getAppUserByTokenForPage(pageId, token);
    return NextResponse.json({ user });
  }
);

export const PATCH = withErrorHandler(
  async (req: Request, context: { params: Promise<{ pageId: string }> }) => {
    const { pageId } = await context.params;
    const token = await getToken(pageId, req);
    if (!token) return NextResponse.json({ error: "auth_required" }, { status: 401 });

    const user = await getAppUserByTokenForPage(pageId, token);
    if (!user) return NextResponse.json({ error: "auth_required" }, { status: 401 });

    const body = (await safeParseBody(req)) as Record<string, unknown> | null;
    if (!body) return NextResponse.json({ error: "body_required" }, { status: 400 });

    const updated = await updateAppUserProfile(user.id, {
      display_name: body.display_name != null ? String(body.display_name) : undefined,
      avatar_url: body.avatar_url != null ? String(body.avatar_url) : undefined,
      metadata: body.metadata,
    });
    const changed: string[] = [];
    if (body.display_name != null) changed.push("display_name");
    if (body.avatar_url != null) changed.push("avatar_url");
    if (body.metadata != null) changed.push("metadata");
    await logAppAudit({
      pageId,
      action: "app_user_update",
      targetType: "app_user",
      targetId: user.id,
      meta: { changed_fields: changed },
      actor: { appUserId: user.id },
    });
    return NextResponse.json({ ok: true, user: updated });
  }
);

export const PUT = withErrorHandler(
  async (req: Request, context: { params: Promise<{ pageId: string }> }) => {
    const { pageId } = await context.params;
    const token = await getToken(pageId, req);
    if (!token) return NextResponse.json({ error: "auth_required" }, { status: 401 });

    const user = await getAppUserByTokenForPage(pageId, token);
    if (!user) return NextResponse.json({ error: "auth_required" }, { status: 401 });

    const body = (await safeParseBody(req)) as Record<string, unknown> | null;
    if (!body) return NextResponse.json({ error: "body_required" }, { status: 400 });

    try {
      await changeAppUserPassword(user.id, String(body.current_password ?? ""), String(body.new_password ?? ""));
      await logAppAudit({
        pageId,
        action: "app_user_password_change",
        targetType: "app_user",
        targetId: user.id,
        meta: null,
        actor: { appUserId: user.id },
      });
      return NextResponse.json({ ok: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "password_change_failed";
      return NextResponse.json({ error: msg }, { status: 400 });
    }
  }
);
