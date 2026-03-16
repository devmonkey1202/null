import { describe, expect, it } from "vitest";

import { addNode, cloneDoc, createDoc, createNode } from "@/advanced/doc/scene";
import {
  applyEditorDocOperation,
  buildEditorDocOperation,
  getLatestEditorDocOperation,
  rememberEditorDocOperation,
} from "@/lib/collab";

function buildGridDoc(count: number) {
  const doc = createDoc();
  const rootId = doc.pages[0].rootId;
  const ids: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const node = createNode("rect", {
      frame: {
        x: (index % 25) * 28,
        y: Math.floor(index / 25) * 28,
        w: 24,
        h: 24,
        rotation: 0,
      },
      name: `Node ${index}`,
    });
    addNode(doc, node, rootId);
    ids.push(node.id);
  }
  return { doc, rootId, ids };
}

describe("collab long-session soak", () => {
  it("keeps merge/recovery state stable across hundreds of remote snapshot operations", () => {
    const { doc: initialDoc, rootId, ids } = buildGridDoc(180);
    let local = cloneDoc(initialDoc);
    let history = [] as ReturnType<typeof rememberEditorDocOperation>;

    for (let index = 0; index < 320; index += 1) {
      const remote = cloneDoc(local);
      const targetId = ids[index % ids.length];
      const target = remote.nodes[targetId];
      if (target) {
        target.frame = {
          ...target.frame,
          x: target.frame.x + 3,
          y: target.frame.y + 1,
        };
      }

      const deletedNodeIds: string[] = [];
      if (index % 41 === 0 && index > 0) {
        const deleteId = ids[(index / 41) % ids.length | 0];
        delete remote.nodes[deleteId];
        deletedNodeIds.push(deleteId);
      }

      if (index % 64 === 0) {
        const extra = createNode("ellipse", {
          frame: { x: 720 + index, y: 36 + index, w: 18, h: 18, rotation: 0 },
          name: `Remote ${index}`,
        });
        addNode(remote, extra, rootId);
      }

      const operation = buildEditorDocOperation({
        doc: remote,
        ts: index + 1,
        opId: `soak-${index}`,
        deletedNodeIds,
      });
      history = rememberEditorDocOperation(history, operation, 96);
      const merged = applyEditorDocOperation(local, operation, { preferLocal: index % 7 === 0 });
      local = merged.doc;
    }

    expect(history).toHaveLength(96);
    expect(getLatestEditorDocOperation(history)?.opId).toBe("soak-319");
    expect(Object.keys(local.nodes).length).toBeGreaterThan(140);
    expect(Object.values(local.nodes).every((node) => Number.isFinite(node.frame.x) && Number.isFinite(node.frame.y))).toBe(true);
  });
});
