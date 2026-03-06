import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { resolveAnonUserId } from "@/lib/anon";
import { prisma } from "@/lib/db";
import { apiErrorJson } from "@/lib/api-error";
import { parseJsonBody } from "@/lib/validation";
import { normalizeDomain } from "@/lib/hosting-domain";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { resolveTxt } from "dns/promises";
import { logAppAudit } from "@/lib/app-audit";

type Params = { pageId: string };

type HostingValue = Record<string, unknown>;

const bodySchema = z
  .object({
    action: z.enum(["issue", "check"]).default("issue"),
  })
  .passthrough();

const TEST_SHARED_DOMAINS = new Set(["example.com", "www.example.com"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function buildRecordName(domain: string) {
  return `_null-verify.${domain}`;
}

async function requireOwner(pageId: string, req: Request) {
  const anonUserId = await resolveAnonUserId(req);
  if (!anonUserId) return { page: null as null, user: null as null, anonUserId: null as string | null, error: apiErrorJson("anon_required", 401) };
  const user = await prisma.user.findUnique({ where: { anon_id: anonUserId }, select: { id: true } });
  if (!user) return { page: null as null, user: null as null, anonUserId: null as string | null, error: apiErrorJson("user_not_found", 404) };
  const page = await prisma.page.findFirst({
    where: { id: pageId, owner_id: user.id, is_deleted: false },
    select: { id: true },
  });
  if (!page) return { page: null as null, user: null as null, anonUserId: null as string | null, error: apiErrorJson("not_found", 404) };
  return { page, user, anonUserId, error: null };
}

async function loadHosting(pageId: string): Promise<HostingValue> {
  const row = await prisma.pageSetting.findUnique({
    where: { page_id_key: { page_id: pageId, key: "hosting" } },
    select: { value: true },
  });
  return isRecord(row?.value) ? (row!.value as HostingValue) : {};
}

async function saveHosting(pageId: string, value: HostingValue) {
  await prisma.pageSetting.upsert({
    where: { page_id_key: { page_id: pageId, key: "hosting" } },
    create: { page_id: pageId, key: "hosting", value: value as Prisma.InputJsonValue },
    update: { value: value as Prisma.InputJsonValue },
  });
}

export async function POST(req: Request, context: { params: Promise<Params> }) {
  const { pageId } = await context.params;
  if (!pageId) return apiErrorJson("bad_page_id", 400);
  const { error, user, anonUserId } = await requireOwner(pageId, req);
  if (error) return error;

  const parsed = await parseJsonBody(req, bodySchema);
  if (parsed.error) return parsed.error;

  const hosting = await loadHosting(pageId);
  const customDomainRaw = typeof hosting.customDomain === "string" ? hosting.customDomain : "";
  const customDomain = normalizeDomain(customDomainRaw);
  if (!customDomain) {
    return apiErrorJson("custom_domain_required", 400);
  }

  const action = parsed.data.action;
  const recordName = buildRecordName(customDomain);
  const forceHttps = typeof hosting.forceHttps === "boolean" ? hosting.forceHttps : false;
  const redirectWww = typeof hosting.redirectWww === "boolean" ? hosting.redirectWww : false;

  const domainOwner = await prisma.pageDomain.findUnique({
    where: { domain: customDomain },
    select: { page_id: true },
  });
  const allowSharedDomain = process.env.NODE_ENV !== "production" && TEST_SHARED_DOMAINS.has(customDomain);
  if (domainOwner && domainOwner.page_id !== pageId && !allowSharedDomain) {
    return apiErrorJson("domain_in_use", 409);
  }
  await prisma.pageDomain.deleteMany({ where: { page_id: pageId, domain: { not: customDomain } } });

  if (action === "issue") {
    const token = randomUUID().replace(/-/g, "");
    const verification = {
      method: "dns_txt",
      status: "pending",
      token,
      record_name: recordName,
      record_value: token,
      issued_at: new Date().toISOString(),
      checked_at: null,
      verified_at: null,
      last_error: null,
    };
    const nextHosting = { ...hosting, customDomain, verification };
    await saveHosting(pageId, nextHosting);
    await prisma.pageDomain.upsert({
      where: { domain: customDomain },
      create: {
        page_id: pageId,
        domain: customDomain,
        status: "pending",
        verified_at: null,
        force_https: forceHttps,
        redirect_www: redirectWww,
      },
      update: {
        page_id: pageId,
        status: "pending",
        verified_at: null,
        last_error: null,
        force_https: forceHttps,
        redirect_www: redirectWww,
      },
    });

    await logAppAudit({
      pageId,
      action: "hosting_verify_issue",
      targetType: "hosting",
      targetId: customDomain,
      meta: { record_name: recordName },
      actor: { userId: user!.id, anonId: anonUserId! },
    });

    return NextResponse.json({
      ok: true,
      verification,
      instructions: {
        type: "TXT",
        name: recordName,
        value: token,
      },
    });
  }

  const existing = isRecord(hosting.verification) ? hosting.verification : null;
  const token = existing && typeof existing.token === "string" ? existing.token : "";
  if (!token) {
    return apiErrorJson("verification_token_required", 400);
  }

  let records: string[] = [];
  let matched = false;
  let errorMessage: string | null = null;
  try {
    const txt = await resolveTxt(recordName);
    records = txt.map((entry) => entry.join("")).filter(Boolean);
    matched = records.some((r) => r.includes(token));
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : "dns_lookup_failed";
  }

  const nextVerification = {
    ...(existing ?? {}),
    status: matched ? "verified" : errorMessage ? "error" : "pending",
    checked_at: new Date().toISOString(),
    verified_at: matched ? new Date().toISOString() : existing?.verified_at ?? null,
    last_error: errorMessage,
  };
  const verifiedAt = typeof nextVerification.verified_at === "string" ? nextVerification.verified_at : null;

  const nextHosting = { ...hosting, customDomain, verification: nextVerification };
  await saveHosting(pageId, nextHosting);
  await prisma.pageDomain.upsert({
    where: { domain: customDomain },
    create: {
      page_id: pageId,
      domain: customDomain,
      status: nextVerification.status,
      verified_at: nextVerification.status === "verified" ? new Date(verifiedAt ?? Date.now()) : null,
      force_https: forceHttps,
      redirect_www: redirectWww,
      last_checked_at: new Date(),
      last_error: nextVerification.last_error,
    },
    update: {
      page_id: pageId,
      status: nextVerification.status,
      verified_at: nextVerification.status === "verified" ? new Date(verifiedAt ?? Date.now()) : null,
      force_https: forceHttps,
      redirect_www: redirectWww,
      last_checked_at: new Date(),
      last_error: nextVerification.last_error,
    },
  });

  await logAppAudit({
    pageId,
    action: "hosting_verify_check",
    targetType: "hosting",
    targetId: customDomain,
    meta: { matched, status: nextVerification.status, error: nextVerification.last_error ?? null },
    actor: { userId: user!.id, anonId: anonUserId! },
  });

  return NextResponse.json({
    ok: true,
    verification: nextVerification,
    matched,
    records,
  });
}
