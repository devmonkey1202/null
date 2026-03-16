import { describe, expect, it } from "vitest";

import { buildDevCodegenBundle } from "../src/advanced/ui/devCodegen";

describe("dev codegen", () => {
  it("builds react style, jsx, and tailwind snippets from a handoff payload", () => {
    const bundle = buildDevCodegenBundle({
      meta: { name: "Hero Title", type: "text" },
      frame: { x: 24, y: 48, w: 320, h: 80 },
      style: {
        fill: "#111111",
        stroke: { color: "#222222", width: 1 },
        opacity: 0.9,
        radius: 12,
        blendMode: "multiply",
      },
      text: {
        value: "Launch faster",
        style: {
          fontFamily: "Pretendard",
          fontSize: 32,
          fontWeight: 700,
          lineHeight: 40,
          letterSpacing: -0.5,
          align: "center",
          fontVariationSettings: "\"wght\" 700",
        },
      },
      tokens: {
        activeMode: "Dark",
        fillStyle: "Text/Primary",
        fillVariable: "color/text/primary",
      },
      handoff: {
        readyForDev: true,
        codeLinks: [{ title: "HeroTitle.tsx", kind: "react", url: "https://example.com/HeroTitle.tsx" }],
      },
    });

    expect(bundle.reactStyle).toContain('const nodeStyle = {');
    expect(bundle.reactStyle).toContain('fontKerning: "normal"');
    expect(bundle.jsx).toContain("// active mode: Dark");
    expect(bundle.jsx).toContain("// ready for dev: true");
    expect(bundle.jsx).toContain("// react: HeroTitle.tsx https://example.com/HeroTitle.tsx");
    expect(bundle.jsx).toContain("<p style={nodeStyle}>Launch faster</p>");
    expect(bundle.tailwind).toContain('className="absolute');
    expect(bundle.tailwind).toContain("w-[320px]");
    expect(bundle.tailwind).toContain("// fill style: Text/Primary");
    expect(bundle.tailwind).toContain("// ready for dev: true");
  });
});
