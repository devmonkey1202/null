import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  appCollection: { findMany: vi.fn() },
  appRecord: { findMany: vi.fn() },
  serviceRankingRule: { upsert: vi.fn(), findMany: vi.fn() },
  serviceRankingSnapshot: {
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
  assembleServiceFeed,
  ensureDefaultServiceRankingRules,
  queryServiceRanking,
  syncServiceRankingRecord,
} from "@/lib/service-ranking";

describe("service ranking", () => {
  beforeEach(() => {
    prismaMock.appCollection.findMany.mockReset();
    prismaMock.appRecord.findMany.mockReset();
    prismaMock.serviceRankingRule.upsert.mockReset();
    prismaMock.serviceRankingRule.findMany.mockReset();
    prismaMock.serviceRankingSnapshot.findMany.mockReset();
    prismaMock.serviceRankingSnapshot.count.mockReset();
    prismaMock.serviceRankingSnapshot.createMany.mockReset();
    prismaMock.serviceRankingSnapshot.deleteMany.mockReset();
    prismaMock.serviceRankingSnapshot.upsert.mockReset();
    prismaMock.$transaction.mockClear();
  });

  it("creates default ranking rules for collections", async () => {
    prismaMock.appCollection.findMany.mockResolvedValue([
      {
        slug: "posts",
        name: "Posts",
        fields: [
          { name: "title", type: "string" },
          { name: "body", type: "string" },
          { name: "score", type: "number" },
          { name: "featured", type: "boolean" },
        ],
      },
    ]);

    await ensureDefaultServiceRankingRules("page1");

    const keys = prismaMock.serviceRankingRule.upsert.mock.calls.map((call) => {
      const args = call[0] as { where: { page_id_key: { key: string } } };
      return args.where.page_id_key.key;
    });
    expect(keys).toContain("collection:posts:default");
  });

  it("returns higher scored ranking items first", async () => {
    prismaMock.appCollection.findMany.mockResolvedValue([]);
    prismaMock.serviceRankingRule.findMany
      .mockResolvedValueOnce([
        {
          id: "rule_posts",
          key: "collection:posts:default",
          name: "Posts ranking",
          source_type: "app_collection",
          source_key: "posts",
          visibility: "app_user",
          scope_mode: "own",
          enabled: true,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "rule_posts",
          key: "collection:posts:default",
          name: "Posts ranking",
          source_type: "app_collection",
          source_key: "posts",
          visibility: "app_user",
          scope_mode: "own",
          enabled: true,
        },
      ]);
    prismaMock.serviceRankingSnapshot.count.mockResolvedValue(1);
    prismaMock.serviceRankingSnapshot.findMany.mockResolvedValue([
      {
        id: "snap2",
        page_id: "page1",
        rule_id: "rule_posts",
        source_type: "app_collection",
        source_key: "posts",
        source_id: "record2",
        title: "Second",
        excerpt: "Second excerpt",
        score: 12,
        rank: 2,
        facets: { status: "published" },
        app_user_id: "app_user_1",
        payload: {},
        updated_at: new Date("2026-03-22T00:00:00Z"),
      },
      {
        id: "snap1",
        page_id: "page1",
        rule_id: "rule_posts",
        source_type: "app_collection",
        source_key: "posts",
        source_id: "record1",
        title: "First",
        excerpt: "First excerpt",
        score: 24,
        rank: 1,
        facets: { status: "published" },
        app_user_id: "app_user_1",
        payload: {},
        updated_at: new Date("2026-03-23T00:00:00Z"),
      },
    ]);

    const result = await queryServiceRanking(
      "page1",
      {
        filters: { status: "published" },
      },
      {
        isOwner: false,
        appUserId: "app_user_1",
        env: "prod",
      },
    );

    expect(result.items[0]?.sourceId).toBe("record1");
    expect(result.total).toBe(2);
  });

  it("assembles feed from weighted ranking rules", async () => {
    prismaMock.appCollection.findMany.mockResolvedValue([]);
    prismaMock.serviceRankingRule.findMany.mockResolvedValue([
      {
        id: "rule_posts",
        key: "collection:posts:default",
        name: "Posts ranking",
        source_type: "app_collection",
        source_key: "posts",
        visibility: "public",
        scope_mode: "all",
        enabled: true,
      },
      {
        id: "rule_news",
        key: "collection:news:default",
        name: "News ranking",
        source_type: "app_collection",
        source_key: "news",
        visibility: "public",
        scope_mode: "all",
        enabled: true,
      },
    ]);
    prismaMock.serviceRankingSnapshot.count.mockResolvedValue(1);
    prismaMock.serviceRankingSnapshot.findMany.mockResolvedValue([
      {
        id: "snap1",
        page_id: "page1",
        rule_id: "rule_posts",
        source_type: "app_collection",
        source_key: "posts",
        source_id: "record1",
        title: "Alpha",
        excerpt: "Alpha excerpt",
        score: 10,
        rank: 1,
        facets: {},
        app_user_id: null,
        payload: {},
        updated_at: new Date("2026-03-23T00:00:00Z"),
      },
      {
        id: "snap2",
        page_id: "page1",
        rule_id: "rule_news",
        source_type: "app_collection",
        source_key: "news",
        source_id: "record1",
        title: "Alpha",
        excerpt: "Alpha excerpt",
        score: 6,
        rank: 1,
        facets: {},
        app_user_id: null,
        payload: {},
        updated_at: new Date("2026-03-23T00:00:00Z"),
      },
      {
        id: "snap3",
        page_id: "page1",
        rule_id: "rule_news",
        source_type: "app_collection",
        source_key: "news",
        source_id: "record2",
        title: "Beta",
        excerpt: "Beta excerpt",
        score: 12,
        rank: 1,
        facets: {},
        app_user_id: null,
        payload: {},
        updated_at: new Date("2026-03-22T00:00:00Z"),
      },
    ]);

    const feed = await assembleServiceFeed(
      "page1",
      {
        ruleWeights: [
          { ruleKey: "collection:posts:default", weight: 2 },
          { ruleKey: "collection:news:default", weight: 2 },
        ],
      },
      {
        isOwner: true,
        env: "prod",
      },
    );

    expect(feed.items[0]?.sourceId).toBe("record1");
    expect(feed.items[0]?.contributingRules).toContain("collection:posts:default");
    expect(feed.items[0]?.contributingRules).toContain("collection:news:default");
  });

  it("syncs a changed record into ranking snapshots", async () => {
    prismaMock.serviceRankingRule.findMany.mockResolvedValue([
      {
        id: "rule_posts",
        key: "collection:posts:default",
        source_type: "app_collection",
        source_key: "posts",
        title_fields: ["title"],
        excerpt_fields: ["body"],
        facet_fields: ["featured"],
        config: {
          numericWeights: { score: 5 },
          booleanBonuses: { featured: 10 },
          freshnessField: "updated_at",
          freshnessHalfLifeHours: 72,
        },
      },
    ]);
    prismaMock.appRecord.findMany.mockResolvedValue([
      {
        id: "record1",
        data: { title: "Alpha", body: "Body", score: 4, featured: true },
        created_at: new Date("2026-03-22T00:00:00Z"),
        updated_at: new Date("2026-03-23T00:00:00Z"),
        app_user_id: null,
      },
    ]);

    const touched = await syncServiceRankingRecord({
      pageId: "page1",
      collectionSlug: "posts",
      recordId: "record1",
    });

    expect(touched).toEqual(["collection:posts:default"]);
    expect(prismaMock.serviceRankingSnapshot.upsert).toHaveBeenCalled();
  });
});
