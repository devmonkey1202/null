import { describe, expect, it } from "vitest";

import {
  findDuplicateComponentPropertyNames,
  getUniqueComponentPropertyName,
  isComponentPropertyKindCompatible,
  upsertComponentPropertyDefinition,
} from "../src/advanced/ui/componentProperties";

describe("component properties", () => {
  it("keeps kind compatibility aligned with the target node type", () => {
    expect(isComponentPropertyKindCompatible("text", "text")).toBe(true);
    expect(isComponentPropertyKindCompatible("instance", "instance")).toBe(true);
    expect(isComponentPropertyKindCompatible("rect", "boolean")).toBe(true);
    expect(isComponentPropertyKindCompatible("rect", "text")).toBe(false);
    expect(isComponentPropertyKindCompatible("text", "instance")).toBe(false);
  });

  it("normalizes unique property names and detects duplicates", () => {
    const definitions = {
      title: { kind: "text" as const, name: "Label" },
      title_copy: { kind: "text" as const, name: "Label" },
    };

    expect(findDuplicateComponentPropertyNames(definitions)).toEqual(["label"]);
    expect(getUniqueComponentPropertyName(definitions, "cta", "Label", "CTA")).toBe("Label 2");
  });

  it("upserts and removes component property definitions safely", () => {
    const first = upsertComponentPropertyDefinition(undefined, "node_a", { kind: "text", name: "" }, "Title");
    const second = upsertComponentPropertyDefinition(first, "node_b", { kind: "text", name: "Title" }, "Badge");
    const removed = upsertComponentPropertyDefinition(second, "node_a", null, "Title");

    expect(first).toEqual({
      node_a: { kind: "text", name: "Title" },
    });
    expect(second).toEqual({
      node_a: { kind: "text", name: "Title" },
      node_b: { kind: "text", name: "Title 2" },
    });
    expect(removed).toEqual({
      node_b: { kind: "text", name: "Title 2" },
    });
  });
});
