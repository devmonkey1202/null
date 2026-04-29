import { describe, expect, it } from "vitest";

import { addNode, createDoc, createNode, serializeDoc } from "@/advanced/doc/scene";
import { buildEditorDocOperation } from "@/lib/collab";
import {
  buildExternalCollabOperation,
  createExternalCollabAdapter,
  getRegisteredExternalCollabAdapterNames,
  pullExternalCollabDoc,
  pushExternalCollabDoc,
  registerExternalCollabAdapter,
  unregisterExternalCollabAdapter,
  type ExternalCollabEvent,
} from "@/lib/external-collab";

function buildDoc() {
  const doc = createDoc();
  const rootId = doc.pages[0]!.rootId;
  const rect = createNode("rect", {
    id: "rect_a",
    name: "Card",
    frame: { x: 20, y: 20, w: 120, h: 80, rotation: 0 },
  });
  addNode(doc, rect, rootId);
  return doc;
}

describe("external collab adapter bridge", () => {
  it("registers adapters, pushes snapshots, and pulls remote state", async () => {
    const pushed: string[] = [];
    const doc = buildDoc();
    const factoryName = "vitest-adapter";
    registerExternalCollabAdapter(factoryName, () => ({
      id: factoryName,
      async pushSnapshot(input) {
        pushed.push(input.operation.opId);
      },
      async pullSnapshot() {
        const remote = buildDoc();
        remote.nodes.rect_a!.frame = { ...remote.nodes.rect_a!.frame, x: 240 };
        return serializeDoc(remote);
      },
    }));

    try {
      expect(getRegisteredExternalCollabAdapterNames()).toContain(factoryName);
      const adapter = createExternalCollabAdapter(factoryName, { pageId: "page_1" });
      expect(adapter?.id).toBe(factoryName);

      const operation = buildEditorDocOperation({ doc });
      await pushExternalCollabDoc(adapter, "page_1", doc, operation, "local");
      expect(pushed).toEqual([operation.opId]);

      const pulled = await pullExternalCollabDoc(adapter);
      expect(pulled?.nodes.rect_a?.frame.x).toBe(240);
    } finally {
      unregisterExternalCollabAdapter(factoryName);
    }
  });

  it("converts external snapshots into recovery operations", () => {
    const doc = buildDoc();
    const event: ExternalCollabEvent = {
      adapterId: "adapter-a",
      snapshot: serializeDoc(doc),
      ts: 1234,
      opId: "external-op-1",
      source: "sync",
    };
    const operation = buildExternalCollabOperation(event);
    expect(operation.opId).toBe("external-op-1");
    expect(operation.ts).toBe(1234);
    expect(operation.senderId).toBe("external:adapter-a");
    expect(operation.source).toBe("recovery");
  });
});
