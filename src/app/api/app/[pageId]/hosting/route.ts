import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { resolveAnonUserId } from "@/lib/anon";
import { apiErrorJson } from "@/lib/api-error";
import { parseJsonBody } from "@/lib/validation";
import { normalizeDomain } from "@/lib/hosting-domain";
import { logAppAudit } from "@/lib/app-audit";

type Params = { pageId: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

const TEST_SHARED_DOMAINS = new Set(["example.com", "www.example.com"]);

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

const hostingSchema = z.object({
  customDomain: z.string().trim().min(1).max(200).optional().nullable(),
  forceHttps: z.boolean().optional(),
  redirectWww: z.boolean().optional(),
  notes: z.string().max(500).optional(),
}).passthrough();

export async function GET(req: Request, context: { params: Promise<Params> }) {
  const { pageId } = await context.params;
  if (!pageId) return apiErrorJson("bad_page_id", 400);
  const { error } = await requireOwner(pageId, req);
  if (error) return error;

  const row = await prisma.pageSetting.findUnique({
    where: { page_id_key: { page_id: pageId, key: "hosting" } },
    select: { value: true, updated_at: true },
  });
  const settings = row?.value ?? null;
  return NextResponse.json({ settings, updatedAt: row?.updated_at?.toISOString() ?? null });
}

export async function PUT(req: Request, context: { params: Promise<Params> }) {
  const { pageId } = await context.params;
  if (!pageId) return apiErrorJson("bad_page_id", 400);
  const { error, user, anonUserId } = await requireOwner(pageId, req);
  if (error) return error;

  const parsed = await parseJsonBody(req, hostingSchema);
  if (parsed.error) return parsed.error;
  const nextSettings = parsed.data;

  const existing = await prisma.pageSetting.findUnique({
    where: { page_id_key: { page_id: pageId, key: "hosting" } },
    select: { value: true },
  });
  const base = isRecord(existing?.value) ? existing.value : {};
  const settings = { ...base, ...nextSettings };

  const hasCustomDomain = Object.prototype.hasOwnProperty.call(nextSettings, "customDomain");
  const prevDomain = normalizeDomain(typeof base.customDomain === "string" ? base.customDomain : null);
  const rawDomain = hasCustomDomain
    ? (typeof nextSettings.customDomain === "string" ? nextSettings.customDomain : "")
    : (typeof base.customDomain === "string" ? base.customDomain : "");
  const nextDomain = normalizeDomain(rawDomain);
  const domainChanged = hasCustomDomain && prevDomain !== nextDomain;

  if (hasCustomDomain) {
    settings.customDomain = nextDomain ?? null;
    if (domainChanged) {
      settings.verification = null;
    }
  }

  const forceHttps = typeof settings.forceHttps === "boolean" ? settings.forceHttps : false;
  const redirectWww = typeof settings.redirectWww === "boolean" ? settings.redirectWww : false;

  if (nextDomain) {
    const allowSharedDomain = process.env.NODE_ENV !== "production" && TEST_SHARED_DOMAINS.has(nextDomain);
    const existingDomain = await prisma.pageDomain.findUnique({
      where: { domain: nextDomain },
      select: { page_id: true, status: true, verified_at: true },
    });
    if (existingDomain && existingDomain.page_id !== pageId && !allowSharedDomain) {
      return apiErrorJson("domain_in_use", 409);
    }

    const currentDomain = await prisma.pageDomain.findFirst({
      where: { page_id: pageId },
      select: { domain: true, status: true, verified_at: true },
    });
    const changed = !currentDomain || currentDomain.domain !== nextDomain;

    await prisma.pageDomain.deleteMany({
      where: { page_id: pageId, domain: { not: nextDomain } },
    });

    await prisma.pageDomain.upsert({
      where: { domain: nextDomain },
      create: {
        page_id: pageId,
        domain: nextDomain,
        status: changed ? "pending" : (currentDomain?.status ?? "pending"),
        verified_at: changed ? null : (currentDomain?.verified_at ?? null),
        force_https: forceHttps,
        redirect_www: redirectWww,
      },
      update: {
        page_id: pageId,
        status: changed ? "pending" : (currentDomain?.status ?? "pending"),
        verified_at: changed ? null : (currentDomain?.verified_at ?? null),
        force_https: forceHttps,
        redirect_www: redirectWww,
      },
    });
  } else if (hasCustomDomain) {
    await prisma.pageDomain.deleteMany({ where: { page_id: pageId } });
  }

  await prisma.pageSetting.upsert({
    where: { page_id_key: { page_id: pageId, key: "hosting" } },
    create: { page_id: pageId, key: "hosting", value: settings as Prisma.InputJsonValue },
    update: { value: settings as Prisma.InputJsonValue },
  });

  await logAppAudit({
    pageId,
    action: "hosting_update",
    targetType: "hosting",
    targetId: nextDomain ?? null,
    meta: { customDomain: nextDomain ?? null, forceHttps, redirectWww },
    actor: { userId: user!.id, anonId: anonUserId! },
  });

  return NextResponse.json({ ok: true, settings });
}
