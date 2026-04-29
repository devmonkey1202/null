import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { normalizeEmail, verifyPassword } from "@/lib/auth";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { logApiError } from "@/lib/logger";
import { apiErrorJson } from "@/lib/api-error";
import { parseJsonBody } from "@/lib/validation";
import { logSecurityEvent } from "@/lib/security-log";
import { shouldUseSecureCookies } from "@/lib/cookie-security";

const COOKIE_NAME = "anon_user_id";
const LOGIN_MAX_PER_MINUTE = 10;

export async function POST(req: Request) {
  const rl = await checkRateLimit(req, LOGIN_MAX_PER_MINUTE);
  if (!rl.allowed) {
    logSecurityEvent({
      action: "user_login_rate_limited",
      req,
    });
    return apiErrorJson("rate_limit_exceeded", 429, {
      message: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
      headers: rateLimitHeaders(rl),
    });
  }

  try {
    const parsed = await parseJsonBody(
      req,
      z
        .object({
          email: z.string().optional(),
          password: z.string().optional(),
          nextPageId: z.string().optional().nullable(),
        })
        .passthrough()
    );
    if (parsed.error) return parsed.error;
    const payload = parsed.data;
    const email = normalizeEmail(String(payload.email ?? ""));
    const password = String(payload.password ?? "");

    if (!email || !password) {
      return apiErrorJson("email_password_required", 400);
    }

    const user = await prisma.user.findFirst({ where: { email } });
    if (!user || !user.password_hash) {
      logSecurityEvent({
        action: "user_login_invalid",
        req,
        meta: { email },
      });
      return apiErrorJson("invalid_credentials", 401);
    }

    if (!verifyPassword(password, user.password_hash)) {
      logSecurityEvent({
        action: "user_login_invalid",
        req,
        actor: { userId: user.id },
        meta: { email },
      });
      return apiErrorJson("invalid_credentials", 401);
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { last_login_at: new Date() },
    });
    logSecurityEvent({
      action: "user_login_success",
      req,
      actor: { userId: user.id, anonId: user.anon_id },
      meta: { email },
    });

    const response = NextResponse.json({
      ok: true,
      anonUserId: user.anon_id,
      email: user.email,
      nextPageId: payload.nextPageId ?? null,
    });
    Object.entries(rateLimitHeaders(rl)).forEach(([k, v]) => response.headers.set(k, v));
    response.cookies.set(COOKIE_NAME, user.anon_id, {
      httpOnly: true,
      sameSite: "lax",
      secure: shouldUseSecureCookies(req),
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
    return response;
  } catch (error) {
    logApiError(req, "auth login failed", error);
    return apiErrorJson("server_error", 500);
  }
}
