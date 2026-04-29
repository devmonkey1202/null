import {
  cloneDoc,
  type BranchDiffSummary,
  type BranchEntry,
  type BranchMergeResolution,
  type BranchReviewAction,
  type BranchReviewActorRole,
  type BranchReviewItem,
  type BranchReviewPermissions,
  type Doc,
  type Node,
} from "../doc/scene";
import { makeRuntimeId } from "./AdvancedEditor.utils";

function cloneNode<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function stable(value: unknown) {
  return JSON.stringify(value);
}

function normalizeNodeForDiff(node: Node) {
  return {
    id: node.id,
    type: node.type,
    name: node.name,
    parentId: node.parentId,
    children: node.children,
    frame: node.frame,
    style: node.style,
    text: node.text ?? null,
    image: node.image ?? null,
    video: node.video ?? null,
    layout: node.layout ?? null,
    layoutSizing: node.layoutSizing ?? null,
    layoutPositioning: node.layoutPositioning ?? null,
    gridChild: node.gridChild ?? null,
    constraints: node.constraints ?? null,
    hidden: node.hidden ?? false,
    locked: node.locked ?? false,
    clipContent: node.clipContent ?? false,
    shape: node.shape ?? null,
    data: node.data ?? null,
    componentId: node.componentId ?? null,
    instanceOf: node.instanceOf ?? null,
    sourceId: node.sourceId ?? null,
    instanceLibraryId: node.instanceLibraryId ?? null,
    variantId: node.variantId ?? null,
    overrides: node.overrides ?? null,
    prototype: node.prototype ?? null,
    isMask: node.isMask ?? false,
    overflowScrolling: node.overflowScrolling ?? "none",
    sticky: node.sticky ?? false,
    variants: node.variants ?? null,
    propertyDefinitions: node.propertyDefinitions ?? null,
    layoutGrid: node.layoutGrid ?? null,
    exportSettings: node.exportSettings ?? null,
    widthPercent: node.widthPercent ?? null,
    heightPercent: node.heightPercent ?? null,
    slotId: node.slotId ?? null,
    table: node.table ?? null,
    widget: node.widget ?? null,
    dev: node.dev ?? null,
  };
}

function copySubtreeIntoResult(result: Doc, sourceDoc: Doc, nodeId: string, visited = new Set<string>()) {
  if (visited.has(nodeId)) return;
  const source = sourceDoc.nodes[nodeId];
  if (!source) return;
  visited.add(nodeId);
  if (source.parentId && !result.nodes[source.parentId] && sourceDoc.nodes[source.parentId]) {
    copySubtreeIntoResult(result, sourceDoc, source.parentId, visited);
  }
  result.nodes[nodeId] = cloneNode(source);
  source.children.forEach((childId) => copySubtreeIntoResult(result, sourceDoc, childId, visited));
}

function rebuildChildren(doc: Doc) {
  Object.values(doc.nodes).forEach((node) => {
    node.children = [];
  });
  Object.values(doc.nodes).forEach((node) => {
    if (!node.parentId) return;
    const parent = doc.nodes[node.parentId];
    if (parent) parent.children.push(node.id);
  });
}

const BRANCH_REVIEW_ROLE_ORDER: BranchReviewActorRole[] = ["viewer", "member", "admin", "owner"];

function roleLevel(role: BranchReviewActorRole) {
  return BRANCH_REVIEW_ROLE_ORDER.indexOf(role);
}

export function branchReviewRolesAtLeast(requiredRole: BranchReviewActorRole) {
  return BRANCH_REVIEW_ROLE_ORDER.filter((role) => roleLevel(role) >= roleLevel(requiredRole));
}

export function getDefaultBranchReviewRequiredRole(role: BranchReviewActorRole | null | undefined): BranchReviewActorRole {
  return role === "owner" ? "owner" : "admin";
}

export function createBranchReviewPermissions(requiredRole: BranchReviewActorRole = "admin"): BranchReviewPermissions {
  return {
    approve: branchReviewRolesAtLeast(requiredRole),
    close: branchReviewRolesAtLeast(requiredRole),
    resolve: branchReviewRolesAtLeast("member"),
    merge: branchReviewRolesAtLeast(requiredRole),
  };
}

export function canBranchReviewAction(
  review: BranchReviewItem,
  role: BranchReviewActorRole | null | undefined,
  action: BranchReviewAction,
) {
  const currentRole = role ?? "viewer";
  const permissions = review.permissions ?? createBranchReviewPermissions(review.requiredRole ?? "admin");
  return permissions[action].includes(currentRole);
}

export function buildBranchDiffSummary(currentDoc: Doc, branchDoc: Doc): BranchDiffSummary {
  const added: string[] = [];
  const removed: string[] = [];
  const changed: string[] = [];
  const conflicts: string[] = [];

  const ids = new Set([...Object.keys(currentDoc.nodes), ...Object.keys(branchDoc.nodes)]);
  ids.forEach((id) => {
    if (id === currentDoc.root || id === branchDoc.root) return;
    const current = currentDoc.nodes[id];
    const branch = branchDoc.nodes[id];
    if (!current && branch) {
      added.push(id);
      return;
    }
    if (current && !branch) {
      removed.push(id);
      conflicts.push(id);
      return;
    }
    if (current && branch) {
      if (stable(normalizeNodeForDiff(current)) !== stable(normalizeNodeForDiff(branch))) {
        changed.push(id);
        conflicts.push(id);
      }
    }
  });

  return {
    added: added.sort(),
    removed: removed.sort(),
    changed: changed.sort(),
    conflicts: Array.from(new Set(conflicts)).sort(),
  };
}

export function createBranchEntry(name: string, versionId: string, now = new Date().toISOString()): BranchEntry {
  return {
    name,
    versionId,
    createdAt: now,
    updatedAt: now,
  };
}

export function upsertBranchEntry(doc: Doc, entry: BranchEntry) {
  const next = cloneDoc(doc);
  next.branches = { ...(next.branches ?? {}), [entry.name]: entry };
  return next;
}

export function removeBranchEntry(doc: Doc, branchName: string) {
  const next = cloneDoc(doc);
  const branches = { ...(next.branches ?? {}) };
  delete branches[branchName];
  next.branches = branches;
  next.branchReviews = (next.branchReviews ?? []).filter((review) => review.branchName !== branchName);
  return next;
}

export function createBranchReview(
  branchName: string,
  versionId: string,
  summary: BranchDiffSummary,
  now = new Date().toISOString(),
  createdByRole: BranchReviewActorRole = "member",
  requiredRole: BranchReviewActorRole = getDefaultBranchReviewRequiredRole(createdByRole),
): BranchReviewItem {
  const resolutions = Object.fromEntries(summary.conflicts.map((nodeId) => [nodeId, "branch" as BranchMergeResolution]));
  return {
    id: makeRuntimeId("review"),
    branchName,
    versionId,
    createdAt: now,
    updatedAt: now,
    status: "open",
    summary,
    resolutions,
    createdByRole,
    requiredRole,
    permissions: createBranchReviewPermissions(requiredRole),
  };
}

export function upsertBranchReview(doc: Doc, review: BranchReviewItem) {
  const next = cloneDoc(doc);
  const reviews = next.branchReviews ?? [];
  const index = reviews.findIndex((item) => item.id === review.id);
  next.branchReviews =
    index >= 0 ? reviews.map((item) => (item.id === review.id ? review : item)) : [review, ...reviews];
  if (next.branches?.[review.branchName]) {
    next.branches[review.branchName] = {
      ...next.branches[review.branchName]!,
      lastComparedAt: review.updatedAt ?? review.createdAt,
      lastReviewId: review.id,
    };
  }
  return next;
}

export function setBranchReviewResolution(doc: Doc, reviewId: string, nodeId: string, resolution: BranchMergeResolution) {
  const next = cloneDoc(doc);
  next.branchReviews = (next.branchReviews ?? []).map((review) =>
    review.id === reviewId
      ? {
          ...review,
          updatedAt: new Date().toISOString(),
          resolutions: { ...(review.resolutions ?? {}), [nodeId]: resolution },
        }
      : review,
  );
  return next;
}

export function setBranchReviewStatus(doc: Doc, reviewId: string, status: BranchReviewItem["status"]) {
  const next = cloneDoc(doc);
  next.branchReviews = (next.branchReviews ?? []).map((review) =>
    review.id === reviewId
      ? {
          ...review,
          status,
          updatedAt: new Date().toISOString(),
        }
      : review,
  );
  return next;
}

export function setBranchReviewRequiredRole(doc: Doc, reviewId: string, requiredRole: BranchReviewActorRole) {
  const next = cloneDoc(doc);
  next.branchReviews = (next.branchReviews ?? []).map((review) =>
    review.id === reviewId
      ? {
          ...review,
          requiredRole,
          permissions: createBranchReviewPermissions(requiredRole),
          updatedAt: new Date().toISOString(),
        }
      : review,
  );
  return next;
}

export function applyBranchMerge(currentDoc: Doc, branchDoc: Doc, review: BranchReviewItem) {
  const result = cloneDoc(branchDoc);
  result.view = { ...currentDoc.view };
  result.selection = new Set(currentDoc.selection);
  result.branches = cloneNode(currentDoc.branches ?? {});
  result.branchReviews = cloneNode(currentDoc.branchReviews ?? []);

  const currentKept = new Set<string>();
  review.summary.removed.forEach((nodeId) => {
    const resolution = review.resolutions?.[nodeId];
    if (resolution === "current") currentKept.add(nodeId);
  });
  review.summary.conflicts.forEach((nodeId) => {
    const resolution = review.resolutions?.[nodeId] ?? "branch";
    if (resolution === "current") currentKept.add(nodeId);
  });

  currentKept.forEach((nodeId) => {
    copySubtreeIntoResult(result, currentDoc, nodeId);
  });

  rebuildChildren(result);

  return setBranchReviewStatus(result, review.id, "merged");
}

export function summarizeBranchReview(review: BranchReviewItem) {
  return `+${review.summary.added.length} / ~${review.summary.changed.length} / -${review.summary.removed.length} / conflicts ${review.summary.conflicts.length}`;
}
