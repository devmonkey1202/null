import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFile, rm } from "fs/promises";
import path from "path";
import sharp from "sharp";

type AssetRow = {
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
  metadata: Record<string, unknown> | null;
  processed_at: Date | null;
  last_error: string | null;
  created_at: Date;
  updated_at: Date;
};

type VariantRow = {
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
  metadata: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
};

type UploadSessionRow = {
  id: string;
  page_id: string;
  key: string;
  file_name: string;
  mime_type: string;
  total_size: number;
  chunk_size: number;
  received_size: number;
  storage_scope: string;
  temp_storage_key: string;
  visibility: string;
  status: string;
  completed_asset_id: string | null;
  expires_at: Date;
  created_at: Date;
  updated_at: Date;
};

const state = vi.hoisted(() => ({
  seq: 0,
  assets: [] as AssetRow[],
  variants: [] as VariantRow[],
  sessions: [] as UploadSessionRow[],
  storage: new Map<string, Buffer>(),
}));

function nextId(prefix: string) {
  state.seq += 1;
  return `${prefix}_${state.seq}`;
}

function withVariants(asset: AssetRow | undefined | null) {
  if (!asset) return null;
  return {
    ...asset,
    variants: state.variants.filter((variant) => variant.asset_id === asset.id).sort((a, b) => a.name.localeCompare(b.name)),
  };
}

const prismaMock = vi.hoisted(() => ({
  serviceMediaAsset: {
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const row: AssetRow = {
        id: nextId("asset"),
        page_id: String(data.page_id),
        key: String(data.key),
        original_name: String(data.original_name),
        kind: String(data.kind),
        mime_type: String(data.mime_type),
        backend: String(data.backend),
        storage_scope: String(data.storage_scope),
        storage_key: String(data.storage_key),
        public_url: (data.public_url as string | null) ?? null,
        visibility: String(data.visibility),
        status: String(data.status),
        size_bytes: Number(data.size_bytes),
        checksum_sha256: (data.checksum_sha256 as string | null) ?? null,
        width: (data.width as number | null) ?? null,
        height: (data.height as number | null) ?? null,
        duration_ms: (data.duration_ms as number | null) ?? null,
        placeholder_data_url: (data.placeholder_data_url as string | null) ?? null,
        metadata: (data.metadata as Record<string, unknown> | null) ?? null,
        processed_at: (data.processed_at as Date | null) ?? null,
        last_error: (data.last_error as string | null) ?? null,
        created_at: new Date(),
        updated_at: new Date(),
      };
      state.assets.push(row);
      return row;
    }),
    findUnique: vi.fn(async ({ where }: { where: { id: string } }) => withVariants(state.assets.find((asset) => asset.id === where.id))),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const row = state.assets.find((asset) => asset.id === where.id);
      if (!row) throw new Error("asset_not_found");
      Object.assign(row, data, { updated_at: new Date() });
      return row;
    }),
    findMany: vi.fn(async ({ where }: { where?: Record<string, unknown> }) => {
      let rows = [...state.assets];
      if (where?.page_id) rows = rows.filter((row) => row.page_id === where.page_id);
      if (where?.kind) rows = rows.filter((row) => row.kind === where.kind);
      if (where?.status) rows = rows.filter((row) => row.status === where.status);
      return rows.map((row) => withVariants(row));
    }),
    count: vi.fn(async ({ where }: { where?: Record<string, unknown> }) => {
      let rows = [...state.assets];
      if (where?.page_id) rows = rows.filter((row) => row.page_id === where.page_id);
      if (where?.kind) rows = rows.filter((row) => row.kind === where.kind);
      if (where?.status) rows = rows.filter((row) => row.status === where.status);
      return rows.length;
    }),
    delete: vi.fn(async ({ where }: { where: { id: string } }) => {
      const index = state.assets.findIndex((row) => row.id === where.id);
      if (index < 0) throw new Error("asset_not_found");
      const [row] = state.assets.splice(index, 1);
      state.variants = state.variants.filter((variant) => variant.asset_id !== row.id);
      return row;
    }),
  },
  serviceMediaVariant: {
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const row: VariantRow = {
        id: nextId("variant"),
        page_id: String(data.page_id),
        asset_id: String(data.asset_id),
        key: String(data.key),
        name: String(data.name),
        mime_type: String(data.mime_type),
        backend: String(data.backend),
        storage_scope: String(data.storage_scope),
        storage_key: String(data.storage_key),
        public_url: (data.public_url as string | null) ?? null,
        size_bytes: Number(data.size_bytes),
        width: (data.width as number | null) ?? null,
        height: (data.height as number | null) ?? null,
        metadata: (data.metadata as Record<string, unknown> | null) ?? null,
        created_at: new Date(),
        updated_at: new Date(),
      };
      state.variants.push(row);
      return row;
    }),
    createMany: vi.fn(async ({ data }: { data: Array<Record<string, unknown>> }) => {
      for (const item of data) {
        state.variants.push({
          id: nextId("variant"),
          page_id: String(item.page_id),
          asset_id: String(item.asset_id),
          key: String(item.key),
          name: String(item.name),
          mime_type: String(item.mime_type),
          backend: String(item.backend),
          storage_scope: String(item.storage_scope),
          storage_key: String(item.storage_key),
          public_url: (item.public_url as string | null) ?? null,
          size_bytes: Number(item.size_bytes),
          width: (item.width as number | null) ?? null,
          height: (item.height as number | null) ?? null,
          metadata: (item.metadata as Record<string, unknown> | null) ?? null,
          created_at: new Date(),
          updated_at: new Date(),
        });
      }
      return { count: data.length };
    }),
    deleteMany: vi.fn(async ({ where }: { where?: Record<string, unknown> }) => {
      const before = state.variants.length;
      state.variants = state.variants.filter((variant) => {
        if (where?.asset_id && variant.asset_id !== where.asset_id) return true;
        if (where?.name && typeof where.name === "object" && where.name && "not" in where.name) {
          return variant.name === (where.name as { not: string }).not;
        }
        return false;
      });
      return { count: before - state.variants.length };
    }),
  },
  serviceMediaUploadSession: {
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const row: UploadSessionRow = {
        id: nextId("session"),
        page_id: String(data.page_id),
        key: String(data.key),
        file_name: String(data.file_name),
        mime_type: String(data.mime_type),
        total_size: Number(data.total_size),
        chunk_size: Number(data.chunk_size),
        received_size: Number(data.received_size ?? 0),
        storage_scope: String(data.storage_scope ?? "private"),
        temp_storage_key: String(data.temp_storage_key),
        visibility: String(data.visibility),
        status: String(data.status ?? "open"),
        completed_asset_id: (data.completed_asset_id as string | null) ?? null,
        expires_at: data.expires_at as Date,
        created_at: new Date(),
        updated_at: new Date(),
      };
      state.sessions.push(row);
      return row;
    }),
    findUnique: vi.fn(async ({ where }: { where: { id: string } }) => state.sessions.find((row) => row.id === where.id) ?? null),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const row = state.sessions.find((item) => item.id === where.id);
      if (!row) throw new Error("session_not_found");
      Object.assign(row, data, { updated_at: new Date() });
      return row;
    }),
  },
}));

vi.mock("@/lib/db", () => ({ prisma: prismaMock }));
vi.mock("@/lib/background-jobs", () => ({ enqueueJob: vi.fn() }));
vi.mock("@/lib/app-audit", () => ({ logAppAudit: vi.fn() }));
vi.mock("@/lib/service-runtime", () => ({ registerBackgroundJobHandler: vi.fn() }));
vi.mock("@/lib/storage", () => ({
  putStorageObject: vi.fn(async ({ key, buffer, scope }: { key: string; buffer: Buffer; scope: string }) => {
    state.storage.set(`${scope}:${key}`, Buffer.from(buffer));
    return {
      url: `/mock/${scope}/${key}`,
      key,
      backend: "local",
      size: buffer.length,
      scope,
      contentType: null,
    };
  }),
  moveStorageObjectFromPath: vi.fn(async ({ key, sourcePath, scope }: { key: string; sourcePath: string; scope: string }) => {
    const buffer = await readFile(sourcePath);
    state.storage.set(`${scope}:${key}`, Buffer.from(buffer));
    return {
      url: `/mock/${scope}/${key}`,
      key,
      backend: "local",
      size: buffer.length,
      scope,
      contentType: null,
    };
  }),
  readStorageObject: vi.fn(async ({ key, scope }: { key: string; scope: string }) => {
    const buffer = state.storage.get(`${scope}:${key}`);
    if (!buffer) throw new Error("storage_missing");
    return {
      buffer: Buffer.from(buffer),
      backend: "local",
      key,
      scope,
      size: buffer.length,
      contentType: null,
    };
  }),
  deleteStorageObject: vi.fn(async (key: string, scope: string) => {
    state.storage.delete(`${scope}:${key}`);
  }),
}));

import { enqueueJob } from "@/lib/background-jobs";
import {
  appendServiceMediaUploadChunk,
  completeServiceMediaUploadSession,
  createServiceMediaAssetFromBuffer,
  createServiceMediaUploadSession,
  issueServiceMediaAccessUrl,
  processServiceMediaAsset,
  resolveServiceMediaAccess,
} from "@/lib/service-media";

describe("service media", () => {
  beforeEach(() => {
    state.seq = 0;
    state.assets = [];
    state.variants = [];
    state.sessions = [];
    state.storage = new Map<string, Buffer>();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await rm(path.join(process.cwd(), ".null_storage", "media-sessions"), { recursive: true, force: true }).catch(() => null);
  });

  it("creates an image asset and enqueues processing", async () => {
    const buffer = await sharp({
      create: {
        width: 480,
        height: 320,
        channels: 4,
        background: "#ffffff",
      },
    })
      .png()
      .toBuffer();

    const asset = await createServiceMediaAssetFromBuffer({
      pageId: "page1",
      fileName: "hero.png",
      mimeType: "image/png",
      buffer,
      visibility: "public",
    });

    expect(asset?.kind).toBe("image");
    expect(asset?.variants).toHaveLength(1);
    expect(enqueueJob).toHaveBeenCalledTimes(1);
  });

  it("processes image assets and creates preview/thumb variants", async () => {
    const buffer = await sharp({
      create: {
        width: 800,
        height: 600,
        channels: 4,
        background: "#0f172a",
      },
    })
      .png()
      .toBuffer();

    const asset = await createServiceMediaAssetFromBuffer({
      pageId: "page1",
      fileName: "banner.png",
      mimeType: "image/png",
      buffer,
      visibility: "signed",
    });

    const result = await processServiceMediaAsset({ assetId: asset!.id });

    expect(result.ok).toBe(true);
    const updated = withVariants(state.assets[0]);
    expect(updated?.status).toBe("ready");
    expect(updated?.width).toBe(800);
    expect(updated?.height).toBe(600);
    expect(updated?.placeholder_data_url?.startsWith("data:image/webp;base64,")).toBe(true);
    expect(updated?.variants.map((variant) => variant.name)).toEqual(["original", "preview", "thumb"]);
  });

  it("issues signed access urls and resolves private variants", async () => {
    const buffer = await sharp({
      create: {
        width: 320,
        height: 320,
        channels: 4,
        background: "#22c55e",
      },
    })
      .png()
      .toBuffer();

    const asset = await createServiceMediaAssetFromBuffer({
      pageId: "page1",
      fileName: "avatar.png",
      mimeType: "image/png",
      buffer,
      visibility: "signed",
    });
    await processServiceMediaAsset({ assetId: asset!.id });

    const issued = await issueServiceMediaAccessUrl({
      pageId: "page1",
      assetId: asset!.id,
      variant: "thumb",
      expiresInSec: 3600,
    });
    expect(issued?.url).toContain("token=");
    const parsed = new URL(`https://example.com${issued!.url}`);
    const access = await resolveServiceMediaAccess({
      pageId: "page1",
      assetId: asset!.id,
      variant: parsed.searchParams.get("variant") ?? "thumb",
      token: parsed.searchParams.get("token"),
      expires: Number(parsed.searchParams.get("expires")),
    });

    expect(access.ok).toBe(true);
    if (access.ok) {
      expect(access.mimeType).toBe("image/webp");
      expect(access.size).toBeGreaterThan(0);
    }
  });

  it("supports chunked upload sessions and completes them into an asset", async () => {
    const buffer = await sharp({
      create: {
        width: 256,
        height: 256,
        channels: 4,
        background: "#f97316",
      },
    })
      .jpeg()
      .toBuffer();

    const session = await createServiceMediaUploadSession({
      pageId: "page1",
      fileName: "chunked.jpg",
      mimeType: "image/jpeg",
      totalSize: buffer.length,
      chunkSize: 64 * 1024,
      visibility: "public",
    });

    const first = buffer.subarray(0, Math.floor(buffer.length / 2));
    const second = buffer.subarray(first.length);

    const appendA = await appendServiceMediaUploadChunk({
      pageId: "page1",
      sessionId: session.id,
      offset: 0,
      chunk: first,
    });
    expect(appendA.ok).toBe(true);
    const appendB = await appendServiceMediaUploadChunk({
      pageId: "page1",
      sessionId: session.id,
      offset: first.length,
      chunk: second,
    });
    expect(appendB.ok).toBe(true);

    const completed = await completeServiceMediaUploadSession({
      pageId: "page1",
      sessionId: session.id,
    });

    expect(completed.ok).toBe(true);
    expect(state.assets).toHaveLength(1);
    expect(state.sessions[0]?.status).toBe("completed");
  });
});
