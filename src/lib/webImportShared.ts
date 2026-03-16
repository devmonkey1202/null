export const WEB_IMPORT_VIEWPORT_IDS = ["desktop", "tablet", "mobile"] as const;

export type WebImportViewportId = (typeof WEB_IMPORT_VIEWPORT_IDS)[number];

export type WebImportViewportPreset = {
  id: WebImportViewportId;
  label: string;
  width: number;
  minHeight: number;
};

export const WEB_IMPORT_VIEWPORTS: Record<WebImportViewportId, WebImportViewportPreset> = {
  desktop: { id: "desktop", label: "데스크톱", width: 1440, minHeight: 900 },
  tablet: { id: "tablet", label: "태블릿", width: 834, minHeight: 1112 },
  mobile: { id: "mobile", label: "모바일", width: 390, minHeight: 844 },
};

export const WEB_IMPORT_VIEWPORT_OPTIONS = WEB_IMPORT_VIEWPORT_IDS.map((id) => WEB_IMPORT_VIEWPORTS[id]);

export type WebImportSource = {
  kind: "public-url" | "html-code" | "html-file" | "archive-file" | "mhtml-file";
  url: string;
  normalizedUrl?: string;
  finalUrl?: string;
  viewportId: WebImportViewportId;
  title?: string;
  fileName?: string;
  importedAt: string;
};

export type WebImportState = {
  web?: WebImportSource;
};

export function getWebImportViewport(id?: string | null): WebImportViewportPreset {
  if (id && id in WEB_IMPORT_VIEWPORTS) {
    return WEB_IMPORT_VIEWPORTS[id as WebImportViewportId];
  }
  return WEB_IMPORT_VIEWPORTS.desktop;
}

export function normalizePublicWebImportUrl(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("URL을 입력해 주세요.");
  }
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const parsed = new URL(withScheme);
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("http 또는 https URL만 가져올 수 있습니다.");
  }
  parsed.hash = "";
  return parsed.toString();
}
