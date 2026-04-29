import { describe, expect, it } from "vitest";

import { addNode, cloneDoc, createDoc, createNode } from "@/advanced/doc/scene";
import {
  applyBranchMerge,
  buildBranchDiffSummary,
  canBranchReviewAction,
  createBranchReviewPermissions,
  createBranchEntry,
  createBranchReview,
  getDefaultBranchReviewRequiredRole,
  removeBranchEntry,
  setBranchReviewResolution,
  setBranchReviewRequiredRole,
  setBranchReviewStatus,
  summarizeBranchReview,
  upsertBranchEntry,
  upsertBranchReview,
} from "@/advanced/ui/branchReview";

function addRect(doc = createDoc(), id = "rect_a") {
  const page = doc.pages[0]!;
  const rect = createNode("rect", {
    id,
    name: "Card",
    parentId: page.rootId,
    frame: { x: 40, y: 40, w: 160, h: 120, rotation: 0 },
  });
  addNode(doc, rect, page.rootId);
  return { doc, rect };
}

describe("branch review", () => {
  it("builds branch diffs and upserts branch review metadata", () => {
    const { doc: current } = addRect();
    const branchDoc = cloneDoc(current);
    branchDoc.nodes.rect_a = {
      ...branchDoc.nodes.rect_a!,
      frame: { ...branchDoc.nodes.rect_a!.frame, x: 120 },
    };
    const extra = createNode("ellipse", {
      id: "ellipse_b",
      name: "Badge",
      parentId: branchDoc.pages[0]!.rootId,
      frame: { x: 280, y: 56, w: 40, h: 40, rotation: 0 },
    });
    addNode(branchDoc, extra, branchDoc.pages[0]!.rootId);

    const summary = buildBranchDiffSummary(current, branchDoc);
    expect(summary.added).toEqual(["ellipse_b"]);
    expect(summary.changed).toContain("rect_a");
    expect(summary.conflicts).toContain("rect_a");

    const withBranch = upsertBranchEntry(current, createBranchEntry("feature/card", "version_1", "2026-03-14T00:00:00.000Z"));
    const review = createBranchReview("feature/card", "version_1", summary, "2026-03-14T00:01:00.000Z");
    const withReview = upsertBranchReview(withBranch, review);

    expect(withReview.branches?.["feature/card"]).toMatchObject({
      versionId: "version_1",
      lastReviewId: review.id,
      lastComparedAt: "2026-03-14T00:01:00.000Z",
    });
    expect(withReview.branchReviews?.[0]?.summary.added).toEqual(["ellipse_b"]);
    expect(summarizeBranchReview(review)).toBe("+1 / ~2 / -0 / conflicts 2");
  });

  it("updates review resolution/status and removes review state with the branch", () => {
    const { doc } = addRect();
    const branchDoc = cloneDoc(doc);
    branchDoc.nodes.rect_a = {
      ...branchDoc.nodes.rect_a!,
      frame: { ...branchDoc.nodes.rect_a!.frame, y: 96 },
    };
    const summary = buildBranchDiffSummary(doc, branchDoc);
    const withBranch = upsertBranchEntry(doc, createBranchEntry("feature/card", "version_2", "2026-03-14T00:00:00.000Z"));
    const review = createBranchReview("feature/card", "version_2", summary, "2026-03-14T00:02:00.000Z");
    const withReview = upsertBranchReview(withBranch, review);

    const resolved = setBranchReviewResolution(withReview, review.id, "rect_a", "current");
    expect(resolved.branchReviews?.[0]?.resolutions?.rect_a).toBe("current");

    const approved = setBranchReviewStatus(resolved, review.id, "approved");
    expect(approved.branchReviews?.[0]?.status).toBe("approved");

    const removed = removeBranchEntry(approved, "feature/card");
    expect(removed.branches?.["feature/card"]).toBeUndefined();
    expect(removed.branchReviews).toHaveLength(0);
  });

  it("merges a branch doc while preserving current-side conflict resolutions", () => {
    const { doc: current } = addRect();
    const title = createNode("text", {
      id: "title_a",
      name: "Title",
      parentId: "rect_a",
      frame: { x: 16, y: 16, w: 100, h: 24, rotation: 0 },
      text: {
        value: "Current title",
        style: {
          fontFamily: "Inter, sans-serif",
          fontSize: 16,
          fontWeight: 600,
          lineHeight: 1.2,
          letterSpacing: 0,
          paragraphSpacing: 0,
          align: "left",
        },
      },
    });
    current.nodes.rect_a!.children = [title.id];
    addNode(current, title, "rect_a");
    current.selection = new Set(["rect_a"]);
    const withBranch = upsertBranchEntry(current, createBranchEntry("feature/card", "version_3", "2026-03-14T00:00:00.000Z"));

    const branchDoc = cloneDoc(withBranch);
    branchDoc.nodes.title_a = {
      ...branchDoc.nodes.title_a!,
      text: {
        ...branchDoc.nodes.title_a!.text!,
        value: "Branch title",
      },
    };
    const badge = createNode("ellipse", {
      id: "badge_a",
      name: "Badge",
      parentId: branchDoc.pages[0]!.rootId,
      frame: { x: 260, y: 48, w: 32, h: 32, rotation: 0 },
    });
    addNode(branchDoc, badge, branchDoc.pages[0]!.rootId);

    const summary = buildBranchDiffSummary(withBranch, branchDoc);
    const review = createBranchReview("feature/card", "version_3", summary, "2026-03-14T00:03:00.000Z");
    const withReview = upsertBranchReview(withBranch, review);
    const resolved = setBranchReviewResolution(withReview, review.id, "title_a", "current");
    const merged = applyBranchMerge(resolved, branchDoc, resolved.branchReviews![0]!);

    expect(merged.nodes.title_a?.text?.value).toBe("Current title");
    expect(merged.nodes.badge_a?.parentId).toBe(merged.pages[0]!.rootId);
    expect(Array.from(merged.selection)).toEqual(["rect_a"]);
    expect(merged.branchReviews?.find((item) => item.id === review.id)?.status).toBe("merged");
    expect(merged.branches?.["feature/card"]?.versionId).toBe("version_3");
  });

  it("builds granular review permissions from the required role", () => {
    expect(getDefaultBranchReviewRequiredRole("viewer")).toBe("admin");
    expect(getDefaultBranchReviewRequiredRole("owner")).toBe("owner");
    expect(createBranchReviewPermissions("member")).toEqual({
      approve: ["member", "admin", "owner"],
      close: ["member", "admin", "owner"],
      resolve: ["member", "admin", "owner"],
      merge: ["member", "admin", "owner"],
    });
  });

  it("enforces branch review actions per role and updates the approval policy", () => {
    const { doc } = addRect();
    const branchDoc = cloneDoc(doc);
    branchDoc.nodes.rect_a = {
      ...branchDoc.nodes.rect_a!,
      frame: { ...branchDoc.nodes.rect_a!.frame, x: 72 },
    };
    const summary = buildBranchDiffSummary(doc, branchDoc);
    const review = createBranchReview("feature/card", "version_4", summary, "2026-03-14T00:05:00.000Z", "member", "admin");

    expect(canBranchReviewAction(review, "member", "approve")).toBe(false);
    expect(canBranchReviewAction(review, "member", "resolve")).toBe(true);
    expect(canBranchReviewAction(review, "admin", "approve")).toBe(true);
    expect(canBranchReviewAction(review, "viewer", "merge")).toBe(false);

    const next = upsertBranchReview(doc, review);
    const updated = setBranchReviewRequiredRole(next, review.id, "member");
    const updatedReview = updated.branchReviews?.[0];
    expect(updatedReview?.requiredRole).toBe("member");
    expect(updatedReview && canBranchReviewAction(updatedReview, "member", "approve")).toBe(true);
  });
});
