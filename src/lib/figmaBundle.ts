import { Buffer } from "node:buffer";
import { gunzipSync, gzipSync, inflateRawSync } from "node:zlib";

import { hydrateDoc, serializeDoc, type Doc, type SerializableDoc } from "@/advanced/doc/scene";
import type { FigmaFileResponse, FigmaLocalVariablesResponse } from "./figma";
import { tryParseDirectFigBinary, tryWriteDirectFigBinary } from "./directFigBinary";
import { figmaNodesToNullDoc } from "./figmaToNull";
import { nullDocToFigmaPayload, type NullToFigmaExportPayload } from "./nullToFigma";
import { buildZip } from "./zip";

export type FigmaCompatibilitySeverity = "info" | "warn" | "error";

export type FigmaCompatibilityIssue = {
  severity: FigmaCompatibilitySeverity;
  code: string;
  message: string;
  nodeId?: string;
};

export type FigmaCompatibilityReport = {
  generatedAt: string;
  summary: {
    errors: number;
    warnings: number;
    infos: number;
  };
  issues: FigmaCompatibilityIssue[];
};

export type DirectFigmaBundle = {
  kind: "null_figma_bundle";
  version: 1;
  format: "figma-rest-bundle";
  exportedAt: string;
  payload: NullToFigmaExportPayload;
  compatibilityReport: FigmaCompatibilityReport;
  fidelityReport: DirectFigmaFidelityReport;
};

export type DirectFigmaSourceEncoding = "object" | "json" | "gzip" | "base64-gzip" | "zip" | "binary" | "text";

export type DirectFigmaSourceKind =
  | "null-bundle"
  | "null-package"
  | "figma-rest-payload"
  | "figma-rest-file"
  | "figma-rest-package"
  | "unknown-binary"
  | "unknown-text";

export type DirectFigmaSourceDescriptor = {
  kind: DirectFigmaSourceKind;
  encoding: DirectFigmaSourceEncoding;
  binary: boolean;
  compressed: boolean;
  byteLength?: number;
  adapter?: string;
  warnings: string[];
};

export type DirectFigmaImportResult = {
  doc: SerializableDoc;
  descriptor: DirectFigmaSourceDescriptor;
  compatibilityReport?: FigmaCompatibilityReport;
  fidelityReport?: DirectFigmaFidelityReport;
};

export type DirectFigmaPackageManifest = {
  kind: "null_fig_package";
  version: 1;
  format: "figma-rest-package";
  exportedAt: string;
};

export type DirectFigmaFidelityCategory = {
  before: number;
  after: number;
  delta: number;
};

export type DirectFigmaFidelityReport = {
  components: DirectFigmaFidelityCategory;
  styles: DirectFigmaFidelityCategory;
  variables: DirectFigmaFidelityCategory;
  prototypeInteractions: DirectFigmaFidelityCategory;
  pages: DirectFigmaFidelityCategory;
  changedNodeIds: string[];
};

function buildReportSummary(issues: FigmaCompatibilityIssue[]) {
  return {
    errors: issues.filter((issue) => issue.severity === "error").length,
    warnings: issues.filter((issue) => issue.severity === "warn").length,
    infos: issues.filter((issue) => issue.severity === "info").length,
  };
}

export function buildFigmaCompatibilityReport(doc: Doc, payload: NullToFigmaExportPayload): FigmaCompatibilityReport {
  const issues: FigmaCompatibilityIssue[] = [];
  const exportedNodes = Object.values(doc.nodes);
  const metadataNodes = exportedNodes.filter(
    (node) =>
      node.dev ||
      node.widget ||
      node.sourceLibraryId ||
      node.sourceVersionId ||
      node.publishedKey ||
      node.instanceLibraryId ||
      node.sourceId,
  );

  metadataNodes.forEach((node) => {
    issues.push({
      severity: node.widget || node.dev ? "warn" : "info",
      code: node.widget || node.dev ? "shared-metadata-preserved" : "reference-metadata-preserved",
      message: node.widget || node.dev ? "Extended node metadata is preserved through sharedPluginData.NULL.meta." : "Library/source metadata is preserved through sharedPluginData.NULL.meta.",
      nodeId: node.id,
    });
  });

  issues.push({
    severity: "info",
    code: "style-export-count",
    message: `Exported ${Object.keys(payload.file.styles ?? {}).length} shared styles.`,
  });
  issues.push({
    severity: "info",
    code: "variable-export-count",
    message: `Exported ${Object.keys(payload.localVariables.meta?.variables ?? {}).length} local variables.`,
  });
  issues.push({
    severity: "info",
    code: "component-export-count",
    message: `Exported ${Object.keys(payload.file.components ?? {}).length} components.`,
  });

  return {
    generatedAt: new Date().toISOString(),
    summary: buildReportSummary(issues),
    issues,
  };
}

function countPrototypeInteractions(doc: Doc) {
  return Object.values(doc.nodes).reduce((count, node) => count + (node.prototype?.interactions?.length ?? 0), 0);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isDirectFigmaBundle(value: unknown): value is DirectFigmaBundle {
  return isRecord(value) && value.kind === "null_figma_bundle" && value.version === 1;
}

function isDirectFigmaPackageManifest(value: unknown): value is DirectFigmaPackageManifest {
  return isRecord(value) && value.kind === "null_fig_package" && value.version === 1;
}

function isFigmaFileResponse(value: unknown): value is FigmaFileResponse {
  return (
    isRecord(value) &&
    typeof value.name === "string" &&
    isRecord(value.document) &&
    value.document.type === "DOCUMENT" &&
    Array.isArray((value.document as { children?: unknown }).children)
  );
}

function isFigmaLocalVariablesResponse(value: unknown): value is FigmaLocalVariablesResponse {
  return isRecord(value);
}

function isNullToFigmaExportPayload(value: unknown): value is NullToFigmaExportPayload {
  return isRecord(value) && isFigmaFileResponse(value.file) && (!("localVariables" in value) || isFigmaLocalVariablesResponse(value.localVariables));
}

function createEmptyLocalVariables(): FigmaLocalVariablesResponse {
  return {
    meta: {
      variableCollections: {},
      variables: {},
    },
  };
}

function buildSerializableDocFromPayload(payload: NullToFigmaExportPayload, sourceLabel: string): SerializableDoc {
  return figmaNodesToNullDoc(sourceLabel, payload.file.document, {
    fileName: payload.file.name,
    figmaStyles: payload.file.styles,
    figmaVariableCollections: payload.localVariables.meta?.variableCollections,
    figmaVariables: payload.localVariables.meta?.variables,
  });
}

function normalizePayloadLike(
  value: unknown,
): { kind: "figma-rest-payload" | "figma-rest-file"; payload: NullToFigmaExportPayload } | null {
  if (isNullToFigmaExportPayload(value)) {
    return {
      kind: "figma-rest-payload",
      payload: {
        file: value.file,
        localVariables: value.localVariables ?? createEmptyLocalVariables(),
      },
    };
  }
  if (isFigmaFileResponse(value)) {
    return {
      kind: "figma-rest-file",
      payload: {
        file: value,
        localVariables: createEmptyLocalVariables(),
      },
    };
  }
  return null;
}

type ParsedDirectFigmaSource =
  | { descriptor: DirectFigmaSourceDescriptor; bundle: DirectFigmaBundle; payload?: undefined }
  | { descriptor: DirectFigmaSourceDescriptor; payload: NullToFigmaExportPayload; bundle?: undefined }
  | { descriptor: DirectFigmaSourceDescriptor; payload?: undefined; bundle?: undefined };

function normalizeParsedSource(
  parsed: unknown,
  descriptorBase: Omit<DirectFigmaSourceDescriptor, "kind" | "warnings">,
): ParsedDirectFigmaSource {
  if (isDirectFigmaBundle(parsed)) {
    return {
      descriptor: {
        ...descriptorBase,
        kind: "null-bundle",
        warnings: [],
      },
      bundle: parsed,
    };
  }
  const normalizedPayload = normalizePayloadLike(parsed);
  if (normalizedPayload) {
    return {
      descriptor: {
        ...descriptorBase,
        kind: normalizedPayload.kind,
        warnings: [],
      },
      payload: normalizedPayload.payload,
    };
  }
  throw new Error("invalid_figma_source");
}

function tryGunzipToText(buffer: Buffer) {
  try {
    return gunzipSync(buffer).toString("utf8");
  } catch {
    return null;
  }
}

function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function isZipBuffer(buffer: Buffer) {
  return buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04;
}

function parseZipEntries(buffer: Buffer) {
  const entries = new Map<string, Buffer>();
  let offset = 0;
  while (offset + 30 <= buffer.length) {
    const signature = buffer.readUInt32LE(offset);
    if (signature !== 0x04034b50) break;
    const compression = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const fileNameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const dataStart = nameStart + fileNameLength + extraLength;
    const name = buffer.slice(nameStart, nameStart + fileNameLength).toString("utf8");
    const compressedData = buffer.slice(dataStart, dataStart + compressedSize);
    const normalizedName = name.replace(/\\/g, "/");
    const data =
      compression === 0
        ? compressedData
        : compression === 8
          ? inflateRawSync(compressedData)
          : (() => {
              throw new Error(`unsupported_zip_method:${compression}`);
            })();
    if (!normalizedName.endsWith("/")) {
      entries.set(normalizedName, data);
    }
    offset = dataStart + compressedSize;
  }
  return entries;
}

function parseZipPackage(buffer: Buffer): ParsedDirectFigmaSource {
  const entries = parseZipEntries(buffer);
  const readJsonEntry = (path: string) => {
    const entry = entries.get(path);
    return entry ? tryParseJson(entry.toString("utf8")) : null;
  };
  const bundle = readJsonEntry("bundle.json");
  if (isDirectFigmaBundle(bundle)) {
    return {
      descriptor: {
        kind: "null-package",
        encoding: "zip",
        binary: true,
        compressed: false,
        byteLength: buffer.length,
        warnings: [],
      },
      bundle,
    };
  }

  const manifest = readJsonEntry("manifest.json");
  const file = readJsonEntry("file.json");
  const localVariables = readJsonEntry("localVariables.json");
  if (isDirectFigmaPackageManifest(manifest) && isFigmaFileResponse(file)) {
    return {
      descriptor: {
        kind: "figma-rest-package",
        encoding: "zip",
        binary: true,
        compressed: false,
        byteLength: buffer.length,
        warnings: [],
      },
      payload: {
        file,
        localVariables: isFigmaLocalVariablesResponse(localVariables) ? localVariables : createEmptyLocalVariables(),
      },
    };
  }

  return {
    descriptor: {
      kind: "unknown-binary",
      encoding: "zip",
      binary: true,
      compressed: false,
      byteLength: buffer.length,
      warnings: ["unrecognized-zip-fig-source"],
    },
  };
}

function parseStringLikeSource(input: string): ParsedDirectFigmaSource {
  const trimmed = input.trim();
  if (trimmed.startsWith("{")) {
    return normalizeParsedSource(JSON.parse(trimmed), {
      encoding: "json",
      binary: false,
      compressed: false,
      byteLength: Buffer.byteLength(input, "utf8"),
    });
  }

  try {
    const gunzipped = gunzipSync(Buffer.from(trimmed, "base64")).toString("utf8");
    return normalizeParsedSource(JSON.parse(gunzipped), {
      encoding: "base64-gzip",
      binary: false,
      compressed: true,
      byteLength: trimmed.length,
    });
  } catch {
    try {
      const decoded = Buffer.from(trimmed, "base64");
      if (decoded.length > 0) {
        const parsed = parseBinaryLikeSource(decoded);
        if (parsed.descriptor.kind !== "unknown-binary") {
          return {
            ...parsed,
            descriptor: {
              ...parsed.descriptor,
              encoding: parsed.descriptor.encoding === "zip" ? "zip" : "binary",
            },
          };
        }
      }
    } catch {
      // Ignore non-base64 text and fall through to unknown-text.
    }
    return {
      descriptor: {
        kind: "unknown-text",
        encoding: "text",
        binary: false,
        compressed: false,
        byteLength: Buffer.byteLength(input, "utf8"),
        warnings: ["unrecognized-figma-text-source"],
      },
    };
  }
}

function parseBinaryLikeSource(input: Uint8Array | Buffer): ParsedDirectFigmaSource {
  const buffer = Buffer.from(input);
  if (isZipBuffer(buffer)) {
    return parseZipPackage(buffer);
  }
  const gunzipped = tryGunzipToText(buffer);
  if (gunzipped) {
    return normalizeParsedSource(JSON.parse(gunzipped), {
      encoding: "gzip",
      binary: true,
      compressed: true,
      byteLength: buffer.length,
    });
  }

  const utf8 = buffer.toString("utf8").trim();
  if (utf8.startsWith("{")) {
    return normalizeParsedSource(JSON.parse(utf8), {
      encoding: "binary",
      binary: true,
      compressed: false,
      byteLength: buffer.length,
    });
  }

  const adapted = tryParseDirectFigBinary(buffer);
  if (adapted) {
    const parsed =
      adapted.kind === "bundle"
        ? normalizeParsedSource(adapted.data, {
            encoding: "binary",
            binary: true,
            compressed: false,
            byteLength: buffer.length,
            adapter: adapted.adapterName,
          })
        : normalizeParsedSource(adapted.data, {
            encoding: "binary",
            binary: true,
            compressed: false,
            byteLength: buffer.length,
            adapter: adapted.adapterName,
          });
    parsed.descriptor.warnings.push(...(adapted.warnings ?? []));
    return parsed;
  }

  return {
    descriptor: {
      kind: "unknown-binary",
      encoding: "binary",
      binary: true,
      compressed: false,
      byteLength: buffer.length,
      warnings: ["binary-fig-format-unsupported"],
    },
  };
}

function parseDirectFigmaSource(input: unknown): ParsedDirectFigmaSource {
  if (isDirectFigmaBundle(input)) {
    return {
      descriptor: {
        kind: "null-bundle",
        encoding: "object",
        binary: false,
        compressed: false,
        warnings: [],
      },
      bundle: input,
    };
  }

  const normalizedPayload = normalizePayloadLike(input);
  if (normalizedPayload) {
    return {
      descriptor: {
        kind: normalizedPayload.kind,
        encoding: "object",
        binary: false,
        compressed: false,
        warnings: [],
      },
      payload: normalizedPayload.payload,
    };
  }

  if (typeof input === "string") {
    return parseStringLikeSource(input);
  }

  if (input instanceof Uint8Array || Buffer.isBuffer(input)) {
    return parseBinaryLikeSource(input);
  }

  throw new Error("invalid_figma_source");
}

export function buildDirectFigmaFidelityReport(before: Doc, after: Doc): DirectFigmaFidelityReport {
  const diff = buildDirectFigmaRoundtripDiff(before, after);
  return {
    components: {
      before: Object.values(before.nodes).filter((node) => node.type === "component").length,
      after: Object.values(after.nodes).filter((node) => node.type === "component").length,
      delta:
        Object.values(after.nodes).filter((node) => node.type === "component").length -
        Object.values(before.nodes).filter((node) => node.type === "component").length,
    },
    styles: {
      before: before.styles.length,
      after: after.styles.length,
      delta: after.styles.length - before.styles.length,
    },
    variables: {
      before: before.variables.length,
      after: after.variables.length,
      delta: after.variables.length - before.variables.length,
    },
    prototypeInteractions: {
      before: countPrototypeInteractions(before),
      after: countPrototypeInteractions(after),
      delta: countPrototypeInteractions(after) - countPrototypeInteractions(before),
    },
    pages: {
      before: before.pages.length,
      after: after.pages.length,
      delta: after.pages.length - before.pages.length,
    },
    changedNodeIds: diff.changedNodeIds,
  };
}

export function nullDocToDirectFigmaBundle(doc: Doc, options?: { fileName?: string }): DirectFigmaBundle {
  const payload = nullDocToFigmaPayload(doc, options);
  const roundtripped = hydrateDoc(buildSerializableDocFromPayload(payload, "direct_figma_bundle"));
  const fidelityReport = buildDirectFigmaFidelityReport(doc, roundtripped);
  const compatibilityReport = buildFigmaCompatibilityReport(doc, payload);
  if (fidelityReport.components.delta !== 0 || fidelityReport.styles.delta !== 0 || fidelityReport.variables.delta !== 0 || fidelityReport.prototypeInteractions.delta !== 0) {
    compatibilityReport.issues.push({
      severity: "warn",
      code: "roundtrip-fidelity-delta",
      message: "Roundtrip fidelity deltas detected in component/style/variable/prototype counts.",
    });
    compatibilityReport.summary = buildReportSummary(compatibilityReport.issues);
  }
  return {
    kind: "null_figma_bundle",
    version: 1,
    format: "figma-rest-bundle",
    exportedAt: new Date().toISOString(),
    compatibilityReport,
    fidelityReport,
    payload,
  };
}

export function writeDirectFigmaBundle(bundle: DirectFigmaBundle) {
  return gzipSync(Buffer.from(JSON.stringify(bundle), "utf8"));
}

export function stringifyDirectFigmaBundle(bundle: DirectFigmaBundle) {
  return JSON.stringify(bundle, null, 2);
}

export function writeDirectFigmaPackage(bundle: DirectFigmaBundle) {
  const manifest: DirectFigmaPackageManifest = {
    kind: "null_fig_package",
    version: 1,
    format: "figma-rest-package",
    exportedAt: bundle.exportedAt,
  };
  return buildZip([
    { path: "manifest.json", data: Buffer.from(JSON.stringify(manifest, null, 2), "utf8") },
    { path: "bundle.json", data: Buffer.from(JSON.stringify(bundle, null, 2), "utf8") },
    { path: "file.json", data: Buffer.from(JSON.stringify(bundle.payload.file, null, 2), "utf8") },
    { path: "localVariables.json", data: Buffer.from(JSON.stringify(bundle.payload.localVariables, null, 2), "utf8") },
    { path: "compatibilityReport.json", data: Buffer.from(JSON.stringify(bundle.compatibilityReport, null, 2), "utf8") },
    { path: "fidelityReport.json", data: Buffer.from(JSON.stringify(bundle.fidelityReport, null, 2), "utf8") },
  ]);
}

export function writeDirectFigBinary(bundle: DirectFigmaBundle) {
  const bundleJson = stringifyDirectFigmaBundle(bundle);
  const result = tryWriteDirectFigBinary({
    bundle,
    bundleJson,
    bundleBytes: new Uint8Array(writeDirectFigmaBundle(bundle)),
  });
  return result;
}

export async function readDirectFigmaSource(
  input: unknown,
): Promise<string | Uint8Array | Buffer | DirectFigmaBundle | NullToFigmaExportPayload | FigmaFileResponse> {
  if (typeof input === "string" || input instanceof Uint8Array || Buffer.isBuffer(input)) return input;
  if (isDirectFigmaBundle(input)) {
    return input;
  }
  if (normalizePayloadLike(input)) {
    return input as NullToFigmaExportPayload | FigmaFileResponse;
  }
  if (typeof File !== "undefined" && input instanceof File) {
    const buffer = await input.arrayBuffer();
    return new Uint8Array(buffer);
  }
  if (input && typeof input === "object" && "arrayBuffer" in (input as Record<string, unknown>)) {
    const arrayBuffer = await (input as { arrayBuffer: () => Promise<ArrayBuffer> }).arrayBuffer();
    return new Uint8Array(arrayBuffer);
  }
  throw new Error("invalid_figma_bundle");
}

export function parseDirectFigmaSourceDescriptor(input: unknown): DirectFigmaSourceDescriptor {
  return parseDirectFigmaSource(input).descriptor;
}

export function parseDirectFigmaBundle(input: unknown): DirectFigmaBundle {
  const parsed = parseDirectFigmaSource(input);
  if (parsed.bundle) return parsed.bundle;
  throw new Error("invalid_figma_bundle");
}

export function encodeDirectFigmaBundleBase64(bundle: DirectFigmaBundle) {
  return Buffer.from(writeDirectFigmaBundle(bundle)).toString("base64");
}

export function encodeDirectFigmaPackageBase64(bundle: DirectFigmaBundle) {
  return Buffer.from(writeDirectFigmaPackage(bundle)).toString("base64");
}

export function directFigmaBundleToNullDoc(bundleLike: unknown): SerializableDoc {
  const bundle = parseDirectFigmaBundle(bundleLike);
  return buildSerializableDocFromPayload(bundle.payload, "direct_figma_bundle");
}

export function directFigmaSourceToNullDoc(sourceLike: unknown): DirectFigmaImportResult {
  const parsed = parseDirectFigmaSource(sourceLike);
  if (parsed.bundle) {
    return {
      doc: buildSerializableDocFromPayload(parsed.bundle.payload, "direct_figma_bundle"),
      descriptor: parsed.descriptor,
      compatibilityReport: parsed.bundle.compatibilityReport,
      fidelityReport: parsed.bundle.fidelityReport,
    };
  }
  if (parsed.payload) {
    const doc = buildSerializableDocFromPayload(parsed.payload, parsed.descriptor.kind);
    return {
      doc,
      descriptor: parsed.descriptor,
      compatibilityReport: buildFigmaCompatibilityReport(hydrateDoc(doc), parsed.payload),
    };
  }
  if (parsed.descriptor.kind === "unknown-binary") {
    throw new Error("unsupported_fig_binary");
  }
  throw new Error("invalid_figma_source");
}

export type DirectFigmaRoundtripDiff = {
  sameSchema: boolean;
  nodeCountDelta: number;
  styleCountDelta: number;
  variableCountDelta: number;
  pageCountDelta: number;
  changedNodeIds: string[];
};

export function buildDirectFigmaRoundtripDiff(before: Doc, after: Doc): DirectFigmaRoundtripDiff {
  const beforeSerialized = serializeDoc(before);
  const afterSerialized = serializeDoc(after);
  const changedNodeIds = Array.from(
    new Set([
      ...Object.keys(before.nodes).filter((id) => JSON.stringify(beforeSerialized.nodes[id]) !== JSON.stringify(afterSerialized.nodes[id])),
      ...Object.keys(after.nodes).filter((id) => JSON.stringify(beforeSerialized.nodes[id]) !== JSON.stringify(afterSerialized.nodes[id])),
    ]),
  );
  return {
    sameSchema: before.schema === after.schema && before.version === after.version,
    nodeCountDelta: Object.keys(after.nodes).length - Object.keys(before.nodes).length,
    styleCountDelta: after.styles.length - before.styles.length,
    variableCountDelta: after.variables.length - before.variables.length,
    pageCountDelta: after.pages.length - before.pages.length,
    changedNodeIds,
  };
}
