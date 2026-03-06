import { describe, expect, it } from "vitest";
import { validateRecordData, type AppFieldDef } from "../src/lib/app-data";

describe("app data validation", () => {
  it("enforces required fields and applies defaults on create", () => {
    const fields: AppFieldDef[] = [
      { name: "title", type: "string", required: true },
      { name: "count", type: "number", default: 1 },
    ];

    const result = validateRecordData(fields, {}, { mode: "create", strict: true });
    expect(result.data.count).toBe(1);
    expect(result.errors.some((e) => e.field === "title" && e.code === "required")).toBe(true);
  });

  it("validates string constraints (min/max/pattern/enum)", () => {
    const fields: AppFieldDef[] = [
      { name: "slug", type: "string", minLength: 3, maxLength: 8, pattern: "^[a-z]+$", enum: ["alpha"] },
    ];

    const tooShort = validateRecordData(fields, { slug: "ab" }, { mode: "create" });
    expect(tooShort.errors.some((e) => e.code === "min_length")).toBe(true);

    const tooLong = validateRecordData(fields, { slug: "toolongvalue" }, { mode: "create" });
    expect(tooLong.errors.some((e) => e.code === "max_length")).toBe(true);

    const patternFail = validateRecordData(fields, { slug: "Alpha1" }, { mode: "create" });
    expect(patternFail.errors.some((e) => e.code === "pattern")).toBe(true);

    const enumFail = validateRecordData(fields, { slug: "beta" }, { mode: "create" });
    expect(enumFail.errors.some((e) => e.code === "enum")).toBe(true);

    const ok = validateRecordData(fields, { slug: "alpha" }, { mode: "create" });
    expect(ok.errors.length).toBe(0);
    expect(ok.data.slug).toBe("alpha");
  });

  it("validates number/date/boolean types and strict mode", () => {
    const fields: AppFieldDef[] = [
      { name: "age", type: "number", min: 1, max: 120 },
      { name: "active", type: "boolean" },
      { name: "joined", type: "date" },
    ];

    const bad = validateRecordData(
      fields,
      { age: "0", active: "no", joined: "invalid", extra: "x" },
      { mode: "create", strict: true }
    );
    expect(bad.errors.some((e) => e.field === "age" && e.code === "min")).toBe(true);
    expect(bad.errors.some((e) => e.field === "active" && e.code === "type")).toBe(true);
    expect(bad.errors.some((e) => e.field === "joined" && e.code === "type")).toBe(true);
    expect(bad.errors.some((e) => e.code === "unknown_field")).toBe(true);

    const ok = validateRecordData(
      fields,
      { age: "42", active: "true", joined: "2025-01-01T00:00:00Z" },
      { mode: "create", strict: true }
    );
    expect(ok.errors.length).toBe(0);
    expect(ok.data.age).toBe(42);
    expect(ok.data.active).toBe(true);
    expect(typeof ok.data.joined).toBe("string");
  });
});
