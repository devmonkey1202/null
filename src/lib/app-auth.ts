/**
 * App user auth for per-page services (AppUser scoped by Page).
 */

import { prisma } from "@/lib/db";
import { hashPassword, verifyPassword, normalizeEmail, isValidPassword } from "@/lib/auth";
import { consumeBackupCode, normalizeBackupCode, normalizeOtpToken, verifyTotp } from "@/lib/otp";
import { randomBytes } from "crypto";

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
function generateToken() {
  return randomBytes(32).toString("hex");
}

export type AppUserPublic = {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  role: string;
  metadata: unknown;
  created_at: Date;
};

type AppUserOtpState = {
  id: string;
  otp_enabled: boolean;
  otp_secret: string | null;
  otp_backup_codes: unknown | null;
  otp_last_used_at: Date | null;
};

type AppUserOtpInput = {
  otp?: string;
  otpBackup?: string;
};

function parseBackupCodes(raw: unknown) {
  if (!Array.isArray(raw)) return [];
  return raw.filter((value): value is string => typeof value === "string");
}

export async function enforceAppUserOtp(state: AppUserOtpState, input: AppUserOtpInput, opts?: { now?: Date }) {
  if (!state.otp_enabled) return;
  if (!state.otp_secret) throw new Error("otp_not_setup");

  const otp = normalizeOtpToken(input.otp);
  const backup = normalizeBackupCode(input.otpBackup);
  const now = opts?.now ?? new Date();

  if (otp) {
    const verified = verifyTotp({ secret: state.otp_secret, token: otp, timestamp: now.getTime(), window: 1 });
    if (!verified.valid) throw new Error("otp_invalid");
    const lastStep = state.otp_last_used_at
      ? Math.floor(state.otp_last_used_at.getTime() / 1000 / 30)
      : null;
    if (lastStep !== null && verified.counter <= lastStep) throw new Error("otp_reused");
    await prisma.appUser.update({
      where: { id: state.id },
      data: { otp_last_used_at: now },
    });
    return;
  }

  if (backup) {
    const hashes = parseBackupCodes(state.otp_backup_codes);
    const consumed = consumeBackupCode(hashes, backup);
    if (!consumed.ok) throw new Error("otp_invalid");
    await prisma.appUser.update({
      where: { id: state.id },
      data: { otp_backup_codes: consumed.remaining, otp_last_used_at: now },
    });
    return;
  }

  throw new Error("otp_required");
}

function toPublic(u: {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  role: string;
  metadata: unknown;
  created_at: Date;
}): AppUserPublic {
  return {
    id: u.id,
    email: u.email,
    display_name: u.display_name,
    avatar_url: u.avatar_url,
    role: u.role,
    metadata: u.metadata,
    created_at: u.created_at,
  };
}

export async function registerAppUser(
  pageId: string,
  email: string,
  password: string,
  displayName?: string
) {
  email = normalizeEmail(email);
  if (!email) throw new Error("Email is required.");
  if (!isValidPassword(password)) {
    throw new Error("Password must be at least 8 characters and include upper/lowercase, number, and symbol.");
  }

  const existing = await prisma.appUser.findUnique({
    where: { page_id_email: { page_id: pageId, email } },
  });
  if (existing) throw new Error("Email is already registered.");

  const existingCount = await prisma.appUser.count({ where: { page_id: pageId } });
  const role = existingCount === 0 ? "admin" : "user";

  const user = await prisma.appUser.create({
    data: {
      page_id: pageId,
      email,
      password_hash: hashPassword(password),
      display_name: displayName ?? null,
      role,
    },
  });

  const token = generateToken();
  await prisma.appSession.create({
    data: {
      page_id: pageId,
      app_user_id: user.id,
      token,
      expires_at: new Date(Date.now() + SESSION_TTL_MS),
    },
  });

  return { user: toPublic(user), token };
}

export async function loginAppUser(
  pageId: string,
  email: string,
  password: string,
  input?: { otp?: string; otpBackup?: string }
) {
  email = normalizeEmail(email);
  if (!email || !password) throw new Error("Email and password are required.");

  const user = await prisma.appUser.findUnique({
    where: { page_id_email: { page_id: pageId, email } },
  });
  if (!user || !verifyPassword(password, user.password_hash)) {
    throw new Error("Invalid email or password.");
  }

  await enforceAppUserOtp(
    {
      id: user.id,
      otp_enabled: Boolean(user.otp_enabled),
      otp_secret: user.otp_secret ?? null,
      otp_backup_codes: user.otp_backup_codes ?? null,
      otp_last_used_at: user.otp_last_used_at ?? null,
    },
    { otp: input?.otp, otpBackup: input?.otpBackup }
  );

  const token = generateToken();
  await prisma.appSession.create({
    data: {
      page_id: pageId,
      app_user_id: user.id,
      token,
      expires_at: new Date(Date.now() + SESSION_TTL_MS),
    },
  });

  return { user: toPublic(user), token };
}

export async function logoutAppUser(token: string) {
  await prisma.appSession.deleteMany({ where: { token } });
}

export async function getAppUserByToken(token: string): Promise<AppUserPublic | null> {
  if (!token) return null;
  const session = await prisma.appSession.findUnique({
    where: { token },
    include: { app_user: true },
  });
  if (!session) return null;
  if (session.expires_at < new Date()) {
    await prisma.appSession.delete({ where: { id: session.id } });
    return null;
  }
  return toPublic(session.app_user);
}

export async function getAppUserByTokenForPage(pageId: string, token: string): Promise<AppUserPublic | null> {
  if (!token) return null;
  const session = await prisma.appSession.findUnique({
    where: { token },
    include: { app_user: true },
  });
  if (!session) return null;
  if (session.page_id !== pageId) return null;
  if (session.expires_at < new Date()) {
    await prisma.appSession.delete({ where: { id: session.id } });
    return null;
  }
  return toPublic(session.app_user);
}

export async function updateAppUserProfile(
  userId: string,
  data: { display_name?: string; avatar_url?: string; metadata?: unknown }
) {
  const updated = await prisma.appUser.update({
    where: { id: userId },
    data: {
      ...(data.display_name !== undefined && { display_name: data.display_name }),
      ...(data.avatar_url !== undefined && { avatar_url: data.avatar_url }),
      ...(data.metadata !== undefined && { metadata: data.metadata as object }),
    },
  });
  return toPublic(updated);
}

export async function changeAppUserPassword(userId: string, currentPassword: string, newPassword: string) {
  const user = await prisma.appUser.findUnique({ where: { id: userId } });
  if (!user) throw new Error("User not found.");
  if (!verifyPassword(currentPassword, user.password_hash)) {
    throw new Error("Current password is incorrect.");
  }
  if (!isValidPassword(newPassword)) {
    throw new Error("New password must be at least 8 characters and include upper/lowercase, number, and symbol.");
  }

  await prisma.appUser.update({
    where: { id: userId },
    data: { password_hash: hashPassword(newPassword) },
  });
}

export async function listAppUsers(pageId: string, opts?: { role?: string; limit?: number; offset?: number }) {
  const where: Record<string, unknown> = { page_id: pageId };
  if (opts?.role) where.role = opts.role;

  const users = await prisma.appUser.findMany({
    where,
    orderBy: { created_at: "desc" },
    take: opts?.limit ?? 50,
    skip: opts?.offset ?? 0,
    select: {
      id: true, email: true, display_name: true, avatar_url: true,
      role: true, metadata: true, created_at: true,
    },
  });
  return users.map(toPublic);
}

export async function setAppUserRole(userId: string, role: string) {
  const updated = await prisma.appUser.update({
    where: { id: userId },
    data: { role },
  });
  return toPublic(updated);
}

export async function deleteAppUser(userId: string) {
  await prisma.appSession.deleteMany({ where: { app_user_id: userId } });
  await prisma.appUser.delete({ where: { id: userId } });
}
