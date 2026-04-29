import { NextResponse } from "next/server";
import { resolveAnonUserId } from "@/lib/anon";
import { prisma } from "@/lib/db";
import { apiErrorJson } from "@/lib/api-error";
import { normalizeDomain } from "@/lib/hosting-domain";
import { resolve4, resolve6, resolveCname, resolveTxt } from "dns/promises";
import tls from "tls";
import { logAppAudit } from "@/lib/app-audit";

type Params = { pageId: string };
type HostingValue = Record<string, unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
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

function parseEnvList(value?: string) {
  if (!value) return [];
  return value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

async function safeResolve<T>(fn: () => Promise<T>, fallback: T) {
  try {
    const data = await fn();
    return { data, error: null as string | null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "dns_lookup_failed";
    return { data: fallback, error: message };
  }
}

async function checkTls(domain: string) {
  return new Promise<{
    status: "ok" | "expired" | "not_found" | "error";
    valid_from?: string;
    valid_to?: string;
    days_remaining?: number;
    issuer?: unknown;
    subject?: unknown;
    error?: string;
  }>((resolve) => {
    const socket = tls.connect(
      {
        host: domain,
        port: 443,
        servername: domain,
        timeout: 5000,
      },
      () => {
        try {
          const cert = socket.getPeerCertificate();
          socket.end();
          if (!cert || !cert.valid_to) {
            resolve({ status: "not_found" });
            return;
          }
          const validTo = new Date(cert.valid_to);
          const now = new Date();
          const daysRemaining = Math.floor((validTo.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          resolve({
            status: validTo.getTime() < now.getTime() ? "expired" : "ok",
            valid_from: cert.valid_from,
            valid_to: cert.valid_to,
            days_remaining: Number.isNaN(daysRemaining) ? undefined : daysRemaining,
            issuer: cert.issuer,
            subject: cert.subject,
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : "tls_failed";
          resolve({ status: "error", error: message });
        }
      },
    );
    socket.on("error", (err) => {
      resolve({ status: "error", error: err.message });
    });
    socket.on("timeout", () => {
      socket.destroy();
      resolve({ status: "error", error: "tls_timeout" });
    });
  });
}

export async function GET(req: Request, context: { params: Promise<Params> }) {
  const { pageId } = await context.params;
  if (!pageId) return apiErrorJson("bad_page_id", 400);
  const { error, user, anonUserId } = await requireOwner(pageId, req);
  if (error) return error;

  const hosting = await loadHosting(pageId);
  const customDomainRaw = typeof hosting.customDomain === "string" ? hosting.customDomain : "";
  const customDomain = normalizeDomain(customDomainRaw);
  if (!customDomain) {
    await logAppAudit({
      pageId,
      action: "hosting_status_check",
      targetType: "hosting",
      targetId: null,
      meta: { error: "custom_domain_required" },
      actor: { userId: user!.id, anonId: anonUserId! },
    });
    return apiErrorJson("custom_domain_required", 400);
  }

  const verification = isRecord(hosting.verification) ? hosting.verification : null;
  const token = verification && typeof verification.token === "string" ? verification.token : null;
  const recordName = token ? `_null-verify.${customDomain}` : null;

  const expectedCname = parseEnvList(process.env.HOSTING_EXPECTED_CNAME ?? process.env.NEXT_PUBLIC_HOSTING_EXPECTED_CNAME);
  const expectedA = parseEnvList(process.env.HOSTING_EXPECTED_A ?? process.env.NEXT_PUBLIC_HOSTING_EXPECTED_A);
  const expectedAAAA = parseEnvList(process.env.HOSTING_EXPECTED_AAAA ?? process.env.NEXT_PUBLIC_HOSTING_EXPECTED_AAAA);

  const txtResult = recordName
    ? await safeResolve(() => resolveTxt(recordName), [] as string[][])
    : { data: [] as string[][], error: null as string | null };
  const txtRecords = txtResult.data.map((entry) => entry.join("")).filter(Boolean);
  const txtMatched = token ? txtRecords.some((r) => r.includes(token)) : null;

  const aResult = await safeResolve(() => resolve4(customDomain), [] as string[]);
  const aaaaResult = await safeResolve(() => resolve6(customDomain), [] as string[]);
  const cnameResult = await safeResolve(() => resolveCname(customDomain), [] as string[]);

  const cnameMatched = expectedCname.length ? cnameResult.data.some((r) => expectedCname.includes(r)) : null;
  const aMatched = expectedA.length ? aResult.data.some((r) => expectedA.includes(r)) : null;
  const aaaaMatched = expectedAAAA.length ? aaaaResult.data.some((r) => expectedAAAA.includes(r)) : null;

  const ssl = await checkTls(customDomain);

  const errors = [txtResult.error, aResult.error, aaaaResult.error, cnameResult.error, ssl.status === "error" ? ssl.error : null]
    .filter(Boolean)
    .join(" | ");

  if (errors) {
    await prisma.pageDomain.updateMany({
      where: { page_id: pageId, domain: customDomain },
      data: { last_checked_at: new Date(), last_error: errors },
    });
  } else {
    await prisma.pageDomain.updateMany({
      where: { page_id: pageId, domain: customDomain },
      data: { last_checked_at: new Date(), last_error: null },
    });
  }

  await logAppAudit({
    pageId,
    action: "hosting_status_check",
    targetType: "hosting",
    targetId: customDomain,
    meta: { errors: errors || null },
    actor: { userId: user!.id, anonId: anonUserId! },
  });

  return NextResponse.json({
    ok: true,
    domain: customDomain,
    dns: {
      verification: recordName
        ? { name: recordName, matched: txtMatched, records: txtRecords, error: txtResult.error }
        : { name: null, matched: null, records: [], error: null },
      a: { records: aResult.data, matched: aMatched, error: aResult.error },
      aaaa: { records: aaaaResult.data, matched: aaaaMatched, error: aaaaResult.error },
      cname: { records: cnameResult.data, matched: cnameMatched, error: cnameResult.error },
      expected: {
        cname: expectedCname,
        a: expectedA,
        aaaa: expectedAAAA,
      },
    },
    ssl,
  });
}
