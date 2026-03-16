import { describe, expect, it } from "vitest";

import { exportTokenBundle, importTokenBundleIntoDoc } from "../src/advanced/ui/tokenRoundtrip";
import { collectDocParitySnapshot, roundtripDocThroughSerialize } from "./doc-parity";
import { buildRepresentativeFixtureDoc, buildTokenFixtureDoc, REPRESENTATIVE_FIXTURE_IDS } from "./figma-fixtures";

describe("doc parity fixtures", () => {
  it("keeps representative fixtures stable through serialize/hydrate roundtrip", () => {
    for (const fixtureId of REPRESENTATIVE_FIXTURE_IDS) {
      const doc = buildRepresentativeFixtureDoc(fixtureId);
      expect(collectDocParitySnapshot(roundtripDocThroughSerialize(doc))).toEqual(collectDocParitySnapshot(doc));
    }
  });

  it("keeps token fixture refs stable across export/import roundtrip", () => {
    const doc = buildTokenFixtureDoc();
    const bundle = exportTokenBundle(doc);
    const next = importTokenBundleIntoDoc(doc, bundle, "replace");

    expect(collectDocParitySnapshot(next)).toEqual(collectDocParitySnapshot(doc));
  });
});
