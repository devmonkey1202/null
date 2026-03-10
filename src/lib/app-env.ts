import { createHash } from "crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export type AppEnv = "dev" | "prod";

export const DEV_SUFFIX = "__dev";
const ENV_KEY = "app_env";
const PROD_VERSION_KEY = "prod_version";

const DEV_SUFFIX_RE = new RegExp(`${DEV_SUFFIX}$`);

export function isDevSlug(slug: string) {
  return slug.endsWith(DEV_SUFFIX);
}

export function toEnvSlug(slug: string, env: AppEnv) {
  if (env === "prod") return slug;
  if (slug.endsWith(DEV_SUFFIX)) return slug;
  return `${slug}${DEV_SUFFIX}`;
}

export function stripDevSuffix(slug: string) {
  return slug.endsWith(DEV_SUFFIX) ? slug.replace(DEV_SUFFIX_RE, "") : slug;
}

export function normalizeEnv(value?: string | null): AppEnv | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "prod" || normalized === "production") return "prod";
  if (normalized === "dev" || normalized === "development") return "dev";
  return null;
}

export function readEnvFromRequest(req: Request) {
  const url = new URL(req.url);
  return url.searchParams.get("env") ?? req.headers.get("x-null-env");
}

export async function ensureDevCollections(pageId: string, tx: Prisma.TransactionClient = prisma) {
  const collections = await tx.appCollection.findMany({ where: { page_id: pageId } });
  const existing = new Set(collections.map((c) => c.slug));
  const create: Array<{
    page_id: string;
    slug: string;
    name: string;
    strict: boolean;
    fields: object;
  }> = [];
  collections.forEach((c) => {
    if (isDevSlug(c.slug)) return;
    const devSlug = toEnvSlug(c.slug, "dev");
    if (existing.has(devSlug)) return;
    create.push({
      page_id: pageId,
      slug: devSlug,
      name: c.name ?? c.slug,
      strict: Boolean(c.strict),
      fields: (c.fields ?? []) as object,
    });
  });
  if (create.length) {
    await tx.appCollection.createMany({ data: create, skipDuplicates: true });
  }
}

export async function resolveAppEnvSetting(pageId: string) {
  const row = await prisma.pageSetting.findUnique({
    where: { page_id_key: { page_id: pageId, key: ENV_KEY } },
    select: { value: true },
  });
  const env = row?.value && typeof row.value === "object" ? (row.value as { mode?: string }).mode : undefined;
  return env === "prod" ? "prod" : "dev";
}

export async function resolveAppEnv(
  pageId: string,
  options: { isOwner: boolean; allowCollab?: boolean; requestEnv?: string | null }
) {
  const allowEditor = options.isOwner || Boolean(options.allowCollab);
  if (!allowEditor) return "prod";
  const requested = normalizeEnv(options.requestEnv);
  if (requested) return requested;
  return resolveAppEnvSetting(pageId);
}

export async function setEnvironment(pageId: string, mode: AppEnv) {
  await prisma.pageSetting.upsert({
    where: { page_id_key: { page_id: pageId, key: ENV_KEY } },
    update: { value: { mode } as unknown as object },
    create: { page_id: pageId, key: ENV_KEY, value: { mode } as unknown as object },
  });
}

export type ProdVersionMeta = {
  versionId: string;
  deployedAt?: string | null;
  deployHash?: string | null;
};

export async function getProdVersionMeta(pageId: string, tx: Prisma.TransactionClient = prisma): Promise<ProdVersionMeta | null> {
  const row = await tx.pageSetting.findUnique({
    where: { page_id_key: { page_id: pageId, key: PROD_VERSION_KEY } },
    select: { value: true },
  });
  const value = row?.value;
  if (!value || typeof value !== "object") return null;
  const meta = value as { versionId?: string; deployedAt?: string | null; deployHash?: string | null };
  if (!meta.versionId) return null;
  return { versionId: meta.versionId, deployedAt: meta.deployedAt ?? null, deployHash: meta.deployHash ?? null };
}

export async function setProdVersionMeta(
  pageId: string,
  meta: ProdVersionMeta,
  tx: Prisma.TransactionClient = prisma
) {
  await tx.pageSetting.upsert({
    where: { page_id_key: { page_id: pageId, key: PROD_VERSION_KEY } },
    update: { value: meta as unknown as object },
    create: { page_id: pageId, key: PROD_VERSION_KEY, value: meta as unknown as object },
  });
}

export async function mapCollectionSlug(pageId: string, slug: string, env: AppEnv) {
  if (env === "prod") return slug;
  const devSlug = toEnvSlug(slug, "dev");
  const exists = await prisma.appCollection.findFirst({ where: { page_id: pageId, slug: devSlug } });
  return exists ? devSlug : slug;
}

export async function cloneDevToProd(pageId: string, tx: Prisma.TransactionClient = prisma) {
  await ensureDevCollections(pageId, tx);
  const collections = await tx.appCollection.findMany({ where: { page_id: pageId } });
  const devCollections = collections.filter((c) => isDevSlug(c.slug));
  const prodCollections = collections.filter((c) => !isDevSlug(c.slug));
  const prodByBase = new Map(prodCollections.map((c) => [c.slug, c]));

  let copiedCollections = 0;
  let copiedRecords = 0;

  for (const dev of devCollections) {
    const baseSlug = stripDevSuffix(dev.slug);
    const prod = prodByBase.get(baseSlug);

    if (prod) {
      await tx.appCollection.update({
        where: { id: prod.id },
        data: {
          name: dev.name ?? baseSlug,
          strict: Boolean(dev.strict),
          fields: (dev.fields ?? []) as object,
          updated_at: new Date(),
        },
      });
    } else {
      await tx.appCollection.create({
        data: {
          page_id: pageId,
          slug: baseSlug,
          name: dev.name ?? baseSlug,
          strict: Boolean(dev.strict),
          fields: (dev.fields ?? []) as object,
        },
      });
    }
    copiedCollections += 1;

    await tx.appRecord.deleteMany({ where: { page_id: pageId, collection_slug: baseSlug } });
    const records = await tx.appRecord.findMany({ where: { page_id: pageId, collection_slug: dev.slug } });
    if (records.length) {
      await tx.appRecord.createMany({
        data: records.map((r) => ({
          page_id: pageId,
          collection_slug: baseSlug,
          data: r.data as object,
          app_user_id: r.app_user_id,
        })),
      });
      copiedRecords += records.length;
    }
  }

  return { collections: copiedCollections, records: copiedRecords };
}

export function computeDeployHash(content: unknown) {
  const text = JSON.stringify(content ?? null);
  return createHash("sha256").update(text).digest("hex");
}
