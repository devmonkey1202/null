import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  appCollection: { findMany: vi.fn() },
  appRecord: { findMany: vi.fn() },
  comment: { findMany: vi.fn() },
  chatMessage: { findMany: vi.fn() },
  todo: { findMany: vi.fn() },
  note: { findUnique: vi.fn() },
  calendarEvent: { findMany: vi.fn() },
  serviceSearchIndex: { upsert: vi.fn(), findMany: vi.fn() },
  serviceSearchDocument: {
    findMany: vi.fn(),
    count: vi.fn(),
    createMany: vi.fn(),
    deleteMany: vi.fn(),
    upsert: vi.fn(),
  },
  $transaction: vi.fn(async (callback: (tx: typeof prismaMock) => Promise<unknown>) => callback(prismaMock)),
}));

vi.mock("@/lib/db", () => ({ prisma: prismaMock }));
vi.mock("@/lib/background-jobs", () => ({ enqueueJob: vi.fn() }));
vi.mock("@/lib/app-audit", () => ({ logAppAudit: vi.fn() }));
vi.mock("@/lib/service-runtime", () => ({ registerBackgroundJobHandler: vi.fn() }));

import {
  deleteServiceSearchRecord,
  ensureDefaultServiceSearchIndices,
  queryServiceSearch,
  syncServiceSearchRecord,
} from "@/lib/service-search";

describe("service search", () => {
  beforeEach(() => {
    prismaMock.appCollection.findMany.mockReset();
    prismaMock.appRecord.findMany.mockReset();
    prismaMock.comment.findMany.mockReset();
    prismaMock.chatMessage.findMany.mockReset();
    prismaMock.todo.findMany.mockReset();
    prismaMock.note.findUnique.mockReset();
    prismaMock.calendarEvent.findMany.mockReset();
    prismaMock.serviceSearchIndex.upsert.mockReset();
    prismaMock.serviceSearchIndex.findMany.mockReset();
    prismaMock.serviceSearchDocument.findMany.mockReset();
    prismaMock.serviceSearchDocument.count.mockReset();
    prismaMock.serviceSearchDocument.createMany.mockReset();
    prismaMock.serviceSearchDocument.deleteMany.mockReset();
    prismaMock.serviceSearchDocument.upsert.mockReset();
    prismaMock.$transaction.mockClear();
  });

  it("creates default indexes for builtin entities and app collections", async () => {
    prismaMock.appCollection.findMany.mockResolvedValue([
      {
        slug: "posts",
        name: "Posts",
        fields: [
          { name: "title", type: "string" },
          { name: "body", type: "string" },
          { name: "published", type: "boolean" },
        ],
      },
    ]);

    await ensureDefaultServiceSearchIndices("page1");

    expect(prismaMock.serviceSearchIndex.upsert).toHaveBeenCalled();
    const keys = prismaMock.serviceSearchIndex.upsert.mock.calls.map((call) => {
      const args = call[0] as { where: { page_id_key: { key: string } } };
      return args.where.page_id_key.key;
    });
    expect(keys).toContain("page:comments");
    expect(keys).toContain("collection:posts");
  });

  it("ranks title matches higher and respects scope filters", async () => {
    prismaMock.appCollection.findMany.mockResolvedValue([]);
    prismaMock.serviceSearchIndex.findMany
      .mockResolvedValueOnce([
        {
          id: "idx_posts",
          key: "collection:posts",
          name: "Posts",
          source_type: "app_collection",
          source_key: "posts",
          title_fields: ["title"],
          body_fields: ["body"],
          facet_fields: ["status"],
          sort_field: "updated_at",
          visibility: "app_user",
          scope_mode: "own",
          enabled: true,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "idx_posts",
          key: "collection:posts",
          name: "Posts",
          source_type: "app_collection",
          source_key: "posts",
          title_fields: ["title"],
          body_fields: ["body"],
          facet_fields: ["status"],
          sort_field: "updated_at",
          visibility: "app_user",
          scope_mode: "own",
          enabled: true,
        },
      ]);
    prismaMock.serviceSearchDocument.count.mockResolvedValue(1);
    prismaMock.serviceSearchDocument.findMany.mockResolvedValue([
      {
        id: "doc_1",
        page_id: "page1",
        index_id: "idx_posts",
        source_type: "app_collection",
        source_key: "posts",
        source_id: "record_1",
        title: "Hello World",
        body: "short body",
        facets: { status: "published" },
        sort_text: "Hello World",
        sort_number: null,
        sort_date: new Date("2026-03-23T00:00:00Z"),
        app_user_id: "app_user_1",
        payload: { path: "/posts/1" },
        updated_at: new Date("2026-03-23T00:00:00Z"),
      },
      {
        id: "doc_2",
        page_id: "page1",
        index_id: "idx_posts",
        source_type: "app_collection",
        source_key: "posts",
        source_id: "record_2",
        title: "Another post",
        body: "hello world appears in body only",
        facets: { status: "draft" },
        sort_text: "Another post",
        sort_number: null,
        sort_date: new Date("2026-03-22T00:00:00Z"),
        app_user_id: "other_user",
        payload: { path: "/posts/2" },
        updated_at: new Date("2026-03-22T00:00:00Z"),
      },
    ]);

    const result = await queryServiceSearch(
      "page1",
      {
        q: "hello",
        filters: { status: "published" },
      },
      {
        isOwner: false,
        appUserId: "app_user_1",
        env: "prod",
      },
    );

    expect(result.total).toBe(1);
    expect(result.items[0]?.sourceId).toBe("record_1");
    expect(result.items[0]?.relevance).toBeGreaterThan(0);
  });

  it("syncs app records into collection search documents", async () => {
    prismaMock.serviceSearchIndex.findMany.mockResolvedValue([
      {
        id: "idx_posts",
        source_type: "app_collection",
        source_key: "posts",
        title_fields: ["title"],
        body_fields: ["body"],
        facet_fields: ["published"],
        sort_field: "updated_at",
      },
    ]);
    prismaMock.appRecord.findMany.mockResolvedValue([
      {
        id: "record_1",
        data: { title: "Alpha", body: "Beta", published: true },
        updated_at: new Date("2026-03-23T00:00:00Z"),
        created_at: new Date("2026-03-22T00:00:00Z"),
        app_user_id: "app_user_1",
      },
    ]);

    await syncServiceSearchRecord({
      pageId: "page1",
      collectionSlug: "posts",
      recordId: "record_1",
    });

    expect(prismaMock.serviceSearchDocument.upsert).toHaveBeenCalled();
  });

  it("removes collection search documents on delete", async () => {
    prismaMock.serviceSearchDocument.deleteMany.mockResolvedValue({ count: 1 });

    await deleteServiceSearchRecord({
      pageId: "page1",
      collectionSlug: "posts",
      recordId: "record_1",
    });

    expect(prismaMock.serviceSearchDocument.deleteMany).toHaveBeenCalledWith({
      where: {
        page_id: "page1",
        source_type: "app_collection",
        source_key: "posts",
        source_id: "record_1",
      },
    });
  });
});
