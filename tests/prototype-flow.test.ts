import { describe, expect, it } from "vitest";

import { addNode, createDoc, createNode } from "../src/advanced/doc/scene";
import { buildPrototypeFlow, diagnosePrototypeInteraction, summarizePrototypeAction } from "../src/advanced/prototype/prototypeFlow";

describe("prototype flow", () => {
  it("builds readable action labels and smart animate diagnostics", () => {
    const doc = createDoc();
    const pageA = doc.pages[0]!;
    const pageBId = "page_B";
    doc.pages.push({ id: pageBId, name: "Page B", rootId: pageBId });
    const pageBRoot = createNode("frame", { id: pageBId, name: "Page B Root", parentId: doc.root, frame: { x: 0, y: 0, w: 400, h: 400, rotation: 0 } });
    doc.nodes[pageBId] = pageBRoot;
    doc.nodes[doc.root].children.push(pageBId);

    const sourceA = createNode("rect", { sourceId: "hero_card", frame: { x: 20, y: 20, w: 160, h: 96, rotation: 0 } });
    const sourceB = createNode("rect", { sourceId: "hero_card", frame: { x: 80, y: 60, w: 200, h: 120, rotation: 0 } });
    addNode(doc, sourceA, pageA.rootId);
    addNode(doc, sourceB, pageBId);

    const trigger = createNode("rect", {
      name: "CTA",
      prototype: {
        interactions: [
          {
            id: "nav_1",
            trigger: "click",
            action: {
              type: "navigate",
              targetPageId: pageBId,
              transition: { type: "smart", duration: 320, easing: "ease-out" },
            },
          },
        ],
      },
    });
    addNode(doc, trigger, pageA.rootId);

    expect(summarizePrototypeAction(doc, pageA.id, trigger.prototype!.interactions[0]!.action)).toBe("navigate -> Page B");

    const diagnostics = diagnosePrototypeInteraction(doc, pageA.id, trigger.id, trigger.prototype!.interactions[0]!);
    expect(diagnostics.some((issue) => issue.message === "smart matches 1")).toBe(true);

    const flow = buildPrototypeFlow(doc);
    expect(flow).toHaveLength(1);
    expect(flow[0]!.items[0]!.actionLabel).toBe("navigate -> Page B");
  });

  it("reports missing targets and variables as warnings", () => {
    const doc = createDoc();
    const node = createNode("rect", {
      prototype: {
        interactions: [
          {
            id: "bad_overlay",
            trigger: "click",
            action: { type: "overlay", targetPageId: "missing_page" },
          },
          {
            id: "bad_var",
            trigger: "click",
            action: { type: "setVariable", variableId: "missing_var", value: true },
          },
        ],
      },
    });
    addNode(doc, node, doc.pages[0]!.rootId);

    const overlayIssues = diagnosePrototypeInteraction(doc, doc.pages[0]!.id, node.id, node.prototype!.interactions[0]!);
    const variableIssues = diagnosePrototypeInteraction(doc, doc.pages[0]!.id, node.id, node.prototype!.interactions[1]!);

    expect(overlayIssues.some((issue) => issue.message === "target page missing")).toBe(true);
    expect(variableIssues.some((issue) => issue.message === "target variable missing")).toBe(true);
  });
});
