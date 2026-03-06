import { NextResponse } from "next/server";
import { withErrorHandler } from "@/lib/api-handler";
import { prisma } from "@/lib/db";
import type { PageStatus } from "@prisma/client";

/**
 * GET: upvote_count 기준 페이지 랭킹.
 * 쿼리: limit (기본 20), status=live (기본 live만), min_upvotes (선택)
 */
export const GET = withErrorHandler(async (req: Request) => {
  const { searchParams } = new URL(req.url);
  const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit")) || 20));
  const status = searchParams.get("status") || "live";
  const minUpvotes = Number(searchParams.get("min_upvotes"));
  const validStatus = (status === "live" || status === "draft" ? status : "live") as PageStatus;

  const where: { is_deleted: boolean; status: PageStatus; upvote_count?: { gte: number } } = {
    is_deleted: false,
    status: validStatus,
  };
  if (!Number.isNaN(minUpvotes) && minUpvotes > 0) {
    where.upvote_count = { gte: minUpvotes };
  }

  const pages = await prisma.page.findMany({
    where,
    orderBy: [{ upvote_count: "desc" }, { updated_at: "desc" }],
    take: limit,
    select: {
      id: true,
      title: true,
      upvote_count: true,
      status: true,
      deployed_at: true,
      owner_id: true,
    },
  });

  const list = pages.map((p, i) => ({
    rank: i + 1,
    pageId: p.id,
    title: p.title,
    upvoteCount: p.upvote_count,
    status: p.status,
    deployedAt: p.deployed_at?.toISOString() ?? null,
    ownerId: p.owner_id,
  }));

  return NextResponse.json({ ranking: list });
});
