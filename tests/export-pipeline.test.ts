import { describe, expect, it } from "vitest";

import { addNode, createDoc, createNode } from "../src/advanced/doc/scene";
import { buildNodeBatchExportQueue, buildScopedExportBaseName } from "../src/advanced/ui/exportPipeline";

describe("export pipeline", () => {
  it("builds deterministic scoped export names", () => {
    const doc = createDoc();
    doc.pages[0]!.name = "Landing";
    const button = createNode("rect", { name: "CTA Button" });
    addNode(doc, button, doc.pages[0]!.rootId);

    expect(buildScopedExportBaseName({ doc, title: "Marketing", scope: "document" })).toBe("Marketing");
    expect(buildScopedExportBaseName({ doc, title: "Marketing", scope: "page", pageId: doc.pages[0]!.id })).toBe("Marketing-Landing");
    expect(buildScopedExportBaseName({ doc, title: "Marketing", scope: "selection", selectionIds: [button.id] })).toBe("Marketing-CTA Button");
  });

  it("builds unique batch export jobs from node export settings", () => {
    const doc = createDoc();
    doc.pages[0]!.name = "Home";
    const cardA = createNode("rect", {
      name: "Card",
      exportSettings: [{ format: "png", scale: 2 }],
    });
    const cardB = createNode("rect", {
      name: "Card",
      exportSettings: [{ format: "png", scale: 2 }, { format: "svg", scale: 1 }],
    });

    addNode(doc, cardA, doc.pages[0]!.rootId);
    addNode(doc, cardB, doc.pages[0]!.rootId);

    const jobs = buildNodeBatchExportQueue(doc, [cardA.id, cardB.id], "Marketing");

    expect(jobs.map((job) => job.fileName)).toEqual([
      "Marketing-Home-Card-2x.png",
      "Marketing-Home-Card-2x-2.png",
      "Marketing-Home-Card-1x.svg",
    ]);
    expect(jobs[0]?.pathLabel).toContain("Card");
    expect(jobs[1]?.pageName).toBe("Home");
  });
});
