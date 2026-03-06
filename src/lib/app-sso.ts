import { prisma } from "@/lib/db";
import { hashPassword, normalizeEmail } from "@/lib/auth";
import { logAppAudit } from "@/lib/app-audit";
import { randomBytes } from "crypto";

export type SsoProvider = "oauth" | "saml";

export type SsoConnectionInput = {
  provider: SsoProvider;
  name: string;
  enabled?: boolean;
  issuer?: string;
  client_id?: string;
  client_secret?: string;
  authorization_url?: string;
  token_url?: string;
  metadata_url?: string;
  certificate_pem?: string;
  entity_id?: string;
  acs_url?: string;
  sign_requests?: boolean;
  auto_provision?: boolean;
  allow_unlinked?: boolean;
  default_role?: string;
};

export type SsoLoginInput = {
  provider: SsoProvider;
  connectionName?: string;
  payload: unknown;
};

type SsoIdentity = {
  subject: string;
  email: string | null;
  displayName: string | null;
};

function cleanString(value: unknown, maxLen: number) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, maxLen);
}

function normalizeProvider(value: unknown): SsoProvider | null {
  if (value === "oauth" || value === "saml") return value;
  return null;
}

function normalizeIdentity(input: unknown): SsoIdentity {
  let payload: Record<string, unknown> | null = null;
  if (typeof input === "string") {
    const raw = input.trim();
    if (!raw) throw new Error("sso_payload_required");
    try {
      payload = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      const emailGuess = raw.includes("@") ? raw : null;
      const subjectGuess = raw;
      return {
        subject: subjectGuess,
        email: emailGuess ? normalizeEmail(emailGuess) : null,
        displayName: null,
      };
    }
  } else if (input && typeof input === "object") {
    payload = input as Record<string, unknown>;
  }

  const subjectRaw =
    cleanString(payload?.subject, 180) ??
    cleanString(payload?.sub, 180) ??
    cleanString(payload?.id, 180);
  const emailRaw =
    cleanString(payload?.email, 200) ??
    cleanString(payload?.mail, 200) ??
    cleanString(payload?.user_email, 200);
  const displayName = cleanString(payload?.displayName ?? payload?.name, 200) ?? null;

  if (!subjectRaw && !emailRaw) {
    throw new Error("sso_identity_missing");
  }

  const email = emailRaw ? normalizeEmail(emailRaw) : null;
  const subject = subjectRaw ?? (email ? email : "sso-subject");

  return { subject, email, displayName };
}

function generateToken() {
  return randomBytes(32).toString("hex");
}

function generateFallbackPassword() {
  return randomBytes(24).toString("hex");
}

function toPublic(u: {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  role: string;
  metadata: unknown;
  created_at: Date;
}) {
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

export function normalizeSsoConnectionInput(input: unknown): SsoConnectionInput {
  const obj = (input ?? {}) as Record<string, unknown>;
  const provider = normalizeProvider(obj.provider);
  if (!provider) {
    throw new Error("sso_provider_required");
  }
  const name = cleanString(obj.name, 120);
  if (!name) {
    throw new Error("sso_name_required");
  }

  return {
    provider,
    name,
    enabled: typeof obj.enabled === "boolean" ? obj.enabled : undefined,
    issuer: cleanString(obj.issuer, 400),
    client_id: cleanString(obj.client_id, 400),
    client_secret: cleanString(obj.client_secret, 800),
    authorization_url: cleanString(obj.authorization_url, 800),
    token_url: cleanString(obj.token_url, 800),
    metadata_url: cleanString(obj.metadata_url, 800),
    certificate_pem: cleanString(obj.certificate_pem, 4000),
    entity_id: cleanString(obj.entity_id, 400),
    acs_url: cleanString(obj.acs_url, 800),
    sign_requests: typeof obj.sign_requests === "boolean" ? obj.sign_requests : undefined,
    auto_provision: typeof obj.auto_provision === "boolean" ? obj.auto_provision : undefined,
    allow_unlinked: typeof obj.allow_unlinked === "boolean" ? obj.allow_unlinked : undefined,
    default_role: cleanString(obj.default_role, 120),
  };
}

export async function listSsoConnections(pageId: string) {
  return prisma.appSsoConnection.findMany({
    where: { page_id: pageId },
    orderBy: { created_at: "desc" },
  });
}

export async function createSsoConnection(pageId: string, input: unknown) {
  const data = normalizeSsoConnectionInput(input);
  return prisma.appSsoConnection.create({
    data: {
      page_id: pageId,
      provider: data.provider,
      name: data.name,
      enabled: data.enabled ?? true,
      issuer: data.issuer ?? null,
      client_id: data.client_id ?? null,
      client_secret: data.client_secret ?? null,
      authorization_url: data.authorization_url ?? null,
      token_url: data.token_url ?? null,
      metadata_url: data.metadata_url ?? null,
      certificate_pem: data.certificate_pem ?? null,
      entity_id: data.entity_id ?? null,
      acs_url: data.acs_url ?? null,
      sign_requests: data.sign_requests ?? false,
      auto_provision: data.auto_provision ?? false,
      allow_unlinked: data.allow_unlinked ?? false,
      default_role: data.default_role ?? null,
    },
  });
}

export async function updateSsoConnection(pageId: string, connectionId: string, input: unknown) {
  const existing = await prisma.appSsoConnection.findFirst({
    where: { id: connectionId, page_id: pageId },
  });
  if (!existing) throw new Error("sso_connection_not_found");

  const obj = (input ?? {}) as Record<string, unknown>;
  const updated = await prisma.appSsoConnection.update({
    where: { id: connectionId },
    data: {
      enabled: typeof obj.enabled === "boolean" ? obj.enabled : undefined,
      issuer: cleanString(obj.issuer, 400),
      client_id: cleanString(obj.client_id, 400),
      client_secret: cleanString(obj.client_secret, 800),
      authorization_url: cleanString(obj.authorization_url, 800),
      token_url: cleanString(obj.token_url, 800),
      metadata_url: cleanString(obj.metadata_url, 800),
      certificate_pem: cleanString(obj.certificate_pem, 4000),
      entity_id: cleanString(obj.entity_id, 400),
      acs_url: cleanString(obj.acs_url, 800),
      sign_requests: typeof obj.sign_requests === "boolean" ? obj.sign_requests : undefined,
      auto_provision: typeof obj.auto_provision === "boolean" ? obj.auto_provision : undefined,
      allow_unlinked: typeof obj.allow_unlinked === "boolean" ? obj.allow_unlinked : undefined,
      default_role: cleanString(obj.default_role, 120),
    },
  });
  return updated;
}

export async function deleteSsoConnection(pageId: string, connectionId: string) {
  const existing = await prisma.appSsoConnection.findFirst({
    where: { id: connectionId, page_id: pageId },
    select: { id: true },
  });
  if (!existing) throw new Error("sso_connection_not_found");
  await prisma.appSsoConnection.delete({ where: { id: connectionId } });
}

export async function loginWithSso(pageId: string, input: SsoLoginInput) {
  const provider = normalizeProvider(input.provider);
  if (!provider) throw new Error("sso_provider_required");

  const connection = await prisma.appSsoConnection.findFirst({
    where: {
      page_id: pageId,
      provider,
      ...(input.connectionName ? { name: input.connectionName } : {}),
      enabled: true,
    },
  });
  if (!connection) throw new Error("sso_connection_not_found");

  const identity = normalizeIdentity(input.payload);
  const subject = identity.subject;
  let account = await prisma.appSsoAccount.findUnique({
    where: { connection_id_subject: { connection_id: connection.id, subject } },
    include: { app_user: true },
  });

  if (!account && identity.email && connection.allow_unlinked) {
    const existingUser = await prisma.appUser.findUnique({
      where: { page_id_email: { page_id: pageId, email: identity.email } },
    });
    if (existingUser) {
      account = await prisma.appSsoAccount.create({
        data: {
          page_id: pageId,
          connection_id: connection.id,
          app_user_id: existingUser.id,
          provider,
          subject,
          email: identity.email,
        },
        include: { app_user: true },
      });
    }
  }

  let created = false;
  if (!account) {
    if (!connection.auto_provision) {
      throw new Error("sso_account_unlinked");
    }
    const fallbackEmail = identity.email ?? `${subject}@sso.local`;
    const user = await prisma.appUser.create({
      data: {
        page_id: pageId,
        email: normalizeEmail(fallbackEmail),
        password_hash: hashPassword(generateFallbackPassword()),
        display_name: identity.displayName ?? null,
        role: connection.default_role ?? "user",
        metadata: { sso_provider: provider, sso_subject: subject },
      },
    });
    account = await prisma.appSsoAccount.create({
      data: {
        page_id: pageId,
        connection_id: connection.id,
        app_user_id: user.id,
        provider,
        subject,
        email: identity.email,
      },
      include: { app_user: true },
    });
    created = true;
  }

  const token = generateToken();
  await prisma.appSession.create({
    data: {
      page_id: pageId,
      app_user_id: account.app_user_id,
      token,
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });

  await logAppAudit({
    pageId,
    action: created ? "sso_provision" : "sso_login",
    targetType: "app_user",
    targetId: account.app_user_id,
    meta: {
      provider,
      connection: connection.name,
      subject,
      email: identity.email,
    },
    actor: { appUserId: account.app_user_id },
  });

  return { user: toPublic(account.app_user), token, created };
}
