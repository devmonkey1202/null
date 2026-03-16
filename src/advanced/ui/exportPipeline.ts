import type { Doc } from "../doc/scene";

export type BatchExportJob = {
  nodeId: string;
  nodeName: string;
  pageId: string | null;
  pageName: string | null;
  format: "png" | "svg" | "pdf";
  scale: number;
  fileName: string;
  pathLabel: string;
};

export function sanitizeExportName(value: string) {
  const trimmed = value.trim();
  const base = trimmed.length ? trimmed : "advanced_export";
  return base.replace(/[\\/:*?"<>|]+/g, "_");
}

function compactSegments(values: Array<string | null | undefined>) {
  return values
    .map((value) => (value ? sanitizeExportName(value) : ""))
    .filter(Boolean);
}

function uniqueFileName(base: string, ext: string, used: Map<string, number>) {
  const key = `${base}.${ext}`;
  const count = used.get(key) ?? 0;
  used.set(key, count + 1);
  if (count === 0) return key;
  return `${base}-${count + 1}.${ext}`;
}

function findNodePage(doc: Doc, nodeId: string) {
  let currentId: string | null = nodeId;
  while (currentId) {
    const page = doc.pages.find((item) => item.rootId === currentId);
    if (page) return page;
    currentId = doc.nodes[currentId]?.parentId ?? null;
  }
  return null;
}

function buildNodePathLabel(doc: Doc, nodeId: string) {
  const labels: string[] = [];
  let currentId: string | null = nodeId;
  while (currentId) {
    const node: Doc["nodes"][string] | undefined = doc.nodes[currentId];
    if (!node) break;
    labels.unshift(node.name || node.id);
    currentId = node.parentId;
  }
  return labels.join(" / ");
}

export function buildScopedExportBaseName(options: {
  doc: Doc;
  title?: string | null;
  scope: "document" | "page" | "selection";
  pageId?: string | null;
  selectionIds?: string[];
}) {
  const base = options.title?.trim() || "advanced_export";
  if (options.scope === "document") return sanitizeExportName(base);

  if (options.scope === "selection") {
    const selectionIds = options.selectionIds ?? [];
    if (selectionIds.length === 1) {
      const node = options.doc.nodes[selectionIds[0]];
      return compactSegments([base, node?.name ?? "selection"]).join("-");
    }
    if (selectionIds.length > 1) {
      return compactSegments([base, `selection-${selectionIds.length}`]).join("-");
    }
    return compactSegments([base, "selection"]).join("-");
  }

  const pageId = options.pageId ?? options.doc.pages[0]?.id ?? null;
  const page = pageId ? options.doc.pages.find((item) => item.id === pageId) : null;
  return compactSegments([base, page?.name ?? "page"]).join("-");
}

export function buildNodeBatchExportQueue(doc: Doc, nodeIds: string[], title?: string | null) {
  const jobs: BatchExportJob[] = [];
  const used = new Map<string, number>();

  nodeIds.forEach((nodeId) => {
    const node = doc.nodes[nodeId];
    if (!node?.exportSettings?.length) return;
    const page = findNodePage(doc, nodeId);
    const pathLabel = buildNodePathLabel(doc, nodeId);
    node.exportSettings.forEach((setting) => {
      const ext = setting.format === "svg" ? "svg" : setting.format === "pdf" ? "pdf" : "png";
      const base = compactSegments([
        title ?? "advanced_export",
        page?.name ?? "page",
        node.name || node.id,
        `${setting.scale}x`,
      ]).join("-");
      jobs.push({
        nodeId,
        nodeName: node.name || node.id,
        pageId: page?.id ?? null,
        pageName: page?.name ?? null,
        format: setting.format,
        scale: setting.scale,
        fileName: uniqueFileName(base, ext, used),
        pathLabel,
      });
    });
  });

  return jobs;
}
