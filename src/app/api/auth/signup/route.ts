import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { resolveAnonUserId, ensureAnonUser } from "@/lib/anon";
import { hashPassword, isValidPassword, normalizeEmail, verifyPassword } from "@/lib/auth";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { logApiError } from "@/lib/logger";
import { apiErrorJson } from "@/lib/api-error";
import { parseJsonBody } from "@/lib/validation";
import { logSecurityEvent } from "@/lib/security-log";
import { shouldUseSecureCookies } from "@/lib/cookie-security";

const COOKIE_NAME = "anon_user_id";
const SIGNUP_MAX_PER_MINUTE = 5;

export async function POST(req: Request) {
  const rl = await checkRateLimit(req, SIGNUP_MAX_PER_MINUTE);
  if (!rl.allowed) {
    logSecurityEvent({ action: "user_signup_rate_limited", req });
    return apiErrorJson("rate_limit_exceeded", 429, {
      message: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
      headers: rateLimitHeaders(rl),
    });
  }

  try {
    let anonUserId = await resolveAnonUserId(req);
    if (!anonUserId) {
      anonUserId = `anon_${randomUUID()}`;
    }

    const parsed = await parseJsonBody(
      req,
      z
        .object({
          email: z.string().optional(),
          password: z.string().optional(),
          passwordConfirm: z.string().optional(),
          password_confirm: z.string().optional(),
          nextPageId: z.string().optional().nullable(),
        })
        .passthrough()
    );
    if (parsed.error) return parsed.error;
    const payload = parsed.data;

    const email = normalizeEmail(String(payload.email ?? ""));
    const password = String(payload.password ?? "");
    const passwordConfirm = String(payload.passwordConfirm ?? payload.password_confirm ?? "");

    if (!email || !password) {
      return apiErrorJson("email_password_required", 400);
    }

    if (!isValidPassword(password)) {
      return apiErrorJson("password_too_short", 400, "비밀번호는 8자 이상이며 대/소문자, 숫자, 특수문자를 포함해야 합니다.");
    }

    if (passwordConfirm && passwordConfirm !== password) {
      return apiErrorJson("password_mismatch", 400);
    }

    const user = await ensureAnonUser(anonUserId);
    if (!user) {
      return apiErrorJson("user_not_found", 404);
    }

    const existing = await prisma.user.findFirst({ where: { email } });
    if (existing && existing.id !== user.id) {
      if (existing.password_hash && verifyPassword(password, existing.password_hash)) {
        await prisma.user.update({
          where: { id: existing.id },
          data: { last_login_at: new Date() },
        });
        logSecurityEvent({
          action: "user_login_success",
          req,
          actor: { userId: existing.id, anonId: existing.anon_id },
          meta: { email, via: "signup_existing" },
        });
        const response = NextResponse.json({ ok: true, anonUserId: existing.anon_id, email: existing.email });
        Object.entries(rateLimitHeaders(rl)).forEach(([k, v]) => response.headers.set(k, v));
        response.cookies.set(COOKIE_NAME, existing.anon_id, {
          httpOnly: true,
          sameSite: "lax",
          secure: shouldUseSecureCookies(req),
          path: "/",
          maxAge: 60 * 60 * 24 * 365,
        });
        return response;
      }
      logSecurityEvent({ action: "user_signup_email_in_use", req, meta: { email } });
      return apiErrorJson("email_in_use", 409);
    }

    const passwordHash = hashPassword(password);

    if (user.email && user.email !== email) {
      const newAnonId = `anon_${randomUUID()}`;
      const created = await prisma.user.create({
        data: {
          anon_id: newAnonId,
          email,
          password_hash: passwordHash,
          last_login_at: new Date(),
        },
      });
      logSecurityEvent({
        action: "user_signup_success",
        req,
        actor: { userId: created.id, anonId: created.anon_id },
        meta: { email, switched: true },
      });
      const response = NextResponse.json({
        ok: true,
        anonUserId: created.anon_id,
        email: created.email,
        switched: true,
      });
      Object.entries(rateLimitHeaders(rl)).forEach(([k, v]) => response.headers.set(k, v));
      response.cookies.set(COOKIE_NAME, created.anon_id, {
        httpOnly: true,
        sameSite: "lax",
        secure: shouldUseSecureCookies(req),
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
      });
      return response;
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        email,
        password_hash: passwordHash,
        last_login_at: new Date(),
      },
    });
    logSecurityEvent({
      action: "user_signup_success",
      req,
      actor: { userId: updated.id, anonId: updated.anon_id },
      meta: { email, switched: false },
    });

    const response = NextResponse.json({
      ok: true,
      anonUserId: updated.anon_id,
      email: updated.email,
      nextPageId: payload.nextPageId ?? null,
    });
    Object.entries(rateLimitHeaders(rl)).forEach(([k, v]) => response.headers.set(k, v));
    response.cookies.set(COOKIE_NAME, updated.anon_id, {
      httpOnly: true,
      sameSite: "lax",
      secure: shouldUseSecureCookies(req),
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
    return response;
  } catch (error) {
    logApiError(req, "auth signup failed", error);
    return apiErrorJson("server_error", 500);
  }
}
