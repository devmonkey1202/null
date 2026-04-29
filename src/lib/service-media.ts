import { Prisma } from "@prisma/client";
import { appendFile, mkdir, rm, stat } from "fs/promises";
import path from "path";
import sharp from "sharp";
import { createHash, createHmac, randomUUID, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/db";
import { enqueueJob } from "@/lib/background-jobs";
import { logAppAudit, type AppAuditActor } from "@/lib/app-audit";
import { registerBackgroundJobHandler } from "@/lib/service-runtime";
import {
  deleteStorageObject,
  moveStorageObjectFromPath,
  putStorageObject,
  readStorageObject,
  type StorageScope,
} from "@/lib/storage";

export type ServiceMediaKind = "image" | "video" | "audio" | "file";
export type ServiceMediaVisibility = "public" | "signed";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
type PersistedServiceMediaAsset = {
  id: string;
  page_id: string;
  key: string;
  original_name: string;
  kind: string;
  mime_type: string;
  backend: string;
  storage_scope: string;
  storage_key: string;
  public_url: string | null;
  visibility: string;
  status: string;
  size_bytes: number;
  checksum_sha256: string | null;
  width: number | null;
  height: number | null;
  duration_ms: number | null;
  placeholder_data_url: string | null;
  metadata: Prisma.JsonValue | null;
  processed_at: Date | null;
  last_error: string | null;
  created_at: Date;
  updated_at: Date;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
type PersistedServiceMediaVariant = {
  id: string;
  page_id: string;
  asset_id: string;
  key: string;
  name: string;
  mime_type: string;
  backend: string;
  storage_scope: string;
  storage_key: string;
  public_url: string | null;
  size_bytes: number;
  width: number | null;
  height: number | null;
  metadata: Prisma.JsonValue | null;
  created_at: Date;
  updated_at: Date;
};

const MAX_CHUNK_SIZE = 8 * 1024 * 1024;
const DEFAULT_CHUNK_SIZE = 2 * 1024 * 1024;
const DEFAULT_UPLOAD_SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const TEMP_UPLOAD_ROOT = path.join(process.cwd(), ".null_storage", "media-sessions");

function normalizeVisibility(value: unknown): ServiceMediaVisibility {
  return value === "signed" ? "signed" : "public";
}

function normalizeMediaKind(mimeType: string, fileName: string): ServiceMediaKind {
  const lowerMime = mimeType.toLowerCase();
  const lowerName = fileName.toLowerCase();
  if (lowerMime.startsWith("image/") || /\.(png|jpe?g|gif|webp|avif|svg)$/i.test(lowerName)) return "image";
  if (lowerMime.startsWith("video/") || /\.(mp4|webm|mov|avi|m4v)$/i.test(lowerName)) return "video";
  if (lowerMime.startsWith("audio/") || /\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(lowerName)) return "audio";
  return "file";
}

function normalizeMimeType(fileName: string, mimeType?: string | null) {
  const raw = (mimeType ?? "").trim().toLowerCase();
  if (raw) return raw;
  const ext = path.extname(fileName).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".gif") return "image/gif";
  if (ext === ".webp") return "image/webp";
  if (ext === ".avif") return "image/avif";
  if (ext === ".svg") return "image/svg+xml";
  if (ext === ".mp4") return "video/mp4";
  if (ext === ".webm") return "video/webm";
  if (ext === ".mp3") return "audio/mpeg";
  if (ext === ".wav") return "audio/wav";
  return "application/octet-stream";
}

function extensionForMimeType(mimeType: string, originalName: string) {
  const existing = path.extname(originalName || "").trim();
  if (existing) return existing.toLowerCase();
  if (mimeType === "image/png") return ".png";
  if (mimeType === "image/jpeg") return ".jpg";
  if (mimeType === "image/gif") return ".gif";
  if (mimeType === "image/webp") return ".webp";
  if (mimeType === "image/avif") return ".avif";
  if (mimeType === "image/svg+xml") return ".svg";
  if (mimeType === "video/mp4") return ".mp4";
  if (mimeType === "video/webm") return ".webm";
  if (mimeType === "audio/mpeg") return ".mp3";
  if (mimeType === "audio/wav") return ".wav";
  return "";
}

function makeMediaKey(prefix: string) {
  return `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
}

function buildAssetStorageKey(pageId: string, assetKey: string, variantName: string, ext: string) {
  const safeExt = ext.startsWith(".") ? ext : ext ? `.${ext}` : "";
  return `${pageId}/media/${assetKey}/${variantName}${safeExt}`;
}

function computeChecksum(buffer: Buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function mediaAccessSecret() {
  return (
    process.env.MEDIA_URL_SECRET?.trim() ||
    process.env.AUTH_SECRET?.trim() ||
    process.env.NEXTAUTH_SECRET?.trim() ||
    "null-media-dev-secret"
  );
}

function toJsonObject(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function tempSessionPath(tempStorageKey: string) {
  return path.join(TEMP_UPLOAD_ROOT, ...tempStorageKey.split("/"));
}

async function ensureTempSessionDir(tempStorageKey: string) {
  await mkdir(path.dirname(tempSessionPath(tempStorageKey)), { recursive: true });
}

async function buildImagePlaceholder(buffer: Buffer) {
  const preview = await sharp(buffer)
    .rotate()
    .resize({ width: 24, height: 24, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 36 })
    .toBuffer();
  return `data:image/webp;base64,${preview.toString("base64")}`;
}

async function inspectMediaBuffer(buffer: Buffer, mimeType: string, originalName: string) {
  const kind = normalizeMediaKind(mimeType, originalName);
  const metadata: Record<string, unknown> = {
    mimeType,
    originalName,
    sizeBytes: buffer.length,
  };
  if (kind !== "image") {
    return {
      kind,
      width: null,
      height: null,
      durationMs: null,
      metadata,
      placeholderDataUrl: null,
    };
  }

  const image = sharp(buffer, { animated: true });
  const info = await image.metadata();
  metadata.format = info.format ?? null;
  metadata.space = info.space ?? null;
  metadata.channels = info.channels ?? null;
  metadata.density = info.density ?? null;
  metadata.hasAlpha = info.hasAlpha ?? null;
  metadata.pages = info.pages ?? null;

  return {
    kind,
    width: info.width ?? null,
    height: info.height ?? null,
    durationMs: null,
    metadata,
    placeholderDataUrl: await buildImagePlaceholder(buffer),
  };
}

async function createImageVariants(input: {
  pageId: string;
  assetKey: string;
  originalBuffer: Buffer;
}) {
  const previewBuffer = await sharp(input.originalBuffer)
    .rotate()
    .resize({ width: 1440, height: 1440, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 84 })
    .toBuffer();
  const thumbBuffer = await sharp(input.originalBuffer)
    .rotate()
    .resize({ width: 320, height: 320, fit: "cover", position: "centre" })
    .webp({ quality: 76 })
    .toBuffer();

  const [previewMeta, thumbMeta] = await Promise.all([sharp(previewBuffer).metadata(), sharp(thumbBuffer).metadata()]);

  const previewStorage = await putStorageObject({
    key: buildAssetStorageKey(input.pageId, input.assetKey, "preview", ".webp"),
    buffer: previewBuffer,
    scope: "private",
    contentType: "image/webp",
  });
  const thumbStorage = await putStorageObject({
    key: buildAssetStorageKey(input.pageId, input.assetKey, "thumb", ".webp"),
    buffer: thumbBuffer,
    scope: "private",
    contentType: "image/webp",
  });

  return [
    {
      name: "preview",
      mimeType: "image/webp",
      storage: previewStorage,
      width: previewMeta.width ?? null,
      height: previewMeta.height ?? null,
      metadata: { generated: true, quality: 84 },
    },
    {
      name: "thumb",
      mimeType: "image/webp",
      storage: thumbStorage,
      width: thumbMeta.width ?? null,
      height: thumbMeta.height ?? null,
      metadata: { generated: true, quality: 76 },
    },
  ];
}

async function loadAssetWithVariants(assetId: string) {
  return prisma.serviceMediaAsset.findUnique({
    where: { id: assetId },
    include: {
      variants: {
        orderBy: [{ name: "asc" }],
      },
    },
  });
}

function buildMediaAccessPath(pageId: string, assetId: string, variant = "original") {
  const params = new URLSearchParams({ variant });
  return `/api/app/${pageId}/media/${assetId}/access?${params.toString()}`;
}

export function issueServiceMediaAccessSignature(input: {
  pageId: string;
  assetId: string;
  variant?: string;
  expiresAt: number;
}) {
  const variant = input.variant?.trim() || "original";
  const payload = `${input.pageId}.${input.assetId}.${variant}.${input.expiresAt}`;
  return createHmac("sha256", mediaAccessSecret()).update(payload).digest("hex");
}

function verifyServiceMediaAccessSignature(input: {
  pageId: string;
  assetId: string;
  variant?: string;
  expiresAt: number;
  token: string;
}) {
  const expected = issueServiceMediaAccessSignature(input);
  if (expected.length !== input.token.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(input.token));
}

export async function createServiceMediaAssetFromBuffer(input: {
  pageId: string;
  fileName: string;
  mimeType?: string | null;
  buffer: Buffer;
  visibility?: ServiceMediaVisibility;
  actor?: AppAuditActor;
}) {
  const mimeType = normalizeMimeType(input.fileName, input.mimeType);
  const kind = normalizeMediaKind(mimeType, input.fileName);
  const assetKey = makeMediaKey("media");
  const ext = extensionForMimeType(mimeType, input.fileName);
  const original = await putStorageObject({
    key: buildAssetStorageKey(input.pageId, assetKey, "original", ext),
    buffer: input.buffer,
    scope: "private",
    contentType: mimeType,
  });

  const asset = await prisma.serviceMediaAsset.create({
    data: {
      page_id: input.pageId,
      key: assetKey,
      original_name: path.basename(input.fileName || "upload"),
      kind,
      mime_type: mimeType,
      backend: original.backend,
      storage_scope: original.scope,
      storage_key: original.key,
      public_url: null,
      visibility: normalizeVisibility(input.visibility),
      status: "processing",
      size_bytes: original.size,
      checksum_sha256: computeChecksum(input.buffer),
      metadata: {} as Prisma.InputJsonValue,
    },
  });

  await prisma.serviceMediaVariant.create({
    data: {
      page_id: input.pageId,
      asset_id: asset.id,
      key: `${assetKey}:original`,
      name: "original",
      mime_type: mimeType,
      backend: original.backend,
      storage_scope: original.scope,
      storage_key: original.key,
      public_url: null,
      size_bytes: original.size,
      metadata: { original: true } as Prisma.InputJsonValue,
    },
  });

  await enqueueJob({
    pageId: input.pageId,
    queue: "media",
    type: "service-media-process",
    payload: { assetId: asset.id },
    priority: 80,
    dedupeKey: `service-media-process:${asset.id}`,
    maxAttempts: 2,
  });

  await logAppAudit({
    pageId: input.pageId,
    action: "service_media_asset_create",
    targetType: "service_media_asset",
    targetId: asset.id,
    actor: input.actor,
    meta: {
      key: asset.key,
      kind,
      mimeType,
      sizeBytes: original.size,
      visibility: asset.visibility,
    },
  });

  return loadAssetWithVariants(asset.id);
}

export async function createServiceMediaAssetFromFile(input: {
  pageId: string;
  file: File;
  visibility?: ServiceMediaVisibility;
  actor?: AppAuditActor;
}) {
  const buffer = Buffer.from(await input.file.arrayBuffer());
  return createServiceMediaAssetFromBuffer({
    pageId: input.pageId,
    fileName: input.file.name,
    mimeType: input.file.type,
    buffer,
    visibility: input.visibility,
    actor: input.actor,
  });
}

async function createServiceMediaAssetFromStoredFile(input: {
  pageId: string;
  fileName: string;
  mimeType?: string | null;
  sourcePath: string;
  totalSize: number;
  visibility?: ServiceMediaVisibility;
  actor?: AppAuditActor;
}) {
  const mimeType = normalizeMimeType(input.fileName, input.mimeType);
  const kind = normalizeMediaKind(mimeType, input.fileName);
  const assetKey = makeMediaKey("media");
  const ext = extensionForMimeType(mimeType, input.fileName);
  const original = await moveStorageObjectFromPath({
    key: buildAssetStorageKey(input.pageId, assetKey, "original", ext),
    sourcePath: input.sourcePath,
    scope: "private",
    contentType: mimeType,
  });
  const originalBuffer = await readStorageObject({
    key: original.key,
    scope: "private",
    contentType: mimeType,
  });

  const asset = await prisma.serviceMediaAsset.create({
    data: {
      page_id: input.pageId,
      key: assetKey,
      original_name: path.basename(input.fileName || "upload"),
      kind,
      mime_type: mimeType,
      backend: original.backend,
      storage_scope: original.scope,
      storage_key: original.key,
      public_url: null,
      visibility: normalizeVisibility(input.visibility),
      status: "processing",
      size_bytes: input.totalSize,
      checksum_sha256: computeChecksum(originalBuffer.buffer),
      metadata: {} as Prisma.InputJsonValue,
    },
  });

  await prisma.serviceMediaVariant.create({
    data: {
      page_id: input.pageId,
      asset_id: asset.id,
      key: `${assetKey}:original`,
      name: "original",
      mime_type: mimeType,
      backend: original.backend,
      storage_scope: original.scope,
      storage_key: original.key,
      public_url: null,
      size_bytes: input.totalSize,
      metadata: { original: true } as Prisma.InputJsonValue,
    },
  });

  await enqueueJob({
    pageId: input.pageId,
    queue: "media",
    type: "service-media-process",
    payload: { assetId: asset.id },
    priority: 80,
    dedupeKey: `service-media-process:${asset.id}`,
    maxAttempts: 2,
  });

  await logAppAudit({
    pageId: input.pageId,
    action: "service_media_asset_create_from_session",
    targetType: "service_media_asset",
    targetId: asset.id,
    actor: input.actor,
    meta: {
      key: asset.key,
      kind,
      mimeType,
      sizeBytes: input.totalSize,
      visibility: asset.visibility,
    },
  });

  return loadAssetWithVariants(asset.id);
}

export async function processServiceMediaAsset(input: { assetId: string; actor?: AppAuditActor }) {
  const asset = await loadAssetWithVariants(input.assetId);
  if (!asset) return { ok: false, error: "service_media_asset_not_found" };

  try {
    const original = await readStorageObject({
      key: asset.storage_key,
      scope: asset.storage_scope as StorageScope,
      contentType: asset.mime_type,
    });
    const inspected = await inspectMediaBuffer(original.buffer, asset.mime_type, asset.original_name);

    const staleVariants = asset.variants.filter((variant) => variant.name !== "original");
    for (const variant of staleVariants) {
      await deleteStorageObject(variant.storage_key, variant.storage_scope as StorageScope).catch(() => null);
    }
    if (staleVariants.length) {
      await prisma.serviceMediaVariant.deleteMany({
        where: { asset_id: asset.id, name: { not: "original" } },
      });
    }

    if (inspected.kind === "image") {
      const variants = await createImageVariants({
        pageId: asset.page_id,
        assetKey: asset.key,
        originalBuffer: original.buffer,
      });
      if (variants.length) {
        await prisma.serviceMediaVariant.createMany({
          data: variants.map((variant) => ({
            page_id: asset.page_id,
            asset_id: asset.id,
            key: `${asset.key}:${variant.name}`,
            name: variant.name,
            mime_type: variant.mimeType,
            backend: variant.storage.backend,
            storage_scope: variant.storage.scope,
            storage_key: variant.storage.key,
            public_url: null,
            size_bytes: variant.storage.size,
            width: variant.width,
            height: variant.height,
            metadata: variant.metadata as Prisma.InputJsonValue,
          })),
          skipDuplicates: true,
        });
      }
    }

    const updated = await prisma.serviceMediaAsset.update({
      where: { id: asset.id },
      data: {
        kind: inspected.kind,
        width: inspected.width,
        height: inspected.height,
        duration_ms: inspected.durationMs,
        placeholder_data_url: inspected.placeholderDataUrl,
        metadata: inspected.metadata as Prisma.InputJsonValue,
        status: "ready",
        processed_at: new Date(),
        last_error: null,
      },
    });

    await logAppAudit({
      pageId: asset.page_id,
      action: "service_media_asset_process",
      targetType: "service_media_asset",
      targetId: asset.id,
      actor: input.actor,
      meta: {
        key: asset.key,
        kind: updated.kind,
        width: updated.width,
        height: updated.height,
      },
    });

    return { ok: true, assetId: asset.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.serviceMediaAsset.update({
      where: { id: asset.id },
      data: {
        status: "failed",
        last_error: message.slice(0, 1000),
      },
    });
    return { ok: false, error: message };
  }
}

export async function scheduleServiceMediaProcessing(input: {
  pageId: string;
  assetId: string;
}) {
  await enqueueJob({
    pageId: input.pageId,
    queue: "media",
    type: "service-media-process",
    payload: { assetId: input.assetId },
    priority: 80,
    dedupeKey: `service-media-process:${input.assetId}`,
    maxAttempts: 2,
  });
}

export async function listServiceMediaAssets(input: {
  pageId: string;
  kind?: ServiceMediaKind | null;
  status?: string | null;
  limit?: number;
  offset?: number;
}) {
  const limit = Number.isFinite(input.limit) ? Math.min(Math.max(Number(input.limit), 1), 100) : 20;
  const offset = Number.isFinite(input.offset) ? Math.max(Number(input.offset), 0) : 0;
  const where = {
    page_id: input.pageId,
    ...(input.kind ? { kind: input.kind } : {}),
    ...(input.status ? { status: input.status } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.serviceMediaAsset.findMany({
      where,
      include: { variants: { orderBy: [{ name: "asc" }] } },
      orderBy: [{ created_at: "desc" }],
      take: limit,
      skip: offset,
    }),
    prisma.serviceMediaAsset.count({ where }),
  ]);

  return {
    total,
    limit,
    offset,
    items: items.map((asset) => ({
      id: asset.id,
      key: asset.key,
      originalName: asset.original_name,
      kind: asset.kind,
      mimeType: asset.mime_type,
      visibility: asset.visibility,
      status: asset.status,
      sizeBytes: asset.size_bytes,
      width: asset.width,
      height: asset.height,
      durationMs: asset.duration_ms,
      placeholderDataUrl: asset.placeholder_data_url,
      metadata: toJsonObject(asset.metadata),
      createdAt: asset.created_at.toISOString(),
      updatedAt: asset.updated_at.toISOString(),
      accessUrl: buildMediaAccessPath(asset.page_id, asset.id),
      variants: asset.variants.map((variant) => ({
        id: variant.id,
        name: variant.name,
        mimeType: variant.mime_type,
        sizeBytes: variant.size_bytes,
        width: variant.width,
        height: variant.height,
        accessUrl: buildMediaAccessPath(asset.page_id, asset.id, variant.name),
      })),
    })),
  };
}

export async function getServiceMediaAsset(pageId: string, assetId: string) {
  const asset = await loadAssetWithVariants(assetId);
  if (!asset || asset.page_id !== pageId) return null;
  return asset;
}

export async function updateServiceMediaAssetVisibility(input: {
  pageId: string;
  assetId: string;
  visibility: ServiceMediaVisibility;
  actor?: AppAuditActor;
}) {
  const asset = await prisma.serviceMediaAsset.findUnique({ where: { id: input.assetId } });
  if (!asset || asset.page_id !== input.pageId) return null;
  const updated = await prisma.serviceMediaAsset.update({
    where: { id: asset.id },
    data: { visibility: normalizeVisibility(input.visibility) },
  });
  await logAppAudit({
    pageId: input.pageId,
    action: "service_media_asset_visibility_update",
    targetType: "service_media_asset",
    targetId: asset.id,
    actor: input.actor,
    meta: { visibility: updated.visibility },
  });
  return updated;
}

export async function deleteServiceMediaAsset(input: {
  pageId: string;
  assetId: string;
  actor?: AppAuditActor;
}) {
  const asset = await loadAssetWithVariants(input.assetId);
  if (!asset || asset.page_id !== input.pageId) return { ok: false, error: "service_media_asset_not_found" };
  for (const variant of asset.variants) {
    await deleteStorageObject(variant.storage_key, variant.storage_scope as StorageScope).catch(() => null);
  }
  await deleteStorageObject(asset.storage_key, asset.storage_scope as StorageScope).catch(() => null);
  await prisma.serviceMediaAsset.delete({ where: { id: asset.id } });
  await logAppAudit({
    pageId: input.pageId,
    action: "service_media_asset_delete",
    targetType: "service_media_asset",
    targetId: asset.id,
    actor: input.actor,
    meta: { key: asset.key },
  });
  return { ok: true };
}

export async function issueServiceMediaAccessUrl(input: {
  pageId: string;
  assetId: string;
  variant?: string;
  expiresInSec?: number;
}) {
  const asset = await loadAssetWithVariants(input.assetId);
  if (!asset || asset.page_id !== input.pageId) return null;
  const variant = input.variant?.trim() || "original";
  const base = buildMediaAccessPath(input.pageId, input.assetId, variant);
  if (asset.visibility === "public") {
    return {
      url: base,
      expiresAt: null,
      token: null,
    };
  }
  const expiresAt = Date.now() + Math.min(Math.max((input.expiresInSec ?? 3600) * 1000, 30_000), 7 * 24 * 60 * 60 * 1000);
  const token = issueServiceMediaAccessSignature({
    pageId: input.pageId,
    assetId: input.assetId,
    variant,
    expiresAt,
  });
  const params = new URLSearchParams({
    variant,
    expires: String(expiresAt),
    token,
  });
  return {
    url: `/api/app/${input.pageId}/media/${input.assetId}/access?${params.toString()}`,
    expiresAt,
    token,
  };
}

export async function resolveServiceMediaAccess(input: {
  pageId: string;
  assetId: string;
  variant?: string;
  token?: string | null;
  expires?: number | null;
}) {
  const asset = await loadAssetWithVariants(input.assetId);
  if (!asset || asset.page_id !== input.pageId) return { ok: false as const, error: "service_media_asset_not_found" };
  const variantName = input.variant?.trim() || "original";
  const targetVariant =
    variantName === "original"
      ? {
          mime_type: asset.mime_type,
          storage_key: asset.storage_key,
          storage_scope: asset.storage_scope,
          size_bytes: asset.size_bytes,
        }
      : asset.variants.find((variant) => variant.name === variantName);
  if (!targetVariant) return { ok: false as const, error: "service_media_variant_not_found" };

  if (asset.visibility !== "public") {
    if (!input.token || !Number.isFinite(input.expires)) {
      return { ok: false as const, error: "service_media_signature_required" };
    }
    const expiresAt = Number(input.expires);
    if (Date.now() > expiresAt) return { ok: false as const, error: "service_media_signature_expired" };
    const verified = verifyServiceMediaAccessSignature({
      pageId: input.pageId,
      assetId: input.assetId,
      variant: variantName,
      expiresAt,
      token: input.token,
    });
    if (!verified) return { ok: false as const, error: "service_media_signature_invalid" };
  }

  const read = await readStorageObject({
    key: targetVariant.storage_key,
    scope: targetVariant.storage_scope as StorageScope,
    contentType: targetVariant.mime_type,
  });
  return {
    ok: true as const,
    asset,
    variantName,
    mimeType: targetVariant.mime_type,
    buffer: read.buffer,
    size: read.size,
  };
}

export async function createServiceMediaUploadSession(input: {
  pageId: string;
  fileName: string;
  mimeType?: string | null;
  totalSize: number;
  chunkSize?: number;
  visibility?: ServiceMediaVisibility;
  actor?: AppAuditActor;
}) {
  const key = makeMediaKey("upload");
  const tempStorageKey = `${input.pageId}/${key}.part`;
  const session = await prisma.serviceMediaUploadSession.create({
    data: {
      page_id: input.pageId,
      key,
      file_name: path.basename(input.fileName || "upload"),
      mime_type: normalizeMimeType(input.fileName, input.mimeType),
      total_size: Math.max(1, Math.floor(input.totalSize)),
      chunk_size: Math.min(MAX_CHUNK_SIZE, Math.max(64 * 1024, Math.floor(input.chunkSize ?? DEFAULT_CHUNK_SIZE))),
      temp_storage_key: tempStorageKey,
      visibility: normalizeVisibility(input.visibility),
      expires_at: new Date(Date.now() + DEFAULT_UPLOAD_SESSION_TTL_MS),
    },
  });
  await ensureTempSessionDir(tempStorageKey);
  await logAppAudit({
    pageId: input.pageId,
    action: "service_media_upload_session_create",
    targetType: "service_media_upload_session",
    targetId: session.id,
    actor: input.actor,
    meta: {
      key: session.key,
      totalSize: session.total_size,
      chunkSize: session.chunk_size,
    },
  });
  return session;
}

export async function appendServiceMediaUploadChunk(input: {
  pageId: string;
  sessionId: string;
  offset: number;
  chunk: Buffer;
}) {
  const session = await prisma.serviceMediaUploadSession.findUnique({ where: { id: input.sessionId } });
  if (!session || session.page_id !== input.pageId) return { ok: false as const, error: "service_media_upload_session_not_found" };
  if (session.status !== "open") return { ok: false as const, error: "service_media_upload_session_closed" };
  if (Date.now() > session.expires_at.getTime()) return { ok: false as const, error: "service_media_upload_session_expired" };
  if (input.chunk.length > session.chunk_size) return { ok: false as const, error: "service_media_upload_chunk_too_large" };
  if (input.offset !== session.received_size) return { ok: false as const, error: "service_media_upload_offset_mismatch" };
  const nextSize = session.received_size + input.chunk.length;
  if (nextSize > session.total_size) return { ok: false as const, error: "service_media_upload_size_exceeded" };

  await ensureTempSessionDir(session.temp_storage_key);
  await appendFile(tempSessionPath(session.temp_storage_key), input.chunk);
  const updated = await prisma.serviceMediaUploadSession.update({
    where: { id: session.id },
    data: { received_size: nextSize },
  });
  return { ok: true as const, receivedSize: updated.received_size, totalSize: updated.total_size };
}

export async function completeServiceMediaUploadSession(input: {
  pageId: string;
  sessionId: string;
  actor?: AppAuditActor;
}) {
  const session = await prisma.serviceMediaUploadSession.findUnique({ where: { id: input.sessionId } });
  if (!session || session.page_id !== input.pageId) return { ok: false as const, error: "service_media_upload_session_not_found" };
  if (session.status !== "open") return { ok: false as const, error: "service_media_upload_session_closed" };
  if (session.received_size !== session.total_size) return { ok: false as const, error: "service_media_upload_incomplete" };
  const filepath = tempSessionPath(session.temp_storage_key);
  const fileInfo = await stat(filepath).catch(() => null);
  if (!fileInfo || fileInfo.size !== session.total_size) {
    return { ok: false as const, error: "service_media_upload_file_missing" };
  }
  const asset = await createServiceMediaAssetFromStoredFile({
    pageId: input.pageId,
    fileName: session.file_name,
    mimeType: session.mime_type,
    sourcePath: filepath,
    totalSize: session.total_size,
    visibility: session.visibility as ServiceMediaVisibility,
    actor: input.actor,
  });
  await prisma.serviceMediaUploadSession.update({
    where: { id: session.id },
    data: {
      status: "completed",
      completed_asset_id: asset?.id ?? null,
    },
  });
  await rm(filepath, { force: true }).catch(() => null);
  return { ok: true as const, asset };
}

registerBackgroundJobHandler("service-media-process", async (job) => {
  const payload = toJsonObject(job.payload);
  const assetId = typeof payload.assetId === "string" ? payload.assetId : "";
  if (!assetId) {
    return {
      ok: false,
      kind: "background_job",
      error: "service_media_process_missing_asset",
      errorCode: "service_media_process_missing_asset",
      logs: [],
    };
  }
  const result = await processServiceMediaAsset({ assetId });
  if (!result.ok) {
    return {
      ok: false,
      kind: "background_job",
      error: result.error,
      errorCode: result.error,
      logs: [],
    };
  }
  return {
    ok: true,
    kind: "background_job",
    data: result,
    logs: [`service_media_process:${assetId}`],
  };
});
