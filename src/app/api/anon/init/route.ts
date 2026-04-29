import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { ensurePlanDefaults } from "@/lib/plan";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { logApiError } from "@/lib/logger";
import { apiErrorJson } from "@/lib/api-error";
import { shouldUseSecureCookies } from "@/lib/cookie-security";

const COOKIE_NAME = "anon_user_id";
const HEADER_NAME = "x-anon-user-id";
const ANON_INIT_MAX_PER_MINUTE = 20;

export async function POST(req: Request) {
  const rl = await checkRateLimit(req, ANON_INIT_MAX_PER_MINUTE);
  if (!rl.allowed) {
    return apiErrorJson("rate_limit_exceeded", 429, {
      message: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
      headers: rateLimitHeaders(rl),
    });
  }

  try {
    await ensurePlanDefaults(prisma);
    const cookieStore = await cookies();
    const cookieId = cookieStore.get(COOKIE_NAME)?.value ?? null;
    const headerId = req.headers.get(HEADER_NAME);

    const anonUserId = cookieId ?? headerId ?? `anon_${randomUUID()}`;

    let user = await prisma.user.findUnique({ where: { anon_id: anonUserId } });
    if (!user) {
      try {
        user = await prisma.user.create({
          data: {
            anon_id: anonUserId,
          },
        });
      } catch {
        user = await prisma.user.findUnique({ where: { anon_id: anonUserId } });
      }
    }

    if (!user) {
      return apiErrorJson("anon_user_unavailable", 503);
    }

    const response = NextResponse.json({ anonUserId: user.anon_id });
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
    logApiError(req, "anon init failed", error);
    return apiErrorJson("anon_init_failed", 500);
  }
}
