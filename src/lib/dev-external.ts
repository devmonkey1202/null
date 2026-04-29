import { hydrateDoc, type Doc, type Node } from "@/advanced/doc/scene";
import { buildDevCodegenBundle, type DevCodegenPayload } from "@/advanced/ui/devCodegen";

export type CodeConnectManifestEntry = {
  nodeId: string;
  name: string;
  type: string;
  readyForDev: boolean;
  exportKeys: string[];
  codeLinks: Array<{
    title: string;
    kind: string;
    url?: string | null;
    exportKey?: string | null;
  }>;
  spec: DevCodegenPayload;
};

export type CodeConnectManifest = {
  generatedAt: string;
  pageId: string;
  nodeCount: number;
  components: CodeConnectManifestEntry[];
};

export type DevMcpToolName =
  | "list_ready_nodes"
  | "get_node_spec"
  | "get_node_codegen"
  | "get_code_connect_manifest";

function resolveSolidFill(node: Node) {
  const fill = node.style.fills.find((item) => item.type === "solid");
  return fill?.color ?? null;
}

function resolveStroke(node: Node) {
  const stroke = node.style.strokes[0];
  if (!stroke) return null;
  return {
    color: stroke.color,
    width: stroke.width,
  };
}

export function buildExternalDevSpec(doc: Doc, node: Node): DevCodegenPayload {
  const textStyle = node.type === "text" ? node.text?.style : null;
  const codeLinks =
    node.dev?.codeLinks?.map((link) => ({
      title: link.title,
      kind: link.kind,
      url: link.url ?? null,
      exportKey: link.exportKey ?? null,
    })) ?? [];
  return {
    meta: {
      name: node.name,
      type: node.type,
    },
    frame: {
      x: node.frame.x,
      y: node.frame.y,
      w: node.frame.w,
      h: node.frame.h,
    },
    style: {
      fill: resolveSolidFill(node),
      stroke: resolveStroke(node),
      opacity: node.style.opacity,
      radius: node.style.radius,
      blendMode: node.style.blendMode,
    },
    text:
      node.type === "text"
        ? {
            value: node.text?.value ?? "",
            style: textStyle
              ? {
                  fontFamily: textStyle.fontFamily,
                  fontSize: textStyle.fontSize,
                  fontWeight: textStyle.fontWeight,
                  lineHeight: textStyle.lineHeight,
                  letterSpacing: textStyle.letterSpacing,
                  align: textStyle.align,
                  textCase: textStyle.textCase,
                  fontFeatureSettings: textStyle.fontFeatureSettings,
                  fontVariationSettings: textStyle.fontVariationSettings,
                }
              : null,
          }
        : null,
    tokens: {
      fillStyle: node.style.fillStyleId ?? null,
      strokeStyle: node.style.strokeStyleId ?? null,
      effectStyle: node.style.effectStyleId ?? null,
      textStyle: node.text?.styleRef ?? null,
      fillVariable: node.style.fillRef ?? null,
      strokeVariable: node.style.strokeRef ?? null,
      activeMode: doc.variableMode ?? doc.variableModes?.[0] ?? null,
    },
    handoff: {
      readyForDev: node.dev?.readyForDev ?? false,
      codeLinks,
    },
  };
}

export function getCodeConnectExportKeys(node: Node) {
  return Array.from(
    new Set(
      (node.dev?.codeLinks ?? [])
        .map((link) => link.exportKey?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  );
}

export function collectReadyForDevNodes(doc: Doc) {
  return Object.values(doc.nodes).filter((node) => Boolean(node.dev?.readyForDev || node.dev?.codeLinks?.length));
}

export function buildCodeConnectManifest(doc: Doc, pageId: string): CodeConnectManifest {
  const components = collectReadyForDevNodes(doc).map((node) => ({
    nodeId: node.id,
    name: node.name,
    type: node.type,
    readyForDev: Boolean(node.dev?.readyForDev),
    exportKeys: getCodeConnectExportKeys(node),
    codeLinks:
      node.dev?.codeLinks?.map((link) => ({
        title: link.title,
        kind: link.kind,
        url: link.url ?? null,
        exportKey: link.exportKey ?? null,
      })) ?? [],
    spec: buildExternalDevSpec(doc, node),
  }));
  return {
    generatedAt: new Date().toISOString(),
    pageId,
    nodeCount: components.length,
    components,
  };
}

export function buildDevMcpDescriptor() {
  return {
    server: {
      name: "null-editor-dev-mcp",
      version: "1.0.0",
    },
    tools: [
      { name: "list_ready_nodes", input: {} },
      { name: "get_node_spec", input: { nodeId: "string" } },
      { name: "get_node_codegen", input: { nodeId: "string" } },
      { name: "get_code_connect_manifest", input: {} },
    ],
  };
}

export function runDevMcpTool(doc: Doc, pageId: string, tool: DevMcpToolName, args?: Record<string, unknown>) {
  if (tool === "list_ready_nodes") {
    return collectReadyForDevNodes(doc).map((node) => ({
      id: node.id,
      name: node.name,
      type: node.type,
      readyForDev: Boolean(node.dev?.readyForDev),
      exportKeys: getCodeConnectExportKeys(node),
      codeLinkCount: node.dev?.codeLinks?.length ?? 0,
    }));
  }
  if (tool === "get_node_spec") {
    const nodeId = typeof args?.nodeId === "string" ? args.nodeId : "";
    const node = doc.nodes[nodeId];
    if (!node) return null;
    return buildExternalDevSpec(doc, node);
  }
  if (tool === "get_node_codegen") {
    const nodeId = typeof args?.nodeId === "string" ? args.nodeId : "";
    const node = doc.nodes[nodeId];
    if (!node) return null;
    return buildDevCodegenBundle(buildExternalDevSpec(doc, node));
  }
  if (tool === "get_code_connect_manifest") {
    return buildCodeConnectManifest(doc, pageId);
  }
  return null;
}

export function hydrateExternalDevDoc(content: unknown) {
  if (!content || typeof content !== "object") return null;
  if ((content as { schema?: string }).schema !== "null_advanced_v1") return null;
  return hydrateDoc(content as Parameters<typeof hydrateDoc>[0]);
}
