import { copyFile, mkdir, readFile, rename, unlink, writeFile } from "fs/promises";
import path from "path";

export type StorageBackend = "local" | "s3" | "vercel_blob";
export type StorageScope = "public" | "private";

export type UploadResult = {
  url: string;
  key: string;
  backend: StorageBackend;
  size: number;
};

export type StorageObjectResult = {
  url: string;
  key: string;
  backend: StorageBackend;
  size: number;
  scope: StorageScope;
  contentType?: string | null;
};

export type StorageObjectReadResult = {
  buffer: Buffer;
  backend: StorageBackend;
  key: string;
  scope: StorageScope;
  size: number;
  contentType?: string | null;
};

type StorageAdapter = {
  put(params: {
    key: string;
    buffer: Buffer;
    scope: StorageScope;
    contentType?: string | null;
  }): Promise<StorageObjectResult>;
  moveFromPath(params: {
    key: string;
    sourcePath: string;
    scope: StorageScope;
    contentType?: string | null;
  }): Promise<StorageObjectResult>;
  read(params: {
    key: string;
    scope: StorageScope;
    contentType?: string | null;
  }): Promise<StorageObjectReadResult>;
  delete(params: { key: string; scope: StorageScope }): Promise<void>;
  publicUrl(params: { key: string; scope: StorageScope }): string;
};

const PUBLIC_ROOT = path.join(process.cwd(), "public", "uploads");
const PRIVATE_ROOT = path.join(process.cwd(), ".null_storage", "uploads");
const storageAdapters = new Map<StorageBackend, StorageAdapter>();

function resolveBackend(): StorageBackend {
  const raw = (process.env.STORAGE_BACKEND ?? "local").toLowerCase();
  if (raw === "s3") return "s3";
  if (raw === "vercel_blob" || raw === "vercel" || raw === "blob") return "vercel_blob";
  return "local";
}

function makeFileId() {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeKey(key: string) {
  return key
    .split(/[\\/]+/)
    .map((segment) => segment.trim())
    .filter(Boolean)
    .join("/");
}

function resolveRoot(scope: StorageScope) {
  return scope === "public" ? PUBLIC_ROOT : PRIVATE_ROOT;
}

function resolveLocalPath(key: string, scope: StorageScope) {
  return path.join(resolveRoot(scope), ...normalizeKey(key).split("/"));
}

function buildLocalPublicUrl(key: string, scope: StorageScope) {
  const normalizedKey = normalizeKey(key);
  const cdnBase = (process.env.ASSET_CDN_BASE_URL ?? "").trim().replace(/\/+$/, "");
  if (scope === "public") {
    return cdnBase ? `${cdnBase}/${normalizedKey}` : `/uploads/${normalizedKey}`;
  }
  return `/api/storage/private/${normalizedKey}`;
}

const localStorageAdapter: StorageAdapter = {
  async put(params) {
    const normalizedKey = normalizeKey(params.key);
    const filepath = resolveLocalPath(normalizedKey, params.scope);
    await mkdir(path.dirname(filepath), { recursive: true });
    await writeFile(filepath, params.buffer);
    return {
      url: buildLocalPublicUrl(normalizedKey, params.scope),
      key: normalizedKey,
      backend: "local",
      size: params.buffer.length,
      scope: params.scope,
      contentType: params.contentType ?? null,
    };
  },
  async moveFromPath(params) {
    const normalizedKey = normalizeKey(params.key);
    const filepath = resolveLocalPath(normalizedKey, params.scope);
    await mkdir(path.dirname(filepath), { recursive: true });
    try {
      await rename(params.sourcePath, filepath);
    } catch {
      await copyFile(params.sourcePath, filepath);
    }
    const buffer = await readFile(filepath);
    return {
      url: buildLocalPublicUrl(normalizedKey, params.scope),
      key: normalizedKey,
      backend: "local",
      size: buffer.length,
      scope: params.scope,
      contentType: params.contentType ?? null,
    };
  },
  async read(params) {
    const normalizedKey = normalizeKey(params.key);
    const filepath = resolveLocalPath(normalizedKey, params.scope);
    const buffer = await readFile(filepath);
    return {
      buffer,
      backend: "local",
      key: normalizedKey,
      scope: params.scope,
      size: buffer.length,
      contentType: params.contentType ?? null,
    };
  },
  async delete(params) {
    const filepath = resolveLocalPath(params.key, params.scope);
    await unlink(filepath);
  },
  publicUrl(params) {
    return buildLocalPublicUrl(params.key, params.scope);
  },
};

storageAdapters.set("local", localStorageAdapter);

export function registerStorageAdapter(backend: StorageBackend, adapter: StorageAdapter) {
  storageAdapters.set(backend, adapter);
}

function requireAdapter(backend: StorageBackend) {
  const adapter = storageAdapters.get(backend);
  if (!adapter) {
    throw new Error(`storage_backend_not_supported:${backend}`);
  }
  return adapter;
}

export async function putStorageObject(params: {
  key: string;
  buffer: Buffer;
  scope?: StorageScope;
  contentType?: string | null;
}): Promise<StorageObjectResult> {
  const backend = resolveBackend();
  return requireAdapter(backend).put({
    key: normalizeKey(params.key),
    buffer: params.buffer,
    scope: params.scope ?? "public",
    contentType: params.contentType ?? null,
  });
}

export async function moveStorageObjectFromPath(params: {
  key: string;
  sourcePath: string;
  scope?: StorageScope;
  contentType?: string | null;
}) {
  const backend = resolveBackend();
  return requireAdapter(backend).moveFromPath({
    key: normalizeKey(params.key),
    sourcePath: params.sourcePath,
    scope: params.scope ?? "public",
    contentType: params.contentType ?? null,
  });
}

export async function readStorageObject(params: {
  key: string;
  scope?: StorageScope;
  contentType?: string | null;
}) {
  const backend = resolveBackend();
  return requireAdapter(backend).read({
    key: normalizeKey(params.key),
    scope: params.scope ?? "public",
    contentType: params.contentType ?? null,
  });
}

export function resolveStoragePublicUrl(key: string, scope: StorageScope = "public") {
  const backend = resolveBackend();
  return requireAdapter(backend).publicUrl({ key: normalizeKey(key), scope });
}

export async function deleteStorageObject(key: string, scope: StorageScope = "public") {
  const backend = resolveBackend();
  return requireAdapter(backend).delete({ key: normalizeKey(key), scope });
}

export async function saveUpload(pageId: string, file: File): Promise<UploadResult> {
  const ext = path.extname(file.name) || "";
  const id = makeFileId();
  const filename = `${id}${ext}`;
  const key = `${pageId}/${filename}`;
  const buf = Buffer.from(await file.arrayBuffer());
  const result = await putStorageObject({
    key,
    buffer: buf,
    scope: "public",
    contentType: file.type || null,
  });

  return { url: result.url, key: result.key, backend: result.backend, size: result.size };
}

export async function deleteUpload(pageId: string, key: string) {
  const normalizedKey = normalizeKey(key);
  const resolvedKey = normalizedKey.startsWith(`${pageId}/`) ? normalizedKey : `${pageId}/${normalizedKey.split("/").pop() ?? normalizedKey}`;
  await deleteStorageObject(resolvedKey, "public");
}
