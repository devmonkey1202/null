import { describe, expect, it } from "vitest";

import type { ComponentVariant } from "../src/advanced/doc/scene";
import {
  addVariantAxis,
  analyzeVariantMatrix,
  buildVariantPropsTemplate,
  findVariantByProps,
  formatVariantProps,
  getVariantAxes,
  getVariantProps,
  planMissingVariantFill,
  removeVariantAxis,
  setVariantProp,
} from "../src/advanced/ui/componentVariants";

const VARIANTS: ComponentVariant[] = [
  { id: "v_default", name: "Default", rootId: "root_default", props: { State: "Default", Theme: "Light" } },
  { id: "v_hover", name: "Hover", rootId: "root_hover", props: { State: "Hover", Theme: "Light" } },
  { id: "v_dark", name: "Dark", rootId: "root_dark", props: { State: "Default", Theme: "Dark" } },
];

describe("component variants", () => {
  it("formats and clones variant props safely", () => {
    const variantProps = getVariantProps(VARIANTS[0]);
    variantProps.State = "Mutated";

    expect(formatVariantProps(VARIANTS[0]?.props)).toBe("State=Default, Theme=Light");
    expect(VARIANTS[0]?.props?.State).toBe("Default");
  });

  it("derives sorted variant axes and values", () => {
    expect(getVariantAxes(VARIANTS)).toEqual([
      { key: "State", values: ["Default", "Hover"] },
      { key: "Theme", values: ["Dark", "Light"] },
    ]);
  });

  it("builds a new variant props template from existing axes", () => {
    expect(buildVariantPropsTemplate(VARIANTS)).toEqual({
      State: "Default",
      Theme: "Dark",
    });
  });

  it("sets and removes variant props without mutating the source variant", () => {
    const updated = setVariantProp(VARIANTS[0]!, "State", "Pressed");
    const removed = setVariantProp(updated, "Theme", "");

    expect(updated.props).toEqual({
      State: "Pressed",
      Theme: "Light",
    });
    expect(removed.props).toEqual({
      State: "Pressed",
    });
    expect(VARIANTS[0]?.props).toEqual({
      State: "Default",
      Theme: "Light",
    });
  });

  it("adds and removes a variant axis across the whole set", () => {
    const withAxis = addVariantAxis(VARIANTS, "Size", "M");
    const withoutAxis = removeVariantAxis(withAxis, "Theme");

    expect(withAxis.map((variant) => variant.props)).toEqual([
      { State: "Default", Theme: "Light", Size: "M" },
      { State: "Hover", Theme: "Light", Size: "M" },
      { State: "Default", Theme: "Dark", Size: "M" },
    ]);
    expect(withoutAxis.map((variant) => variant.props)).toEqual([
      { State: "Default", Size: "M" },
      { State: "Hover", Size: "M" },
      { State: "Default", Size: "M" },
    ]);
  });

  it("finds the best variant by axis/value props with fallback", () => {
    expect(findVariantByProps(VARIANTS, { State: "Hover", Theme: "Light" })?.id).toBe("v_hover");
    expect(findVariantByProps(VARIANTS, { State: "Hover", Theme: "Dark" }, "v_dark")?.id).toBe("v_dark");
    expect(findVariantByProps(VARIANTS, {}, "v_hover")?.id).toBe("v_hover");
  });

  it("reports duplicate and missing variant matrix combinations", () => {
    const report = analyzeVariantMatrix([
      { id: "v_a", name: "A", rootId: "root_a", props: { State: "Default", Theme: "Light" } },
      { id: "v_b", name: "B", rootId: "root_b", props: { State: "Default", Theme: "Light" } },
      { id: "v_c", name: "C", rootId: "root_c", props: { State: "Hover", Theme: "Dark" } },
    ]);

    expect(report.totalExpected).toBe(4);
    expect(report.duplicates).toEqual([
      {
        props: { State: "Default", Theme: "Light" },
        variantIds: ["v_a", "v_b"],
      },
    ]);
    expect(report.missing).toEqual([
      { State: "Default", Theme: "Dark" },
      { State: "Hover", Theme: "Light" },
    ]);
    expect(report.complete).toBe(false);
  });

  it("plans missing variant fills from the current matrix", () => {
    const plans = planMissingVariantFill([
      { id: "v_default", name: "Default", rootId: "root_default", props: { State: "Default", Theme: "Light" } },
      { id: "v_hover", name: "Hover", rootId: "root_hover", props: { State: "Hover", Theme: "Light" } },
      { id: "v_dark", name: "Dark", rootId: "root_dark", props: { State: "Default", Theme: "Dark" } },
    ]);

    expect(plans).toEqual([
      {
        name: "State=Hover, Theme=Dark",
        props: { State: "Hover", Theme: "Dark" },
        sourceVariantId: "v_hover",
      },
    ]);
  });
});
