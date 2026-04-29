import { describe, expect, it } from "vitest";

import { addNode, createDoc, createNode } from "@/advanced/doc/scene";
import {
  buildCodeConnectManifest,
  buildDevMcpDescriptor,
  runDevMcpTool,
} from "@/lib/dev-external";

function buildReadyDoc() {
  const doc = createDoc();
  const rootId = doc.pages[0]!.rootId;
  const node = createNode("text", {
    id: "title_a",
    name: "Hero Title",
    parentId: rootId,
    frame: { x: 24, y: 32, w: 280, h: 48, rotation: 0 },
    text: {
      value: "Ship faster",
      style: {
        fontFamily: "Space Grotesk, sans-serif",
        fontSize: 32,
        fontWeight: 700,
        lineHeight: 1.2,
        letterSpacing: 0,
        paragraphSpacing: 0,
        align: "left",
      },
    },
  });
  node.dev = {
    readyForDev: true,
    codeLinks: [
      {
        id: "link_1",
        title: "HeroTitle.tsx",
        kind: "react",
        url: "https://example.com/HeroTitle.tsx",
        exportKey: "HeroTitle",
      },
    ],
  };
  addNode(doc, node, rootId);
  return { doc, nodeId: node.id };
}

describe("dev external interop", () => {
  it("builds a code connect style manifest from ready-for-dev nodes", () => {
    const { doc, nodeId } = buildReadyDoc();
    const manifest = buildCodeConnectManifest(doc, "page_1");
    expect(manifest.pageId).toBe("page_1");
    expect(manifest.nodeCount).toBe(1);
    expect(manifest.components[0]?.nodeId).toBe(nodeId);
    expect(manifest.components[0]?.exportKeys).toEqual(["HeroTitle"]);
  });

  it("exposes MCP-style tools for listing nodes and fetching specs/codegen", () => {
    const { doc, nodeId } = buildReadyDoc();
    expect(buildDevMcpDescriptor().tools.map((tool) => tool.name)).toContain("get_node_codegen");

    const readyNodes = runDevMcpTool(doc, "page_1", "list_ready_nodes");
    expect(Array.isArray(readyNodes)).toBe(true);
    expect((readyNodes as Array<{ id: string }>)[0]?.id).toBe(nodeId);

    const spec = runDevMcpTool(doc, "page_1", "get_node_spec", { nodeId }) as { meta: { name: string } };
    expect(spec.meta.name).toBe("Hero Title");

    const codegen = runDevMcpTool(doc, "page_1", "get_node_codegen", { nodeId }) as { jsx: string };
    expect(codegen.jsx).toContain("Ship faster");
  });
});
