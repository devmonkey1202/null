import { createHash } from "crypto";

import type { NodeWidget } from "@/advanced/doc/scene";

export type StoreWidgetCategory = "embed" | "data" | "ops";

export type StoreWidget = {
  storeId: string;
  name: string;
  description: string;
  detail?: string;
  version: string;
  category: StoreWidgetCategory;
  tags?: string[];
  featured?: boolean;
  approvalRequired?: boolean;
  sharePath?: string;
  defaultFrame: { w: number; h: number };
  widget: NodeWidget;
};

export type StoreWidgetFilters = {
  q?: string;
  category?: StoreWidgetCategory | "all";
  storeId?: string;
};

const STORE_VERSION = "2026.03.14";

function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(",")}}`;
  }
  return JSON.stringify(String(value));
}

function computeDigest(widget: StoreWidget) {
  return createHash("sha256")
    .update(
      stableStringify({
        storeId: widget.storeId,
        name: widget.name,
        description: widget.description,
        version: widget.version,
        category: widget.category,
        widget: widget.widget,
        defaultFrame: widget.defaultFrame,
      }),
    )
    .digest("hex");
}

const CATALOG: StoreWidget[] = [
  {
    storeId: "widget-embed-browser",
    name: "Embed Browser",
    description: "Secure URL embed with editor-safe sandbox defaults.",
    detail: "Reusable browser frame widget for previews, docs, demos, and internal tools.",
    version: "1.0.0",
    category: "embed",
    tags: ["embed", "browser", "preview"],
    featured: true,
    sharePath: "/widgets/store/widget-embed-browser",
    defaultFrame: { w: 480, h: 320 },
    widget: {
      kind: "sandbox",
      execution: "iframe",
      src: "https://example.com",
      title: "Embed Browser",
      sandbox: "allow-scripts allow-same-origin allow-forms",
      allow: "clipboard-read; clipboard-write",
      referrerPolicy: "no-referrer",
      allowedActions: ["resize", "toast"],
    },
  },
  {
    storeId: "widget-team-board",
    name: "Team Board",
    description: "Collaboration board widget with optimistic refresh hooks.",
    detail: "Lightweight board view for status, owners, and launch tracking inside design reviews.",
    version: "1.2.0",
    category: "data",
    tags: ["board", "status", "team"],
    featured: true,
    approvalRequired: true,
    sharePath: "/widgets/store/widget-team-board",
    defaultFrame: { w: 520, h: 340 },
    widget: {
      kind: "sandbox",
      execution: "iframe",
      src: "https://example.com/widgets/team-board",
      title: "Team Board",
      sandbox: "allow-scripts allow-same-origin",
      allow: "clipboard-read; clipboard-write",
      referrerPolicy: "strict-origin-when-cross-origin",
      allowedActions: ["toast", "navigate", "setVariable"],
    },
  },
  {
    storeId: "widget-perf-monitor",
    name: "Performance Monitor",
    description: "Large document FPS and event pressure widget.",
    detail: "Operational overlay widget for reviewing heavy pages before publish and handoff.",
    version: "1.0.1",
    category: "ops",
    tags: ["perf", "ops", "fps"],
    approvalRequired: true,
    sharePath: "/widgets/store/widget-perf-monitor",
    defaultFrame: { w: 400, h: 260 },
    widget: {
      kind: "sandbox",
      execution: "iframe",
      src: "https://example.com/widgets/perf-monitor",
      title: "Performance Monitor",
      sandbox: "allow-scripts allow-same-origin",
      allow: "clipboard-write",
      referrerPolicy: "same-origin",
      allowedActions: ["toast"],
    },
  },
];

function matchesWidgetFilters(widget: StoreWidget, filters: StoreWidgetFilters) {
  if (filters.storeId && widget.storeId !== filters.storeId) return false;
  if (filters.category && filters.category !== "all" && widget.category !== filters.category) return false;
  const q = filters.q?.trim().toLowerCase();
  if (!q) return true;
  return [widget.name, widget.description, widget.detail, ...(widget.tags ?? [])]
    .filter((value): value is string => Boolean(value))
    .some((value) => value.toLowerCase().includes(q));
}

export function listStoreWidgets(filters: StoreWidgetFilters = {}) {
  const widgets = CATALOG.filter((widget) => matchesWidgetFilters(widget, filters)).map((widget) => ({
    ...widget,
    digest: computeDigest(widget),
    storeVersion: STORE_VERSION,
  }));
  return { version: STORE_VERSION, widgets };
}

export function getStoreWidget(storeId: string) {
  const widget = CATALOG.find((item) => item.storeId === storeId) ?? null;
  if (!widget) return null;
  return {
    ...widget,
    digest: computeDigest(widget),
    storeVersion: STORE_VERSION,
  };
}
