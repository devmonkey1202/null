import { describe, it, expect, vi, beforeEach } from "vitest";

const prismaMock = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  comment: { findMany: vi.fn() },
  chatMessage: { findMany: vi.fn() },
  todo: { findMany: vi.fn() },
  note: { findUnique: vi.fn() },
  calendarEvent: { findMany: vi.fn() },
}));

vi.mock("@/lib/db", () => ({ prisma: prismaMock }));

import { searchComments, searchNotes } from "@/lib/page-search";

describe("page search", () => {
  beforeEach(() => {
    prismaMock.$queryRaw.mockReset();
    prismaMock.comment.findMany.mockReset();
    prismaMock.note.findUnique.mockReset();
  });

  it("uses fts when available for comments", async () => {
    prismaMock.$queryRaw.mockResolvedValue([
      { id: "c1", content: "hello world", created_at: new Date("2026-01-01T00:00:00Z"), node_id: "n1" },
    ]);
    const results = await searchComments("page1", "hello");
    expect(results[0]?.id).toBe("c1");
    expect(prismaMock.comment.findMany).not.toHaveBeenCalled();
  });

  it("falls back when fts fails", async () => {
    prismaMock.$queryRaw.mockRejectedValue(new Error("fts_error"));
    prismaMock.comment.findMany.mockResolvedValue([
      { id: "c2", content: "fallback", created_at: new Date("2026-01-01T00:00:00Z"), node_id: null },
    ]);
    const results = await searchComments("page1", "fallback");
    expect(results[0]?.id).toBe("c2");
    expect(prismaMock.comment.findMany).toHaveBeenCalled();
  });

  it("falls back for notes when fts fails", async () => {
    prismaMock.$queryRaw.mockRejectedValue(new Error("fts_error"));
    prismaMock.note.findUnique.mockResolvedValue({
      id: "note1",
      content: "my note content",
      updated_at: new Date("2026-01-01T00:00:00Z"),
    });
    const results = await searchNotes("page1", "note");
    expect(results.length).toBe(1);
  });
});
