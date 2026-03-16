import { describe, expect, it } from "vitest";
import { buildBindingDecision } from "../src/advanced/runtime/data-binding";

const baseBinding = {
  type: "collection" as const,
  collectionId: "posts",
  mode: "list" as const,
};

describe("data binding decision", () => {
  it("uses list mode for allowed orderBy without filters/search", () => {
    const decision = buildBindingDecision({
      ...baseBinding,
      limit: 20,
      offset: 0,
      orderBy: "created_at",
      orderDir: "asc",
    });
    expect(decision.mode).toBe("list");
    if (decision.mode !== "list") throw new Error("expected list mode");
    expect(decision.params.get("limit")).toBe("20");
    expect(decision.params.get("offset")).toBe("0");
    expect(decision.params.get("orderBy")).toBe("created_at");
    expect(decision.params.get("orderDir")).toBe("asc");
  });

  it("uses query mode when orderBy is custom", () => {
    const decision = buildBindingDecision({
      ...baseBinding,
      orderBy: "price",
    });
    expect(decision.mode).toBe("query");
    if (decision.mode !== "query") throw new Error("expected query mode");
    expect(decision.payload.orderBy).toBe("price");
  });

  it("normalizes in/notIn filters from comma-separated input", () => {
    const decision = buildBindingDecision({
      ...baseBinding,
      filters: [{ field: "tag", op: "in", value: "red, blue" }],
    });
    expect(decision.mode).toBe("query");
    if (decision.mode !== "query") throw new Error("expected query mode");
    expect(decision.payload.filters?.[0].value).toEqual(["red", "blue"]);
  });

  it("applies override paging values", () => {
    const decision = buildBindingDecision({
      ...baseBinding,
      limit: 10,
      offset: 0,
    }, { limit: 5, page: 3 });
    expect(decision.mode).toBe("list");
    if (decision.mode !== "list") throw new Error("expected list mode");
    expect(decision.params.get("limit")).toBe("5");
    expect(decision.params.get("offset")).toBe("10");
  });
});
