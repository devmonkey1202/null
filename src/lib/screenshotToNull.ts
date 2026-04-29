import { addNode, createDoc, createNode, type Doc } from "@/advanced/doc/scene";
import { getWebImportViewport, type WebImportSource, type WebImportViewportId } from "@/lib/webImportShared";

type RgbaColor = { r: number; g: number; b: number; a: number };

type ScreenshotPixelSource = {
  width: number;
  height: number;
  data: Uint8ClampedArray;
};

type ScreenshotImportOptions = {
  viewportId?: WebImportViewportId;
  maxAnalysisDimension?: number;
  textDetector?: boolean;
};

export type ScreenshotRegionKind = "text" | "rect" | "image";

export type ScreenshotRegion = {
  x: number;
  y: number;
  w: number;
  h: number;
  kind: ScreenshotRegionKind;
  fill: string;
  foreground: string;
  density: number;
  variance: number;
};

export type ScreenshotImportAnalysis = {
  width: number;
  height: number;
  background: string;
  regions: ScreenshotRegion[];
};

type ScreenshotRegionWithAssets = ScreenshotRegion & {
  text?: string;
  imageSrc?: string;
};

const MAX_ANALYSIS_DIMENSION = 180;
const MAX_REGIONS = 36;
const MIN_COMPONENT_AREA = 10;
const FOREGROUND_THRESHOLD = 42;
const QUANTIZE_STEP = 16;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function toHex(value: number) {
  return clamp(Math.round(value), 0, 255).toString(16).padStart(2, "0");
}

function rgbaToHex(color: RgbaColor) {
  return `#${toHex(color.r)}${toHex(color.g)}${toHex(color.b)}`;
}

function colorDistance(a: RgbaColor, b: RgbaColor) {
  return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
}

function readPixel(source: ScreenshotPixelSource, x: number, y: number): RgbaColor {
  const ix = clamp(Math.round(x), 0, source.width - 1);
  const iy = clamp(Math.round(y), 0, source.height - 1);
  const index = (iy * source.width + ix) * 4;
  return {
    r: source.data[index] ?? 0,
    g: source.data[index + 1] ?? 0,
    b: source.data[index + 2] ?? 0,
    a: source.data[index + 3] ?? 255,
  };
}

function quantizeColor(color: RgbaColor) {
  return {
    r: Math.round(color.r / QUANTIZE_STEP) * QUANTIZE_STEP,
    g: Math.round(color.g / QUANTIZE_STEP) * QUANTIZE_STEP,
    b: Math.round(color.b / QUANTIZE_STEP) * QUANTIZE_STEP,
  };
}

function detectBackgroundColor(source: ScreenshotPixelSource): RgbaColor {
  const samples = new Map<string, { count: number; color: RgbaColor }>();
  const stepX = Math.max(1, Math.floor(source.width / 20));
  const stepY = Math.max(1, Math.floor(source.height / 20));
  const samplePoints: Array<{ x: number; y: number }> = [];

  for (let x = 0; x < source.width; x += stepX) {
    samplePoints.push({ x, y: 0 });
    samplePoints.push({ x, y: source.height - 1 });
  }
  for (let y = 0; y < source.height; y += stepY) {
    samplePoints.push({ x: 0, y });
    samplePoints.push({ x: source.width - 1, y });
  }

  samplePoints.push({ x: 0, y: 0 });
  samplePoints.push({ x: source.width - 1, y: 0 });
  samplePoints.push({ x: 0, y: source.height - 1 });
  samplePoints.push({ x: source.width - 1, y: source.height - 1 });

  for (const point of samplePoints) {
    const color = readPixel(source, point.x, point.y);
    const quantized = quantizeColor(color);
    const key = `${quantized.r},${quantized.g},${quantized.b}`;
    const entry = samples.get(key) ?? { count: 0, color };
    entry.count += 1;
    samples.set(key, entry);
  }

  const dominant = Array.from(samples.values()).sort((a, b) => b.count - a.count)[0];
  return dominant?.color ?? { r: 255, g: 255, b: 255, a: 255 };
}

function buildForegroundMask(source: ScreenshotPixelSource, background: RgbaColor) {
  const mask = new Uint8Array(source.width * source.height);
  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      const color = readPixel(source, x, y);
      const index = y * source.width + x;
      mask[index] =
        color.a > 24 && colorDistance(color, background) >= FOREGROUND_THRESHOLD ? 1 : 0;
    }
  }
  return mask;
}

function boxesOverlapOrNear(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }, gap = 2) {
  return !(
    a.x + a.w + gap < b.x ||
    b.x + b.w + gap < a.x ||
    a.y + a.h + gap < b.y ||
    b.y + b.h + gap < a.y
  );
}

function mergeBoxes(boxes: Array<{ x: number; y: number; w: number; h: number; area: number }>) {
  const queue = [...boxes];
  const merged: Array<{ x: number; y: number; w: number; h: number; area: number }> = [];

  while (queue.length) {
    let current = queue.shift()!;
    let changed = true;
    while (changed) {
      changed = false;
      for (let index = queue.length - 1; index >= 0; index -= 1) {
        const candidate = queue[index]!;
        if (!boxesOverlapOrNear(current, candidate)) continue;
        queue.splice(index, 1);
        const x1 = Math.min(current.x, candidate.x);
        const y1 = Math.min(current.y, candidate.y);
        const x2 = Math.max(current.x + current.w, candidate.x + candidate.w);
        const y2 = Math.max(current.y + current.h, candidate.y + candidate.h);
        current = { x: x1, y: y1, w: x2 - x1, h: y2 - y1, area: current.area + candidate.area };
        changed = true;
      }
    }
    merged.push(current);
  }

  return merged;
}

function detectComponents(source: ScreenshotPixelSource, mask: Uint8Array) {
  const visited = new Uint8Array(source.width * source.height);
  const components: Array<{ x: number; y: number; w: number; h: number; area: number }> = [];
  const offsets = [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 },
  ];

  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      const start = y * source.width + x;
      if (!mask[start] || visited[start]) continue;
      visited[start] = 1;
      const queue = [{ x, y }];
      let minX = x;
      let minY = y;
      let maxX = x;
      let maxY = y;
      let area = 0;

      while (queue.length) {
        const current = queue.pop()!;
        area += 1;
        minX = Math.min(minX, current.x);
        minY = Math.min(minY, current.y);
        maxX = Math.max(maxX, current.x);
        maxY = Math.max(maxY, current.y);
        for (const offset of offsets) {
          const nx = current.x + offset.x;
          const ny = current.y + offset.y;
          if (nx < 0 || ny < 0 || nx >= source.width || ny >= source.height) continue;
          const index = ny * source.width + nx;
          if (!mask[index] || visited[index]) continue;
          visited[index] = 1;
          queue.push({ x: nx, y: ny });
        }
      }

      if (area < MIN_COMPONENT_AREA) continue;
      components.push({
        x: Math.max(0, minX - 1),
        y: Math.max(0, minY - 1),
        w: Math.min(source.width - minX, maxX - minX + 3),
        h: Math.min(source.height - minY, maxY - minY + 3),
        area,
      });
    }
  }

  return mergeBoxes(components)
    .sort((a, b) => b.area - a.area)
    .slice(0, MAX_REGIONS);
}

function summarizeRegion(source: ScreenshotPixelSource, background: RgbaColor, box: { x: number; y: number; w: number; h: number; area: number }): ScreenshotRegion {
  let rSum = 0;
  let gSum = 0;
  let bSum = 0;
  let fgRSum = 0;
  let fgGSum = 0;
  let fgBSum = 0;
  let fgCount = 0;
  let varianceSum = 0;
  let samples = 0;

  for (let y = box.y; y < box.y + box.h; y += 1) {
    for (let x = box.x; x < box.x + box.w; x += 1) {
      const color = readPixel(source, x, y);
      rSum += color.r;
      gSum += color.g;
      bSum += color.b;
      if (color.a > 24 && colorDistance(color, background) >= FOREGROUND_THRESHOLD) {
        fgRSum += color.r;
        fgGSum += color.g;
        fgBSum += color.b;
        fgCount += 1;
      }
      samples += 1;
    }
  }

  const avg = {
    r: samples > 0 ? rSum / samples : background.r,
    g: samples > 0 ? gSum / samples : background.g,
    b: samples > 0 ? bSum / samples : background.b,
    a: 255,
  };

  for (let y = box.y; y < box.y + box.h; y += 1) {
    for (let x = box.x; x < box.x + box.w; x += 1) {
      const color = readPixel(source, x, y);
      varianceSum += colorDistance(color, avg) ** 2;
    }
  }

  const foreground =
    fgCount > 0
      ? {
          r: fgRSum / fgCount,
          g: fgGSum / fgCount,
          b: fgBSum / fgCount,
          a: 255,
        }
      : avg;

  const density = samples > 0 ? fgCount / samples : 0;
  const variance = samples > 0 ? Math.sqrt(varianceSum / samples) : 0;
  const aspect = box.w / Math.max(1, box.h);

  let kind: ScreenshotRegionKind = "image";
  if (variance <= 18) {
    kind = "rect";
  } else if (box.h <= 28 && aspect >= 2.2 && density > 0.03 && density < 0.55) {
    kind = "text";
  } else if (box.h <= 42 && aspect >= 1.4 && density > 0.04 && density < 0.6) {
    kind = "text";
  } else if (density >= 0.75 && variance <= 28) {
    kind = "rect";
  }

  return {
    x: box.x,
    y: box.y,
    w: box.w,
    h: box.h,
    kind,
    fill: rgbaToHex(avg),
    foreground: rgbaToHex(foreground),
    density: Number(density.toFixed(4)),
    variance: Number(variance.toFixed(2)),
  };
}

export function analyzeScreenshotPixels(source: ScreenshotPixelSource): ScreenshotImportAnalysis {
  const backgroundColor = detectBackgroundColor(source);
  const mask = buildForegroundMask(source, backgroundColor);
  const components = detectComponents(source, mask);
  const regions = components.map((component) => summarizeRegion(source, backgroundColor, component));
  return {
    width: source.width,
    height: source.height,
    background: rgbaToHex(backgroundColor),
    regions,
  };
}

function makeTextNode(text: string, region: ScreenshotRegionWithAssets) {
  const node = createNode("text");
  node.name = "스크린샷 텍스트";
  node.frame = { ...node.frame, x: region.x, y: region.y, w: region.w, h: region.h, rotation: 0 };
  node.text = {
    value: text || "Text",
    style: {
      ...node.text!.style,
      fontSize: Math.max(12, Math.round(region.h * 0.68)),
      fontWeight: 500,
      lineHeight: 1.2,
      align: "left",
    },
    wrap: true,
    autoSize: false,
  };
  node.style = { ...node.style, fills: [{ type: "solid", color: region.foreground }], strokes: [] };
  return node;
}

function makeRectNode(region: ScreenshotRegionWithAssets) {
  const node = createNode("rect");
  node.name = "스크린샷 블록";
  node.frame = { ...node.frame, x: region.x, y: region.y, w: region.w, h: region.h, rotation: 0 };
  node.style = {
    ...node.style,
    fills: [{ type: "solid", color: region.fill }],
    strokes: [],
    radius: Math.min(16, Math.max(4, Math.round(Math.min(region.w, region.h) * 0.12))),
  };
  return node;
}

function makeImageNode(region: ScreenshotRegionWithAssets) {
  const node = createNode("image");
  node.name = "스크린샷 이미지";
  node.frame = { ...node.frame, x: region.x, y: region.y, w: region.w, h: region.h, rotation: 0 };
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
    src: region.imageSrc ?? "",
    fit: "cover",
  };
  node.style = { ...node.style, fills: [{ type: "solid", color: region.fill }], strokes: [] };
  return node;
}

export function buildScreenshotDocFromAnalysis(params: {
  analysis: ScreenshotImportAnalysis;
  fileName: string;
  viewportId?: WebImportViewportId;
  regions?: ScreenshotRegionWithAssets[];
}): { doc: Doc; importSource: WebImportSource } {
  const { analysis, fileName } = params;
  const regions: ScreenshotRegionWithAssets[] =
    params.regions ?? analysis.regions.map((region) => ({ ...region }));
  const viewport = getWebImportViewport(params.viewportId);
  const scale = viewport.width / Math.max(1, analysis.width);
  const scaledHeight = Math.max(viewport.minHeight, Math.round(analysis.height * scale));
  const doc = createDoc();
  const page = doc.pages[0]!;
  const pageNode = doc.nodes[page.rootId]!;
  const title = fileName.replace(/\.[^.]+$/, "") || "스크린샷 가져오기";
  const importSource: WebImportSource = {
    kind: "screenshot-file",
    url: fileName,
    viewportId: viewport.id,
    fileName,
    title,
    importedAt: new Date().toISOString(),
  };

  page.name = title;
  pageNode.name = title;
  pageNode.frame = { ...pageNode.frame, w: 8000, h: 6000 };

  const rootFrame = createNode("frame");
  rootFrame.name = `${title} · 스크린샷`;
  rootFrame.frame = { x: 320, y: 160, w: viewport.width, h: scaledHeight, rotation: 0 };
  rootFrame.style = {
    ...rootFrame.style,
    fills: [{ type: "solid", color: analysis.background }],
    strokes: [{ color: "#E5E7EB", width: 1, align: "inside" }],
    radius: 24,
  };
  rootFrame.clipContent = true;
  addNode(doc, rootFrame, page.rootId);

  for (const region of regions) {
    const scaled = {
      ...region,
      x: Math.round(region.x * scale),
      y: Math.round(region.y * scale),
      w: Math.max(8, Math.round(region.w * scale)),
      h: Math.max(8, Math.round(region.h * scale)),
    };
    if (scaled.kind === "text") {
      addNode(doc, makeTextNode(scaled.text ?? "Text", scaled), rootFrame.id);
      continue;
    }
    if (scaled.kind === "rect") {
      addNode(doc, makeRectNode(scaled), rootFrame.id);
      continue;
    }
    addNode(doc, makeImageNode(scaled), rootFrame.id);
  }

  if (!regions.length) {
    const fallback = createNode("image");
    fallback.name = "스크린샷";
    fallback.frame = { x: 0, y: 0, w: viewport.width, h: scaledHeight, rotation: 0 };
    fallback.style = { ...fallback.style, fills: [{ type: "solid", color: analysis.background }], strokes: [] };
    addNode(doc, fallback, rootFrame.id);
  }

  doc.imports = { web: importSource };
  return { doc, importSource };
}

function getScaledCanvasDimensions(width: number, height: number, maxDimension: number) {
  const scale = Math.min(1, maxDimension / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function cropCanvasToDataUrl(sourceCanvas: HTMLCanvasElement, region: ScreenshotRegion) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(region.w));
  canvas.height = Math.max(1, Math.round(region.h));
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.drawImage(
    sourceCanvas,
    region.x,
    region.y,
    region.w,
    region.h,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  return canvas.toDataURL("image/png");
}

type TextDetectionLike = {
  rawValue?: string;
};

type TextDetectorLike = {
  detect(input: HTMLCanvasElement): Promise<TextDetectionLike[]>;
};

function getTextDetector() {
  const ctor = (globalThis as unknown as { TextDetector?: new () => TextDetectorLike }).TextDetector;
  return ctor ? new ctor() : null;
}

async function detectRegionText(sourceCanvas: HTMLCanvasElement, region: ScreenshotRegion) {
  const detector = getTextDetector();
  if (!detector) return "";
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(region.w));
  canvas.height = Math.max(1, Math.round(region.h));
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.drawImage(sourceCanvas, region.x, region.y, region.w, region.h, 0, 0, canvas.width, canvas.height);
  const detections = await detector.detect(canvas).catch(() => []);
  return detections
    .map((entry) => (entry.rawValue ?? "").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join(" ")
    .trim();
}

async function loadImageFromFile(file: File) {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    const loaded = new Promise<HTMLImageElement>((resolve, reject) => {
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("스크린샷 이미지를 불러오지 못했습니다."));
    });
    image.src = objectUrl;
    return await loaded;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function screenshotFileToNullDoc(file: File, options: ScreenshotImportOptions = {}) {
  if (typeof document === "undefined") {
    throw new Error("브라우저 환경에서만 스크린샷 가져오기를 실행할 수 있습니다.");
  }
  const image = await loadImageFromFile(file);
  const fullCanvas = document.createElement("canvas");
  fullCanvas.width = image.naturalWidth || image.width;
  fullCanvas.height = image.naturalHeight || image.height;
  const fullContext = fullCanvas.getContext("2d");
  if (!fullContext) {
    throw new Error("스크린샷 캔버스를 초기화하지 못했습니다.");
  }
  fullContext.drawImage(image, 0, 0, fullCanvas.width, fullCanvas.height);

  const analysisSize = getScaledCanvasDimensions(
    fullCanvas.width,
    fullCanvas.height,
    options.maxAnalysisDimension ?? MAX_ANALYSIS_DIMENSION,
  );
  const analysisCanvas = document.createElement("canvas");
  analysisCanvas.width = analysisSize.width;
  analysisCanvas.height = analysisSize.height;
  const analysisContext = analysisCanvas.getContext("2d");
  if (!analysisContext) {
    throw new Error("스크린샷 분석 캔버스를 초기화하지 못했습니다.");
  }
  analysisContext.drawImage(fullCanvas, 0, 0, analysisCanvas.width, analysisCanvas.height);
  const analysisImageData = analysisContext.getImageData(0, 0, analysisCanvas.width, analysisCanvas.height);
  const analysis = analyzeScreenshotPixels({
    width: analysisImageData.width,
    height: analysisImageData.height,
    data: analysisImageData.data,
  });

  const scaleX = fullCanvas.width / analysis.width;
  const scaleY = fullCanvas.height / analysis.height;
  const mappedRegions = analysis.regions.map((region) => ({
    ...region,
    x: Math.max(0, Math.round(region.x * scaleX)),
    y: Math.max(0, Math.round(region.y * scaleY)),
    w: Math.max(4, Math.round(region.w * scaleX)),
    h: Math.max(4, Math.round(region.h * scaleY)),
  }));

  const regions: ScreenshotRegionWithAssets[] = [];
  for (const region of mappedRegions) {
    if (region.kind === "text") {
      const text = options.textDetector === false ? "" : await detectRegionText(fullCanvas, region);
      regions.push({ ...region, text: text || "Text" });
      continue;
    }
    if (region.kind === "rect") {
      regions.push(region);
      continue;
    }
    regions.push({ ...region, imageSrc: cropCanvasToDataUrl(fullCanvas, region) });
  }

  if (!regions.length) {
    regions.push({
      x: 0,
      y: 0,
      w: fullCanvas.width,
      h: fullCanvas.height,
      kind: "image",
      fill: analysis.background,
      foreground: "#111111",
      density: 1,
      variance: 0,
      imageSrc: fullCanvas.toDataURL("image/png"),
    });
  }

  const result = buildScreenshotDocFromAnalysis({
    analysis: {
      width: fullCanvas.width,
      height: fullCanvas.height,
      background: analysis.background,
      regions,
    },
    fileName: file.name || "screenshot.png",
    viewportId: options.viewportId,
    regions,
  });

  return {
    ...result,
    regionCount: regions.length,
  };
}
