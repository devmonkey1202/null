import { describe, expect, it } from "vitest";

import type { PrototypeAction } from "../src/advanced/doc/scene";
import { cloneDoc, createDoc } from "../src/advanced/doc/scene";

describe("scene clone", () => {
  it("deep clones boolean metadata inside node shapes", () => {
    const doc = createDoc();
    const pageId = doc.pages[0]!.rootId;
    doc.nodes[pageId] = {
      ...doc.nodes[pageId]!,
      shape: {
        pathData: "M0 0L10 0L10 10Z",
        booleanMeta: {
          op: "union",
          source: "editor",
          operands: [
            {
              sourceId: "a",
              name: "A",
              type: "rect",
              pathData: "M 0 0 L 10 0 L 10 10 L 0 10 Z",
              frame: { x: 0, y: 0, w: 10, h: 10, rotation: 0 },
              fills: [{ type: "solid", color: "#ff0000", opacity: 1 }],
              vectorNetwork: {
                vertices: [
                  { id: "v0", x: 0, y: 0 },
                  { id: "v1", x: 10, y: 0 },
                  { id: "v2", x: 10, y: 10 },
                ],
                segments: [
                  { id: "s0", from: "v0", to: "v1" },
                  { id: "s1", from: "v1", to: "v2" },
                  { id: "s2", from: "v2", to: "v0" },
                ],
                paths: [
                  {
                    id: "p0",
                    vertexIds: ["v0", "v1", "v2"],
                    closed: true,
                    fills: [{ type: "solid", color: "#ff0000", opacity: 1 }],
                  },
                ],
              },
            },
          ],
        },
      },
    };

    const cloned = cloneDoc(doc);
    cloned.nodes[pageId]!.shape!.booleanMeta!.operands![0]!.name = "B";
    cloned.nodes[pageId]!.shape!.booleanMeta!.operands![0]!.frame!.x = 99;
    (cloned.nodes[pageId]!.shape!.booleanMeta!.operands![0]!.fills![0]! as { color: string }).color = "#0000ff";
    cloned.nodes[pageId]!.shape!.booleanMeta!.operands![0]!.vectorNetwork!.vertices[0]!.x = 42;

    expect(doc.nodes[pageId]!.shape!.booleanMeta!.operands![0]!.name).toBe("A");
    expect(doc.nodes[pageId]!.shape!.booleanMeta!.operands![0]!.frame!.x).toBe(0);
    expect((doc.nodes[pageId]!.shape!.booleanMeta!.operands![0]!.fills![0]! as { color: string }).color).toBe("#ff0000");
    expect(doc.nodes[pageId]!.shape!.booleanMeta!.operands![0]!.vectorNetwork!.vertices[0]!.x).toBe(0);
    expect(cloned.nodes[pageId]!.shape!.booleanMeta!.operands![0]!.name).toBe("B");
    expect(cloned.nodes[pageId]!.shape!.booleanMeta!.operands![0]!.frame!.x).toBe(99);
    expect((cloned.nodes[pageId]!.shape!.booleanMeta!.operands![0]!.fills![0]! as { color: string }).color).toBe("#0000ff");
    expect(cloned.nodes[pageId]!.shape!.booleanMeta!.operands![0]!.vectorNetwork!.vertices[0]!.x).toBe(42);
  });

  it("deep clones vector networks inside node shapes", () => {
    const doc = createDoc();
    const pageId = doc.pages[0]!.rootId;
    doc.nodes[pageId] = {
      ...doc.nodes[pageId]!,
      shape: {
        pathData: "M0 0L10 0L10 10Z",
        vectorNetwork: {
          vertices: [
            { id: "v0", x: 0, y: 0 },
            { id: "v1", x: 10, y: 0 },
            { id: "v2", x: 10, y: 10 },
          ],
          segments: [
            { id: "s0", from: "v0", to: "v1" },
            { id: "s1", from: "v1", to: "v2" },
            { id: "s2", from: "v2", to: "v0" },
          ],
          paths: [
            {
              id: "p0",
              vertexIds: ["v0", "v1", "v2"],
              closed: true,
              fills: [{ type: "solid", color: "#ff0000", opacity: 1 }],
            },
          ],
        },
      },
    };

    const cloned = cloneDoc(doc);
    cloned.nodes[pageId]!.shape!.vectorNetwork!.vertices[0]!.x = 99;
    (cloned.nodes[pageId]!.shape!.vectorNetwork!.paths[0]!.fills![0]! as { color: string }).color = "#0000ff";

    expect(doc.nodes[pageId]!.shape!.vectorNetwork!.vertices[0]!.x).toBe(0);
    expect((doc.nodes[pageId]!.shape!.vectorNetwork!.paths[0]!.fills![0]! as { color: string }).color).toBe("#ff0000");
    expect(cloned.nodes[pageId]!.shape!.vectorNetwork!.vertices[0]!.x).toBe(99);
    expect((cloned.nodes[pageId]!.shape!.vectorNetwork!.paths[0]!.fills![0]! as { color: string }).color).toBe("#0000ff");
  });

  it("deep clones instance override fields", () => {
    const doc = createDoc();
    const pageId = doc.pages[0]!.rootId;
    doc.nodes[pageId] = {
      ...doc.nodes[pageId]!,
      type: "instance",
      instanceOf: "component_a",
      variantId: "variant_a",
      layoutPositioning: "absolute",
      overrides: {
        hidden: true,
        instanceOf: "component_b",
        variantId: "variant_b",
        layoutPositioning: "absolute",
        text: {
          value: "Hello",
          style: { fontFamily: "Inter", fontSize: 16, fontWeight: 400, lineHeight: 1.4, letterSpacing: 0, align: "left" },
          wrap: true,
          autoSize: false,
          ranges: [{ start: 0, end: 5, style: { fontWeight: 700 }, fill: "#ff0000" }],
          textPath: { pathData: "M0 0 L 100 0", startOffset: 10 },
        },
      },
    };

    const cloned = cloneDoc(doc);
    cloned.nodes[pageId]!.layoutPositioning = "auto";
    cloned.nodes[pageId]!.overrides!.instanceOf = "component_c";
    cloned.nodes[pageId]!.overrides!.variantId = "variant_c";
    cloned.nodes[pageId]!.overrides!.layoutPositioning = "auto";
    cloned.nodes[pageId]!.overrides!.text!.value = "World";
    cloned.nodes[pageId]!.overrides!.text!.ranges![0]!.fill = "#0000ff";
    cloned.nodes[pageId]!.overrides!.text!.textPath!.startOffset = 25;

    expect(doc.nodes[pageId]!.layoutPositioning).toBe("absolute");
    expect(doc.nodes[pageId]!.overrides!.instanceOf).toBe("component_b");
    expect(doc.nodes[pageId]!.overrides!.variantId).toBe("variant_b");
    expect(doc.nodes[pageId]!.overrides!.layoutPositioning).toBe("absolute");
    expect(doc.nodes[pageId]!.overrides!.text!.value).toBe("Hello");
    expect(doc.nodes[pageId]!.overrides!.text!.ranges![0]!.fill).toBe("#ff0000");
    expect(doc.nodes[pageId]!.overrides!.text!.textPath!.startOffset).toBe(10);
    expect(cloned.nodes[pageId]!.layoutPositioning).toBe("auto");
    expect(cloned.nodes[pageId]!.overrides!.instanceOf).toBe("component_c");
    expect(cloned.nodes[pageId]!.overrides!.variantId).toBe("variant_c");
    expect(cloned.nodes[pageId]!.overrides!.layoutPositioning).toBe("auto");
    expect(cloned.nodes[pageId]!.overrides!.text!.value).toBe("World");
    expect(cloned.nodes[pageId]!.overrides!.text!.ranges![0]!.fill).toBe("#0000ff");
    expect(cloned.nodes[pageId]!.overrides!.text!.textPath!.startOffset).toBe(25);
  });

  it("deep clones component variants and property definitions", () => {
    const doc = createDoc();
    const pageId = doc.pages[0]!.rootId;
    doc.nodes[pageId] = {
      ...doc.nodes[pageId]!,
      type: "component",
      variants: [
        { id: "variant_a", name: "Primary", rootId: "root_a", props: { State: "Primary", Size: "M" } },
      ],
      propertyDefinitions: {
        text_a: { kind: "text", name: "Label" },
      },
    };

    const cloned = cloneDoc(doc);
    cloned.nodes[pageId]!.variants![0]!.name = "Secondary";
    cloned.nodes[pageId]!.variants![0]!.props!.State = "Secondary";
    cloned.nodes[pageId]!.propertyDefinitions!.text_a!.name = "CTA";

    expect(doc.nodes[pageId]!.variants![0]!.name).toBe("Primary");
    expect(doc.nodes[pageId]!.variants![0]!.props!.State).toBe("Primary");
    expect(doc.nodes[pageId]!.propertyDefinitions!.text_a!.name).toBe("Label");
    expect(cloned.nodes[pageId]!.variants![0]!.name).toBe("Secondary");
    expect(cloned.nodes[pageId]!.variants![0]!.props!.State).toBe("Secondary");
    expect(cloned.nodes[pageId]!.propertyDefinitions!.text_a!.name).toBe("CTA");
  });

  it("deep clones nested crop data for node media and image fills", () => {
    const doc = createDoc();
    const pageId = doc.pages[0]!.rootId;
    doc.nodes[pageId] = {
      ...doc.nodes[pageId]!,
      type: "image",
      image: {
        src: "https://example.com/image.png",
        fit: "cover",
        scale: 1.25,
        focalX: 0.7,
        focalY: 0.2,
        crop: { x: 0.1, y: 0.2, w: 0.8, h: 0.7 },
      },
      style: {
        ...doc.nodes[pageId]!.style,
        fills: [
          {
            type: "image",
            src: "https://example.com/fill.png",
            fit: "contain",
            scale: 1.4,
            focalX: 0.3,
            focalY: 0.9,
            crop: { x: 0.05, y: 0.1, w: 0.6, h: 0.5 },
          },
        ],
      },
    };

    const cloned = cloneDoc(doc);
    cloned.nodes[pageId]!.image!.crop!.x = 0.9;
    cloned.nodes[pageId]!.image!.focalX = 0.1;
    (cloned.nodes[pageId]!.style.fills[0] as { crop: { w: number }; focalY: number }).crop.w = 0.2;
    (cloned.nodes[pageId]!.style.fills[0] as { crop: { w: number }; focalY: number }).focalY = 0.1;

    expect(doc.nodes[pageId]!.image!.crop!.x).toBe(0.1);
    expect(doc.nodes[pageId]!.image!.focalX).toBe(0.7);
    expect((doc.nodes[pageId]!.style.fills[0] as { crop: { w: number }; focalY: number }).crop.w).toBe(0.6);
    expect((doc.nodes[pageId]!.style.fills[0] as { crop: { w: number }; focalY: number }).focalY).toBe(0.9);
    expect(cloned.nodes[pageId]!.image!.crop!.x).toBe(0.9);
    expect(cloned.nodes[pageId]!.image!.focalX).toBe(0.1);
    expect((cloned.nodes[pageId]!.style.fills[0] as { crop: { w: number }; focalY: number }).crop.w).toBe(0.2);
    expect((cloned.nodes[pageId]!.style.fills[0] as { crop: { w: number }; focalY: number }).focalY).toBe(0.1);
  });

  it("deep clones grid layout tracks, guide alignment, and grid child placement", () => {
    const doc = createDoc();
    const pageId = doc.pages[0]!.rootId;
    doc.nodes[pageId] = {
      ...doc.nodes[pageId]!,
      layout: {
        mode: "grid",
        columns: 2,
        rows: 2,
        columnGap: 16,
        rowGap: 12,
        padding: { t: 8, r: 8, b: 8, l: 8 },
        columnsSizing: [{ type: "fixed", value: 120 }, { type: "flex", value: 1 }],
        rowsSizing: [{ type: "hug" }, { type: "fixed", value: 64 }],
      },
      layoutGrid: [
        { type: "columns", count: 2, gutter: 16, offset: 24, alignment: "stretch", color: "#4f46e5", opacity: 0.1 },
        { type: "rows", count: 3, gutter: 12, offset: 20, alignment: "center", color: "#22c55e", opacity: 0.08 },
      ],
      gridChild: {
        row: 1,
        column: 0,
        rowSpan: 2,
        columnSpan: 1,
        horizontalAlign: "center",
        verticalAlign: "end",
      },
    };

    const cloned = cloneDoc(doc);
    const clonedNode = cloned.nodes[pageId]!;
    if (!clonedNode.layout || clonedNode.layout.mode !== "grid") throw new Error("expected grid layout");
    clonedNode.layout.columnsSizing![0]!.value = 240;
    clonedNode.layout.rowsSizing![0] = { type: "fixed", value: 40 };
    (clonedNode.layoutGrid![0]! as { alignment?: "start" | "center" | "stretch" }).alignment = "start";
    clonedNode.gridChild!.column = 1;
    clonedNode.gridChild!.horizontalAlign = "start";

    const originalNode = doc.nodes[pageId]!;
    if (!originalNode.layout || originalNode.layout.mode !== "grid") throw new Error("expected original grid layout");
    expect(originalNode.layout.mode).toBe("grid");
    expect(originalNode.layout.columnsSizing?.[0]).toEqual({ type: "fixed", value: 120 });
    expect(originalNode.layout.rowsSizing?.[0]).toEqual({ type: "hug" });
    expect(originalNode.layoutGrid?.[0]).toMatchObject({ alignment: "stretch" });
    expect(originalNode.gridChild).toMatchObject({ column: 0, horizontalAlign: "center" });
    expect(clonedNode.layout.columnsSizing?.[0]).toEqual({ type: "fixed", value: 240 });
    expect(clonedNode.layout.rowsSizing?.[0]).toEqual({ type: "fixed", value: 40 });
    expect(clonedNode.layoutGrid?.[0]).toMatchObject({ alignment: "start" });
    expect(clonedNode.gridChild).toMatchObject({ column: 1, horizontalAlign: "start" });
  });

  it("deep clones service bindings on nodes, data bindings, and prototype actions", () => {
    const doc = createDoc();
    const pageId = doc.pages[0]!.rootId;
    doc.nodes[pageId] = {
      ...doc.nodes[pageId]!,
      service: {
        field: {
          key: "reservation.notes",
          valueType: "message",
          required: true,
          fallbackValue: { draft: true },
        },
        dataSource: {
          source: "reservations.list",
          fields: ["id", "title"],
          filters: [{ field: "status", op: "eq", value: "requested" }],
          search: { q: "desk", fields: ["title"] },
          params: { limit: 10 },
        },
        stateTransition: {
          machine: "reservation",
          to: "confirmed",
          from: ["requested"],
          recordIdField: "reservationId",
        },
      },
      data: {
        type: "service",
        source: "tickets.list",
        fields: ["id", "title"],
        filters: [{ field: "status", op: "eq", value: "open" }],
        search: { q: "vip", fields: ["title"] },
        params: { queueId: "queue_1" },
      },
      prototype: {
        interactions: [
          {
            id: "service-int",
            trigger: "click",
            action: {
              type: "service",
              action: "document.decide",
              bindings: [{ target: "documentId", source: "field", fieldKey: "documentId", required: true }],
              dataSource: { source: "documents.list", fields: ["id"] },
              stateTransition: {
                machine: "document",
                to: "approved",
                from: ["pending"],
                recordIdField: "documentId",
              },
            },
          },
        ],
      },
    };

    const cloned = cloneDoc(doc);
    cloned.nodes[pageId]!.service!.field!.key = "ticket.body";
    (cloned.nodes[pageId]!.service!.field!.fallbackValue as { draft: boolean }).draft = false;
    cloned.nodes[pageId]!.service!.dataSource!.fields![0] = "status";
    cloned.nodes[pageId]!.service!.stateTransition!.to = "completed";
    (cloned.nodes[pageId]!.data as { fields: string[] }).fields[0] = "status";
    (
      cloned.nodes[pageId]!.prototype!.interactions[0]!.action as Extract<PrototypeAction, { type: "service" }>
    ).bindings![0]!.target = "status";

    expect(doc.nodes[pageId]!.service!.field!.key).toBe("reservation.notes");
    expect((doc.nodes[pageId]!.service!.field!.fallbackValue as { draft: boolean }).draft).toBe(true);
    expect(doc.nodes[pageId]!.service!.dataSource!.fields![0]).toBe("id");
    expect(doc.nodes[pageId]!.service!.stateTransition!.to).toBe("confirmed");
    expect((doc.nodes[pageId]!.data as { fields: string[] }).fields[0]).toBe("id");
    expect(
      (doc.nodes[pageId]!.prototype!.interactions[0]!.action as Extract<PrototypeAction, { type: "service" }>).bindings![0]!.target,
    ).toBe("documentId");
  });
});
