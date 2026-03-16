// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";

import RuntimeRenderer from "@/advanced/runtime/renderer";
import { buildRepresentativeFixtureDoc, REPRESENTATIVE_FIXTURE_IDS, type FixtureId } from "./figma-fixtures";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function normalizeTextContent(value: string | null) {
  const normalized = value?.replace(/\s+/g, " ").trim() ?? "";
  return normalized || undefined;
}

async function collectRendererFixtureSnapshot(fixtureId: FixtureId) {
  const doc = buildRepresentativeFixtureDoc(fixtureId);
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  try {
    await act(async () => {
      root.render(<RuntimeRenderer doc={doc} />);
    });

    const svg = container.querySelector("svg");
    if (!svg) throw new Error(`renderer did not mount for fixture ${fixtureId}`);

    return {
      tagCounts: {
        path: svg.querySelectorAll("path").length,
        rect: svg.querySelectorAll("rect").length,
        text: svg.querySelectorAll("text").length,
        foreignObject: svg.querySelectorAll("foreignObject").length,
        image: svg.querySelectorAll("image").length,
      },
      nodeOrder: Array.from(svg.querySelectorAll("[data-node-id]")).map((element) => ({
        childTags: Array.from(element.children).map((child) => child.tagName.toLowerCase()),
        text: normalizeTextContent(element.textContent),
      })),
    };
  } finally {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  }
}

describe("runtime renderer representative fixtures", () => {
  it.each(REPRESENTATIVE_FIXTURE_IDS)("keeps rendered output stable for %s", async (fixtureId) => {
    expect(await collectRendererFixtureSnapshot(fixtureId)).toMatchSnapshot();
  });
});
