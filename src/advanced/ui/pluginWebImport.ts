import {
  WEB_IMPORT_VIEWPORT_OPTIONS,
  normalizePublicWebImportUrl,
  normalizeWebImportLanguage,
  normalizeWebImportQuery,
  normalizeWebImportTheme,
  type WebImportTheme,
  type WebImportViewportId,
} from "@/lib/webImportShared";

const WEB_IMPORT_VIEWPORT_IDS = new Set<WebImportViewportId>(
  WEB_IMPORT_VIEWPORT_OPTIONS.map((option) => option.id),
);

export type PluginWebImportSpec =
  | {
      kind: "url";
      url: string;
      viewportId: WebImportViewportId;
      language: string;
      query: string;
      theme: WebImportTheme | "";
    }
  | {
      kind: "url-bulk";
      urls: string[];
      viewportId: WebImportViewportId;
      language: string;
      query: string;
      theme: WebImportTheme | "";
    }
  | {
      kind: "open-modal";
      url?: string;
      urls?: string[];
      viewportId: WebImportViewportId;
      language: string;
      query: string;
      theme: WebImportTheme | "";
    };

function normalizeViewportId(raw: unknown): WebImportViewportId {
  if (typeof raw === "string" && WEB_IMPORT_VIEWPORT_IDS.has(raw as WebImportViewportId)) {
    return raw as WebImportViewportId;
  }
  return "desktop";
}

function normalizeUrlList(raw: unknown) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const urls: string[] = [];
  raw.forEach((value) => {
    if (typeof value !== "string") return;
    const normalized = normalizePublicWebImportUrl(value);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    urls.push(normalized);
  });
  return urls;
}

export function normalizePluginWebImportParams(
  params: Record<string, unknown> | undefined | null,
): PluginWebImportSpec | null {
  const input = params ?? {};
  if (typeof input !== "object" || Array.isArray(input)) {
    return {
      kind: "open-modal",
      viewportId: "desktop",
      language: "",
      query: "",
      theme: "",
    };
  }

  const viewportId = normalizeViewportId(input.viewportId);
  const language = typeof input.language === "string" ? normalizeWebImportLanguage(input.language) : "";
  const query = typeof input.query === "string" ? normalizeWebImportQuery(input.query) : "";
  const theme = typeof input.theme === "string" ? normalizeWebImportTheme(input.theme) : "";
  const openModal = input.openModal === true;
  const url = (() => {
    if (typeof input.url !== "string") return null;
    try {
      return normalizePublicWebImportUrl(input.url);
    } catch {
      return null;
    }
  })();
  const urls = normalizeUrlList(input.urls);

  if (urls.length > 1) {
    return openModal
      ? { kind: "open-modal", urls, viewportId, language, query, theme }
      : { kind: "url-bulk", urls, viewportId, language, query, theme };
  }

  const singleUrl = url ?? urls[0] ?? "";
  if (singleUrl) {
    return openModal
      ? { kind: "open-modal", url: singleUrl, viewportId, language, query, theme }
      : { kind: "url", url: singleUrl, viewportId, language, query, theme };
  }

  return {
    kind: "open-modal",
    viewportId,
    language,
    query,
    theme,
  };
}
