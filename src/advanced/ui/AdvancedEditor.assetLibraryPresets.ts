
import type { PresetDefinition } from "./AdvancedEditor.types";
import type { Node, PrototypeAction, PrototypeInteraction } from "../doc/scene";
import {
  makeFrameNode,
  makeRectNode,
  makeEllipseNode,
  makeGroupNode,
  makeTextNode,
  fieldPlaceholder,
} from "./AdvancedEditor.nodes";
import { makeRuntimeId } from "./AdvancedEditor.utils";

type Size = { w: number; h: number };

type BuildCtx = {
  nodes: Record<string, Node>;
  add: <T extends Node>(node: T) => T;
  attach: (parent: Node, children: Node[]) => void;
};

function createBuilder(): BuildCtx {
  const nodes: Record<string, Node> = {};
  const add = <T extends Node>(node: T): T => {
    nodes[node.id] = node;
    return node;
  };
  const attach = (parent: Node, children: Node[]) => {
    parent.children = children.map((child) => child.id);
    children.forEach((child) => {
      child.parentId = parent.id;
    });
  };
  return { nodes, add, attach };
}

function addInteraction(node: Node, interaction: PrototypeInteraction) {
  if (!node.prototype) node.prototype = { interactions: [] };
  node.prototype.interactions = [...(node.prototype.interactions ?? []), interaction];
}

function addClickAction(node: Node, action: PrototypeAction) {
  addInteraction(node, { id: makeRuntimeId("proto"), trigger: "click", action });
}

function wireMockSubmit(node: Node, kind: "success" | "sent" | "error" = "success") {
  addClickAction(node, { type: "submit", url: `mock://${kind}` });
}

function wireSubmit(node: Node, url: string, options?: { method?: "POST" | "GET" | "PATCH" | "DELETE" | "PUT"; nextPageId?: string }) {
  addClickAction(node, { type: "submit", url, method: options?.method, nextPageId: options?.nextPageId });
}

const COLORS = {
  surface: "#FFFFFF",
  surfaceSecondary: "#F8FAFC",
  border: "#E2E8F0",
  borderLight: "#F1F5F9",
  subtle: "#F1F5F9",
  muted: "#CBD5E1",
  text: "#0F172A",
  textSecondary: "#334155",
  textMuted: "#64748B",
  textLight: "#94A3B8",
  primary: "#6366F1",
  primaryHover: "#4F46E5",
  primaryLight: "#EEF2FF",
  primaryText: "#FFFFFF",
  accent: "#2563EB",
  accentLight: "#DBEAFE",
  secondary: "#8B5CF6",
  secondaryLight: "#F5F3FF",
  danger: "#EF4444",
  dangerLight: "#FEF2F2",
  success: "#10B981",
  successLight: "#ECFDF5",
  warning: "#F59E0B",
  warningLight: "#FFFBEB",
  overlay: "#F8FAFC",
  dark: "#0F172A",
  darkSecondary: "#1E293B",
  gradient1Start: "#6366F1",
  gradient1End: "#8B5CF6",
  gradient2Start: "#3B82F6",
  gradient2End: "#06B6D4",
  avatarColors: ["#818CF8", "#A78BFA", "#F472B6", "#FB923C", "#34D399", "#38BDF8"],
};

const RADIUS = {
  xs: 6,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
};

const GAP = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 18,
};

const SIZE_MOBILE: Size = { w: 360, h: 640 };
const SIZE_PANEL: Size = { w: 420, h: 520 };
const SIZE_PANEL_WIDE: Size = { w: 520, h: 420 };
const SIZE_DESKTOP: Size = { w: 960, h: 600 };
const SIZE_WIDE: Size = { w: 1100, h: 680 };
const SIZE_MODAL: Size = { w: 420, h: 300 };
const SIZE_CARD: Size = { w: 320, h: 220 };

const PADDING_SCREEN = 20;
const PADDING_PANEL = 16;

type RootOptions = {
  fill?: string;
  stroke?: { color: string; width: number } | null;
  radius?: number;
  layout?: Node["layout"];
  padding?: { t: number; r: number; b: number; l: number };
  gap?: number;
};

function makeRoot(ctx: BuildCtx, name: string, origin: { x: number; y: number }, size: Size, options: RootOptions = {}) {
  const node = ctx.add(
    makeFrameNode(
      name,
      { x: origin.x, y: origin.y, w: size.w, h: size.h, rotation: 0 },
      {
        fill: options.fill ?? COLORS.surface,
        stroke: options.stroke ?? { color: COLORS.borderLight, width: 1 },
        radius: options.radius ?? RADIUS.lg,
        layout:
          options.layout ??
          ({
            mode: "auto",
            dir: "column",
            gap: options.gap ?? GAP.md,
            padding: options.padding ?? {
              t: PADDING_SCREEN,
              r: PADDING_SCREEN,
              b: PADDING_SCREEN,
              l: PADDING_SCREEN,
            },
            align: "start",
            wrap: false,
          } as Node["layout"]),
      },
    ),
  );
  node.style.effects = [{ type: "shadow", x: 0, y: 4, blur: 16, color: "#0F172A", opacity: 0.05 }];
  node.constraints = { scaleX: true, scaleY: true };
  return node;
}

function makeStack(
  ctx: BuildCtx,
  name: string,
  size: Size,
  dir: "row" | "column",
  options: {
    gap?: number;
    padding?: { t: number; r: number; b: number; l: number };
    fill?: string;
    stroke?: { color: string; width: number } | null;
    radius?: number;
    align?: "start" | "center" | "stretch" | "baseline" | "end";
    fillParent?: boolean;
  } = {},
) {
  const node = ctx.add(
    makeFrameNode(
      name,
      { x: 0, y: 0, w: size.w, h: size.h, rotation: 0 },
      {
        fill: options.fill ?? COLORS.surface,
        stroke: options.stroke ?? null,
        radius: options.radius ?? 0,
        layout: {
          mode: "auto",
          dir,
          gap: options.gap ?? GAP.sm,
          padding: options.padding ?? { t: 0, r: 0, b: 0, l: 0 },
          align: options.align ?? "start",
          wrap: false,
        },
        layoutSizing: options.fillParent ? { width: "fill", height: "fixed" } : undefined,
      },
    ),
  );
  return node;
}

function makeTitle(ctx: BuildCtx, text: string, width: number, size = 18) {
  return ctx.add(
    makeTextNode("타이틀", text, { x: 0, y: 0, w: width, h: size + 8, rotation: 0 }, { size, weight: 700 }),
  );
}

function makeSubtitle(ctx: BuildCtx, text: string, width: number, size = 12) {
  return ctx.add(
    makeTextNode("설명", text, { x: 0, y: 0, w: width, h: size + 6, rotation: 0 }, { size, color: COLORS.textMuted }),
  );
}

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "accent";

function makeButton(ctx: BuildCtx, label: string, width: number, variant: ButtonVariant = "primary") {
  const height = 40;
  const styles =
    variant === "primary"
      ? { fill: COLORS.primary, text: COLORS.primaryText, stroke: null as { color: string; width: number } | null }
      : variant === "accent"
        ? { fill: COLORS.accent, text: COLORS.primaryText, stroke: null as { color: string; width: number } | null }
        : variant === "danger"
          ? { fill: COLORS.danger, text: COLORS.primaryText, stroke: null as { color: string; width: number } | null }
          : variant === "ghost"
            ? { fill: COLORS.subtle, text: COLORS.textSecondary, stroke: null as { color: string; width: number } | null }
            : { fill: COLORS.surface, text: COLORS.text, stroke: { color: COLORS.border, width: 1 } };

  const frame = ctx.add(
    makeFrameNode(
      "버튼",
      { x: 0, y: 0, w: width, h: height, rotation: 0 },
      {
        fill: styles.fill,
        stroke: styles.stroke,
        radius: RADIUS.sm,
        layout: {
          mode: "auto",
          dir: "row",
          gap: 6,
          padding: { t: 10, r: 16, b: 10, l: 16 },
          align: "center",
          wrap: false,
        },
      },
    ),
  );
  if (variant === "primary" || variant === "accent") {
    frame.style.effects = [{ type: "shadow", x: 0, y: 2, blur: 8, color: variant === "accent" ? "#2563EB" : "#6366F1", opacity: 0.15 }];
  }
  const text = ctx.add(
    makeTextNode(
      "버튼 텍스트",
      label,
      { x: 0, y: 0, w: Math.max(40, width - 32), h: 20, rotation: 0 },
      { size: 13, weight: 600, color: styles.text, align: "center" },
    ),
  );
  ctx.attach(frame, [text]);
  return frame;
}

function makeInput(
  ctx: BuildCtx,
  placeholder: string,
  width: number,
  height = 44,
  options?: { name?: string; padding?: { t: number; r: number; b: number; l: number } },
) {
  const frame = ctx.add(
    makeFrameNode(
      options?.name ?? "입력",
      { x: 0, y: 0, w: width, h: height, rotation: 0 },
      {
        fill: COLORS.surfaceSecondary,
        stroke: { color: COLORS.border, width: 1 },
        radius: RADIUS.sm,
        layout: {
          mode: "auto",
          dir: "row",
          gap: 8,
          padding: options?.padding ?? { t: 12, r: 14, b: 12, l: 14 },
          align: "center",
          wrap: false,
        },
      },
    ),
  );
  const text = ctx.add(
    makeTextNode(
      "플레이스홀더",
      placeholder,
      { x: 0, y: 0, w: Math.max(40, width - 28), h: 18, rotation: 0 },
      { size: 13, color: COLORS.textLight },
    ),
  );
  ctx.attach(frame, [text]);
  return frame;
}

function makeDropzone(ctx: BuildCtx, label: string, width: number, height = 180) {
  const frame = makeInput(ctx, label, width, height, {
    name: "파일 업로드",
    padding: { t: 18, r: 18, b: 18, l: 18 },
  });
  frame.style = {
    ...frame.style,
    fills: [{ type: "solid", color: COLORS.subtle }],
    strokes: [{ color: COLORS.border, width: 1, align: "inside" }],
    radius: RADIUS.md,
  };
  return frame;
}
function makeChip(
  ctx: BuildCtx,
  label: string,
  options: { fill?: string; text?: string; stroke?: { color: string; width: number } | null } = {},
) {
  const width = Math.max(64, label.length * 8 + 28);
  const frame = ctx.add(
    makeFrameNode(
      "칩",
      { x: 0, y: 0, w: width, h: 30, rotation: 0 },
      {
        fill: options.fill ?? COLORS.subtle,
        stroke: options.stroke ?? null,
        radius: RADIUS.pill,
        layout: {
          mode: "auto",
          dir: "row",
          gap: 6,
          padding: { t: 6, r: 14, b: 6, l: 14 },
          align: "center",
          wrap: false,
        },
      },
    ),
  );
  const text = ctx.add(
    makeTextNode("칩 텍스트", label, { x: 0, y: 0, w: width - 24, h: 16, rotation: 0 }, {
      size: 12,
      weight: 500,
      color: options.text ?? COLORS.textSecondary,
    }),
  );
  ctx.attach(frame, [text]);
  return frame;
}

function makeBadge(
  ctx: BuildCtx,
  label: string,
  options: { fill?: string; text?: string; stroke?: { color: string; width: number } | null } = {},
) {
  const width = Math.max(44, label.length * 7 + 22);
  const frame = ctx.add(
    makeFrameNode(
      "배지",
      { x: 0, y: 0, w: width, h: 24, rotation: 0 },
      {
        fill: options.fill ?? COLORS.primaryLight,
        stroke: options.stroke ?? null,
        radius: RADIUS.pill,
        layout: {
          mode: "auto",
          dir: "row",
          gap: 4,
          padding: { t: 4, r: 10, b: 4, l: 10 },
          align: "center",
          wrap: false,
        },
      },
    ),
  );
  const text = ctx.add(
    makeTextNode("배지 텍스트", label, { x: 0, y: 0, w: width - 14, h: 14, rotation: 0 }, {
      size: 10,
      weight: 600,
      color: options.text ?? COLORS.primary,
    }),
  );
  ctx.attach(frame, [text]);
  return frame;
}

function makeAvatar(ctx: BuildCtx, size = 32, color = COLORS.subtle) {
  return ctx.add(makeEllipseNode("아바타", { x: 0, y: 0, w: size, h: size, rotation: 0 }, { fill: color }));
}

function makeIconBox(ctx: BuildCtx, size = 28, color = COLORS.subtle) {
  return ctx.add(makeRectNode("아이콘", { x: 0, y: 0, w: size, h: size, rotation: 0 }, { fill: color, radius: 8 }));
}

function makeListItem(
  ctx: BuildCtx,
  label: string,
  meta: string | undefined,
  width: number,
  leading: "avatar" | "icon" | "none" = "avatar",
) {
  const row = makeStack(ctx, "리스트 아이템", { w: width, h: 60 }, "row", {
    gap: 12,
    padding: { t: 12, r: 14, b: 12, l: 14 },
    align: "center",
    fill: COLORS.surface,
    stroke: { color: COLORS.borderLight, width: 1 },
    radius: RADIUS.md,
  });
  row.style.effects = [{ type: "shadow", x: 0, y: 1, blur: 3, color: "#0F172A", opacity: 0.03 }];

  const avatarColorIdx = Math.abs(label.charCodeAt(0) ?? 0) % COLORS.avatarColors.length;
  const leadNode = leading === "avatar"
    ? makeAvatar(ctx, 36, COLORS.avatarColors[avatarColorIdx])
    : leading === "icon" ? makeIconBox(ctx, 32, COLORS.primaryLight) : null;
  const textWidth = width - (leading === "none" ? 40 : 88);
  const textStack = makeStack(ctx, "텍스트", { w: textWidth, h: 36 }, "column", { gap: 3 });
  const title = ctx.add(makeTextNode("제목", label, { x: 0, y: 0, w: textWidth, h: 18, rotation: 0 }, { size: 13, weight: 600, color: COLORS.text }));
  const subtitle = meta
    ? ctx.add(
        makeTextNode("메타", meta, { x: 0, y: 0, w: textWidth, h: 16, rotation: 0 }, { size: 11, color: COLORS.textMuted }),
      )
    : null;
  ctx.attach(textStack, subtitle ? [title, subtitle] : [title]);
  ctx.attach(row, leadNode ? [leadNode, textStack] : [textStack]);
  return row;
}

function makeToggle(ctx: BuildCtx, on = false) {
  const group = ctx.add(makeGroupNode("토글", { x: 0, y: 0, w: 40, h: 22, rotation: 0 }));
  const track = ctx.add(
    makeRectNode("트랙", { x: 0, y: 0, w: 40, h: 22, rotation: 0 }, { fill: on ? COLORS.primary : COLORS.muted, radius: 11 }),
  );
  const knob = ctx.add(
    makeEllipseNode("노브", { x: on ? 20 : 2, y: 2, w: 18, h: 18, rotation: 0 }, { fill: COLORS.surface }),
  );
  knob.style.effects = [{ type: "shadow", x: 0, y: 1, blur: 2, color: "#0F172A", opacity: 0.1 }];
  group.children = [track.id, knob.id];
  track.parentId = group.id;
  knob.parentId = group.id;
  return group;
}

function makeToggleRow(ctx: BuildCtx, label: string, width: number) {
  const row = makeStack(ctx, "토글 행", { w: width, h: 48 }, "row", {
    gap: 12,
    padding: { t: 12, r: 14, b: 12, l: 14 },
    align: "center",
    fill: COLORS.surface,
    stroke: { color: COLORS.borderLight, width: 1 },
    radius: RADIUS.md,
  });
  const text = ctx.add(makeTextNode("라벨", label, { x: 0, y: 0, w: width - 88, h: 18, rotation: 0 }, { size: 13, weight: 500, color: COLORS.text }));
  const toggle = makeToggle(ctx);
  ctx.attach(row, [text, toggle]);
  return row;
}

function makeCheckboxRow(ctx: BuildCtx, label: string, width: number) {
  const row = makeStack(ctx, "체크 행", { w: width, h: 36 }, "row", {
    gap: 10,
    padding: { t: 8, r: 12, b: 8, l: 12 },
    align: "center",
    fill: COLORS.surface,
    stroke: { color: COLORS.border, width: 1 },
    radius: RADIUS.md,
  });
  const box = ctx.add(
    makeRectNode("체크", { x: 0, y: 0, w: 16, h: 16, rotation: 0 }, { fill: COLORS.surface, stroke: { color: COLORS.border, width: 1 }, radius: 4 }),
  );
  const text = ctx.add(makeTextNode("라벨", label, { x: 0, y: 0, w: width - 80, h: 18, rotation: 0 }, { size: 12 }));
  ctx.attach(row, [box, text]);
  return row;
}

function makeProgressDots(ctx: BuildCtx, count = 3, active = 0) {
  const width = count * 8 + (count - 1) * 6;
  const row = makeStack(ctx, "페이지 표시", { w: width, h: 12 }, "row", { gap: 6, align: "center" });
  const dots = Array.from({ length: count }).map((_, idx) =>
    ctx.add(makeEllipseNode("점", { x: 0, y: 0, w: 8, h: 8, rotation: 0 }, { fill: idx === active ? COLORS.primary : COLORS.muted })),
  );
  ctx.attach(row, dots);
  return row;
}

function makeStatCard(ctx: BuildCtx, label: string, value: string, size: Size) {
  const card = makeStack(ctx, "스탯 카드", size, "column", {
    gap: 8,
    padding: { t: 16, r: 16, b: 16, l: 16 },
    fill: COLORS.surface,
    stroke: { color: COLORS.borderLight, width: 1 },
    radius: RADIUS.lg,
  });
  card.style.effects = [{ type: "shadow", x: 0, y: 2, blur: 6, color: "#0F172A", opacity: 0.03 }];
  const labelNode = ctx.add(makeTextNode("라벨", label, { x: 0, y: 0, w: size.w - 32, h: 16, rotation: 0 }, { size: 11, color: COLORS.textMuted }));
  const valueNode = ctx.add(makeTextNode("값", value, { x: 0, y: 0, w: size.w - 32, h: 28, rotation: 0 }, { size: 22, weight: 700, color: COLORS.text }));
  ctx.attach(card, [labelNode, valueNode]);
  return card;
}

function makeTablePlaceholder(ctx: BuildCtx, width: number, height: number, rows = 4) {
  const table = makeStack(ctx, "테이블", { w: width, h: height }, "column", {
    gap: 8,
    padding: { t: 10, r: 10, b: 10, l: 10 },
    fill: COLORS.surface,
    stroke: { color: COLORS.border, width: 1 },
    radius: RADIUS.md,
  });
  const header = ctx.add(makeRectNode("헤더", { x: 0, y: 0, w: width - 20, h: 24, rotation: 0 }, { fill: COLORS.subtle, radius: 6 }));
  const rowNodes = Array.from({ length: rows }).map(() =>
    ctx.add(makeRectNode("행", { x: 0, y: 0, w: width - 20, h: 20, rotation: 0 }, { fill: COLORS.muted, radius: 6 })),
  );
  ctx.attach(table, [header, ...rowNodes]);
  return table;
}

function makeContentCard(ctx: BuildCtx, width: number, height: number, title: string, meta?: string) {
  const card = makeStack(ctx, "콘텐츠 카드", { w: width, h: height }, "column", {
    gap: 10,
    padding: { t: 0, r: 0, b: 14, l: 0 },
    fill: COLORS.surface,
    stroke: { color: COLORS.borderLight, width: 1 },
    radius: RADIUS.lg,
  });
  card.style.effects = [{ type: "shadow", x: 0, y: 2, blur: 8, color: "#0F172A", opacity: 0.04 }];
  const imageH = Math.max(80, Math.min(140, height - 80));
  const image = ctx.add(makeRectNode("썸네일", { x: 0, y: 0, w: width, h: imageH, rotation: 0 }, { fill: COLORS.subtle, radius: 0 }));
  image.style.radius = 0;
  const textArea = makeStack(ctx, "텍스트 영역", { w: width, h: height - imageH - 14 }, "column", {
    gap: 4,
    padding: { t: 4, r: 14, b: 0, l: 14 },
  });
  const titleNode = ctx.add(makeTextNode("제목", title, { x: 0, y: 0, w: width - 28, h: 18, rotation: 0 }, { size: 13, weight: 600, color: COLORS.text }));
  const metaNode = meta
    ? ctx.add(makeTextNode("메타", meta, { x: 0, y: 0, w: width - 28, h: 16, rotation: 0 }, { size: 11, color: COLORS.textMuted }))
    : null;
  ctx.attach(textArea, metaNode ? [titleNode, metaNode] : [titleNode]);
  ctx.attach(card, [image, textArea]);
  return card;
}

function makePlanCard(ctx: BuildCtx, name: string, price: string, width: number, highlight = false) {
  const card = makeStack(ctx, "플랜 카드", { w: width, h: 100 }, "column", {
    gap: 8,
    padding: { t: 16, r: 16, b: 16, l: 16 },
    fill: highlight ? COLORS.primaryLight : COLORS.surface,
    stroke: { color: highlight ? COLORS.primary : COLORS.borderLight, width: highlight ? 2 : 1 },
    radius: RADIUS.lg,
  });
  if (highlight) {
    card.style.effects = [{ type: "shadow", x: 0, y: 4, blur: 12, color: "#6366F1", opacity: 0.1 }];
  } else {
    card.style.effects = [{ type: "shadow", x: 0, y: 2, blur: 6, color: "#0F172A", opacity: 0.03 }];
  }
  const title = ctx.add(makeTextNode("플랜", name, { x: 0, y: 0, w: width - 32, h: 18, rotation: 0 }, { size: 14, weight: 700, color: highlight ? COLORS.primary : COLORS.text }));
  const priceNode = ctx.add(makeTextNode("가격", price, { x: 0, y: 0, w: width - 32, h: 18, rotation: 0 }, { size: 13, color: COLORS.textMuted }));
  ctx.attach(card, [title, priceNode]);
  return card;
}

function makeHeaderRow(ctx: BuildCtx, title: string, width: number, actionLabel?: string) {
  const header = makeStack(ctx, "헤더", { w: width, h: 40 }, "row", { gap: 12, align: "center" });
  const titleNode = makeTitle(ctx, title, Math.max(100, width - (actionLabel ? 110 : 0)), 18);
  if (actionLabel) {
    const action = makeButton(ctx, actionLabel, 90, "ghost");
    wireMockSubmit(action, "sent");
    ctx.attach(header, [titleNode, action]);
  } else {
    ctx.attach(header, [titleNode]);
  }
  return header;
}
type AssetVariant =
  | "flow"
  | "ui"
  | "settings"
  | "content"
  | "communication"
  | "productivity"
  | "board"
  | "timeline"
  | "media"
  | "analytics"
  | "feedback"
  | "form"
  | "commerce"
  | "template"
  | "appauth";

type GroupDef = { title: string; variant: AssetVariant; ids: string[] };

const GROUPS: GroupDef[] = [
  {
    title: "신규 사용자 여정+",
    variant: "flow",
    ids: [
      "asset-onboarding-swipe",
      "asset-permission-request",
      "asset-profile-edit",
      "asset-settings-center",
      "asset-search-home",
      "asset-notification-center",
      "asset-help-faq",
      "asset-consent-policy",
      "asset-otp-2fa",
      "asset-subscription-upgrade",
      "asset-account-recovery",
      "asset-security-center",
      "asset-account-delete-flow",
    ],
  },
  {
    title: "기본 UI+",
    variant: "ui",
    ids: [
      "asset-ui-header",
      "asset-ui-tabbar",
      "asset-ui-sidebar",
      "asset-ui-breadcrumb",
      "asset-ui-sticky-cta",
      "asset-ui-section-header",
      "asset-ui-modal-sheet",
      "asset-ui-select-tabs",
      "asset-ui-pagination",
      "asset-ui-date-slider",
      "asset-accessibility-focus-skip",
      "asset-keyboard-navigation-state",
      "asset-tooltip-help-pattern",
    ],
  },
  {
    title: "설정/환경+",
    variant: "settings",
    ids: [
      "asset-settings-locale",
      "asset-settings-notification-matrix",
      "asset-settings-accessibility-theme",
      "asset-cookie-privacy-banner",
      "asset-app-update-modal",
    ],
  },
  {
    title: "콘텐츠/커뮤니티+",
    variant: "content",
    ids: [
      "asset-content-feed",
      "asset-content-detail",
      "asset-content-comment-thread",
      "asset-content-user-card",
      "asset-content-tag-page",
      "asset-content-bookmark",
      "asset-content-ranking",
      "asset-content-report",
    ],
  },
  {
    title: "커뮤니케이션+",
    variant: "communication",
    ids: [
      "asset-chat-working",
      "asset-chat-list",
      "asset-chat-room",
      "asset-chat-attachment",
      "asset-chat-mention",
      "asset-group-channel",
      "asset-call-ui",
    ],
  },
  {
    title: "생산성/업무+",
    variant: "productivity",
    ids: [
      "asset-todo-list",
      "asset-calendar",
      "asset-note-editor",
      "asset-member-role",
      "asset-approval-flow",
    ],
  },
  { title: "프로젝트 보드+", variant: "board", ids: ["asset-kanban-board"] },
  { title: "타임라인/차트+", variant: "timeline", ids: ["asset-gantt-timeline"] },
  {
    title: "미디어/콘텐츠+",
    variant: "media",
    ids: [
      "asset-media-upload",
      "asset-media-gallery",
      "asset-media-lightbox",
      "asset-media-player",
      "asset-media-story",
      "asset-media-live",
    ],
  },
  {
    title: "분석/운영+",
    variant: "analytics",
    ids: [
      "asset-kpi-cards",
      "asset-chart-panel",
      "asset-data-table",
      "asset-user-admin",
      "asset-audit-log",
      "asset-billing-manage",
      "asset-system-console",
      "asset-data-import-export",
      "asset-monitoring-summary",
    ],
  },
  {
    title: "피드백/상태+",
    variant: "feedback",
    ids: [
      "asset-skeleton-loading",
      "asset-empty-state",
      "asset-toast-feedback",
      "asset-confirm-modal",
      "asset-offline-network",
      "asset-error-pages",
    ],
  },
  {
    title: "폼/입력+",
    variant: "form",
    ids: [
      "asset-form-wizard",
      "asset-form-validation",
      "asset-input-masking",
      "asset-upload-dropzone",
      "asset-address-search",
    ],
  },
  {
    title: "상거래/결제+",
    variant: "commerce",
    ids: [
      "asset-commerce-catalog",
      "asset-commerce-inventory",
      "asset-commerce-cart",
      "asset-commerce-payment-method",
      "asset-commerce-price-table",
      "asset-commerce-payment-result",
      "asset-commerce-coupon",
    ],
  },
  {
    title: "템플릿/스타터+",
    variant: "template",
    ids: [
      "asset-template-blank",
      "asset-template-landing",
      "asset-template-dashboard",
      "asset-template-community",
      "asset-template-service",
    ],
  },
  {
    title: "앱 인증+",
    variant: "appauth",
    ids: [
      "asset-auth-login",
      "asset-auth-register",
      "asset-auth-profile",
    ],
  },
];

const CATEGORY_ICONS: Record<string, string> = {
  "신규 사용자 여정+": "🚀",
  "기본 UI+": "🧩",
  "설정/환경+": "⚙️",
  "콘텐츠/커뮤니티+": "📝",
  "커뮤니케이션+": "💬",
  "생산성/업무+": "✅",
  "프로젝트 보드+": "📋",
  "타임라인/차트+": "📊",
  "미디어/콘텐츠+": "🎬",
  "분석/운영+": "📈",
  "피드백/상태+": "🔔",
  "폼/입력+": "📄",
  "상거래/결제+": "🛒",
  "템플릿/스타터+": "🎯",
  "앱 인증+": "🔐",
};

const ASSET_DESCRIPTIONS: Record<string, string> = {
  "asset-onboarding-swipe": "스와이프 카드로 서비스를 소개하는 온보딩 화면",
  "asset-permission-request": "카메라·위치·알림 등 권한 요청 화면",
  "asset-profile-edit": "이름, 소개 등 프로필 편집 폼",
  "asset-settings-center": "알림, 다크모드 등 토글 설정 화면",
  "asset-search-home": "검색 입력 + 최근 검색·추천 결과",
  "asset-notification-center": "수신 알림 목록과 시간 표시",
  "asset-help-faq": "도움말 및 FAQ 질문 목록",
  "asset-consent-policy": "개인정보·이용약관 동의 체크박스 폼",
  "asset-otp-2fa": "6자리 인증 코드 입력 화면",
  "asset-subscription-upgrade": "플랜 선택과 업그레이드 화면",
  "asset-account-recovery": "이메일로 계정 복구 요청 폼",
  "asset-security-center": "보안 설정 토글 목록",
  "asset-account-delete-flow": "계정 삭제 경고 + 확인 입력",
  "asset-ui-header": "로고·네비·CTA 버튼 상단 헤더",
  "asset-ui-tabbar": "홈·검색·알림·설정 하단 탭바",
  "asset-ui-sidebar": "대시보드·사용자·결제 사이드 메뉴",
  "asset-ui-breadcrumb": "홈 > 프로젝트 > 상세 경로 표시",
  "asset-ui-sticky-cta": "하단 고정 업그레이드 CTA 배너",
  "asset-ui-section-header": "섹션 제목 + 더보기 링크",
  "asset-ui-modal-sheet": "오버레이 + 바텀시트 모달",
  "asset-ui-select-tabs": "전체·진행중·완료 필터 탭",
  "asset-ui-pagination": "페이지 번호 네비게이션",
  "asset-ui-date-slider": "날짜 선택 슬라이더",
  "asset-accessibility-focus-skip": "콘텐츠 바로가기 접근성 스킵",
  "asset-keyboard-navigation-state": "키보드 포커스 상태 표시",
  "asset-tooltip-help-pattern": "아이콘 + 도움말 툴팁",
  "asset-settings-locale": "언어 및 지역 설정 토글",
  "asset-settings-notification-matrix": "알림 종류별 on/off 매트릭스",
  "asset-settings-accessibility-theme": "고대비·큰 글자·테마 전환",
  "asset-cookie-privacy-banner": "쿠키 동의 배너",
  "asset-app-update-modal": "앱 업데이트 알림 모달",
  "asset-content-feed": "카드형 콘텐츠 피드 목록",
  "asset-content-detail": "히어로 이미지 + 제목·설명 상세",
  "asset-content-comment-thread": "댓글·답글·신고 스레드",
  "asset-content-user-card": "아바타·이름·팔로우 사용자 카드",
  "asset-content-tag-page": "태그 필터 + 카드 그리드",
  "asset-content-bookmark": "저장한 콘텐츠 목록 + 해제",
  "asset-content-ranking": "인기순 랭킹 목록",
  "asset-content-report": "신고 사유 선택 + 제출",
  "asset-chat-working": "실시간 채팅 — API 연동 완료",
  "asset-chat-list": "채팅방 목록 + 읽지 않은 메시지",
  "asset-chat-room": "채팅 메시지 + 입력창 (API 연동)",
  "asset-chat-attachment": "파일 첨부 목록 + 업로드",
  "asset-chat-mention": "@ 멘션 알림 목록",
  "asset-group-channel": "채널 목록 + 멤버 패널",
  "asset-call-ui": "음성/영상 통화 UI",
  "asset-todo-list": "할일 추가·체크 목록 (API 연동)",
  "asset-calendar": "월간 캘린더 그리드",
  "asset-note-editor": "텍스트 에디터 + 저장",
  "asset-member-role": "멤버 역할 관리 테이블",
  "asset-approval-flow": "요청→검토→승인 단계 카드",
  "asset-kanban-board": "할 일·진행중·완료 칸반 보드",
  "asset-gantt-timeline": "작업별 일정 간트 차트",
  "asset-media-upload": "드래그&드롭 파일 업로드",
  "asset-media-gallery": "썸네일 그리드 갤러리",
  "asset-media-lightbox": "전체화면 이미지 뷰어",
  "asset-media-player": "비디오 재생 + 컨트롤",
  "asset-media-story": "스토리 진행바 + 전체화면",
  "asset-media-live": "라이브 영상 + 실시간 채팅",
  "asset-kpi-cards": "방문자·전환율·매출 KPI 요약",
  "asset-chart-panel": "차트 영역 + 기간 필터",
  "asset-data-table": "데이터 테이블 + 내보내기",
  "asset-user-admin": "사용자 관리 테이블",
  "asset-audit-log": "접근·변경 감사 로그",
  "asset-billing-manage": "플랜 비교 + 결제 내역",
  "asset-system-console": "터미널 스타일 콘솔",
  "asset-data-import-export": "가져오기/내보내기 영역",
  "asset-monitoring-summary": "서버 응답·에러율 모니터링",
  "asset-skeleton-loading": "로딩 스켈레톤 플레이스홀더",
  "asset-empty-state": "데이터 없음 빈 상태 안내",
  "asset-toast-feedback": "저장 완료 토스트 알림",
  "asset-confirm-modal": "확인/취소 다이얼로그",
  "asset-offline-network": "네트워크 오프라인 경고 배너",
  "asset-error-pages": "404 에러 페이지",
  "asset-form-wizard": "단계별 폼 위저드",
  "asset-form-validation": "이메일 검증 에러 폼",
  "asset-input-masking": "전화번호·날짜 포맷 마스킹",
  "asset-upload-dropzone": "파일 드롭존 + 업로드",
  "asset-address-search": "주소 검색 결과 목록",
  "asset-commerce-catalog": "상품 카드/카테고리/재고 표시가 포함된 카탈로그 화면",
  "asset-commerce-inventory": "출고/배송 상태와 재고 현황을 함께 보는 운영 화면",
  "asset-commerce-cart": "장바구니 아이템 + 결제",
  "asset-commerce-payment-method": "결제 수단 목록",
  "asset-commerce-price-table": "Starter·Pro·Team 가격표",
  "asset-commerce-payment-result": "결제 완료 확인",
  "asset-commerce-coupon": "쿠폰 코드 적용",
  "asset-template-blank": "빈 캔버스 시작",
  "asset-template-landing": "히어로 + 특징 + CTA 랜딩",
  "asset-template-dashboard": "사이드바 + KPI + 테이블 대시보드",
  "asset-template-community": "피드 + 사이드바 커뮤니티",
  "asset-template-service": "히어로 + 단계 + 상담 서비스",
  "asset-auth-login": "이메일/비밀번호 로그인 폼. appAuth login 액션 연결됨",
  "asset-auth-register": "이메일/비밀번호/이름 회원가입 폼. appAuth register 액션 연결됨",
  "asset-auth-profile": "로그인 사용자 정보 표시 + 로그아웃. $app_user 변수 바인딩됨",
};

const ASSET_LABELS: Record<string, string> = {
  "asset-onboarding-swipe": "온보딩 스와이프",
  "asset-permission-request": "권한 요청",
  "asset-profile-edit": "프로필 편집",
  "asset-settings-center": "설정 센터",
  "asset-search-home": "검색 홈",
  "asset-notification-center": "알림 센터",
  "asset-help-faq": "도움말/FAQ",
  "asset-consent-policy": "동의/정책 안내",
  "asset-otp-2fa": "OTP/2FA 인증",
  "asset-subscription-upgrade": "구독 업그레이드",
  "asset-account-recovery": "계정 복구",
  "asset-security-center": "보안 센터",
  "asset-account-delete-flow": "계정 삭제 플로우",
  "asset-ui-header": "UI 헤더",
  "asset-ui-tabbar": "UI 탭바",
  "asset-ui-sidebar": "UI 사이드바",
  "asset-ui-breadcrumb": "브레드크럼",
  "asset-ui-sticky-cta": "스티키 CTA",
  "asset-ui-section-header": "섹션 헤더",
  "asset-ui-modal-sheet": "모달 시트",
  "asset-ui-select-tabs": "선택 탭",
  "asset-ui-pagination": "페이지네이션",
  "asset-ui-date-slider": "날짜 슬라이더",
  "asset-accessibility-focus-skip": "접근성 포커스 스킵",
  "asset-keyboard-navigation-state": "키보드 내비게이션 상태",
  "asset-tooltip-help-pattern": "툴팁 도움말 패턴",
  "asset-settings-locale": "언어/로케일 설정",
  "asset-settings-notification-matrix": "알림 매트릭스 설정",
  "asset-settings-accessibility-theme": "접근성/테마 설정",
  "asset-cookie-privacy-banner": "쿠키/프라이버시 배너",
  "asset-app-update-modal": "앱 업데이트 모달",
  "asset-content-feed": "콘텐츠 피드",
  "asset-content-detail": "콘텐츠 상세",
  "asset-content-comment-thread": "댓글 스레드",
  "asset-content-user-card": "사용자 카드",
  "asset-content-tag-page": "태그 페이지",
  "asset-content-bookmark": "북마크",
  "asset-content-ranking": "랭킹",
  "asset-content-report": "리포트",
  "asset-chat-working": "실기능 채팅",
  "asset-chat-list": "채팅 목록",
  "asset-chat-room": "채팅룸",
  "asset-chat-attachment": "채팅 첨부",
  "asset-chat-mention": "멘션",
  "asset-group-channel": "그룹 채널",
  "asset-call-ui": "콜 UI",
  "asset-todo-list": "할일 목록",
  "asset-calendar": "캘린더",
  "asset-note-editor": "노트 에디터",
  "asset-member-role": "멤버 역할/권한",
  "asset-approval-flow": "승인 플로우",
  "asset-kanban-board": "칸반 보드",
  "asset-gantt-timeline": "간트 타임라인",
  "asset-media-upload": "미디어 업로드",
  "asset-media-gallery": "미디어 갤러리",
  "asset-media-lightbox": "라이트박스",
  "asset-media-player": "미디어 플레이어",
  "asset-media-story": "스토리",
  "asset-media-live": "라이브",
  "asset-kpi-cards": "KPI 카드",
  "asset-chart-panel": "차트 패널",
  "asset-data-table": "데이터 테이블",
  "asset-user-admin": "사용자 관리자",
  "asset-audit-log": "감사 로그",
  "asset-billing-manage": "빌링 관리",
  "asset-system-console": "시스템 콘솔",
  "asset-data-import-export": "데이터 가져오기/내보내기",
  "asset-monitoring-summary": "모니터링 요약",
  "asset-skeleton-loading": "스켈레톤 로딩",
  "asset-empty-state": "빈 상태",
  "asset-toast-feedback": "토스트 피드백",
  "asset-confirm-modal": "확인 모달",
  "asset-offline-network": "오프라인/네트워크",
  "asset-error-pages": "에러 페이지",
  "asset-form-wizard": "폼 위저드",
  "asset-form-validation": "폼 검증",
  "asset-input-masking": "입력 마스킹",
  "asset-upload-dropzone": "업로드 드롭존",
  "asset-address-search": "주소 검색",
  "asset-commerce-catalog": "상품 카탈로그",
  "asset-commerce-inventory": "배송/재고",
  "asset-commerce-cart": "장바구니",
  "asset-commerce-payment-method": "결제 수단",
  "asset-commerce-price-table": "가격표",
  "asset-commerce-payment-result": "결제 결과",
  "asset-commerce-coupon": "쿠폰",
  "asset-template-blank": "빈 템플릿",
  "asset-template-landing": "랜딩 템플릿",
  "asset-template-dashboard": "대시보드 템플릿",
  "asset-template-community": "커뮤니티 템플릿",
  "asset-template-service": "서비스 템플릿",
  "asset-auth-login": "앱 로그인",
  "asset-auth-register": "앱 회원가입",
  "asset-auth-profile": "앱 프로필",
};

function getSizeForAsset(variant: AssetVariant, id: string): Size {
  if (variant === "flow") return SIZE_MOBILE;
  if (variant === "ui") {
    if (id === "asset-ui-header") return { w: 960, h: 72 };
    if (id === "asset-ui-tabbar") return { w: 360, h: 72 };
    if (id === "asset-ui-sidebar") return { w: 240, h: 420 };
    if (id === "asset-ui-breadcrumb") return { w: 480, h: 56 };
    if (id === "asset-ui-sticky-cta") return { w: 480, h: 72 };
    if (id === "asset-ui-section-header") return { w: 480, h: 56 };
    if (id === "asset-ui-modal-sheet") return { w: 420, h: 520 };
    if (id === "asset-ui-select-tabs") return { w: 360, h: 56 };
    if (id === "asset-ui-pagination") return { w: 360, h: 56 };
    if (id === "asset-ui-date-slider") return { w: 520, h: 80 };
    if (id === "asset-accessibility-focus-skip") return { w: 480, h: 160 };
    if (id === "asset-keyboard-navigation-state") return { w: 480, h: 200 };
    if (id === "asset-tooltip-help-pattern") return { w: 320, h: 160 };
  }
  if (variant === "settings") {
    if (id === "asset-settings-notification-matrix") return { w: 520, h: 320 };
    if (id === "asset-cookie-privacy-banner") return { w: 520, h: 120 };
    if (id === "asset-app-update-modal") return SIZE_MODAL;
    return SIZE_PANEL;
  }
  if (variant === "content") {
    if (id === "asset-content-user-card") return SIZE_CARD;
    if (id === "asset-content-comment-thread") return SIZE_PANEL;
    if (id === "asset-content-report") return SIZE_PANEL;
    if (id === "asset-content-bookmark" || id === "asset-content-ranking") return SIZE_PANEL;
    return SIZE_DESKTOP;
  }
  if (variant === "communication") {
    if (id === "asset-chat-room") return SIZE_DESKTOP;
    if (id === "asset-group-channel") return SIZE_DESKTOP;
    if (id === "asset-chat-working") return { w: 360, h: 520 };
    if (id === "asset-call-ui") return { w: 360, h: 520 };
    return SIZE_PANEL;
  }
  if (variant === "productivity") {
    if (id === "asset-calendar") return { w: 520, h: 420 };
    if (id === "asset-member-role") return { w: 520, h: 420 };
    return SIZE_PANEL;
  }
  if (variant === "board") return { w: 960, h: 520 };
  if (variant === "timeline") return { w: 1100, h: 420 };
  if (variant === "media") {
    if (id === "asset-media-gallery") return SIZE_DESKTOP;
    if (id === "asset-media-lightbox") return { w: 520, h: 420 };
    if (id === "asset-media-player") return { w: 720, h: 420 };
    if (id === "asset-media-story") return SIZE_MOBILE;
    if (id === "asset-media-live") return { w: 960, h: 520 };
    return SIZE_PANEL_WIDE;
  }
  if (variant === "analytics") {
    if (id === "asset-kpi-cards") return { w: 960, h: 220 };
    if (id === "asset-chart-panel") return { w: 960, h: 420 };
    if (id === "asset-data-table") return { w: 960, h: 420 };
    if (id === "asset-user-admin") return { w: 960, h: 480 };
    if (id === "asset-audit-log") return { w: 960, h: 420 };
    if (id === "asset-billing-manage") return { w: 960, h: 520 };
    if (id === "asset-system-console") return { w: 720, h: 420 };
    if (id === "asset-data-import-export") return { w: 960, h: 320 };
    if (id === "asset-monitoring-summary") return { w: 960, h: 420 };
  }
  if (variant === "feedback") {
    if (id === "asset-toast-feedback") return { w: 320, h: 120 };
    if (id === "asset-offline-network") return { w: 520, h: 120 };
    if (id === "asset-error-pages") return { w: 520, h: 320 };
    if (id === "asset-confirm-modal") return SIZE_MODAL;
    return { w: 420, h: 320 };
  }
  if (variant === "form") {
    if (id === "asset-input-masking") return { w: 420, h: 420 };
    if (id === "asset-upload-dropzone") return SIZE_PANEL_WIDE;
    return SIZE_PANEL;
  }
  if (variant === "commerce") {
    if (id === "asset-commerce-catalog") return { w: 960, h: 560 };
    if (id === "asset-commerce-inventory") return { w: 960, h: 520 };
    if (id === "asset-commerce-cart") return { w: 520, h: 520 };
    if (id === "asset-commerce-payment-method") return { w: 420, h: 420 };
    if (id === "asset-commerce-price-table") return { w: 960, h: 360 };
    if (id === "asset-commerce-payment-result") return SIZE_MODAL;
    if (id === "asset-commerce-coupon") return { w: 420, h: 260 };
  }
  if (variant === "template") {
    if (id === "asset-template-blank") return SIZE_DESKTOP;
    return SIZE_WIDE;
  }
  return SIZE_PANEL;
}
function buildFlowPreset(id: string, title: string, origin: { x: number; y: number }, ctx: BuildCtx, size: Size) {
  const root = makeRoot(ctx, title, origin, size);
  const contentW = size.w - PADDING_SCREEN * 2;
  const header = makeTitle(ctx, title, contentW, 20);
  const subtitle = makeSubtitle(ctx, "모바일 플로우 화면", contentW, 12);
  const children: Node[] = [header, subtitle];

  if (id.includes("onboarding")) {
    const carousel = makeStack(ctx, "스와이프 카드", { w: contentW, h: 200 }, "row", {
      gap: 12,
      padding: { t: 12, r: 12, b: 12, l: 12 },
      fill: COLORS.subtle,
      stroke: { color: COLORS.border, width: 1 },
      radius: RADIUS.lg,
      align: "center",
    });
    const cardW = Math.max(80, Math.floor((contentW - 48) / 3));
    const cards = [1, 2, 3].map((idx) => makeContentCard(ctx, cardW, 160, `카드 ${idx}`));
    ctx.attach(carousel, cards);
    carousel.overflowScrolling = "horizontal";
    carousel.clipContent = true;
    const dots = makeProgressDots(ctx, 3, 0);
    const dotNodes = dots.children.map((childId) => ctx.nodes[childId]).filter(Boolean) as Node[];
    dotNodes.forEach((dot, idx) => {
      const target = cards[idx];
      if (target) addClickAction(dot, { type: "scrollTo", targetNodeId: target.id, axis: "x" });
    });
    children.push(carousel, dots);
  } else if (id.includes("permission")) {
    const list = makeStack(ctx, "권한 목록", { w: contentW, h: 180 }, "column", { gap: 10 });
    ctx.attach(list, [
      makeToggleRow(ctx, "카메라 접근", contentW),
      makeToggleRow(ctx, "위치 사용", contentW),
      makeToggleRow(ctx, "알림 허용", contentW),
    ]);
    const actions = makeStack(ctx, "액션", { w: contentW, h: 40 }, "row", { gap: 10, align: "center" });
    const laterButton = makeButton(ctx, "나중에", Math.floor((contentW - 10) / 2), "secondary");
    const allowButton = makeButton(ctx, "허용", Math.floor((contentW - 10) / 2), "primary");
    wireMockSubmit(laterButton, "sent");
    wireMockSubmit(allowButton, "success");
    ctx.attach(actions, [laterButton, allowButton]);
    children.push(list, actions);
  } else if (id.includes("profile")) {
    const saveButton = makeButton(ctx, "저장", contentW, "primary");
    wireMockSubmit(saveButton, "success");
    children.push(
      makeAvatar(ctx, 72),
      makeInput(ctx, fieldPlaceholder("name", "이름"), contentW),
      makeInput(ctx, fieldPlaceholder("bio", "소개"), contentW, 56),
      saveButton,
    );
  } else if (id.includes("settings") || id.includes("security")) {
    const list = makeStack(ctx, "설정 목록", { w: contentW, h: 200 }, "column", { gap: 10 });
    ctx.attach(list, [makeToggleRow(ctx, "알림", contentW), makeToggleRow(ctx, "다크 모드", contentW), makeToggleRow(ctx, "자동 업데이트", contentW)]);
    children.push(list);
  } else if (id.includes("search")) {
    children.push(makeInput(ctx, "검색어를 입력하세요", contentW));
    const chips = makeStack(ctx, "최근", { w: contentW, h: 32 }, "row", { gap: 8 });
    ctx.attach(chips, [makeChip(ctx, "디자인"), makeChip(ctx, "온보딩"), makeChip(ctx, "템플릿")]);
    const list = makeStack(ctx, "추천", { w: contentW, h: 160 }, "column", { gap: 10 });
    ctx.attach(list, [makeListItem(ctx, "추천 템플릿", "최근 인기", contentW, "icon"), makeListItem(ctx, "랜딩 페이지", "오늘의 픽", contentW, "icon")]);
    children.push(chips, list);
  } else if (id.includes("notification")) {
    const list = makeStack(ctx, "알림 목록", { w: contentW, h: 220 }, "column", { gap: 10 });
    ctx.attach(list, [makeListItem(ctx, "새 댓글이 달렸습니다", "방금", contentW, "avatar"), makeListItem(ctx, "구독이 만료됩니다", "1시간 전", contentW, "avatar")]);
    children.push(list);
  } else if (id.includes("help") || id.includes("faq")) {
    const list = makeStack(ctx, "FAQ", { w: contentW, h: 220 }, "column", { gap: 10 });
    ctx.attach(list, [makeListItem(ctx, "결제는 어떻게 하나요?", "3분 읽기", contentW, "icon"), makeListItem(ctx, "템플릿 공유 방법", "2분 읽기", contentW, "icon")]);
    children.push(list);
  } else if (id.includes("consent") || id.includes("policy")) {
    const agreeButton = makeButton(ctx, "동의하고 계속", contentW, "primary");
    wireMockSubmit(agreeButton, "success");
    children.push(
      ctx.add(makeRectNode("정책 본문", { x: 0, y: 0, w: contentW, h: 200, rotation: 0 }, { fill: COLORS.subtle, radius: 12 })),
      makeCheckboxRow(ctx, "[선택] 전체 동의", contentW),
      makeCheckboxRow(ctx, "[필수] 개인정보 처리방침", contentW),
      makeCheckboxRow(ctx, "[필수] 서비스 이용약관", contentW),
      agreeButton,
    );
  } else if (id.includes("otp") || id.includes("2fa")) {
    const codeRow = makeStack(ctx, "코드", { w: contentW, h: 48 }, "row", { gap: 8, align: "center" });
    const boxes = Array.from({ length: 6 }).map(() =>
      makeInput(ctx, "0", 36, 44, { name: "코드 입력", padding: { t: 6, r: 6, b: 6, l: 6 } }),
    );
    ctx.attach(codeRow, boxes);
    const confirmButton = makeButton(ctx, "확인", contentW, "primary");
    wireMockSubmit(confirmButton, "success");
    children.push(codeRow, confirmButton);
  } else if (id.includes("subscription") || id.includes("upgrade")) {
    const planStack = makeStack(ctx, "플랜", { w: contentW, h: 200 }, "column", { gap: 12 });
    ctx.attach(planStack, [makePlanCard(ctx, "Basic", "월 9,900원", contentW), makePlanCard(ctx, "Pro", "월 19,900원", contentW, true)]);
    const planSelect = makeStack(ctx, "플랜 선택", { w: contentW, h: 120 }, "column", { gap: 10 });
    ctx.attach(planSelect, [makeToggleRow(ctx, "Basic 플랜", contentW), makeToggleRow(ctx, "Pro 플랜", contentW)]);
    const upgradeButton = makeButton(ctx, "업그레이드", contentW, "primary");
    wireSubmit(upgradeButton, "/api/billing/upgrade");
    children.push(planStack, planSelect, upgradeButton);
  } else if (id.includes("recovery")) {
    const sendButton = makeButton(ctx, "메일 보내기", contentW, "primary");
    wireMockSubmit(sendButton, "sent");
    children.push(makeInput(ctx, fieldPlaceholder("email", "이메일"), contentW), sendButton);
  } else if (id.includes("delete")) {
    const deleteButton = makeButton(ctx, "삭제 요청", contentW, "danger");
    wireMockSubmit(deleteButton, "success");
    children.push(
      ctx.add(makeRectNode("경고", { x: 0, y: 0, w: contentW, h: 120, rotation: 0 }, { fill: "#FEF2F2", radius: 12 })),
      makeInput(ctx, "DELETE 입력", contentW),
      deleteButton,
    );
  } else {
    const continueButton = makeButton(ctx, "계속", contentW, "primary");
    wireMockSubmit(continueButton, "success");
    children.push(makeInput(ctx, "입력", contentW), continueButton);
  }

  ctx.attach(root, children);
  return root;
}

function buildUiPreset(id: string, title: string, origin: { x: number; y: number }, ctx: BuildCtx, size: Size) {
  if (id === "asset-ui-header") {
    const root = makeRoot(ctx, title, origin, size, { padding: { t: 12, r: 20, b: 12, l: 20 }, gap: 12, radius: RADIUS.md });
    const row = makeStack(ctx, "헤더 바", { w: size.w - 40, h: 48 }, "row", { gap: 16, align: "center" });
    const logo = ctx.add(makeTextNode("로고", "브랜드", { x: 0, y: 0, w: 80, h: 24, rotation: 0 }, { size: 16, weight: 700 }));
    const nav = makeStack(ctx, "네비", { w: 240, h: 24 }, "row", { gap: 12, align: "center" });
    const navItems = ["제품", "기능", "가격"].map((label) =>
      ctx.add(makeTextNode("메뉴", label, { x: 0, y: 0, w: 60, h: 20, rotation: 0 }, { size: 12, color: COLORS.textMuted })),
    );
    ctx.attach(nav, navItems);
    const ctaButton = makeButton(ctx, "시작하기", 100, "primary");
    wireMockSubmit(ctaButton, "success");
    ctx.attach(row, [logo, nav, ctaButton]);
    ctx.attach(root, [row]);
    return root;
  }
  if (id === "asset-ui-tabbar") {
    const root = makeRoot(ctx, title, origin, size, { padding: { t: 12, r: 12, b: 12, l: 12 }, gap: 8, radius: RADIUS.md });
    const bar = makeStack(ctx, "탭", { w: size.w - 24, h: 48 }, "row", { gap: 16, align: "center" });
    const tabs = ["홈", "검색", "알림", "설정"].map((label, idx) => {
      const tab = makeStack(ctx, "탭 아이템", { w: 70, h: 44 }, "column", { gap: 4, align: "center" });
      const icon = makeIconBox(ctx, 20, idx === 0 ? "#DBEAFE" : COLORS.subtle);
      const text = ctx.add(makeTextNode("라벨", label, { x: 0, y: 0, w: 60, h: 14, rotation: 0 }, { size: 10, color: idx === 0 ? COLORS.accent : COLORS.textMuted }));
      ctx.attach(tab, [icon, text]);
      return tab;
    });
    ctx.attach(bar, tabs);
    ctx.attach(root, [bar]);
    return root;
  }
  if (id === "asset-ui-sidebar") {
    const root = makeRoot(ctx, title, origin, size, { padding: { t: 16, r: 16, b: 16, l: 16 }, gap: 12, radius: RADIUS.md });
    const contentW = size.w - 32;
    const brand = ctx.add(makeTextNode("브랜드", "관리자", { x: 0, y: 0, w: contentW, h: 20, rotation: 0 }, { size: 14, weight: 700 }));
    const list = makeStack(ctx, "메뉴", { w: contentW, h: 280 }, "column", { gap: 10 });
    ctx.attach(list, ["대시보드", "사용자", "결제", "설정"].map((label) => makeListItem(ctx, label, undefined, contentW, "icon")));
    ctx.attach(root, [brand, list]);
    return root;
  }
  if (id === "asset-ui-breadcrumb") {
    const root = makeRoot(ctx, title, origin, size, { padding: { t: 12, r: 16, b: 12, l: 16 }, gap: 8, radius: RADIUS.md });
    const row = makeStack(ctx, "경로", { w: size.w - 32, h: 24 }, "row", { gap: 8, align: "center" });
    const nodes = ["홈", ">", "프로젝트", ">", "상세"].map((label) =>
      ctx.add(makeTextNode("텍스트", label, { x: 0, y: 0, w: 80, h: 18, rotation: 0 }, { size: 12, color: label === ">" ? COLORS.textMuted : COLORS.text })),
    );
    ctx.attach(row, nodes);
    ctx.attach(root, [row]);
    return root;
  }
  if (id === "asset-ui-sticky-cta") {
    const root = makeRoot(ctx, title, origin, size, { padding: { t: 12, r: 16, b: 12, l: 16 }, gap: 8, radius: RADIUS.md, fill: COLORS.overlay });
    const row = makeStack(ctx, "CTA", { w: size.w - 32, h: 40 }, "row", { gap: 12, align: "center" });
    const text = ctx.add(makeTextNode("라벨", "지금 업그레이드", { x: 0, y: 0, w: 200, h: 18, rotation: 0 }, { size: 12, weight: 600 }));
    const subscribeButton = makeButton(ctx, "구독하기", 100, "primary");
    wireMockSubmit(subscribeButton, "success");
    ctx.attach(row, [text, subscribeButton]);
    ctx.attach(root, [row]);
    return root;
  }
  if (id === "asset-ui-section-header") {
    const root = makeRoot(ctx, title, origin, size, { padding: { t: 12, r: 16, b: 12, l: 16 }, gap: 8, radius: RADIUS.md });
    const row = makeStack(ctx, "헤더", { w: size.w - 32, h: 24 }, "row", { gap: 12, align: "center" });
    const titleNode = ctx.add(makeTextNode("타이틀", "섹션 제목", { x: 0, y: 0, w: 200, h: 18, rotation: 0 }, { size: 14, weight: 700 }));
    const more = ctx.add(makeTextNode("더보기", "더보기", { x: 0, y: 0, w: 60, h: 16, rotation: 0 }, { size: 11, color: COLORS.accent }));
    ctx.attach(row, [titleNode, more]);
    ctx.attach(root, [row]);
    return root;
  }
  if (id === "asset-ui-modal-sheet") {
    const root = makeRoot(ctx, title, origin, size, { fill: COLORS.overlay, padding: { t: 16, r: 16, b: 16, l: 16 }, gap: 16 });
    const overlay = ctx.add(makeRectNode("오버레이", { x: 0, y: 0, w: size.w - 32, h: 220, rotation: 0 }, { fill: COLORS.muted, radius: 12 }));
    const sheet = makeStack(ctx, "시트", { w: size.w - 32, h: 200 }, "column", { gap: 10, padding: { t: 16, r: 16, b: 16, l: 16 }, fill: COLORS.surface, stroke: { color: COLORS.border, width: 1 }, radius: RADIUS.lg });
    const confirmButton = makeButton(ctx, "확인", size.w - 64, "primary");
    wireMockSubmit(confirmButton, "success");
    ctx.attach(sheet, [makeTitle(ctx, "모달 시트", size.w - 64, 16), makeSubtitle(ctx, "간단한 설명 영역", size.w - 64, 12), confirmButton]);
    ctx.attach(root, [overlay, sheet]);
    return root;
  }
  if (id === "asset-ui-select-tabs") {
    const root = makeRoot(ctx, title, origin, size, { padding: { t: 10, r: 12, b: 10, l: 12 }, gap: 8, radius: RADIUS.md });
    const row = makeStack(ctx, "탭", { w: size.w - 24, h: 36 }, "row", { gap: 8, align: "center" });
    ctx.attach(row, [makeChip(ctx, "전체", { fill: "#DBEAFE", text: COLORS.accent, stroke: { color: COLORS.accent, width: 1 } }), makeChip(ctx, "진행중"), makeChip(ctx, "완료")]);
    ctx.attach(root, [row]);
    return root;
  }
  if (id === "asset-ui-pagination") {
    const root = makeRoot(ctx, title, origin, size, { padding: { t: 10, r: 12, b: 10, l: 12 }, gap: 8, radius: RADIUS.md });
    const row = makeStack(ctx, "페이지", { w: size.w - 24, h: 36 }, "row", { gap: 8, align: "center" });
    ctx.attach(row, ["<", "1", "2", "3", ">"].map((label, idx) => makeChip(ctx, label, { fill: idx === 1 ? "#DBEAFE" : COLORS.subtle, text: idx === 1 ? COLORS.accent : COLORS.text })));
    ctx.attach(root, [row]);
    return root;
  }
  if (id === "asset-ui-date-slider") {
    const root = makeRoot(ctx, title, origin, size, { padding: { t: 12, r: 16, b: 12, l: 16 }, gap: 8, radius: RADIUS.md });
    const row = makeStack(ctx, "날짜", { w: size.w - 32, h: 40 }, "row", { gap: 8, align: "center" });
    ctx.attach(row, ["03.01", "03.02", "03.03", "03.04", "03.05"].map((label, idx) => makeChip(ctx, label, { fill: idx === 2 ? "#DBEAFE" : COLORS.subtle, text: idx === 2 ? COLORS.accent : COLORS.text })));
    ctx.attach(root, [row]);
    return root;
  }
  if (id === "asset-accessibility-focus-skip") {
    const root = makeRoot(ctx, title, origin, size, { padding: { t: 16, r: 16, b: 16, l: 16 }, gap: 10, radius: RADIUS.md });
    const skip = ctx.add(makeTextNode("스킵", "콘텐츠로 바로가기", { x: 0, y: 0, w: size.w - 32, h: 16, rotation: 0 }, { size: 11, color: COLORS.accent }));
    const focus = ctx.add(makeRectNode("포커스 영역", { x: 0, y: 0, w: size.w - 32, h: 80, rotation: 0 }, { fill: COLORS.surface, stroke: { color: COLORS.accent, width: 2 }, radius: 10 }));
    addClickAction(skip, { type: "scrollTo", targetNodeId: focus.id, axis: "y", offset: -8 });
    ctx.attach(root, [skip, focus]);
    return root;
  }
  if (id === "asset-keyboard-navigation-state") {
    const root = makeRoot(ctx, title, origin, size, { padding: { t: 16, r: 16, b: 16, l: 16 }, gap: 10, radius: RADIUS.md });
    const contentW = size.w - 32;
    const list = makeStack(ctx, "리스트", { w: contentW, h: 140 }, "column", { gap: 10 });
    const item1 = makeListItem(ctx, "메뉴 1", "선택됨", contentW, "icon");
    item1.style = { ...item1.style, strokes: [{ color: COLORS.accent, width: 2, align: "inside" }] };
    ctx.attach(list, [item1, makeListItem(ctx, "메뉴 2", undefined, contentW, "icon"), makeListItem(ctx, "메뉴 3", undefined, contentW, "icon")]);
    ctx.attach(root, [list]);
    return root;
  }
  if (id === "asset-tooltip-help-pattern") {
    const root = makeRoot(ctx, title, origin, size, { padding: { t: 16, r: 16, b: 16, l: 16 }, gap: 10, radius: RADIUS.md });
    const row = makeStack(ctx, "도움말", { w: size.w - 32, h: 60 }, "row", { gap: 12, align: "center" });
    const icon = makeIconBox(ctx, 28, "#DBEAFE");
    const tooltip = makeStack(ctx, "툴팁", { w: 180, h: 48 }, "column", { gap: 4, padding: { t: 8, r: 10, b: 8, l: 10 }, fill: COLORS.surface, stroke: { color: COLORS.border, width: 1 }, radius: 10 });
    ctx.attach(tooltip, [
      ctx.add(makeTextNode("타이틀", "도움말", { x: 0, y: 0, w: 160, h: 16, rotation: 0 }, { size: 11, weight: 700 })),
      ctx.add(makeTextNode("설명", "자세한 안내", { x: 0, y: 0, w: 160, h: 14, rotation: 0 }, { size: 10, color: COLORS.textMuted })),
    ]);
    ctx.attach(row, [icon, tooltip]);
    ctx.attach(root, [row]);
    return root;
  }
  return makeRoot(ctx, title, origin, size);
}

function buildSettingsPreset(id: string, title: string, origin: { x: number; y: number }, ctx: BuildCtx, size: Size) {
  const root = makeRoot(ctx, title, origin, size, { padding: { t: PADDING_PANEL, r: PADDING_PANEL, b: PADDING_PANEL, l: PADDING_PANEL }, gap: 12 });
  const contentW = size.w - PADDING_PANEL * 2;
  const header = makeHeaderRow(ctx, title, contentW);
  const children: Node[] = [header];

  if (id.includes("notification-matrix")) {
    const grid = makeStack(ctx, "매트릭스", { w: contentW, h: 200 }, "column", { gap: 8 });
    const rows = Array.from({ length: 3 }).map(() => {
      const row = makeStack(ctx, "행", { w: contentW, h: 48 }, "row", { gap: 8, align: "center" });
      const cells = Array.from({ length: 3 }).map(() =>
        ctx.add(makeRectNode("셀", { x: 0, y: 0, w: 48, h: 32, rotation: 0 }, { fill: COLORS.subtle, stroke: { color: COLORS.border, width: 1 }, radius: 6 })),
      );
      ctx.attach(row, cells);
      return row;
    });
    ctx.attach(grid, rows);
    children.push(grid);
  } else if (id.includes("cookie")) {
    const banner = makeStack(ctx, "배너", { w: contentW, h: 64 }, "row", { gap: 12, align: "center" });
    const text = ctx.add(makeTextNode("텍스트", "쿠키 사용에 동의해 주세요.", { x: 0, y: 0, w: 240, h: 20, rotation: 0 }, { size: 12 }));
    const settingButton = makeButton(ctx, "설정", 80, "secondary");
    const agreeButton = makeButton(ctx, "동의", 80, "primary");
    wireMockSubmit(settingButton, "sent");
    wireMockSubmit(agreeButton, "success");
    ctx.attach(banner, [text, settingButton, agreeButton]);
    children.push(banner);
  } else if (id.includes("update")) {
    const updateButton = makeButton(ctx, "업데이트", contentW, "primary");
    wireMockSubmit(updateButton, "success");
    children.push(makeSubtitle(ctx, "새로운 기능이 추가되었습니다.", contentW, 12), updateButton);
  } else if (id.includes("accessibility")) {
    const toggles = makeStack(ctx, "옵션", { w: contentW, h: 140 }, "column", { gap: 10 });
    ctx.attach(toggles, [makeToggleRow(ctx, "고대비", contentW), makeToggleRow(ctx, "큰 글자", contentW)]);
    const themes = makeStack(ctx, "테마", { w: contentW, h: 100 }, "row", { gap: 12, align: "center" });
    const light = makeStack(ctx, "라이트", { w: 100, h: 80 }, "column", { gap: 6, padding: { t: 10, r: 10, b: 10, l: 10 }, fill: COLORS.surface, stroke: { color: COLORS.border, width: 1 }, radius: 10 });
    const dark = makeStack(ctx, "다크", { w: 100, h: 80 }, "column", { gap: 6, padding: { t: 10, r: 10, b: 10, l: 10 }, fill: "#111827", stroke: { color: COLORS.border, width: 1 }, radius: 10 });
    ctx.attach(light, [ctx.add(makeTextNode("라벨", "Light", { x: 0, y: 0, w: 80, h: 16, rotation: 0 }, { size: 10 }))]);
    ctx.attach(dark, [ctx.add(makeTextNode("라벨", "Dark", { x: 0, y: 0, w: 80, h: 16, rotation: 0 }, { size: 10, color: "#FFFFFF" }))]);
    ctx.attach(themes, [light, dark]);
    children.push(toggles, themes);
  } else {
    const list = makeStack(ctx, "설정 목록", { w: contentW, h: 200 }, "column", { gap: 10 });
    ctx.attach(list, [makeToggleRow(ctx, "알림", contentW), makeToggleRow(ctx, "언어", contentW), makeToggleRow(ctx, "접근성", contentW)]);
    children.push(list);
  }

  ctx.attach(root, children);
  return root;
}
function buildContentPreset(id: string, title: string, origin: { x: number; y: number }, ctx: BuildCtx, size: Size) {
  const root = makeRoot(ctx, title, origin, size);
  const contentW = size.w - PADDING_SCREEN * 2;
  const children: Node[] = [];

  if (id.includes("feed")) {
    children.push(makeHeaderRow(ctx, title, contentW, "정렬"));
    const list = makeStack(ctx, "피드", { w: contentW, h: 420 }, "column", { gap: 14 });
    ctx.attach(list, [makeContentCard(ctx, contentW, 160, "프로덕트 런칭", "2시간 전"), makeContentCard(ctx, contentW, 160, "디자인 시스템", "어제")]);
    children.push(list);
  } else if (id.includes("detail")) {
    children.push(
      ctx.add(makeRectNode("히어로", { x: 0, y: 0, w: contentW, h: 240, rotation: 0 }, { fill: COLORS.subtle, radius: 16 })),
      makeTitle(ctx, "콘텐츠 제목", contentW, 22),
      makeSubtitle(ctx, "긴 설명 텍스트 영역", contentW, 12),
    );
  } else if (id.includes("comment")) {
    children.push(makeHeaderRow(ctx, "댓글", contentW));
    const list = makeStack(ctx, "스레드", { w: contentW, h: 300 }, "column", { gap: 10 });
    const comment1 = makeListItem(ctx, "첫 번째 댓글", "방금", contentW, "avatar");
    const reply = makeListItem(ctx, "답글", "1분 전", contentW - 40, "avatar");
    reply.frame.x += 20;
    ctx.attach(list, [comment1, reply, makeListItem(ctx, "두 번째 댓글", "어제", contentW, "avatar")]);
    const commentForm = makeStack(ctx, "댓글 폼", { w: contentW, h: 100 }, "column", { gap: 8 });
    const commentInput = makeInput(ctx, fieldPlaceholder("content", "댓글"), contentW);
    const commentButton = makeButton(ctx, "댓글 달기", contentW, "primary");
    wireSubmit(commentButton, "/api/pages/{pageId}/comments");
    ctx.attach(commentForm, [commentInput, commentButton]);
    const replyForm = makeStack(ctx, "답글 폼", { w: contentW, h: 140 }, "column", { gap: 8 });
    const replyParentInput = makeInput(ctx, fieldPlaceholder("parentId", "댓글 ID"), contentW);
    const replyContentInput = makeInput(ctx, fieldPlaceholder("content", "답글 내용"), contentW);
    const replyButton = makeButton(ctx, "답글 달기", contentW, "secondary");
    wireSubmit(replyButton, "/api/pages/{pageId}/comments");
    ctx.attach(replyForm, [replyParentInput, replyContentInput, replyButton]);
    const manageForm = makeStack(ctx, "관리 폼", { w: contentW, h: 260 }, "column", { gap: 8 });
    const manageIdInput = makeInput(ctx, fieldPlaceholder("commentId", "댓글 ID"), contentW);
    const manageContentInput = makeInput(ctx, fieldPlaceholder("content", "수정 내용"), contentW);
    const resolvedToggle = makeCheckboxRow(ctx, fieldPlaceholder("resolved", "해결 처리"), contentW);
    const manageActions = makeStack(ctx, "관리 액션", { w: contentW, h: 40 }, "row", { gap: 8, align: "center" });
    const updateButton = makeButton(ctx, "수정 저장", Math.floor((contentW - 8) / 2), "secondary");
    const deleteButton = makeButton(ctx, "댓글 삭제", Math.floor((contentW - 8) / 2), "danger");
    wireSubmit(updateButton, "/api/pages/{pageId}/comments/{commentId}", { method: "PATCH" });
    wireSubmit(deleteButton, "/api/pages/{pageId}/comments/{commentId}", { method: "DELETE" });
    ctx.attach(manageActions, [updateButton, deleteButton]);
    const reportReasonInput = makeInput(ctx, fieldPlaceholder("reason", "[선택] 신고 사유"), contentW);
    const reportButton = makeButton(ctx, "신고", contentW, "secondary");
    wireSubmit(reportButton, "/api/pages/{pageId}/report");
    ctx.attach(manageForm, [manageIdInput, manageContentInput, resolvedToggle, manageActions, reportReasonInput, reportButton]);
    children.push(list, commentForm, replyForm, manageForm);
  } else if (id.includes("user-card")) {
    const followButton = makeButton(ctx, "팔로우", contentW, "primary");
    wireMockSubmit(followButton, "success");
    children.push(makeAvatar(ctx, 56), makeTitle(ctx, "홍길동", contentW, 16), makeSubtitle(ctx, "디자이너 · 24개 프로젝트", contentW, 11), followButton);
  } else if (id.includes("tag-page")) {
    children.push(makeHeaderRow(ctx, "태그", contentW, "정렬"));
    const tags = makeStack(ctx, "태그", { w: contentW, h: 36 }, "row", { gap: 8, align: "center" });
    ctx.attach(tags, [makeChip(ctx, "UI"), makeChip(ctx, "모바일"), makeChip(ctx, "온보딩")]);
    const grid = makeStack(ctx, "그리드", { w: contentW, h: 300 }, "row", { gap: 12, align: "center" });
    ctx.attach(grid, [makeContentCard(ctx, 200, 200, "카드 A", "12개"), makeContentCard(ctx, 200, 200, "카드 B", "8개"), makeContentCard(ctx, 200, 200, "카드 C", "5개")]);
    children.push(tags, grid);
  } else if (id.includes("bookmark")) {
    children.push(makeHeaderRow(ctx, title, contentW, "편집"));
    const list = makeStack(ctx, "목록", { w: contentW, h: 260 }, "column", { gap: 10 });
    ctx.attach(list, [makeListItem(ctx, "저장한 콘텐츠", "오늘", contentW, "icon"), makeListItem(ctx, "참고 자료", "어제", contentW, "icon")]);
    const actions = makeStack(ctx, "북마크 액션", { w: contentW, h: 40 }, "row", { gap: 8, align: "center" });
    const saveButton = makeButton(ctx, "저장", Math.floor((contentW - 8) / 2), "primary");
    const removeButton = makeButton(ctx, "해제", Math.floor((contentW - 8) / 2), "secondary");
    wireSubmit(saveButton, "/api/pages/{pageId}/upvote", { method: "POST" });
    wireSubmit(removeButton, "/api/pages/{pageId}/upvote", { method: "DELETE" });
    ctx.attach(actions, [saveButton, removeButton]);
    children.push(list, actions);
  } else if (id.includes("ranking")) {
    children.push(makeHeaderRow(ctx, title, contentW, "이번 주"));
    const list = makeStack(ctx, "랭킹", { w: contentW, h: 260 }, "column", { gap: 10 });
    ctx.attach(list, [
      makeListItem(ctx, "온보딩 템플릿", "1위", contentW, "icon"),
      makeListItem(ctx, "대시보드 UI", "2위", contentW, "icon"),
      makeListItem(ctx, "커뮤니티 카드", "3위", contentW, "icon"),
    ]);
    children.push(list);
  } else if (id.includes("report")) {
    children.push(makeTitle(ctx, title, contentW, 18));
    const reason = makeStack(ctx, "사유", { w: contentW, h: 140 }, "column", { gap: 10 });
    ctx.attach(reason, [
      makeCheckboxRow(ctx, "[reason] [필수] 스팸/광고", contentW),
      makeCheckboxRow(ctx, "[reason] [필수] 부적절한 내용", contentW),
      makeCheckboxRow(ctx, "[reason] [필수] 기타", contentW),
    ]);
    const reportButton = makeButton(ctx, "신고 제출", contentW, "primary");
    wireSubmit(reportButton, "/api/pages/{pageId}/report");
    children.push(reason, makeInput(ctx, fieldPlaceholder("reason", "[선택] 상세 설명"), contentW, 60), reportButton);
  }

  ctx.attach(root, children);
  return root;
}

function buildCommunicationPreset(id: string, title: string, origin: { x: number; y: number }, ctx: BuildCtx, size: Size) {
  const root = makeRoot(ctx, title, origin, size);
  const contentW = size.w - PADDING_SCREEN * 2;
  const children: Node[] = [];

  if (id.includes("chat-working")) {
    root.name = "채팅룸";
    const messages = makeStack(ctx, "메시지", { w: contentW, h: 320 }, "column", { gap: 10 });
    const bubble1 = makeListItem(ctx, "보낸 메시지", "내용이 여기 표시됩니다", contentW, "avatar");
    const bubble2 = makeListItem(ctx, "받은 메시지", "내용이 여기 표시됩니다", contentW, "avatar");
    ctx.attach(messages, [bubble1, bubble2]);
    const inputRow = makeStack(ctx, "채팅 입력", { w: contentW, h: 44 }, "row", { gap: 8, align: "center" });
    const chatInput = makeInput(ctx, fieldPlaceholder("message", "메시지를 입력하세요"), contentW - 80);
    const sendButton = makeButton(ctx, "전송", 68, "primary");
    wireSubmit(sendButton, "/api/pages/{pageId}/chat");
    ctx.attach(inputRow, [chatInput, sendButton]);
    children.push(messages, inputRow);
  } else if (id.includes("chat-list")) {
    children.push(makeHeaderRow(ctx, title, contentW, "새 채팅"));
    const list = makeStack(ctx, "목록", { w: contentW, h: 260 }, "column", { gap: 10 });
    ctx.attach(list, [makeListItem(ctx, "디자인 팀", "읽지 않은 메시지 2", contentW, "avatar"), makeListItem(ctx, "개발 팀", "방금", contentW, "avatar")]);
    children.push(list);
  } else if (id.includes("chat-room")) {
    children.push(makeHeaderRow(ctx, title, contentW, "정보"));
    const messages = makeStack(ctx, "메시지", { w: contentW, h: 320 }, "column", { gap: 10 });
    const bubbleA = makeListItem(ctx, "User", "메시지가 표시됩니다", contentW, "avatar");
    const bubbleB = makeListItem(ctx, "User", "메시지가 표시됩니다", contentW, "avatar");
    ctx.attach(messages, [bubbleA, bubbleB]);
    const inputRow = makeStack(ctx, "채팅 입력", { w: contentW, h: 44 }, "row", { gap: 8, align: "center" });
    const chatInput = makeInput(ctx, fieldPlaceholder("message", "메시지를 입력하세요"), contentW - 80);
    const sendButton = makeButton(ctx, "전송", 68, "primary");
    wireSubmit(sendButton, "/api/pages/{pageId}/chat");
    ctx.attach(inputRow, [chatInput, sendButton]);
    children.push(messages, inputRow);
  } else if (id.includes("attachment")) {
    children.push(makeTitle(ctx, "첨부", contentW, 18));
    const list = makeStack(ctx, "파일", { w: contentW, h: 200 }, "column", { gap: 10 });
    ctx.attach(list, [makeListItem(ctx, "design.png", "2.4MB", contentW, "icon"), makeListItem(ctx, "spec.pdf", "1.1MB", contentW, "icon")]);
    const dropzone = makeDropzone(ctx, "파일 추가", contentW, 140);
    const uploadButton = makeButton(ctx, "업로드", contentW, "secondary");
    wireSubmit(uploadButton, "/api/app/{pageId}/upload");
    children.push(list, dropzone, uploadButton);
  } else if (id.includes("mention")) {
    children.push(makeHeaderRow(ctx, title, contentW));
    const list = makeStack(ctx, "멘션", { w: contentW, h: 220 }, "column", { gap: 10 });
    ctx.attach(list, [makeListItem(ctx, "@minji", "새 댓글", contentW, "avatar"), makeListItem(ctx, "@jun", "요청사항", contentW, "avatar")]);
    children.push(list);
  } else if (id.includes("group-channel")) {
    const columns = makeStack(ctx, "컬럼", { w: contentW, h: 420 }, "row", { gap: 12, align: "start" });
    const left = makeStack(ctx, "채널", { w: 240, h: 420 }, "column", { gap: 10, padding: { t: 12, r: 12, b: 12, l: 12 }, fill: COLORS.surface, stroke: { color: COLORS.border, width: 1 }, radius: RADIUS.md });
    ctx.attach(left, [makeListItem(ctx, "# general", undefined, 216, "icon"), makeListItem(ctx, "# design", undefined, 216, "icon")]);
    const right = makeStack(ctx, "멤버", { w: 300, h: 420 }, "column", { gap: 10, padding: { t: 12, r: 12, b: 12, l: 12 }, fill: COLORS.surface, stroke: { color: COLORS.border, width: 1 }, radius: RADIUS.md });
    ctx.attach(right, [makeListItem(ctx, "민지", "디자이너", 276, "avatar"), makeListItem(ctx, "준", "개발", 276, "avatar")]);
    ctx.attach(columns, [left, right]);
    children.push(columns);
  } else if (id.includes("call")) {
    children.push(makeAvatar(ctx, 120, COLORS.subtle), makeTitle(ctx, "홍길동", contentW, 18));
    const controls = makeStack(ctx, "컨트롤", { w: contentW, h: 60 }, "row", { gap: 12, align: "center" });
    const muteButton = makeButton(ctx, "음소거", 90, "secondary");
    const endButton = makeButton(ctx, "종료", 90, "danger");
    wireMockSubmit(muteButton, "sent");
    wireMockSubmit(endButton, "success");
    ctx.attach(controls, [muteButton, endButton]);
    children.push(controls);
  }

  ctx.attach(root, children);
  return root;
}

function buildProductivityPreset(id: string, title: string, origin: { x: number; y: number }, ctx: BuildCtx, size: Size) {
  const root = makeRoot(ctx, title, origin, size, { padding: { t: PADDING_PANEL, r: PADDING_PANEL, b: PADDING_PANEL, l: PADDING_PANEL }, gap: 12 });
  const contentW = size.w - PADDING_PANEL * 2;
  const children: Node[] = [];

  if (id.includes("todo")) {
    children.push(makeHeaderRow(ctx, "할 일", contentW));
    const addRow = makeStack(ctx, "할일 추가", { w: contentW, h: 44 }, "row", { gap: 8, align: "center" });
    const titleInput = makeInput(ctx, fieldPlaceholder("title", "새 할일"), contentW - 100);
    const addBtn = makeButton(ctx, "추가", 80, "primary");
    wireSubmit(addBtn, "/api/pages/{pageId}/todos");
    ctx.attach(addRow, [titleInput, addBtn]);
    const list = makeStack(ctx, "체크", { w: contentW, h: 240 }, "column", { gap: 10 });
    ctx.attach(list, [makeCheckboxRow(ctx, "와이어프레임 완성", contentW), makeCheckboxRow(ctx, "리뷰 준비", contentW), makeCheckboxRow(ctx, "배포 체크", contentW)]);
    children.push(addRow, list);
  } else if (id.includes("calendar")) {
    children.push(makeHeaderRow(ctx, "캘린더", contentW, "월간"));
    const grid = makeStack(ctx, "그리드", { w: contentW, h: 280 }, "column", { gap: 6 });
    const rows = Array.from({ length: 5 }).map(() => {
      const row = makeStack(ctx, "주", { w: contentW, h: 44 }, "row", { gap: 6, align: "center" });
      const cells = Array.from({ length: 7 }).map(() =>
        ctx.add(makeRectNode("날짜", { x: 0, y: 0, w: 36, h: 36, rotation: 0 }, { fill: COLORS.subtle, radius: 6 })),
      );
      ctx.attach(row, cells);
      return row;
    });
    ctx.attach(grid, rows);
    children.push(grid);
  } else if (id.includes("note")) {
    const toolbar = makeStack(ctx, "툴바", { w: contentW, h: 36 }, "row", { gap: 6, align: "center" });
    ctx.attach(toolbar, [makeChip(ctx, "B"), makeChip(ctx, "I"), makeChip(ctx, "H1")]);
    const noteInput = makeInput(ctx, fieldPlaceholder("content", "내용을 입력하세요"), contentW, 240);
    const saveBtn = makeButton(ctx, "저장", contentW, "primary");
    wireSubmit(saveBtn, "/api/pages/{pageId}/note", { method: "PUT" });
    children.push(toolbar, noteInput, saveBtn);
  } else if (id.includes("member")) {
    children.push(makeHeaderRow(ctx, "멤버 역할", contentW, "관리"), makeTablePlaceholder(ctx, contentW, 260, 5));
  } else if (id.includes("approval")) {
    const steps = makeStack(ctx, "스텝", { w: contentW, h: 36 }, "row", { gap: 8, align: "center" });
    ctx.attach(steps, [makeChip(ctx, "요청", { fill: "#DBEAFE", text: COLORS.accent }), makeChip(ctx, "검토"), makeChip(ctx, "승인")]);
    const cards = makeStack(ctx, "승인 카드", { w: contentW, h: 200 }, "column", { gap: 10 });
    ctx.attach(cards, [makeListItem(ctx, "요청서 1", "대기", contentW, "icon"), makeListItem(ctx, "요청서 2", "검토중", contentW, "icon")]);
    const approveButton = makeButton(ctx, "승인", contentW, "primary");
    wireMockSubmit(approveButton, "success");
    children.push(steps, cards, approveButton);
  }

  ctx.attach(root, children);
  return root;
}
function buildBoardPreset(title: string, origin: { x: number; y: number }, ctx: BuildCtx, size: Size) {
  const root = makeRoot(ctx, title, origin, size, { gap: 12 });
  const contentW = size.w - PADDING_SCREEN * 2;
  const board = makeStack(ctx, "보드", { w: contentW, h: 420 }, "row", { gap: 12, align: "start" });
  const column = (label: string) => {
    const col = makeStack(ctx, "컬럼", { w: 280, h: 400 }, "column", {
      gap: 10,
      padding: { t: 12, r: 12, b: 12, l: 12 },
      fill: COLORS.surface,
      stroke: { color: COLORS.border, width: 1 },
      radius: RADIUS.md,
    });
    ctx.attach(col, [
      ctx.add(makeTextNode("컬럼 타이틀", label, { x: 0, y: 0, w: 240, h: 18, rotation: 0 }, { size: 12, weight: 700 })),
      ctx.add(makeRectNode("카드", { x: 0, y: 0, w: 240, h: 60, rotation: 0 }, { fill: COLORS.subtle, radius: 8 })),
    ]);
    return col;
  };
  ctx.attach(board, [column("할 일"), column("진행중"), column("완료")]);
  ctx.attach(root, [board]);
  return root;
}

function buildTimelinePreset(title: string, origin: { x: number; y: number }, ctx: BuildCtx, size: Size) {
  const root = makeRoot(ctx, title, origin, size, { gap: 12 });
  const contentW = size.w - PADDING_SCREEN * 2;
  const row = makeStack(ctx, "간트", { w: contentW, h: 320 }, "row", { gap: 12, align: "start" });
  const labels = makeStack(ctx, "작업", { w: 200, h: 320 }, "column", { gap: 8 });
  const tasks = ["기획", "디자인", "개발", "테스트"].map((label) =>
    ctx.add(makeTextNode("작업", label, { x: 0, y: 0, w: 180, h: 18, rotation: 0 }, { size: 12 })),
  );
  ctx.attach(labels, tasks);
  const timeline = makeStack(ctx, "타임라인", { w: contentW - 220, h: 320 }, "column", { gap: 14 });
  const bars = Array.from({ length: 4 }).map(() =>
    ctx.add(makeRectNode("바", { x: 0, y: 0, w: 300, h: 20, rotation: 0 }, { fill: "#DBEAFE", radius: 6 })),
  );
  ctx.attach(timeline, bars);
  ctx.attach(row, [labels, timeline]);
  ctx.attach(root, [row]);
  return root;
}

function buildMediaPreset(id: string, title: string, origin: { x: number; y: number }, ctx: BuildCtx, size: Size) {
  const root = makeRoot(ctx, title, origin, size);
  const contentW = size.w - PADDING_SCREEN * 2;
  const children: Node[] = [];

  if (id.includes("upload")) {
    children.push(makeTitle(ctx, title, contentW, 18));
    const dropzone = makeDropzone(ctx, "드래그 앤 드롭 또는 클릭", contentW, 200);
    const uploadButton = makeButton(ctx, "업로드", contentW, "primary");
    wireSubmit(uploadButton, "/api/app/{pageId}/upload");
    children.push(dropzone, makeSubtitle(ctx, "드래그 앤 드롭 또는 클릭", contentW, 11), uploadButton);
  } else if (id.includes("gallery")) {
    children.push(makeHeaderRow(ctx, "갤러리", contentW, "정렬"));
    const grid = makeStack(ctx, "그리드", { w: contentW, h: 360 }, "row", { gap: 12, align: "center" });
    ctx.attach(grid, Array.from({ length: 4 }).map(() => ctx.add(makeRectNode("썸네일", { x: 0, y: 0, w: 200, h: 200, rotation: 0 }, { fill: COLORS.subtle, radius: 10 }))));
    children.push(grid);
  } else if (id.includes("lightbox")) {
    root.style = { ...root.style, fills: [{ type: "solid", color: "#0F172A" }] };
    const closeButton = makeButton(ctx, "닫기", 80, "secondary");
    wireMockSubmit(closeButton, "sent");
    children.push(ctx.add(makeRectNode("이미지", { x: 0, y: 0, w: contentW, h: 320, rotation: 0 }, { fill: COLORS.subtle, radius: 12 })), closeButton);
  } else if (id.includes("player")) {
    children.push(ctx.add(makeRectNode("비디오", { x: 0, y: 0, w: contentW, h: 280, rotation: 0 }, { fill: COLORS.subtle, radius: 12 })));
    const controls = makeStack(ctx, "컨트롤", { w: contentW, h: 44 }, "row", { gap: 10, align: "center" });
    const progress = ctx.add(makeRectNode("바", { x: 0, y: 0, w: 280, h: 6, rotation: 0 }, { fill: COLORS.muted, radius: 999 }));
    ctx.attach(controls, [makeIconBox(ctx, 24), progress]);
    children.push(controls);
  } else if (id.includes("story")) {
    const progress = makeStack(ctx, "진행", { w: contentW, h: 8 }, "row", { gap: 6, align: "center" });
    const bars = Array.from({ length: 3 }).map((_, idx) =>
      ctx.add(makeRectNode("바", { x: 0, y: 0, w: 90, h: 6, rotation: 0 }, { fill: idx === 0 ? COLORS.surface : COLORS.muted, radius: 999 })),
    );
    ctx.attach(progress, bars);
    const detailButton = makeButton(ctx, "자세히", contentW, "primary");
    wireMockSubmit(detailButton, "success");
    children.push(progress, ctx.add(makeRectNode("스토리", { x: 0, y: 0, w: contentW, h: 420, rotation: 0 }, { fill: COLORS.subtle, radius: 16 })), detailButton);
  } else if (id.includes("live")) {
    const row = makeStack(ctx, "라이브", { w: contentW, h: 420 }, "row", { gap: 12, align: "start" });
    const video = makeStack(ctx, "영상", { w: 600, h: 420 }, "column", { gap: 8, padding: { t: 12, r: 12, b: 12, l: 12 }, fill: COLORS.subtle, radius: 12 });
    ctx.attach(video, [makeBadge(ctx, "LIVE", { fill: "#FEE2E2", text: COLORS.danger })]);
    const chat = makeStack(ctx, "채팅", { w: 260, h: 420 }, "column", { gap: 10, padding: { t: 12, r: 12, b: 12, l: 12 }, fill: COLORS.surface, stroke: { color: COLORS.border, width: 1 }, radius: 12 });
    const chatMessages = makeStack(ctx, "채팅 목록", { w: 236, h: 300 }, "column", { gap: 8 });
    ctx.attach(chatMessages, [makeListItem(ctx, "시청자1", "좋아요!", 236, "avatar"), makeListItem(ctx, "시청자2", "멋져요", 236, "avatar")]);
    const chatInputRow = makeStack(ctx, "채팅 입력", { w: 236, h: 44 }, "row", { gap: 6, align: "center" });
    const liveChatInput = makeInput(ctx, fieldPlaceholder("message", "채팅"), 170);
    const liveSendButton = makeButton(ctx, "전송", 58, "primary");
    wireSubmit(liveSendButton, "/api/pages/{pageId}/chat");
    ctx.attach(chatInputRow, [liveChatInput, liveSendButton]);
    ctx.attach(chat, [chatMessages, chatInputRow]);
    ctx.attach(row, [video, chat]);
    children.push(row);
  }

  ctx.attach(root, children);
  return root;
}
function buildAnalyticsPreset(id: string, title: string, origin: { x: number; y: number }, ctx: BuildCtx, size: Size) {
  const root = makeRoot(ctx, title, origin, size, { gap: 12 });
  const contentW = size.w - PADDING_SCREEN * 2;
  const children: Node[] = [];

  if (id.includes("kpi")) {
    const row = makeStack(ctx, "KPI", { w: contentW, h: 120 }, "row", { gap: 12, align: "center" });
    ctx.attach(row, [makeStatCard(ctx, "방문자", "12.3K", { w: 200, h: 100 }), makeStatCard(ctx, "전환율", "4.2%", { w: 200, h: 100 }), makeStatCard(ctx, "매출", "\u20A923M", { w: 200, h: 100 })]);
    children.push(row);
  } else if (id.includes("chart")) {
    children.push(makeHeaderRow(ctx, title, contentW, "기간"), ctx.add(makeRectNode("차트", { x: 0, y: 0, w: contentW, h: 260, rotation: 0 }, { fill: COLORS.subtle, radius: 12 })));
  } else if (id.includes("data-table")) {
    children.push(makeHeaderRow(ctx, title, contentW, "내보내기"), makeTablePlaceholder(ctx, contentW, 260, 6));
  } else if (id.includes("user-admin")) {
    children.push(makeHeaderRow(ctx, "사용자 관리자", contentW, "추가"), makeTablePlaceholder(ctx, contentW, 300, 5));
  } else if (id.includes("audit")) {
    children.push(makeHeaderRow(ctx, "감사 로그", contentW, "필터"));
    const list = makeStack(ctx, "로그", { w: contentW, h: 260 }, "column", { gap: 10 });
    ctx.attach(list, [makeListItem(ctx, "로그인", "방금", contentW, "icon"), makeListItem(ctx, "설정 변경", "1시간 전", contentW, "icon")]);
    children.push(list);
  } else if (id.includes("billing")) {
    children.push(makeHeaderRow(ctx, "빌링 관리", contentW, "업그레이드"));
    const plans = makeStack(ctx, "플랜", { w: contentW, h: 120 }, "row", { gap: 12, align: "center" });
    ctx.attach(plans, [makePlanCard(ctx, "Starter", "\u20A99,900", 200), makePlanCard(ctx, "Pro", "\u20A919,900", 200, true)]);
    children.push(plans, makeTablePlaceholder(ctx, contentW, 220, 4));
  } else if (id.includes("system-console")) {
    root.style = { ...root.style, fills: [{ type: "solid", color: COLORS.dark }] };
    children.push(
      ctx.add(makeTextNode("타이틀", "콘솔", { x: 0, y: 0, w: contentW, h: 18, rotation: 0 }, { size: 12, color: "#E2E8F0" })),
      ctx.add(makeTextNode("라인", "$ deploy --prod", { x: 0, y: 0, w: contentW, h: 16, rotation: 0 }, { size: 11, color: "#94A3B8" })),
      ctx.add(makeTextNode("라인", "빌드 완료", { x: 0, y: 0, w: contentW, h: 16, rotation: 0 }, { size: 11, color: "#94A3B8" })),
    );
  } else if (id.includes("import-export")) {
    const row = makeStack(ctx, "전송", { w: contentW, h: 200 }, "row", { gap: 12, align: "center" });
    ctx.attach(row, [
      ctx.add(makeRectNode("가져오기", { x: 0, y: 0, w: 280, h: 160, rotation: 0 }, { fill: COLORS.subtle, radius: 12 })),
      ctx.add(makeRectNode("내보내기", { x: 0, y: 0, w: 280, h: 160, rotation: 0 }, { fill: COLORS.subtle, radius: 12 })),
    ]);
    children.push(row);
  } else if (id.includes("monitoring")) {
    const stats = makeStack(ctx, "요약", { w: contentW, h: 120 }, "row", { gap: 12, align: "center" });
    ctx.attach(stats, [makeStatCard(ctx, "응답", "99.9%", { w: 200, h: 100 }), makeStatCard(ctx, "에러", "0.2%", { w: 200, h: 100 })]);
    children.push(stats, ctx.add(makeRectNode("차트", { x: 0, y: 0, w: contentW, h: 200, rotation: 0 }, { fill: COLORS.subtle, radius: 12 })));
  }

  ctx.attach(root, children);
  return root;
}

function buildFeedbackPreset(id: string, title: string, origin: { x: number; y: number }, ctx: BuildCtx, size: Size) {
  const root = makeRoot(ctx, title, origin, size, { padding: { t: 16, r: 16, b: 16, l: 16 }, gap: 10 });
  const contentW = size.w - 32;
  const children: Node[] = [];

  if (id.includes("skeleton")) {
    children.push(
      ctx.add(makeRectNode("스켈레톤", { x: 0, y: 0, w: contentW, h: 18, rotation: 0 }, { fill: COLORS.muted, radius: 6 })),
      ctx.add(makeRectNode("스켈레톤", { x: 0, y: 0, w: contentW - 60, h: 18, rotation: 0 }, { fill: COLORS.muted, radius: 6 })),
      ctx.add(makeRectNode("스켈레톤", { x: 0, y: 0, w: contentW - 120, h: 18, rotation: 0 }, { fill: COLORS.muted, radius: 6 })),
    );
  } else if (id.includes("empty")) {
    const createButton = makeButton(ctx, "새로 만들기", contentW, "primary");
    wireMockSubmit(createButton, "success");
    children.push(makeIconBox(ctx, 48, COLORS.subtle), makeTitle(ctx, "데이터 없음", contentW, 16), makeSubtitle(ctx, "아직 표시할 항목이 없습니다.", contentW, 11), createButton);
  } else if (id.includes("toast")) {
    const toast = makeStack(ctx, "토스트", { w: contentW, h: 60 }, "row", { gap: 10, padding: { t: 12, r: 12, b: 12, l: 12 }, align: "center", fill: COLORS.dark, radius: 10 });
    ctx.attach(toast, [ctx.add(makeTextNode("텍스트", "저장되었습니다", { x: 0, y: 0, w: 200, h: 16, rotation: 0 }, { size: 12, color: "#E2E8F0" }))]);
    children.push(toast);
  } else if (id.includes("confirm")) {
    children.push(makeTitle(ctx, "작업을 진행할까요?", contentW, 16), makeSubtitle(ctx, "이 작업은 되돌릴 수 없습니다.", contentW, 11));
    const actions = makeStack(ctx, "액션", { w: contentW, h: 40 }, "row", { gap: 8, align: "center" });
    const cancelButton = makeButton(ctx, "취소", Math.floor((contentW - 8) / 2), "secondary");
    const confirmButton = makeButton(ctx, "확인", Math.floor((contentW - 8) / 2), "primary");
    wireMockSubmit(cancelButton, "sent");
    wireMockSubmit(confirmButton, "success");
    ctx.attach(actions, [cancelButton, confirmButton]);
    children.push(actions);
  } else if (id.includes("offline")) {
    root.style = { ...root.style, fills: [{ type: "solid", color: "#FEF3C7" }] };
    children.push(ctx.add(makeTextNode("텍스트", "네트워크 연결이 불안정합니다.", { x: 0, y: 0, w: contentW, h: 18, rotation: 0 }, { size: 12, weight: 600, color: "#92400E" })));
  } else if (id.includes("error")) {
    const homeButton = makeButton(ctx, "홈으로", contentW, "primary");
    wireMockSubmit(homeButton, "success");
    children.push(makeTitle(ctx, "404", contentW, 26), makeSubtitle(ctx, "페이지를 찾을 수 없습니다.", contentW, 12), homeButton);
  }

  ctx.attach(root, children);
  return root;
}

function buildFormPreset(id: string, title: string, origin: { x: number; y: number }, ctx: BuildCtx, size: Size) {
  const root = makeRoot(ctx, title, origin, size, { padding: { t: PADDING_PANEL, r: PADDING_PANEL, b: PADDING_PANEL, l: PADDING_PANEL }, gap: 12 });
  const contentW = size.w - PADDING_PANEL * 2;
  const children: Node[] = [];

  if (id.includes("wizard")) {
    const steps = makeStack(ctx, "단계", { w: contentW, h: 36 }, "row", { gap: 8, align: "center" });
    ctx.attach(steps, [makeChip(ctx, "1", { fill: "#DBEAFE", text: COLORS.accent }), makeChip(ctx, "2"), makeChip(ctx, "3")]);
    const nextButton = makeButton(ctx, "다음", contentW, "primary");
    wireMockSubmit(nextButton, "success");
    children.push(steps, makeInput(ctx, "이름", contentW), makeInput(ctx, "이메일", contentW), nextButton);
  } else if (id.includes("validation")) {
    children.push(makeTitle(ctx, "폼 검증", contentW, 18));
    const input = makeInput(ctx, "이메일", contentW);
    input.style = { ...input.style, strokes: [{ color: COLORS.danger, width: 1, align: "inside" }] };
    const submitButton = makeButton(ctx, "제출", contentW, "primary");
    wireMockSubmit(submitButton, "success");
    children.push(input, makeSubtitle(ctx, "이메일 형식을 확인하세요.", contentW, 11), submitButton);
  } else if (id.includes("masking")) {
    children.push(
      makeTitle(ctx, "입력 마스킹", contentW, 18),
      makeInput(ctx, "010-1234-5678", contentW, 40, { name: "전화 입력" }),
      makeInput(ctx, "YYYY-MM-DD", contentW, 40, { name: "날짜 입력" }),
    );
  } else if (id.includes("dropzone")) {
    children.push(makeTitle(ctx, "업로드 드롭존", contentW, 18));
    const dropzone = makeDropzone(ctx, "파일을 여기에 드롭", contentW, 200);
    const uploadButton = makeButton(ctx, "업로드", contentW, "primary");
    wireSubmit(uploadButton, "/api/app/{pageId}/upload");
    children.push(dropzone, uploadButton);
  } else if (id.includes("address")) {
    children.push(makeInput(ctx, "주소를 입력하세요", contentW));
    const list = makeStack(ctx, "결과", { w: contentW, h: 220 }, "column", { gap: 10 });
    ctx.attach(list, [makeListItem(ctx, "서울 강남구", "도로명", contentW, "icon"), makeListItem(ctx, "서울 마포구", "지번", contentW, "icon")]);
    children.push(list);
  }

  ctx.attach(root, children);
  return root;
}

function buildCommercePreset(id: string, title: string, origin: { x: number; y: number }, ctx: BuildCtx, size: Size) {
  const root = makeRoot(ctx, title, origin, size, { padding: { t: 16, r: 16, b: 16, l: 16 }, gap: 12 });
  const contentW = size.w - 32;
  const children: Node[] = [];

  if (id.includes("catalog")) {
    children.push(makeHeaderRow(ctx, "상품 카탈로그", contentW, "새 상품"));
    const filters = makeStack(ctx, "필터", { w: contentW, h: 34 }, "row", { gap: 8, align: "center" });
    ctx.attach(filters, [
      makeChip(ctx, "전체", { fill: COLORS.primaryLight, text: COLORS.primary }),
      makeChip(ctx, "재고 있음"),
      makeChip(ctx, "프로모션"),
      makeChip(ctx, "품절", { fill: COLORS.warningLight, text: COLORS.warning }),
    ]);
    const search = makeInput(ctx, "상품명/카테고리 검색", contentW, 42, { name: "catalog-search" });
    const row1 = makeStack(ctx, "상품 행 1", { w: contentW, h: 210 }, "row", { gap: 12, align: "center" });
    ctx.attach(row1, [
      makeContentCard(ctx, 220, 200, "스니커즈", "₩129,000 · 재고 24"),
      makeContentCard(ctx, 220, 200, "후디", "₩79,000 · 재고 8"),
      makeContentCard(ctx, 220, 200, "백팩", "₩159,000 · 재고 3"),
    ]);
    const row2 = makeStack(ctx, "상품 행 2", { w: contentW, h: 210 }, "row", { gap: 12, align: "center" });
    ctx.attach(row2, [
      makeContentCard(ctx, 220, 200, "모자", "₩29,000 · 재고 40"),
      makeContentCard(ctx, 220, 200, "양말", "₩9,900 · 재고 120"),
      makeContentCard(ctx, 220, 200, "트랙 팬츠", "₩69,000 · 재고 15"),
    ]);
    children.push(filters, search, row1, row2);
  } else if (id.includes("inventory")) {
    children.push(makeHeaderRow(ctx, "배송/재고", contentW, "출고 처리"));
    const stats = makeStack(ctx, "재고 요약", { w: contentW, h: 100 }, "row", { gap: 12, align: "center" });
    ctx.attach(stats, [
      makeStatCard(ctx, "재고 부족", "6개", { w: 200, h: 90 }),
      makeStatCard(ctx, "배송중", "18건", { w: 200, h: 90 }),
      makeStatCard(ctx, "오늘 출고", "24건", { w: 200, h: 90 }),
    ]);
    const table = makeTablePlaceholder(ctx, contentW, 240, 6);
    const list = makeStack(ctx, "배송 리스트", { w: contentW, h: 180 }, "column", { gap: 8 });
    ctx.attach(list, [
      makeListItem(ctx, "주문 #1024", "배송중 · 2건", contentW, "icon"),
      makeListItem(ctx, "주문 #1025", "준비중 · 1건", contentW, "icon"),
      makeListItem(ctx, "주문 #1026", "완료 · 3건", contentW, "icon"),
    ]);
    children.push(stats, table, list);
  } else if (id.includes("cart")) {
    children.push(makeHeaderRow(ctx, "장바구니", contentW, "편집"));
    const list = makeStack(ctx, "아이템", { w: contentW, h: 240 }, "column", { gap: 10 });
    ctx.attach(list, [makeListItem(ctx, "상품 A", "1개", contentW, "icon"), makeListItem(ctx, "상품 B", "2개", contentW, "icon")]);
    const payButton = makeButton(ctx, "결제하기", contentW, "primary");
    wireMockSubmit(payButton, "success");
    children.push(list, payButton);
  } else if (id.includes("payment-method")) {
    children.push(makeHeaderRow(ctx, "결제 수단", contentW, "추가"));
    const list = makeStack(ctx, "카드", { w: contentW, h: 220 }, "column", { gap: 10 });
    ctx.attach(list, [makeListItem(ctx, "VISA **** 1234", "기본", contentW, "icon"), makeListItem(ctx, "Master **** 4567", undefined, contentW, "icon")]);
    children.push(list);
  } else if (id.includes("price-table")) {
    const row = makeStack(ctx, "가격", { w: contentW, h: 200 }, "row", { gap: 12, align: "center" });
    ctx.attach(row, [makePlanCard(ctx, "Starter", "\u20A99,900", 220), makePlanCard(ctx, "Pro", "\u20A919,900", 220, true), makePlanCard(ctx, "Team", "\u20A949,900", 220)]);
    const planSelect = makeStack(ctx, "플랜 선택", { w: contentW, h: 120 }, "column", { gap: 10 });
    ctx.attach(planSelect, [makeCheckboxRow(ctx, "Standard 플랜", contentW), makeCheckboxRow(ctx, "Pro 플랜", contentW), makeCheckboxRow(ctx, "Enterprise 플랜", contentW)]);
    const subscribeButton = makeButton(ctx, "구독하기", 200, "primary");
    wireSubmit(subscribeButton, "/api/billing/upgrade");
    children.push(row, planSelect, subscribeButton);
  } else if (id.includes("payment-result")) {
    const confirmButton = makeButton(ctx, "확인", contentW, "primary");
    wireMockSubmit(confirmButton, "success");
    children.push(makeIconBox(ctx, 48, "#DCFCE7"), makeTitle(ctx, "결제 완료", contentW, 18), makeSubtitle(ctx, "주문이 정상적으로 처리되었습니다.", contentW, 11), confirmButton);
  } else if (id.includes("coupon")) {
    children.push(makeInput(ctx, "쿠폰 코드", contentW));
    children.push(ctx.add(makeRectNode("쿠폰 카드", { x: 0, y: 0, w: contentW, h: 100, rotation: 0 }, { fill: "#DBEAFE", radius: 12 })));
    const applyButton = makeButton(ctx, "적용", contentW, "primary");
    wireMockSubmit(applyButton, "success");
    children.push(applyButton);
  }

  ctx.attach(root, children);
  return root;
}

function buildAppAuthPreset(id: string, title: string, origin: { x: number; y: number }, ctx: BuildCtx, size: Size) {
  const root = makeRoot(ctx, title, origin, size);
  if (id === "asset-auth-login") {
    const heading = ctx.add(makeTextNode("로그인", "로그인", { x: 0, y: 0, w: size.w - 48, h: 28, rotation: 0 }, { size: 20, weight: 700, align: "center" }));
    const emailInput = makeInput(ctx, "이메일", size.w - 48, 44, { name: "email" });
    const pwInput = makeInput(ctx, "비밀번호", size.w - 48, 44, { name: "password" });
    const loginBtn = makeButton(ctx, "로그인", size.w - 48, "primary");
    addClickAction(loginBtn, { type: "appAuth", action: "login" });
    ctx.attach(root, [heading, emailInput, pwInput, loginBtn]);
  } else if (id === "asset-auth-register") {
    const heading = ctx.add(makeTextNode("회원가입", "회원가입", { x: 0, y: 0, w: size.w - 48, h: 28, rotation: 0 }, { size: 20, weight: 700, align: "center" }));
    const nameInput = makeInput(ctx, "이름", size.w - 48, 44, { name: "display_name" });
    const emailInput = makeInput(ctx, "이메일", size.w - 48, 44, { name: "email" });
    const pwInput = makeInput(ctx, "비밀번호", size.w - 48, 44, { name: "password" });
    const registerBtn = makeButton(ctx, "가입하기", size.w - 48, "primary");
    addClickAction(registerBtn, { type: "appAuth", action: "register" });
    ctx.attach(root, [heading, nameInput, emailInput, pwInput, registerBtn]);
  } else if (id === "asset-auth-profile") {
    const heading = ctx.add(makeTextNode("내 프로필", "내 프로필", { x: 0, y: 0, w: size.w - 48, h: 28, rotation: 0 }, { size: 20, weight: 700, align: "center" }));
    const emailLabel = ctx.add(makeTextNode("$app_user.email", "$app_user.email", { x: 0, y: 0, w: size.w - 48, h: 20, rotation: 0 }, { size: 14, weight: 400, align: "center", color: COLORS.textSecondary }));
    const nameLabel = ctx.add(makeTextNode("$app_user.display_name", "$app_user.display_name", { x: 0, y: 0, w: size.w - 48, h: 20, rotation: 0 }, { size: 14, weight: 400, align: "center", color: COLORS.textSecondary }));
    const logoutBtn = makeButton(ctx, "로그아웃", size.w - 48, "ghost");
    addClickAction(logoutBtn, { type: "appAuth", action: "logout" });
    ctx.attach(root, [heading, emailLabel, nameLabel, logoutBtn]);
  }
  return root;
}

function buildTemplatePreset(id: string, title: string, origin: { x: number; y: number }, ctx: BuildCtx, size: Size) {
  const root = makeRoot(ctx, title, origin, size, { gap: 16 });
  const contentW = size.w - PADDING_SCREEN * 2;
  const children: Node[] = [];

  if (id.includes("blank")) {
    children.push(ctx.add(makeRectNode("빈 캔버스", { x: 0, y: 0, w: contentW, h: 420, rotation: 0 }, { fill: COLORS.surface, stroke: { color: COLORS.border, width: 2 }, radius: 12 })));
  } else if (id.includes("landing")) {
    children.push(
      ctx.add(makeRectNode("히어로", { x: 0, y: 0, w: contentW, h: 240, rotation: 0 }, { fill: COLORS.subtle, radius: 16 })),
      makeStack(ctx, "특징", { w: contentW, h: 160 }, "row", { gap: 12, align: "center" }),
    );
    const features = children[1] as Node;
    ctx.attach(features, [makeContentCard(ctx, 240, 140, "특징 1"), makeContentCard(ctx, 240, 140, "특징 2"), makeContentCard(ctx, 240, 140, "특징 3")]);
    const startButton = makeButton(ctx, "지금 시작", 200, "primary");
    wireMockSubmit(startButton, "success");
    children.push(startButton);
  } else if (id.includes("dashboard")) {
    const layout = makeStack(ctx, "레이아웃", { w: contentW, h: 520 }, "row", { gap: 12, align: "start" });
    const sidebar = makeStack(ctx, "사이드", { w: 200, h: 520 }, "column", { gap: 10, padding: { t: 12, r: 12, b: 12, l: 12 }, fill: COLORS.surface, stroke: { color: COLORS.border, width: 1 }, radius: 12 });
    ctx.attach(sidebar, [makeListItem(ctx, "대시보드", undefined, 176, "icon"), makeListItem(ctx, "분석", undefined, 176, "icon")]);
    const content = makeStack(ctx, "콘텐츠", { w: contentW - 220, h: 520 }, "column", { gap: 12 });
    ctx.attach(content, [makeStatCard(ctx, "매출", "\u20A923M", { w: contentW - 220, h: 100 }), makeTablePlaceholder(ctx, contentW - 220, 300, 4)]);
    ctx.attach(layout, [sidebar, content]);
    children.push(layout);
  } else if (id.includes("community")) {
    const layout = makeStack(ctx, "레이아웃", { w: contentW, h: 520 }, "row", { gap: 12, align: "start" });
    const feed = makeStack(ctx, "피드", { w: 600, h: 520 }, "column", { gap: 12 });
    ctx.attach(feed, [makeContentCard(ctx, 600, 180, "커뮤니티 글", "5분 전"), makeContentCard(ctx, 600, 180, "업데이트", "1시간 전")]);
    const sidebar = makeStack(ctx, "사이드", { w: 240, h: 520 }, "column", { gap: 10, padding: { t: 12, r: 12, b: 12, l: 12 }, fill: COLORS.surface, stroke: { color: COLORS.border, width: 1 }, radius: 12 });
    ctx.attach(sidebar, [makeListItem(ctx, "인기 태그", "#ui", 216, "icon"), makeListItem(ctx, "추천", "#ux", 216, "icon")]);
    ctx.attach(layout, [feed, sidebar]);
    children.push(layout);
  } else if (id.includes("service")) {
    children.push(
      ctx.add(makeRectNode("히어로", { x: 0, y: 0, w: contentW, h: 220, rotation: 0 }, { fill: COLORS.subtle, radius: 16 })),
      makeStack(ctx, "스텝", { w: contentW, h: 140 }, "row", { gap: 12, align: "center" }),
    );
    const steps = children[1] as Node;
    ctx.attach(steps, [makeContentCard(ctx, 220, 120, "단계 1"), makeContentCard(ctx, 220, 120, "단계 2"), makeContentCard(ctx, 220, 120, "단계 3")]);
    const consultButton = makeButton(ctx, "상담 신청", 220, "primary");
    wireMockSubmit(consultButton, "success");
    children.push(consultButton);
  }

  ctx.attach(root, children);
  return root;
}

function buildAssetPreset(variant: AssetVariant, id: string, title: string, origin: { x: number; y: number }, ctx: BuildCtx, size: Size) {
  switch (variant) {
    case "flow":
      return buildFlowPreset(id, title, origin, ctx, size);
    case "ui":
      return buildUiPreset(id, title, origin, ctx, size);
    case "settings":
      return buildSettingsPreset(id, title, origin, ctx, size);
    case "content":
      return buildContentPreset(id, title, origin, ctx, size);
    case "communication":
      return buildCommunicationPreset(id, title, origin, ctx, size);
    case "productivity":
      return buildProductivityPreset(id, title, origin, ctx, size);
    case "board":
      return buildBoardPreset(title, origin, ctx, size);
    case "timeline":
      return buildTimelinePreset(title, origin, ctx, size);
    case "media":
      return buildMediaPreset(id, title, origin, ctx, size);
    case "analytics":
      return buildAnalyticsPreset(id, title, origin, ctx, size);
    case "feedback":
      return buildFeedbackPreset(id, title, origin, ctx, size);
    case "form":
      return buildFormPreset(id, title, origin, ctx, size);
    case "commerce":
      return buildCommercePreset(id, title, origin, ctx, size);
    case "template":
      return buildTemplatePreset(id, title, origin, ctx, size);
    case "appauth":
      return buildAppAuthPreset(id, title, origin, ctx, size);
    default:
      return makeRoot(ctx, title, origin, size);
  }
}

const ASSET_PRESETS: Record<string, PresetDefinition> = Object.fromEntries(
  GROUPS.flatMap((group) =>
    group.ids.map((id) => {
      const label = ASSET_LABELS[id] ?? id;
      const size = getSizeForAsset(group.variant, id);
      const version = "v1.0";
      return [
        id,
        {
          id,
          label,
          description: ASSET_DESCRIPTIONS[id],
          version,
          size,
          build: (origin) => {
            const ctx = createBuilder();
            const root = buildAssetPreset(group.variant, id, label, origin, ctx, size);
            return { rootId: root.id, nodes: ctx.nodes };
          },
        } as PresetDefinition,
      ];
    }),
  ),
);

function makeFallbackPreset(id: string): PresetDefinition {
  const size = SIZE_PANEL;
  return {
    id,
    label: id,
    version: "v1.0",
    size,
    build: (origin) => {
      const ctx = createBuilder();
      const root = makeRoot(ctx, "자산", origin, size);
      const contentW = size.w - PADDING_SCREEN * 2;
      const title = makeTitle(ctx, id, contentW, 14);
      ctx.attach(root, [title]);
      return { rootId: root.id, nodes: ctx.nodes };
    },
  };
}

export const ASSET_LIBRARY_PRESET_GROUPS: Array<{ title: string; icon?: string; items: PresetDefinition[] }> = GROUPS.map((group) => ({
  title: group.title,
  icon: CATEGORY_ICONS[group.title],
  items: group.ids.map((id) => ASSET_PRESETS[id] ?? makeFallbackPreset(id)),
}));
