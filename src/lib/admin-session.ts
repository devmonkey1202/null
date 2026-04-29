import { createHash, randomBytes } from "crypto";
import { cookies } from "next/headers";
import type { AdminRole } from "@prisma/client";
import { prisma } from "@/lib/db";
import { shouldUseSecureCookiesFromHeaders } from "@/lib/cookie-security";

/**
 * Admin UI session (v1)
 *
 * - Hidden route: /ops/<ADMIN_SECRET_SLUG>
 * - Login: ADMIN_KEY only (no email/phone)
 */

const COOKIE_NAME = "null_admin_session";

function sessionSalt() {
  return process.env.ADMIN_SESSION_SALT ?? process.env.IP_HASH_SALT ?? "";
}

function hashToken(token: string) {
  return createHash("sha256").update(`${token}|${sessionSalt()}`).digest("hex");
}

function hashAdminKeyAsPasswordHash() {
  const key = process.env.ADMIN_KEY ?? "";
  return createHash("sha256").update(`admin-key|${key}|${sessionSalt()}`).digest("hex");
}

export function isAdminUiConfigured() {
  return Boolean(process.env.ADMIN_SECRET_SLUG && process.env.ADMIN_KEY);
}

export function verifyAdminKey(input: string) {
  return Boolean(process.env.ADMIN_KEY) && input === process.env.ADMIN_KEY;
}

function roleAllowed(role: AdminRole, allowed?: AdminRole[]) {
  if (!allowed || allowed.length === 0) return true;
  return allowed.includes(role);
}

export async function ensureAdminUser() {
  let admin = await prisma.adminUser.findFirst({
    orderBy: { created_at: "asc" },
  });

  if (!admin) {
    const suffix = randomBytes(3).toString("hex");
    const username = `admin_${suffix}`;

    admin = await prisma.adminUser.create({
      data: {
        username,
        password_hash: hashAdminKeyAsPasswordHash(),
        // optional fields in schema (role/is_active/otp_secret) are intentionally omitted
      },
    });
  }

  return admin;
}

export async function createAdminSession() {
  const token = randomBytes(32).toString("hex");
  const tokenHash = hashToken(token);

  // 정책확정: 세션 TTL 7일. 관리자 로그인 후 7일간 유효.
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const admin = await ensureAdminUser();

  await prisma.adminSession.create({
    data: {
      token_hash: tokenHash,
      expires_at: expiresAt,
      admin: { connect: { id: admin.id } },
    },
  });

  const jar = await cookies();
  const secure = await shouldUseSecureCookiesFromHeaders();
  jar.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    expires: expiresAt,
  });

  return admin;
}

export async function clearAdminSession() {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;

  if (token) {
    const tokenHash = hashToken(token);
    await prisma.adminSession.deleteMany({ where: { token_hash: tokenHash } });
  }

  jar.set(COOKIE_NAME, "", { path: "/", expires: new Date(0) });
}

export type AdminSessionGate =
  | { ok: true; admin: { id: string; username: string; role: AdminRole; is_active: boolean } }
  | { ok: false; code: "not_configured" | "no_session" | "expired_or_invalid" | "inactive" | "forbidden" };

export async function requireAdminSession(options?: { roles?: AdminRole[] }): Promise<AdminSessionGate> {
  if (!isAdminUiConfigured()) return { ok: false, code: "not_configured" };

  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (!token) return { ok: false, code: "no_session" };

  const tokenHash = hashToken(token);

  const found = await prisma.adminSession.findFirst({
    where: {
      token_hash: tokenHash,
      expires_at: { gt: new Date() },
    },
    select: {
      id: true,
      admin: {
        select: {
          id: true,
          username: true,
          role: true,
          is_active: true,
        },
      },
    },
  });

  if (!found || !found.admin) return { ok: false, code: "expired_or_invalid" };
  if (!found.admin.is_active) return { ok: false, code: "inactive" };
  if (!roleAllowed(found.admin.role, options?.roles)) return { ok: false, code: "forbidden" };

  return { ok: true, admin: found.admin };
}

export async function requireAdminAccess(
  req: Request,
  options?: { roles?: AdminRole[] }
): Promise<AdminSessionGate> {
  if (!isAdminUiConfigured()) return { ok: false, code: "not_configured" };
  const headerKey = req.headers.get("x-admin-key") ?? "";
  if (headerKey && verifyAdminKey(headerKey)) {
    const admin = await ensureAdminUser();
    if (!admin.is_active) return { ok: false, code: "inactive" };
    if (!roleAllowed(admin.role, options?.roles)) return { ok: false, code: "forbidden" };
    return { ok: true, admin: { id: admin.id, username: admin.username, role: admin.role, is_active: admin.is_active } };
  }
  return requireAdminSession(options);
}
