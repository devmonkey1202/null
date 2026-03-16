import { lookup } from "node:dns/promises";
import path from "node:path";

import JSZip from "jszip";
import { JSDOM } from "jsdom";

import {
  addNode,
  createDoc,
  createNode,
  type Doc,
  type PrototypeInteraction,
} from "@/advanced/doc/scene";
import {
  getWebImportViewport,
  normalizePublicWebImportUrl,
  type WebImportSource,
  type WebImportViewportId,
} from "@/lib/webImportShared";

const BLOCKED_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]", "169.254.169.254"]);
const MAX_REDIRECTS = 5;
const MAX_BLOCKS = 24;
const MAX_IMAGES = 4;
const MAX_ACTIONS = 8;
const IMPORT_BASE_URL = "https://null.import.local/";

type WebImportBlock =
  | { kind: "heading"; text: string; level: number }
  | { kind: "paragraph"; text: string }
  | { kind: "link"; text: string; url: string }
  | { kind: "button"; text: string; url: string }
  | { kind: "image"; src: string; alt?: string };

type PreparedImportHtml = {
  html: string;
  baseUrl: string;
  fileName?: string;
  sourceKind: WebImportSource["kind"];
  assetMap?: Map<string, string>;
  title?: string;
};

type PublicWebFetchResult = {
  normalizedUrl: string;
  finalUrl: string;
  html: string;
};

type WebHtmlToNullDocInput = {
  url: string;
  html: string;
  viewportId?: WebImportViewportId;
  finalUrl?: string;
  fileName?: string;
  sourceKind?: WebImportSource["kind"];
  title?: string;
};

type WebFileToNullDocInput = {
  fileName: string;
  buffer: Buffer;
  viewportId?: WebImportViewportId;
};

type HtmlCodeToNullDocInput = {
  html: string;
  css?: string;
  viewportId?: WebImportViewportId;
  title?: string;
};

type WebHtmlToNullDocResult = {
  doc: Doc;
  importSource: WebImportSource;
  blockCount: number;
};

function makeInteractionId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function cleanText(raw: string | null | undefined) {
  return (raw ?? "").replace(/\s+/g, " ").trim();
}

function isIpv4Private(hostname: string) {
  const parts = hostname.split(".").map((value) => Number(value));
  if (parts.length !== 4 || parts.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) {
    return false;
  }
  if (parts[0] === 10) return true;
  if (parts[0] === 127) return true;
  if (parts[0] === 169 && parts[1] === 254) return true;
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  if (parts[0] === 192 && parts[1] === 168) return true;
  if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return true;
  return false;
}

function isIpv6Private(hostname: string) {
  const lowered = hostname.toLowerCase();
  return (
    lowered === "::1" ||
    lowered.startsWith("fe80:") ||
    lowered.startsWith("fc") ||
    lowered.startsWith("fd") ||
    lowered.startsWith("::ffff:127.")
  );
}

function isBlockedHostname(hostname: string) {
  const lowered = hostname.toLowerCase();
  return (
    BLOCKED_HOSTS.has(lowered) ||
    lowered.endsWith(".internal") ||
    isIpv4Private(lowered) ||
    isIpv6Private(lowered)
  );
}

async function assertPublicImportUrl(targetUrl: string) {
  const parsed = new URL(targetUrl);
  if (isBlockedHostname(parsed.hostname)) {
    throw new Error("로컬 또는 사설 네트워크 주소는 가져올 수 없습니다.");
  }
  try {
    const resolved = await lookup(parsed.hostname, { all: true });
    if (resolved.some((entry) => isBlockedHostname(entry.address))) {
      throw new Error("로컬 또는 사설 네트워크 주소는 가져올 수 없습니다.");
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes("사설")) {
      throw error;
    }
  }
}

function normalizeAssetKey(raw: string) {
  return raw.replace(/\\/g, "/").replace(/^\.?\//, "").replace(/^\/+/, "");
}

function bufferToDataUrl(buffer: Buffer, mimeType: string) {
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

function splitMhtmlParts(raw: string) {
  const boundaryMatch = raw.match(/boundary="?([^"\r\n;]+)"?/i);
  if (!boundaryMatch) {
    throw new Error("MHTML boundary를 찾지 못했습니다.");
  }
  const boundary = boundaryMatch[1];
  return raw
    .split(new RegExp(`--${boundary}(?:--)?`))
    .map((part) => part.trim())
    .filter(Boolean);
}

function parsePartHeaders(rawHeaders: string) {
  const headers = new Map<string, string>();
  rawHeaders.split(/\r?\n/).forEach((line) => {
    const idx = line.indexOf(":");
    if (idx < 0) return;
    headers.set(line.slice(0, idx).trim().toLowerCase(), line.slice(idx + 1).trim());
  });
  return headers;
}

function parseMhtml(raw: string, fileName: string): PreparedImportHtml {
  const parts = splitMhtmlParts(raw);
  let html = "";
  let baseUrl = `${IMPORT_BASE_URL}${encodeURIComponent(fileName)}`;
  let title: string | undefined;
  const styles: string[] = [];
  const assetMap = new Map<string, string>();

  for (const part of parts) {
    const splitIndex = part.search(/\r?\n\r?\n/);
    if (splitIndex < 0) continue;
    const headers = parsePartHeaders(part.slice(0, splitIndex));
    const body = part.slice(splitIndex).replace(/^\r?\n\r?\n/, "");
    const contentType = headers.get("content-type")?.toLowerCase() ?? "";
    const location = headers.get("content-location");
    const contentId = headers.get("content-id")?.replace(/[<>]/g, "");
    const transferEncoding = headers.get("content-transfer-encoding")?.toLowerCase() ?? "";

    if (contentType.includes("text/html")) {
      html = body;
      if (location) baseUrl = location;
      continue;
    }

    if (contentType.includes("text/css")) {
      styles.push(body);
      continue;
    }

    if (!contentType.startsWith("image/")) continue;
    if (!body.trim()) continue;

    const buffer =
      transferEncoding.includes("base64")
        ? Buffer.from(body.replace(/\s+/g, ""), "base64")
        : Buffer.from(body, "utf8");
    const dataUrl = bufferToDataUrl(buffer, contentType.split(";")[0] || "application/octet-stream");
    if (location) assetMap.set(normalizeAssetKey(location), dataUrl);
    if (contentId) assetMap.set(normalizeAssetKey(`cid:${contentId}`), dataUrl);
  }

  if (!html.trim()) {
    throw new Error("MHTML 안에서 HTML 본문을 찾지 못했습니다.");
  }

  if (styles.length) {
    html = injectCssIntoHtml(html, styles.join("\n"));
  }

  if (!title) {
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    title = titleMatch ? cleanText(titleMatch[1]) : undefined;
  }

  return {
    html,
    baseUrl,
    fileName,
    sourceKind: "mhtml-file",
    assetMap,
    title,
  };
}

async function parseZipFile(buffer: Buffer, fileName: string): Promise<PreparedImportHtml> {
  const zip = await JSZip.loadAsync(buffer);
  const entries = Object.values(zip.files).filter((entry) => !entry.dir);
  const htmlEntry =
    entries.find((entry) => /(^|\/)index\.html?$/i.test(entry.name)) ??
    entries.find((entry) => /\.html?$/i.test(entry.name));

  if (!htmlEntry) {
    throw new Error("ZIP 안에서 HTML 파일을 찾지 못했습니다.");
  }

  const html = await htmlEntry.async("text");
  const baseUrl = `${IMPORT_BASE_URL}${normalizeAssetKey(htmlEntry.name)}`;
  const assetMap = new Map<string, string>();
  const cssChunks: string[] = [];

  for (const entry of entries) {
    const normalizedName = normalizeAssetKey(entry.name);
    if (/\.css$/i.test(entry.name)) {
      cssChunks.push(await entry.async("text"));
      continue;
    }
    if (!/\.(png|jpe?g|gif|webp|svg|avif)$/i.test(entry.name)) continue;
    const extension = path.extname(entry.name).toLowerCase();
    const mimeType =
      extension === ".png"
        ? "image/png"
        : extension === ".jpg" || extension === ".jpeg"
          ? "image/jpeg"
          : extension === ".gif"
            ? "image/gif"
            : extension === ".webp"
              ? "image/webp"
              : extension === ".avif"
                ? "image/avif"
                : "image/svg+xml";
    assetMap.set(normalizedName, bufferToDataUrl(await entry.async("nodebuffer"), mimeType));
  }

  return {
    html: cssChunks.length ? injectCssIntoHtml(html, cssChunks.join("\n")) : html,
    baseUrl,
    fileName,
    sourceKind: "archive-file",
    assetMap,
  };
}

function injectCssIntoHtml(html: string, css: string) {
  if (!css.trim()) return html;
  if (/<\/head>/i.test(html)) {
    return html.replace(/<\/head>/i, `<style>${css}</style></head>`);
  }
  return `<style>${css}</style>${html}`;
}

async function parseImportFile({ fileName, buffer }: { fileName: string; buffer: Buffer }): Promise<PreparedImportHtml> {
  const lowered = fileName.toLowerCase();
  if (lowered.endsWith(".html") || lowered.endsWith(".htm")) {
    return {
      html: buffer.toString("utf8"),
      baseUrl: `${IMPORT_BASE_URL}${encodeURIComponent(fileName)}`,
      fileName,
      sourceKind: "html-file",
    };
  }
  if (lowered.endsWith(".mhtml") || lowered.endsWith(".mht")) {
    return parseMhtml(buffer.toString("utf8"), fileName);
  }
  if (lowered.endsWith(".zip")) {
    return parseZipFile(buffer, fileName);
  }
  throw new Error("지원하지 않는 파일 형식입니다. .html, .htm, .zip, .mhtml, .mht만 가능합니다.");
}

function resolveAssetUrl(src: string, baseUrl: string, assetMap?: Map<string, string>) {
  if (!assetMap?.size) {
    return new URL(src, baseUrl).toString();
  }

  const directKey = normalizeAssetKey(src);
  const directHit = assetMap.get(directKey);
  if (directHit) return directHit;

  try {
    const absolute = new URL(src, baseUrl);
    const assetKey = normalizeAssetKey(absolute.pathname);
    return assetMap.get(assetKey) ?? absolute.toString();
  } catch {
    return assetMap.get(directKey) ?? src;
  }
}

async function fetchPublicWebDocument(rawUrl: string) {
  const normalizedUrl = normalizePublicWebImportUrl(rawUrl);
  let current = normalizedUrl;
  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    await assertPublicImportUrl(current);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const res = await fetch(current, {
        redirect: "manual",
        headers: {
          "user-agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
          accept: "text/html,application/xhtml+xml",
        },
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get("location");
        if (!location) {
          throw new Error("리다이렉트 위치를 확인할 수 없습니다.");
        }
        current = new URL(location, current).toString();
        continue;
      }

      if (!res.ok) {
        throw new Error(`웹 페이지를 가져오지 못했습니다. (${res.status})`);
      }

      return {
        normalizedUrl,
        finalUrl: current,
        html: await res.text(),
      } satisfies PublicWebFetchResult;
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error("리다이렉트가 너무 많습니다.");
}

function isLikelyButton(element: Element, text: string) {
  const tag = element.tagName.toLowerCase();
  if (tag === "button") return true;
  const role = element.getAttribute("role");
  if (role === "button") return true;
  const className = (element.getAttribute("class") ?? "").toLowerCase();
  return tag === "a" && text.length <= 36 && (className.includes("button") || className.includes("btn"));
}

function collectBlocks(dom: JSDOM, baseUrl: string, assetMap?: Map<string, string>) {
  const document = dom.window.document;
  const scope = document.querySelector("main, article, [role='main']") ?? document.body;
  const blocks: WebImportBlock[] = [];
  const seenText = new Set<string>();
  const seenImages = new Set<string>();
  let imageCount = 0;
  let actionCount = 0;

  for (const element of Array.from<Element>(scope.querySelectorAll("h1,h2,h3,h4,h5,h6,p,li,img,button,a"))) {
    if (blocks.length >= MAX_BLOCKS) break;
    const tag = element.tagName.toLowerCase();

    if (tag === "img") {
      if (imageCount >= MAX_IMAGES) continue;
      const src = cleanText(element.getAttribute("src"));
      if (!src) continue;
      const resolvedSrc = resolveAssetUrl(src, baseUrl, assetMap);
      if (seenImages.has(resolvedSrc)) continue;
      seenImages.add(resolvedSrc);
      imageCount += 1;
      blocks.push({ kind: "image", src: resolvedSrc, alt: cleanText(element.getAttribute("alt")) || undefined });
      continue;
    }

    const text = cleanText(element.textContent);
    if (text.length < 2) continue;
    const dedupeKey = `${tag}:${text}`;
    if (seenText.has(dedupeKey)) continue;
    seenText.add(dedupeKey);

    if (tag.startsWith("h")) {
      const level = Number(tag.slice(1));
      blocks.push({ kind: "heading", text, level: Number.isFinite(level) ? level : 2 });
      continue;
    }

    if (tag === "p") {
      blocks.push({ kind: "paragraph", text });
      continue;
    }

    if (tag === "li") {
      blocks.push({ kind: "paragraph", text: `• ${text}` });
      continue;
    }

    if ((tag === "a" || tag === "button") && actionCount < MAX_ACTIONS) {
      const href = tag === "a" ? cleanText(element.getAttribute("href")) : "";
      const url = href ? new URL(href, baseUrl).toString() : baseUrl;
      actionCount += 1;
      blocks.push(isLikelyButton(element, text) ? { kind: "button", text, url } : { kind: "link", text, url });
    }
  }

  return blocks;
}

function makeTextNode(
  name: string,
  value: string,
  {
    fontSize,
    fontWeight,
    color = "#111827",
    align = "left",
    widthMode = "fill",
  }: {
    fontSize: number;
    fontWeight: number;
    color?: string;
    align?: "left" | "center" | "right" | "justify";
    widthMode?: "fill" | "hug";
  },
) {
  const node = createNode("text");
  node.name = name;
  node.frame = {
    ...node.frame,
    w: widthMode === "fill" ? 960 : Math.max(180, value.length * Math.max(8, fontSize / 1.5)),
    h: Math.max(36, fontSize * 1.8),
  };
  node.layoutSizing = { width: widthMode, height: "hug" };
  node.text = {
    value,
    style: {
      ...node.text!.style,
      fontSize,
      fontWeight,
      align,
    },
    wrap: true,
    autoSize: true,
  };
  node.style = {
    ...node.style,
    fills: [{ type: "solid", color }],
    strokes: [],
  };
  return node;
}

function makeLinkInteraction(url: string): PrototypeInteraction {
  return {
    id: makeInteractionId("web_link"),
    trigger: "click",
    action: {
      type: "url",
      url,
      openInNewTab: true,
    },
  };
}

function makeButtonNode(label: string, url: string) {
  const button = createNode("frame");
  button.name = label;
  button.layout = {
    mode: "auto",
    dir: "row",
    gap: 8,
    gapMode: "fixed",
    justify: "start",
    padding: { t: 12, r: 18, b: 12, l: 18 },
    align: "center",
    wrap: false,
  };
  button.layoutSizing = { width: "hug", height: "hug" };
  button.style = {
    ...button.style,
    fills: [{ type: "solid", color: "#111827" }],
    strokes: [],
    radius: 999,
  };
  button.prototype = { interactions: [makeLinkInteraction(url)] };

  const text = makeTextNode("버튼 텍스트", label, {
    fontSize: 15,
    fontWeight: 600,
    color: "#FFFFFF",
    widthMode: "hug",
  });
  return { button, text };
}

function makeImageNode(src: string, alt?: string) {
  const node = createNode("image");
  node.name = alt || "가져온 이미지";
  node.frame = { ...node.frame, w: 960, h: 320 };
  node.layoutSizing = { width: "fill", height: "fixed" };
  node.image = {
    ...(node.image ?? {
      src: "",
      fit: "cover",
      offsetX: 0,
      offsetY: 0,
      scale: 1,
      poster: "",
      autoplay: false,
      loop: false,
      muted: false,
      controls: true,
    }),
    src,
    fit: "cover",
  };
  node.style = {
    ...node.style,
    fills: [{ type: "solid", color: "#F3F4F6" }],
    strokes: [{ color: "#E5E7EB", width: 1, align: "inside" }],
    radius: 20,
  };
  return node;
}

function buildImportDoc({
  title,
  description,
  blocks,
  source,
}: {
  title: string;
  description?: string;
  blocks: WebImportBlock[];
  source: WebImportSource;
}) {
  const viewport = getWebImportViewport(source.viewportId);
  const doc = createDoc();
  doc.imports = { web: source };

  const page = doc.pages[0];
  const pageNode = doc.nodes[page.rootId];
  page.name = title;
  pageNode.name = title;
  pageNode.frame = { ...pageNode.frame, x: 0, y: 0, w: 8000, h: 6000 };
  pageNode.style = {
    ...pageNode.style,
    fills: [{ type: "solid", color: "#FAFAF8" }],
    strokes: [{ color: "#E5E7EB", width: 1, align: "inside" }],
  };

  const rootFrame = createNode("frame");
  rootFrame.name = `${title} 웹 가져오기`;
  rootFrame.frame = { x: 320, y: 160, w: viewport.width, h: Math.max(viewport.minHeight, 900), rotation: 0 };
  rootFrame.layout = {
    mode: "auto",
    dir: "column",
    gap: 24,
    gapMode: "fixed",
    justify: "start",
    padding: { t: 32, r: 32, b: 32, l: 32 },
    align: "start",
    wrap: false,
  };
  rootFrame.layoutSizing = { width: "fixed", height: "hug" };
  rootFrame.style = {
    ...rootFrame.style,
    fills: [{ type: "solid", color: "#FFFFFF" }],
    strokes: [{ color: "#E5E7EB", width: 1, align: "inside" }],
    radius: 28,
  };
  addNode(doc, rootFrame, page.rootId);

  const sourceParts = [
    source.kind === "public-url" ? new URL(source.finalUrl ?? source.normalizedUrl ?? source.url).hostname : source.fileName ?? source.kind,
    viewport.label,
    source.url,
  ].filter(Boolean);
  addNode(
    doc,
    makeTextNode("웹 가져오기 정보", sourceParts.join(" · "), {
      fontSize: 12,
      fontWeight: 500,
      color: "#6B7280",
    }),
    rootFrame.id,
  );

  addNode(doc, makeTextNode("가져온 제목", title, { fontSize: 40, fontWeight: 700 }), rootFrame.id);

  if (description) {
    addNode(
      doc,
      makeTextNode("가져온 설명", description, {
        fontSize: 18,
        fontWeight: 400,
        color: "#4B5563",
      }),
      rootFrame.id,
    );
  }

  for (const block of blocks) {
    if (block.kind === "heading") {
      const fontSize = block.level <= 1 ? 34 : block.level === 2 ? 28 : block.level === 3 ? 24 : 20;
      addNode(doc, makeTextNode(`제목 ${block.level}`, block.text, { fontSize, fontWeight: 700 }), rootFrame.id);
      continue;
    }
    if (block.kind === "paragraph") {
      addNode(
        doc,
        makeTextNode("본문", block.text, {
          fontSize: 16,
          fontWeight: 400,
          color: "#374151",
        }),
        rootFrame.id,
      );
      continue;
    }
    if (block.kind === "image") {
      addNode(doc, makeImageNode(block.src, block.alt), rootFrame.id);
      continue;
    }
    if (block.kind === "link") {
      const link = makeTextNode("링크", block.text, {
        fontSize: 15,
        fontWeight: 600,
        color: "#2563EB",
        widthMode: "hug",
      });
      link.prototype = { interactions: [makeLinkInteraction(block.url)] };
      addNode(doc, link, rootFrame.id);
      continue;
    }
    if (block.kind === "button") {
      const { button, text } = makeButtonNode(block.text, block.url);
      addNode(doc, button, rootFrame.id);
      addNode(doc, text, button.id);
    }
  }

  if (!blocks.length) {
    addNode(
      doc,
      makeTextNode("가져오기 안내", "본문을 추출하지 못해 제목과 설명만 가져왔습니다.", {
        fontSize: 15,
        fontWeight: 400,
        color: "#6B7280",
      }),
      rootFrame.id,
    );
  }

  return doc;
}

export function webHtmlToNullDoc({
  url,
  html,
  viewportId,
  finalUrl,
  fileName,
  sourceKind = "public-url",
  title: forcedTitle,
}: WebHtmlToNullDocInput): WebHtmlToNullDocResult {
  const normalizedUrl = sourceKind === "public-url" ? normalizePublicWebImportUrl(url) : url;
  const resolvedViewport = getWebImportViewport(viewportId).id;
  const dom = new JSDOM(html, { url: finalUrl ?? normalizedUrl });
  const document = dom.window.document;
  const title =
    forcedTitle ||
    cleanText(document.title) ||
    cleanText(document.querySelector("meta[property='og:title']")?.getAttribute("content")) ||
    fileName ||
    (sourceKind === "public-url" ? new URL(finalUrl ?? normalizedUrl).hostname : "웹 가져오기");
  const description =
    cleanText(document.querySelector("meta[name='description']")?.getAttribute("content")) ||
    cleanText(document.querySelector("meta[property='og:description']")?.getAttribute("content")) ||
    undefined;
  const blocks = collectBlocks(dom, finalUrl ?? normalizedUrl);
  const importSource: WebImportSource = {
    kind: sourceKind,
    url,
    normalizedUrl: sourceKind === "public-url" ? normalizedUrl : undefined,
    finalUrl: finalUrl ?? normalizedUrl,
    viewportId: resolvedViewport,
    title,
    fileName,
    importedAt: new Date().toISOString(),
  };
  return {
    doc: buildImportDoc({ title, description, blocks, source: importSource }),
    importSource,
    blockCount: blocks.length,
  };
}

export function htmlCodeToNullDoc({
  html,
  css,
  viewportId,
  title,
}: HtmlCodeToNullDocInput): WebHtmlToNullDocResult {
  const mergedHtml = injectCssIntoHtml(html, css ?? "");
  return webHtmlToNullDoc({
    url: "inline-html",
    html: mergedHtml,
    viewportId,
    finalUrl: `${IMPORT_BASE_URL}inline.html`,
    sourceKind: "html-code",
    title,
  });
}

export async function webFileToNullDoc({
  fileName,
  buffer,
  viewportId,
}: WebFileToNullDocInput): Promise<WebHtmlToNullDocResult> {
  const prepared = await parseImportFile({ fileName, buffer });
  const dom = new JSDOM(prepared.html, { url: prepared.baseUrl });
  const document = dom.window.document;
  const title =
    prepared.title ||
    cleanText(document.title) ||
    cleanText(document.querySelector("meta[property='og:title']")?.getAttribute("content")) ||
    fileName;
  const description =
    cleanText(document.querySelector("meta[name='description']")?.getAttribute("content")) ||
    cleanText(document.querySelector("meta[property='og:description']")?.getAttribute("content")) ||
    undefined;
  const blocks = collectBlocks(dom, prepared.baseUrl, prepared.assetMap);
  const importSource: WebImportSource = {
    kind: prepared.sourceKind,
    url: fileName,
    finalUrl: prepared.baseUrl,
    viewportId: getWebImportViewport(viewportId).id,
    title,
    fileName,
    importedAt: new Date().toISOString(),
  };
  return {
    doc: buildImportDoc({ title, description, blocks, source: importSource }),
    importSource,
    blockCount: blocks.length,
  };
}

export async function publicUrlToNullDoc({
  url,
  viewportId,
}: {
  url: string;
  viewportId?: WebImportViewportId;
}) {
  const fetched = await fetchPublicWebDocument(url);
  return webHtmlToNullDoc({
    url: fetched.normalizedUrl,
    html: fetched.html,
    viewportId,
    finalUrl: fetched.finalUrl,
  });
}
