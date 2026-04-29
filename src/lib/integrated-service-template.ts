import { addNode, createDoc, createNode, serializeDoc, type Doc, type Frame, type Node, type PageBreakpoint, type PrototypeAction, type PrototypeTransitionType, type Variable } from "@/advanced/doc/scene";
import { fieldPlaceholder, makeFrameNode, makeRectNode, makeTextNode } from "@/advanced/ui/AdvancedEditor.nodes";
import { ASSET_LIBRARY_PRESET_GROUPS } from "@/advanced/ui/AdvancedEditor.assetLibraryPresets";

export const INTEGRATED_SERVICE_PROJECT_TITLE = "NULL 통합 검증 서비스";

const PAGE_SIZE = { w: 1680, h: 3920 };
const MOBILE_PAGE_WIDTH = 390;
const MOBILE_CONTENT_WIDTH = 350;
const TEMPLATE_FONT_FAMILY = "'Space Grotesk', 'Noto Sans KR', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif";

export const INTEGRATED_SERVICE_DESIGN_TOKENS = {
  colors: {
    canvas: "#F8FAFC",
    surface: "#FFFFFF",
    surfaceMuted: "#F8FAFC",
    surfaceBrand: "#EFF6FF",
    surfaceBrandAlt: "#EEF2FF",
    surfaceDanger: "#FEE2E2",
    border: "#E2E8F0",
    borderStrong: "#CBD5E1",
    borderBrand: "#DBEAFE",
    borderDanger: "#FCA5A5",
    textStrong: "#0F172A",
    textBody: "#475569",
    textMuted: "#64748B",
    textSubtle: "#94A3B8",
    textOnDark: "#FFFFFF",
    textOnDarkMuted: "#CBD5E1",
    brand: "#1D4ED8",
    brandStrong: "#4338CA",
    accentPurple: "#7C3AED",
    accentTeal: "#0F766E",
    accentOrange: "#EA580C",
    accentDark: "#020617",
    dangerText: "#B91C1C",
  },
  radius: {
    hero: 28,
    panel: 24,
    item: 18,
    pill: 999,
  },
  spacing: {
    panelInset: 24,
    panelInsetTight: 20,
    panelGap: 24,
    rowGap: 62,
  },
  fonts: {
    sans: TEMPLATE_FONT_FAMILY,
  },
  typography: {
    heroBadge: { size: 12, weight: 800 },
    heroTitle: { size: 34, weight: 800 },
    heroBody: { size: 15, weight: 500 },
    navTitle: { size: 20, weight: 800 },
    statLabel: { size: 12, weight: 700 },
    statValue: { size: 24, weight: 800 },
    panelTitle: { size: 18, weight: 800 },
    panelBody: { size: 12, weight: 500 },
    sectionLabel: { size: 12, weight: 800 },
    fieldLabel: { size: 11, weight: 700 },
    itemTitle: { size: 16, weight: 700 },
    itemMeta: { size: 12, weight: 600 },
    bodyStrong: { size: 13, weight: 700 },
    body: { size: 13, weight: 500 },
    meta: { size: 11, weight: 500 },
    metricValue: { size: 18, weight: 800 },
    status: { size: 13, weight: 700 },
    action: { size: 13, weight: 800 },
  },
  shadows: {
    panel: { type: "shadow", x: 0, y: 14, blur: 30, color: "#0F172A", opacity: 0.08 },
    brandPanel: { type: "shadow", x: 0, y: 12, blur: 28, color: "#1D4ED8", opacity: 0.08 },
    darkPanel: { type: "shadow", x: 0, y: 18, blur: 34, color: "#0F172A", opacity: 0.18 },
    stat: { type: "shadow", x: 0, y: 10, blur: 28, color: "#0F172A", opacity: 0.06 },
    button: { type: "shadow", x: 0, y: 10, blur: 24, color: "#0F172A", opacity: 0.08 },
  },
  components: {
    actionButtonHeight: 44,
    inputHeight: 72,
    textareaHeight: 150,
  },
} as const;

type IntegratedServiceSurfaceVariant = "default" | "brand" | "muted" | "dark";
type IntegratedServiceShadowKey = keyof typeof INTEGRATED_SERVICE_DESIGN_TOKENS.shadows;
type IntegratedServiceTextStyleKey = keyof typeof INTEGRATED_SERVICE_DESIGN_TOKENS.typography;

type IntegratedServiceCredential = {
  label: string;
  role: string;
  email: string;
  password: string;
  displayName: string;
};

const DEFAULT_CREDENTIALS: IntegratedServiceCredential[] = [
  {
    label: "운영 관리자",
    role: "admin",
    email: "admin@example.com",
    password: "NullDemo!2026",
    displayName: "NULL 운영 관리자",
  },
  {
    label: "파트너 운영자",
    role: "user",
    email: "partner@example.com",
    password: "NullDemo!2026",
    displayName: "파트너 운영자",
  },
  {
    label: "일반 사용자",
    role: "user",
    email: "member@example.com",
    password: "NullDemo!2026",
    displayName: "일반 사용자",
  },
];

const PRESET_MAP = new Map(
  ASSET_LIBRARY_PRESET_GROUPS.flatMap((group) => group.items.map((item) => [item.id, item] as const)),
);

const USER_APP_COMPACT_BREAKPOINT_ID = "bp_user_compact_desktop";
const USER_APP_MOBILE_BREAKPOINT_ID = "bp_user_mobile";
const USER_APP_BREAKPOINTS: PageBreakpoint[] = [
  {
    id: USER_APP_COMPACT_BREAKPOINT_ID,
    name: "좁은 데스크톱",
    width: 1180,
    height: 7360,
    minWidth: 768,
    maxWidth: 1279,
  },
  {
    id: USER_APP_MOBILE_BREAKPOINT_ID,
    name: "모바일",
    width: MOBILE_PAGE_WIDTH,
    height: 7600,
    minWidth: 0,
    maxWidth: 767,
  },
];
const PARTNER_PORTAL_COMPACT_BREAKPOINT_ID = "bp_partner_compact_desktop";
const PARTNER_PORTAL_MOBILE_BREAKPOINT_ID = "bp_partner_mobile";
const PARTNER_PORTAL_BREAKPOINTS: PageBreakpoint[] = [
  {
    id: PARTNER_PORTAL_COMPACT_BREAKPOINT_ID,
    name: "좁은 데스크톱",
    width: 1180,
    height: 4900,
    minWidth: 768,
    maxWidth: 1279,
  },
  {
    id: PARTNER_PORTAL_MOBILE_BREAKPOINT_ID,
    name: "모바일",
    width: MOBILE_PAGE_WIDTH,
    height: 6400,
    minWidth: 0,
    maxWidth: 767,
  },
];
const OPS_CONSOLE_COMPACT_BREAKPOINT_ID = "bp_ops_compact_desktop";
const OPS_CONSOLE_MOBILE_BREAKPOINT_ID = "bp_ops_mobile";
const OPS_CONSOLE_BREAKPOINTS: PageBreakpoint[] = [
  {
    id: OPS_CONSOLE_COMPACT_BREAKPOINT_ID,
    name: "좁은 데스크톱",
    width: 1180,
    height: 5860,
    minWidth: 768,
    maxWidth: 1279,
  },
  {
    id: OPS_CONSOLE_MOBILE_BREAKPOINT_ID,
    name: "모바일",
    width: MOBILE_PAGE_WIDTH,
    height: 7600,
    minWidth: 0,
    maxWidth: 767,
  },
];

function applyTemplateShadow(node: Node, shadowKey: IntegratedServiceShadowKey) {
  node.style.effects = [{ ...INTEGRATED_SERVICE_DESIGN_TOKENS.shadows[shadowKey] }];
  return node;
}

function makeSurfaceFrame(
  name: string,
  frame: Frame,
  options: {
    variant?: IntegratedServiceSurfaceVariant;
    radius?: number;
    shadow?: IntegratedServiceShadowKey | null;
  } = {},
) {
  const variant = options.variant ?? "default";
  const radius = options.radius ?? INTEGRATED_SERVICE_DESIGN_TOKENS.radius.panel;
  const styleByVariant = {
    default: {
      fill: INTEGRATED_SERVICE_DESIGN_TOKENS.colors.surface,
      stroke: { color: INTEGRATED_SERVICE_DESIGN_TOKENS.colors.border, width: 1 },
      shadow: "panel" as const,
    },
    brand: {
      fill: INTEGRATED_SERVICE_DESIGN_TOKENS.colors.surface,
      stroke: { color: INTEGRATED_SERVICE_DESIGN_TOKENS.colors.borderBrand, width: 1 },
      shadow: "brandPanel" as const,
    },
    muted: {
      fill: INTEGRATED_SERVICE_DESIGN_TOKENS.colors.surfaceMuted,
      stroke: { color: INTEGRATED_SERVICE_DESIGN_TOKENS.colors.border, width: 1 },
      shadow: null,
    },
    dark: {
      fill: INTEGRATED_SERVICE_DESIGN_TOKENS.colors.accentDark,
      stroke: null,
      shadow: "darkPanel" as const,
    },
  } satisfies Record<
    IntegratedServiceSurfaceVariant,
    {
      fill: string;
      stroke: { color: string; width: number } | null;
      shadow: IntegratedServiceShadowKey | null;
    }
  >;
  const resolved = styleByVariant[variant];
  const node = makeFrameNode(name, frame, {
    fill: resolved.fill,
    stroke: resolved.stroke,
    radius,
  });
  const shadow = options.shadow === undefined ? resolved.shadow : options.shadow;
  if (shadow) applyTemplateShadow(node, shadow);
  else node.style.effects = [];
  return node;
}

function makeTemplateTextNode(
  name: string,
  value: string,
  frame: Frame,
  styleKey: IntegratedServiceTextStyleKey,
  color: string,
  options?: { align?: "left" | "center" | "right" },
) {
  const style = INTEGRATED_SERVICE_DESIGN_TOKENS.typography[styleKey];
  const node = makeTextNode(name, value, frame, {
    color,
    size: style.size,
    weight: style.weight,
    align: options?.align,
  });
  if (node.text) {
    node.text.style = {
      ...node.text.style,
      fontFamily: INTEGRATED_SERVICE_DESIGN_TOKENS.fonts.sans,
      lineHeight: Math.round(style.size * 1.45),
      letterSpacing: style.size >= 24 ? -0.4 : style.size >= 18 ? -0.2 : 0,
    };
  }
  return node;
}

function getSolidFillColor(node: Node) {
  const fill = node.style.fills[0];
  return fill?.type === "solid" ? fill.color : null;
}

function setSolidStyle(
  node: Node,
  options: {
    fill: string;
    stroke?: { color: string; width: number } | null;
    radius?: number;
    shadow?: IntegratedServiceShadowKey | null;
  },
) {
  node.style = {
    ...node.style,
    fills: [{ type: "solid", color: options.fill }],
    strokes: options.stroke ? [{ ...options.stroke }] : [],
    radius: options.radius,
    effects: options.shadow ? [{ ...INTEGRATED_SERVICE_DESIGN_TOKENS.shadows[options.shadow] }] : [],
  };
}

function applyTemplateTextStyle(
  node: Node,
  styleKey: IntegratedServiceTextStyleKey,
  color?: string | null,
  options?: { align?: "left" | "center" | "right" },
) {
  if (!node.text) return;
  const style = INTEGRATED_SERVICE_DESIGN_TOKENS.typography[styleKey];
  node.text.style = {
    ...node.text.style,
    fontFamily: INTEGRATED_SERVICE_DESIGN_TOKENS.fonts.sans,
    fontSize: style.size,
    fontWeight: style.weight,
    lineHeight: Math.round(style.size * 1.45),
    letterSpacing: style.size >= 24 ? -0.4 : style.size >= 18 ? -0.2 : 0,
    align: options?.align ?? node.text.style.align,
  };
  const nextColor = color ?? getSolidFillColor(node) ?? INTEGRATED_SERVICE_DESIGN_TOKENS.colors.textStrong;
  node.style = {
    ...node.style,
    fills: [{ type: "solid", color: nextColor }],
  };
}

function normalizeIntegratedServiceNodeDesign(doc: Doc) {
  const defaultPanels = new Set([
    "Info Panel",
    "Bullet List Panel",
    "Feature Grid Panel",
    "Todo Form Panel",
    "Note Form Panel",
    "Kanban Form Panel",
    "Reservation Form Panel",
    "Reservation Status Panel",
    "Ticket Create Panel",
    "Ticket Reply Panel",
    "CRM Lead Move Panel",
    "Approval Decision Panel",
    "Operations Release Panel",
    "Policy Evaluation Panel",
    "Billing Settlement Panel",
  ]);
  const brandPanels = new Set(["Credentials Panel", "Runtime Value Panel", "Navigation Card"]);

  Object.values(doc.nodes).forEach((node) => {
    if (defaultPanels.has(node.name)) {
      setSolidStyle(node, {
        fill: INTEGRATED_SERVICE_DESIGN_TOKENS.colors.surface,
        stroke: { color: INTEGRATED_SERVICE_DESIGN_TOKENS.colors.border, width: 1 },
        radius: INTEGRATED_SERVICE_DESIGN_TOKENS.radius.panel,
        shadow: "panel",
      });
    } else if (brandPanels.has(node.name)) {
      setSolidStyle(node, {
        fill: INTEGRATED_SERVICE_DESIGN_TOKENS.colors.surface,
        stroke: { color: INTEGRATED_SERVICE_DESIGN_TOKENS.colors.borderBrand, width: 1 },
        radius: INTEGRATED_SERVICE_DESIGN_TOKENS.radius.panel,
        shadow: "brandPanel",
      });
    } else if (node.name === "Dark Feature Card") {
      setSolidStyle(node, {
        fill: INTEGRATED_SERVICE_DESIGN_TOKENS.colors.accentDark,
        stroke: null,
        radius: INTEGRATED_SERVICE_DESIGN_TOKENS.radius.panel,
        shadow: "darkPanel",
      });
    } else if (node.name.startsWith("Credential ")) {
      const isPrimary = node.name === "Credential 1";
      setSolidStyle(node, {
        fill: isPrimary ? INTEGRATED_SERVICE_DESIGN_TOKENS.colors.surfaceBrand : INTEGRATED_SERVICE_DESIGN_TOKENS.colors.surfaceMuted,
        stroke: { color: INTEGRATED_SERVICE_DESIGN_TOKENS.colors.border, width: 1 },
        radius: INTEGRATED_SERVICE_DESIGN_TOKENS.radius.item,
        shadow: null,
      });
    } else if (node.name === "Bullet List Row" || node.name === "Feature Metric Card" || node.name === "Runtime Value Row") {
      setSolidStyle(node, {
        fill: INTEGRATED_SERVICE_DESIGN_TOKENS.colors.surfaceMuted,
        stroke: { color: INTEGRATED_SERVICE_DESIGN_TOKENS.colors.border, width: 1 },
        radius: INTEGRATED_SERVICE_DESIGN_TOKENS.radius.item,
        shadow: null,
      });
    } else if (node.name === "Module Chip") {
      setSolidStyle(node, {
        fill: INTEGRATED_SERVICE_DESIGN_TOKENS.colors.surface,
        stroke: { color: INTEGRATED_SERVICE_DESIGN_TOKENS.colors.border, width: 1 },
        radius: INTEGRATED_SERVICE_DESIGN_TOKENS.radius.pill,
        shadow: "stat",
      });
    } else if (node.name === "Action Button") {
      node.style = {
        ...node.style,
        radius: INTEGRATED_SERVICE_DESIGN_TOKENS.radius.pill,
        effects: [{ ...INTEGRATED_SERVICE_DESIGN_TOKENS.shadows.button }],
      };
    } else if (node.name === "Navigation Action" || node.name === "Section Label") {
      setSolidStyle(node, {
        fill: INTEGRATED_SERVICE_DESIGN_TOKENS.colors.surfaceBrandAlt,
        stroke: null,
        radius: INTEGRATED_SERVICE_DESIGN_TOKENS.radius.pill,
        shadow: null,
      });
    } else if (node.name === "Input" || node.name === "Textarea") {
      setSolidStyle(node, {
        fill: INTEGRATED_SERVICE_DESIGN_TOKENS.colors.surface,
        stroke: { color: INTEGRATED_SERVICE_DESIGN_TOKENS.colors.borderStrong, width: 1 },
        radius: INTEGRATED_SERVICE_DESIGN_TOKENS.radius.item,
        shadow: null,
      });
    } else if (node.name === "Page Tab") {
      const isActive = getSolidFillColor(node) !== INTEGRATED_SERVICE_DESIGN_TOKENS.colors.surface;
      setSolidStyle(node, {
        fill: isActive ? INTEGRATED_SERVICE_DESIGN_TOKENS.colors.textStrong : INTEGRATED_SERVICE_DESIGN_TOKENS.colors.surface,
        stroke: isActive ? null : { color: INTEGRATED_SERVICE_DESIGN_TOKENS.colors.borderStrong, width: 1 },
        radius: INTEGRATED_SERVICE_DESIGN_TOKENS.radius.pill,
        shadow: "stat",
      });
    }

    if (!node.text) return;
    if (node.name === "Badge Text") applyTemplateTextStyle(node, "heroBadge", INTEGRATED_SERVICE_DESIGN_TOKENS.colors.brand);
    else if (node.name === "Hero Title") applyTemplateTextStyle(node, "heroTitle", INTEGRATED_SERVICE_DESIGN_TOKENS.colors.textOnDark);
    else if (node.name === "Hero Body") applyTemplateTextStyle(node, "heroBody", INTEGRATED_SERVICE_DESIGN_TOKENS.colors.textOnDarkMuted);
    else if (node.name === "Stat Label") applyTemplateTextStyle(node, "statLabel", INTEGRATED_SERVICE_DESIGN_TOKENS.colors.textMuted);
    else if (node.name === "Stat Value") applyTemplateTextStyle(node, "statValue", INTEGRATED_SERVICE_DESIGN_TOKENS.colors.textStrong);
    else if (node.name === "Navigation Title") applyTemplateTextStyle(node, "navTitle", INTEGRATED_SERVICE_DESIGN_TOKENS.colors.textStrong);
    else if (node.name === "Navigation Body") applyTemplateTextStyle(node, "body", INTEGRATED_SERVICE_DESIGN_TOKENS.colors.textBody);
    else if (node.name === "Navigation Action Text") applyTemplateTextStyle(node, "sectionLabel", undefined);
    else if (node.name === "Action Button Text" || node.name === "Page Tab Text") applyTemplateTextStyle(node, "action", undefined, { align: "center" });
    else if (node.name === "Dark Feature Title") applyTemplateTextStyle(node, "panelTitle", INTEGRATED_SERVICE_DESIGN_TOKENS.colors.textOnDark);
    else if (node.name === "Dark Feature Body") applyTemplateTextStyle(node, "body", INTEGRATED_SERVICE_DESIGN_TOKENS.colors.textOnDarkMuted);
    else if (node.name === "Feature Metric Value") applyTemplateTextStyle(node, "metricValue", undefined);
    else if (node.name === "Feature Metric Label" || node.name === "Runtime Label" || node.name === "Input Label") applyTemplateTextStyle(node, "fieldLabel", INTEGRATED_SERVICE_DESIGN_TOKENS.colors.textMuted);
    else if (node.name === "Runtime Value" || node.name === "Credential Email") applyTemplateTextStyle(node, "bodyStrong", INTEGRATED_SERVICE_DESIGN_TOKENS.colors.textStrong);
    else if (node.name === "Credential Name") applyTemplateTextStyle(node, "itemTitle", INTEGRATED_SERVICE_DESIGN_TOKENS.colors.textStrong);
    else if (node.name === "Credential Role" || node.name === "Credential Password") applyTemplateTextStyle(node, "itemMeta", node.name === "Credential Password" ? INTEGRATED_SERVICE_DESIGN_TOKENS.colors.textBody : INTEGRATED_SERVICE_DESIGN_TOKENS.colors.textMuted);
    else if (node.name === "Credential Label" || node.name === "Section Label Text") applyTemplateTextStyle(node, "sectionLabel", undefined);
    else if (node.name === "Placeholder") applyTemplateTextStyle(node, "body", INTEGRATED_SERVICE_DESIGN_TOKENS.colors.textSubtle);
    else if (node.name.endsWith("Subtitle") || node.name.endsWith("Body")) applyTemplateTextStyle(node, "panelBody", INTEGRATED_SERVICE_DESIGN_TOKENS.colors.textMuted);
    else if (node.name.endsWith("Title")) applyTemplateTextStyle(node, "panelTitle", INTEGRATED_SERVICE_DESIGN_TOKENS.colors.textStrong);
    else if (node.name.endsWith("Label")) applyTemplateTextStyle(node, "fieldLabel", INTEGRATED_SERVICE_DESIGN_TOKENS.colors.textMuted);
    else if (node.name.endsWith("Meta")) applyTemplateTextStyle(node, "meta", INTEGRATED_SERVICE_DESIGN_TOKENS.colors.textMuted);
    else if (node.name.endsWith("State") || node.name.endsWith("Status")) applyTemplateTextStyle(node, "status", undefined);
  });
}

function addTrackedNode(doc: Doc, node: Node, parentId: string, created: string[]) {
  addNode(doc, node, parentId);
  created.push(node.id);
  return node.id;
}

function markNodesHidden(doc: Doc, nodeIds: string[], hidden: boolean) {
  nodeIds.forEach((nodeId) => {
    const node = doc.nodes[nodeId];
    if (node) node.hidden = hidden;
  });
}

function setBreakpointHidden(doc: Doc, nodeIds: string[], breakpointId: string, hidden: boolean) {
  nodeIds.forEach((nodeId) => {
    const node = doc.nodes[nodeId];
    if (!node) return;
    node.breakpointOverrides = {
      ...(node.breakpointOverrides ?? {}),
      [breakpointId]: {
        ...(node.breakpointOverrides?.[breakpointId] ?? {}),
        hidden,
      },
    };
  });
}

function setBreakpointFrame(doc: Doc, nodeId: string, breakpointId: string, frame: Partial<Frame>) {
  const node = doc.nodes[nodeId];
  if (!node) return;
  node.breakpointOverrides = {
    ...(node.breakpointOverrides ?? {}),
    [breakpointId]: {
      ...(node.breakpointOverrides?.[breakpointId] ?? {}),
      frame: {
        ...(node.breakpointOverrides?.[breakpointId]?.frame ?? {}),
        ...frame,
      },
    },
  };
}

function setPageBreakpoints(doc: Doc, pageId: string, breakpoints: PageBreakpoint[]) {
  const page = doc.pages.find((entry) => entry.id === pageId);
  if (!page) return;
  page.breakpoints = breakpoints.map((breakpoint) => ({ ...breakpoint }));
}

function setPageFrame(node: Node, frame: Frame, name: string) {
  node.name = name;
  node.frame = { ...node.frame, ...frame };
  node.style = {
    ...node.style,
    fills: [{ type: "solid", color: INTEGRATED_SERVICE_DESIGN_TOKENS.colors.canvas }],
    strokes: [],
  };
  node.clipContent = false;
}

function createAdditionalPage(doc: Doc, name: string, x: number) {
  const id = `page_${doc.pages.length}`;
  const rootNode = createNode("frame", {
    id,
    name,
    parentId: doc.root,
    frame: { x, y: 0, w: PAGE_SIZE.w, h: PAGE_SIZE.h, rotation: 0 },
  });
  setPageFrame(rootNode, rootNode.frame, name);
  doc.nodes[id] = rootNode;
  doc.nodes[doc.root]!.children = [...doc.nodes[doc.root]!.children, id];
  doc.pages.push({ id, name, rootId: id });
  return rootNode;
}

function appendBuiltNodes(doc: Doc, parentId: string, nodes: Record<string, Node>, rootId: string) {
  const root = nodes[rootId];
  if (!root) return;
  addNode(doc, root, parentId);
  for (const [id, node] of Object.entries(nodes)) {
    if (id === rootId) continue;
    doc.nodes[id] = node;
  }
}

function addPreset(doc: Doc, pageRootId: string, presetId: string, origin: { x: number; y: number }) {
  const preset = PRESET_MAP.get(presetId);
  if (!preset) return null;
  const built = preset.build(origin);
  appendBuiltNodes(doc, pageRootId, built.nodes, built.rootId);
  return built.rootId;
}

function addScaledPreset(
  doc: Doc,
  pageRootId: string,
  presetId: string,
  origin: { x: number; y: number },
  scale: number,
) {
  const preset = PRESET_MAP.get(presetId);
  if (!preset) return null;
  const built = preset.build(origin);
  const rootNode = built.nodes[built.rootId];
  const rootOrigin = rootNode
    ? { x: rootNode.frame.x, y: rootNode.frame.y }
    : origin;
  for (const [nodeId, node] of Object.entries(built.nodes)) {
    const isRoot = nodeId === built.rootId;
    const relativeX = node.frame.x - rootOrigin.x;
    const relativeY = node.frame.y - rootOrigin.y;
    node.frame = {
      x: isRoot ? origin.x : origin.x + Math.round(relativeX * scale),
      y: isRoot ? origin.y : origin.y + Math.round(relativeY * scale),
      w: Math.round(node.frame.w * scale),
      h: Math.round(node.frame.h * scale),
      rotation: node.frame.rotation,
    };
    if (typeof node.style.radius === "number") {
      node.style.radius = Math.max(8, Math.round(node.style.radius * scale));
    }
    node.style.strokes = node.style.strokes.map((stroke) => ({
      ...stroke,
      width: Math.max(1, Math.round((stroke.width ?? 1) * scale * 100) / 100),
    }));
    node.style.effects = node.style.effects.map((effect) =>
      effect.type === "shadow"
        ? {
            ...effect,
            x: Math.round(effect.x * scale),
            y: Math.round(effect.y * scale),
            blur: Math.max(6, Math.round(effect.blur * scale)),
          }
        : effect,
    );
    if (node.text) {
      node.text.style = {
        ...node.text.style,
        fontFamily: INTEGRATED_SERVICE_DESIGN_TOKENS.fonts.sans,
        fontSize: Math.max(11, Math.round(node.text.style.fontSize * scale * 100) / 100),
        lineHeight: Math.max(14, Math.round(node.text.style.lineHeight * scale)),
        letterSpacing: node.text.style.letterSpacing * Math.max(scale, 0.8),
      };
    }
  }
  appendBuiltNodes(doc, pageRootId, built.nodes, built.rootId);
  return built.rootId;
}

function addHero(doc: Doc, pageRootId: string, title: string, body: string, originYOrFrame: number | Frame = 40) {
  const created: string[] = [];
  const frame =
    typeof originYOrFrame === "number"
      ? { x: 40, y: originYOrFrame, w: 1600, h: 240, rotation: 0 }
      : originYOrFrame;
  const hero = makeFrameNode("Hero", frame, {
    fill: INTEGRATED_SERVICE_DESIGN_TOKENS.colors.textStrong,
    stroke: null,
    radius: INTEGRATED_SERVICE_DESIGN_TOKENS.radius.hero,
  });
  hero.style.fills = [
    {
      type: "linear",
      from: INTEGRATED_SERVICE_DESIGN_TOKENS.colors.textStrong,
      to: INTEGRATED_SERVICE_DESIGN_TOKENS.colors.brand,
      angle: 24,
    },
  ];
  hero.style.effects = [{ type: "shadow", x: 0, y: 20, blur: 46, color: INTEGRATED_SERVICE_DESIGN_TOKENS.colors.textStrong, opacity: 0.16 }];
  addTrackedNode(doc, hero, pageRootId, created);

  const badge = makeFrameNode("Badge", { x: frame.x + 40, y: frame.y + 34, w: 258, h: 36, rotation: 0 }, {
    fill: INTEGRATED_SERVICE_DESIGN_TOKENS.colors.borderBrand,
    stroke: null,
    radius: INTEGRATED_SERVICE_DESIGN_TOKENS.radius.pill,
  });
  addTrackedNode(doc, badge, pageRootId, created);
  addTrackedNode(
    doc,
    makeTemplateTextNode(
      "Badge Text",
      "NULL 실서비스 검증",
      { x: 22, y: 9, w: Math.min(220, frame.w - 120), h: 18, rotation: 0 },
      "heroBadge",
      INTEGRATED_SERVICE_DESIGN_TOKENS.colors.brand,
    ),
    badge.id,
    created,
  );

  addTrackedNode(
    doc,
    makeTemplateTextNode(
      "Hero Title",
      title,
      { x: frame.x + 40, y: frame.y + 88, w: frame.w - 80, h: 70, rotation: 0 },
      "heroTitle",
      INTEGRATED_SERVICE_DESIGN_TOKENS.colors.textOnDark,
    ),
    pageRootId,
    created,
  );
  addTrackedNode(
    doc,
    makeTemplateTextNode(
      "Hero Body",
      body,
      { x: frame.x + 40, y: frame.y + 164, w: frame.w - 80, h: 48, rotation: 0 },
      "heroBody",
      "#E2E8F0",
    ),
    pageRootId,
    created,
  );

  return created;
}

function addStats(
  doc: Doc,
  pageRootId: string,
  cards: Array<{ label: string; value: string; x: number; y?: number; w?: number; h?: number }>,
  originY = 310,
) {
  const created: string[] = [];
  for (const card of cards) {
    const y = card.y ?? originY;
    const width = card.w ?? 240;
    const height = card.h ?? 108;
    const node = makeSurfaceFrame("Stat", { x: card.x, y, w: width, h: height, rotation: 0 }, { shadow: "stat" });
    addTrackedNode(doc, node, pageRootId, created);
    addTrackedNode(
      doc,
      makeTemplateTextNode("Stat Label", card.label, { x: card.x + 24, y: y + 24, w: width - 48, h: 18, rotation: 0 }, "statLabel", INTEGRATED_SERVICE_DESIGN_TOKENS.colors.textMuted),
      pageRootId,
      created,
    );
    addTrackedNode(
      doc,
      makeTemplateTextNode("Stat Value", card.value, { x: card.x + 24, y: y + 52, w: width - 48, h: 30, rotation: 0 }, "statValue", INTEGRATED_SERVICE_DESIGN_TOKENS.colors.textStrong),
      pageRootId,
      created,
    );
  }
  return created;
}

function addSectionLabel(doc: Doc, pageRootId: string, label: string, x: number, y: number) {
  const created: string[] = [];
  const chipWidth = Math.max(190, label.length * 14);
  const chip = makeFrameNode("Section Label", { x, y, w: chipWidth, h: 34, rotation: 0 }, {
    fill: INTEGRATED_SERVICE_DESIGN_TOKENS.colors.surfaceBrandAlt,
    stroke: null,
    radius: INTEGRATED_SERVICE_DESIGN_TOKENS.radius.pill,
  });
  addTrackedNode(doc, chip, pageRootId, created);
  addTrackedNode(
    doc,
    makeTemplateTextNode("Section Label Text", label, { x: x + 18, y: y + 8, w: chipWidth - 32, h: 18, rotation: 0 }, "sectionLabel", INTEGRATED_SERVICE_DESIGN_TOKENS.colors.brandStrong),
    pageRootId,
    created,
  );
  return created;
}

function addInfoPanel(doc: Doc, pageRootId: string, title: string, bullets: string[], frame: Frame) {
  const created: string[] = [];
  const panel = makeSurfaceFrame("Info Panel", frame);
  addTrackedNode(doc, panel, pageRootId, created);
  addTrackedNode(doc, makeTemplateTextNode("Info Title", title, { x: frame.x + 24, y: frame.y + 22, w: frame.w - 48, h: 24, rotation: 0 }, "panelTitle", INTEGRATED_SERVICE_DESIGN_TOKENS.colors.textStrong), pageRootId, created);
  bullets.forEach((bullet, index) => {
    addTrackedNode(doc, makeRectNode("Bullet Dot", { x: frame.x + 26, y: frame.y + 65 + index * 30, w: 8, h: 8, rotation: 0 }, { fill: INTEGRATED_SERVICE_DESIGN_TOKENS.colors.brand, radius: INTEGRATED_SERVICE_DESIGN_TOKENS.radius.pill }), pageRootId, created);
    addTrackedNode(
      doc,
      makeTemplateTextNode("Info Bullet", bullet, { x: frame.x + 44, y: frame.y + 56 + index * 30, w: frame.w - 72, h: 22, rotation: 0 }, "body", INTEGRATED_SERVICE_DESIGN_TOKENS.colors.textBody),
      pageRootId,
      created,
    );
  });
  return created;
}

function addCredentialPanel(doc: Doc, pageRootId: string, credentials: IntegratedServiceCredential[], frame: Frame) {
  const created: string[] = [];
  const isNarrow = frame.w <= 420;
  const cardHeight = isNarrow ? 148 : 100;
  const panel = makeSurfaceFrame("Credentials Panel", frame, { variant: "brand" });
  addTrackedNode(doc, panel, pageRootId, created);
  addTrackedNode(doc, makeTextNode("Credentials Title", "데모 계정", { x: frame.x + 24, y: frame.y + 22, w: frame.w - 48, h: 26, rotation: 0 }, { color: "#0F172A", size: 18, weight: 800 }), pageRootId, created);
  addTrackedNode(
    doc,
    makeTextNode(
      "Credentials Subtitle",
      "로그인 프리셋과 프로필/알림/예약 흐름을 검증할 수 있는 계정입니다.",
      { x: frame.x + 24, y: frame.y + 52, w: frame.w - 48, h: 38, rotation: 0 },
      { color: "#64748B", size: 12, weight: 500 },
    ),
    pageRootId,
    created,
  );

  credentials.forEach((credential, index) => {
    const cardY = frame.y + 104 + index * (cardHeight + 16);
    const card = makeFrameNode(
      `Credential ${index + 1}`,
      { x: frame.x + 20, y: cardY, w: frame.w - 40, h: cardHeight, rotation: 0 },
      { fill: index === 0 ? "#EFF6FF" : "#F8FAFC", stroke: { color: "#E2E8F0", width: 1 }, radius: 18 },
    );
    addTrackedNode(doc, card, pageRootId, created);
    addTrackedNode(doc, makeTextNode("Credential Label", credential.label, { x: frame.x + 40, y: cardY + 18, w: isNarrow ? frame.w - 80 : 180, h: 18, rotation: 0 }, { color: "#1D4ED8", size: 12, weight: 800 }), pageRootId, created);
    addTrackedNode(doc, makeTextNode("Credential Name", credential.displayName, { x: frame.x + 40, y: cardY + 42, w: frame.w - 80, h: 20, rotation: 0 }, { color: "#0F172A", size: 16, weight: 700 }), pageRootId, created);
    addTrackedNode(doc, makeTextNode("Credential Role", `역할: ${credential.role}`, { x: frame.x + 40, y: cardY + 66, w: frame.w - 80, h: 18, rotation: 0 }, { color: "#64748B", size: 12, weight: 600 }), pageRootId, created);
    if (isNarrow) {
      addTrackedNode(doc, makeTextNode("Credential Email", credential.email, { x: frame.x + 40, y: cardY + 92, w: frame.w - 80, h: 18, rotation: 0 }, { color: "#0F172A", size: 13, weight: 600 }), pageRootId, created);
      addTrackedNode(doc, makeTextNode("Credential Password", `비밀번호: ${credential.password}`, { x: frame.x + 40, y: cardY + 116, w: frame.w - 80, h: 18, rotation: 0 }, { color: "#475569", size: 12, weight: 600 }), pageRootId, created);
    } else {
      addTrackedNode(doc, makeTextNode("Credential Email", credential.email, { x: frame.x + 280, y: cardY + 34, w: frame.w - 320, h: 18, rotation: 0 }, { color: "#0F172A", size: 13, weight: 600 }), pageRootId, created);
      addTrackedNode(doc, makeTextNode("Credential Password", `비밀번호: ${credential.password}`, { x: frame.x + 280, y: cardY + 60, w: frame.w - 320, h: 18, rotation: 0 }, { color: "#475569", size: 12, weight: 600 }), pageRootId, created);
    }
  });

  return created;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function addModuleStrip(doc: Doc, pageRootId: string, x: number, y: number, modules: string[]) {
  modules.forEach((moduleName, index) => {
    const rowY = y + index * 42;
    const chip = makeFrameNode("Module Chip", { x, y: rowY, w: 220, h: 34, rotation: 0 }, { fill: "#FFFFFF", stroke: { color: "#E2E8F0", width: 1 }, radius: 999 });
    chip.style.effects = [{ type: "shadow", x: 0, y: 6, blur: 18, color: "#0F172A", opacity: 0.04 }];
    addNode(doc, chip, pageRootId);
    addNode(doc, makeTextNode("Module Name", moduleName, { x: x + 18, y: rowY + 8, w: 186, h: 18, rotation: 0 }, { color: "#0F172A", size: 12, weight: 700 }), pageRootId);
  });
}

function addBulletListPanel(
  doc: Doc,
  pageRootId: string,
  title: string,
  items: Array<{ title: string; meta?: string }>,
  frame: Frame,
  options?: { accent?: string; subtitle?: string },
) {
  const created: string[] = [];
  const accent = options?.accent ?? "#2563EB";
  const isNarrow = frame.w <= 420;
  const rowHeight = isNarrow ? 76 : 54;
  const rowStep = isNarrow ? 88 : 66;
  const panel = makeFrameNode("Bullet List Panel", frame, {
    fill: "#FFFFFF",
    stroke: { color: "#E2E8F0", width: 1 },
    radius: 22,
  });
  panel.style.effects = [{ type: "shadow", x: 0, y: 10, blur: 28, color: "#0F172A", opacity: 0.06 }];
  addTrackedNode(doc, panel, pageRootId, created);
  addTrackedNode(
    doc,
    makeTextNode(
      "Panel Title",
      title,
      { x: frame.x + 24, y: frame.y + 22, w: frame.w - 48, h: 24, rotation: 0 },
      { color: "#0F172A", size: 18, weight: 800 },
    ),
    pageRootId,
    created,
  );
  if (options?.subtitle) {
    addTrackedNode(
      doc,
      makeTextNode(
        "Panel Subtitle",
        options.subtitle,
        { x: frame.x + 24, y: frame.y + 52, w: frame.w - 48, h: 36, rotation: 0 },
        { color: "#64748B", size: 12, weight: 500 },
      ),
      pageRootId,
      created,
    );
  }
  items.forEach((item, index) => {
    const rowY = frame.y + (options?.subtitle ? 100 : 72) + index * rowStep;
    const row = makeFrameNode(
      "Bullet List Row",
      { x: frame.x + 18, y: rowY, w: frame.w - 36, h: rowHeight, rotation: 0 },
      { fill: "#F8FAFC", stroke: { color: "#E2E8F0", width: 1 }, radius: 16 },
    );
    addTrackedNode(doc, row, pageRootId, created);
    addTrackedNode(
      doc,
      makeRectNode("Bullet Accent", { x: frame.x + 34, y: rowY + 20, w: 10, h: 10, rotation: 0 }, { fill: accent, radius: 999 }),
      pageRootId,
      created,
    );
    addTrackedNode(
      doc,
      makeTextNode(
        "Bullet Title",
        item.title,
        { x: frame.x + 56, y: rowY + 14, w: frame.w - 92, h: isNarrow ? 34 : 20, rotation: 0 },
        { color: "#0F172A", size: 14, weight: 700 },
      ),
      pageRootId,
      created,
    );
    if (item.meta) {
      addTrackedNode(
        doc,
        makeTextNode(
          "Bullet Meta",
          item.meta,
          { x: frame.x + 56, y: rowY + (isNarrow ? 46 : 34), w: frame.w - 92, h: isNarrow ? 24 : 16, rotation: 0 },
          { color: "#64748B", size: 11, weight: 500 },
        ),
        pageRootId,
        created,
      );
    }
  });

  return created;
}

function addFeatureGridPanel(
  doc: Doc,
  pageRootId: string,
  title: string,
  cards: Array<{ label: string; value: string; accent?: string }>,
  frame: Frame,
) {
  const created: string[] = [];
  const isNarrow = frame.w <= 420;
  const panel = makeFrameNode("Feature Grid Panel", frame, {
    fill: "#FFFFFF",
    stroke: { color: "#E2E8F0", width: 1 },
    radius: 22,
  });
  panel.style.effects = [{ type: "shadow", x: 0, y: 10, blur: 28, color: "#0F172A", opacity: 0.06 }];
  addTrackedNode(doc, panel, pageRootId, created);
  addTrackedNode(
    doc,
    makeTextNode(
      "Feature Grid Title",
      title,
      { x: frame.x + 24, y: frame.y + 22, w: frame.w - 48, h: 24, rotation: 0 },
      { color: "#0F172A", size: 18, weight: 800 },
    ),
    pageRootId,
    created,
  );
  cards.forEach((card, index) => {
    const colCount = isNarrow ? 1 : 2;
    const col = isNarrow ? 0 : index % colCount;
    const row = isNarrow ? index : Math.floor(index / colCount);
    const cardW = isNarrow ? frame.w - 48 : (frame.w - 72) / 2;
    const cardX = isNarrow ? frame.x + 24 : frame.x + 24 + col * (cardW + 12);
    const cardY = frame.y + 68 + row * 96;
    const node = makeFrameNode(
      "Feature Metric Card",
      { x: cardX, y: cardY, w: cardW, h: 82, rotation: 0 },
      { fill: "#F8FAFC", stroke: { color: "#E2E8F0", width: 1 }, radius: 18 },
    );
    addTrackedNode(doc, node, pageRootId, created);
    addTrackedNode(
      doc,
      makeTextNode(
        "Feature Metric Label",
        card.label,
        { x: cardX + 18, y: cardY + 18, w: cardW - 36, h: 16, rotation: 0 },
        { color: "#64748B", size: 11, weight: 700 },
      ),
      pageRootId,
      created,
    );
    addTrackedNode(
      doc,
      makeTextNode(
        "Feature Metric Value",
        card.value,
        { x: cardX + 18, y: cardY + 42, w: cardW - 36, h: 22, rotation: 0 },
        { color: card.accent ?? "#0F172A", size: 18, weight: 800 },
      ),
      pageRootId,
      created,
    );
  });

  return created;
}

function addNavigationCard(
  doc: Doc,
  pageRootId: string,
  title: string,
  body: string,
  targetPageId: string,
  frame: Frame,
  accent = "#1D4ED8",
  transitionType: PrototypeTransitionType = "smart",
) {
  const created: string[] = [];
  const card = makeFrameNode("Navigation Card", frame, {
    fill: "#FFFFFF",
    stroke: { color: "#DBEAFE", width: 1 },
    radius: 24,
  });
  card.style.effects = [{ type: "shadow", x: 0, y: 12, blur: 28, color: "#1D4ED8", opacity: 0.08 }];
  card.prototype = {
    interactions: [
      {
        id: `nav_${targetPageId}_${frame.x}_${frame.y}`,
        trigger: "click",
        action: { type: "navigate", targetPageId, transition: { type: transitionType, duration: 280, easing: "ease-out" } },
      },
    ],
  };
  addTrackedNode(doc, card, pageRootId, created);
  addTrackedNode(
    doc,
    makeRectNode("Navigation Accent", { x: 22, y: 24, w: 42, h: 42, rotation: 0 }, { fill: accent, radius: 999 }),
    card.id,
    created,
  );
  addTrackedNode(
    doc,
    makeTextNode("Navigation Title", title, { x: 80, y: 28, w: frame.w - 120, h: 28, rotation: 0 }, { color: "#0F172A", size: 20, weight: 800 }),
    card.id,
    created,
  );
  addTrackedNode(
    doc,
    makeTextNode("Navigation Body", body, { x: 80, y: 66, w: frame.w - 120, h: 48, rotation: 0 }, { color: "#475569", size: 13, weight: 500 }),
    card.id,
    created,
  );
  const actionChip = makeFrameNode("Navigation Action", { x: 80, y: frame.h - 54, w: 168, h: 32, rotation: 0 }, { fill: "#EEF2FF", stroke: null, radius: 999 });
  addTrackedNode(doc, actionChip, card.id, created);
  addTrackedNode(
    doc,
    makeTextNode("Navigation Action Text", "페이지 열기", { x: 22, y: 9, w: 120, h: 16, rotation: 0 }, { color: accent, size: 12, weight: 800 }),
    actionChip.id,
    created,
  );

  return created;
}

function addActionButton(
  doc: Doc,
  pageRootId: string,
  label: string,
  frame: Frame,
  action: PrototypeAction,
  options?: { fill?: string; stroke?: { color: string; width: number } | null; textColor?: string },
) {
  const created: string[] = [];
  const fill = options?.fill ?? "#FFFFFF";
  const stroke = options?.stroke ?? { color: "#BFDBFE", width: 1 };
  const textColor = options?.textColor ?? "#1D4ED8";
  const button = makeFrameNode("Action Button", frame, { fill, stroke, radius: 999 });
  button.style.effects = [{ type: "shadow", x: 0, y: 10, blur: 24, color: "#0F172A", opacity: 0.08 }];
  button.prototype = {
    interactions: [
      {
        id: `action_${pageRootId}_${frame.x}_${frame.y}_${label}`,
        trigger: "click",
        action,
      },
    ],
  };
  addTrackedNode(doc, button, pageRootId, created);
  addTrackedNode(
    doc,
    makeTextNode(
      "Action Button Text",
      label,
      { x: 24, y: 13, w: frame.w - 48, h: 18, rotation: 0 },
      { color: textColor, size: 13, weight: 800, align: "center" },
    ),
    button.id,
    created,
  );
  return created;
}

function addServiceInputField(
  doc: Doc,
  pageRootId: string,
  frame: Frame,
  options: {
    label: string;
    fieldKey: string;
    placeholder: string;
    valueType?: "string" | "email" | "password" | "message" | "id";
    required?: boolean;
    textarea?: boolean;
  },
) {
  const created: string[] = [];
  const placeholderY = frame.y + 38;
  const placeholderHeight = options.textarea ? Math.max(24, frame.h - 56) : 18;
  const input = makeFrameNode(options.textarea ? "Textarea" : "Input", frame, {
    fill: "#FFFFFF",
    stroke: { color: "#CBD5E1", width: 1 },
    radius: 18,
  });
  input.service = {
    field: {
      key: options.fieldKey,
      valueType: options.valueType,
      required: options.required,
    },
  };
  addTrackedNode(doc, input, pageRootId, created);
  addTrackedNode(
    doc,
    makeTextNode(
      "Input Label",
      options.label,
      { x: frame.x + 20, y: frame.y + 14, w: frame.w - 40, h: 16, rotation: 0 },
      { color: "#64748B", size: 11, weight: 700 },
    ),
    pageRootId,
    created,
  );
  addTrackedNode(
    doc,
    makeTextNode(
      "Placeholder",
      fieldPlaceholder(options.fieldKey, options.placeholder),
      { x: frame.x + 20, y: placeholderY, w: frame.w - 40, h: placeholderHeight, rotation: 0 },
      { color: "#94A3B8", size: 13, weight: 500 },
    ),
    pageRootId,
    created,
  );
  return { rootId: input.id, created };
}

function addTodoPanel(doc: Doc, pageRootId: string, frame: Frame) {
  const created: string[] = [];
  const isNarrow = frame.w <= 420;
  const inputFrame = isNarrow
    ? { x: frame.x + 24, y: frame.y + 106, w: frame.w - 48, h: 72, rotation: 0 }
    : { x: frame.x + 24, y: frame.y + 106, w: frame.w - 208, h: 72, rotation: 0 };
  const buttonFrame = isNarrow
    ? { x: frame.x + 24, y: frame.y + 194, w: frame.w - 48, h: 44, rotation: 0 }
    : { x: frame.x + frame.w - 168, y: frame.y + 120, w: 144, h: 44, rotation: 0 };
  const itemsY = isNarrow ? frame.y + 260 : frame.y + 212;
  const metaY = isNarrow ? frame.y + 374 : frame.y + 320;
  const panel = makeFrameNode("Todo Form Panel", frame, {
    fill: "#FFFFFF",
    stroke: { color: "#E2E8F0", width: 1 },
    radius: 24,
  });
  panel.style.effects = [{ type: "shadow", x: 0, y: 14, blur: 30, color: "#0F172A", opacity: 0.08 }];
  panel.service = { dataSource: { source: "todo.list", limit: 8 } };
  addTrackedNode(doc, panel, pageRootId, created);
  addTrackedNode(doc, makeTextNode("Todo Title", "개인 할 일", { x: frame.x + 24, y: frame.y + 24, w: frame.w - 48, h: 24, rotation: 0 }, { color: "#0F172A", size: 18, weight: 800 }), pageRootId, created);
  addTrackedNode(doc, makeTextNode("Todo Body", "할 일을 추가하고 같은 배포 화면에서 목록이 즉시 갱신되는지 확인합니다.", { x: frame.x + 24, y: frame.y + 58, w: frame.w - 48, h: 36, rotation: 0 }, { color: "#64748B", size: 12, weight: 500 }), pageRootId, created);
  const input = addServiceInputField(doc, pageRootId, inputFrame, {
    label: "할 일 제목",
    fieldKey: "title",
    placeholder: "새 할 일 제목",
    valueType: "string",
    required: true,
  });
  created.push(...input.created);
  const action = addActionButton(
    doc,
    pageRootId,
    "할 일 추가",
    buttonFrame,
    {
      type: "service",
      action: "todo.create",
      dataSource: { source: "todo.list", limit: 8 },
      bindings: [{ target: "title", source: "field", fieldKey: "title", required: true }],
    },
    { fill: "#1D4ED8", stroke: null, textColor: "#FFFFFF" },
  );
  created.push(...action);
  addTrackedNode(doc, makeTextNode("Todo Items", "{{ todo_items }}", { x: frame.x + 24, y: itemsY, w: frame.w - 48, h: 100, rotation: 0 }, { color: "#0F172A", size: 14, weight: 700 }), pageRootId, created);
  addTrackedNode(doc, makeTextNode("Todo Meta", "{{ todo_meta }}", { x: frame.x + 24, y: metaY, w: frame.w - 48, h: 52, rotation: 0 }, { color: "#64748B", size: 12, weight: 500 }), pageRootId, created);
  return created;
}

function addNotePanel(doc: Doc, pageRootId: string, frame: Frame) {
  const created: string[] = [];
  const isNarrow = frame.w <= 420;
  const actionFrame = isNarrow
    ? { x: frame.x + 24, y: frame.y + 274, w: frame.w - 48, h: 44, rotation: 0 }
    : { x: frame.x + frame.w - 168, y: frame.y + 274, w: 144, h: 44, rotation: 0 };
  const valueY = isNarrow ? frame.y + 336 : frame.y + 336;
  const panel = makeFrameNode("Note Form Panel", frame, {
    fill: "#FFFFFF",
    stroke: { color: "#E2E8F0", width: 1 },
    radius: 24,
  });
  panel.style.effects = [{ type: "shadow", x: 0, y: 14, blur: 30, color: "#0F172A", opacity: 0.08 }];
  panel.service = { dataSource: { source: "note.current" } };
  addTrackedNode(doc, panel, pageRootId, created);
  addTrackedNode(doc, makeTextNode("Note Title", "개인 노트", { x: frame.x + 24, y: frame.y + 24, w: frame.w - 48, h: 24, rotation: 0 }, { color: "#0F172A", size: 18, weight: 800 }), pageRootId, created);
  addTrackedNode(doc, makeTextNode("Note Body", "현재 노트를 저장하고 배포된 화면에 최신 내용이 유지되는지 확인합니다.", { x: frame.x + 24, y: frame.y + 58, w: frame.w - 48, h: 36, rotation: 0 }, { color: "#64748B", size: 12, weight: 500 }), pageRootId, created);
  const input = addServiceInputField(doc, pageRootId, { x: frame.x + 24, y: frame.y + 106, w: frame.w - 48, h: 150, rotation: 0 }, {
    label: "노트 내용",
    fieldKey: "content",
    placeholder: "노트를 입력하세요",
    valueType: "message",
    required: true,
    textarea: true,
  });
  created.push(...input.created);
  const action = addActionButton(
    doc,
    pageRootId,
    "노트 저장",
    actionFrame,
    {
      type: "service",
      action: "note.save",
      dataSource: { source: "note.current" },
      bindings: [{ target: "content", source: "field", fieldKey: "content", required: true }],
    },
    { fill: "#7C3AED", stroke: null, textColor: "#FFFFFF" },
  );
  created.push(...action);
  addTrackedNode(doc, makeTextNode("Note Value", "{{ note_content }}", { x: frame.x + 24, y: valueY, w: frame.w - 48, h: 140, rotation: 0 }, { color: "#0F172A", size: 13, weight: 600 }), pageRootId, created);
  return created;
}

function addKanbanPanel(doc: Doc, pageRootId: string, frame: Frame) {
  const created: string[] = [];
  const isNarrow = frame.w <= 420;
  const inputFrame = isNarrow
    ? { x: frame.x + 24, y: frame.y + 106, w: frame.w - 48, h: 72, rotation: 0 }
    : { x: frame.x + 24, y: frame.y + 106, w: frame.w - 208, h: 72, rotation: 0 };
  const actionFrame = isNarrow
    ? { x: frame.x + 24, y: frame.y + 194, w: frame.w - 48, h: 44, rotation: 0 }
    : { x: frame.x + frame.w - 168, y: frame.y + 120, w: 144, h: 44, rotation: 0 };
  const columnsY = isNarrow ? frame.y + 260 : frame.y + 212;
  const cardsY = isNarrow ? frame.y + 332 : frame.y + 282;
  const panel = makeFrameNode("Kanban Form Panel", frame, {
    fill: "#FFFFFF",
    stroke: { color: "#E2E8F0", width: 1 },
    radius: 24,
  });
  panel.style.effects = [{ type: "shadow", x: 0, y: 14, blur: 30, color: "#0F172A", opacity: 0.08 }];
  panel.service = { dataSource: { source: "kanban.columns", limit: 8 } };
  addTrackedNode(doc, panel, pageRootId, created);
  addTrackedNode(doc, makeTextNode("Kanban Title", "칸반 보드", { x: frame.x + 24, y: frame.y + 24, w: frame.w - 48, h: 24, rotation: 0 }, { color: "#0F172A", size: 18, weight: 800 }), pageRootId, created);
  addTrackedNode(doc, makeTextNode("Kanban Body", "컬럼을 추가해도 시드 컬럼과 카드가 계속 보이는지 확인합니다.", { x: frame.x + 24, y: frame.y + 58, w: frame.w - 48, h: 36, rotation: 0 }, { color: "#64748B", size: 12, weight: 500 }), pageRootId, created);
  const input = addServiceInputField(doc, pageRootId, inputFrame, {
    label: "컬럼 제목",
    fieldKey: "title",
    placeholder: "새 칸반 컬럼",
    valueType: "string",
    required: true,
  });
  created.push(...input.created);
  const action = addActionButton(
    doc,
    pageRootId,
    "컬럼 추가",
    actionFrame,
    {
      type: "service",
      action: "kanban.column.create",
      dataSource: { source: "kanban.columns", limit: 8 },
      bindings: [{ target: "title", source: "field", fieldKey: "title", required: true }],
    },
    { fill: "#0F766E", stroke: null, textColor: "#FFFFFF" },
  );
  created.push(...action);
  addTrackedNode(doc, makeTextNode("Kanban Columns", "{{ kanban_columns }}", { x: frame.x + 24, y: columnsY, w: frame.w - 48, h: 60, rotation: 0 }, { color: "#0F172A", size: 13, weight: 700 }), pageRootId, created);
  addTrackedNode(doc, makeTextNode("Kanban Cards", "{{ kanban_cards }}", { x: frame.x + 24, y: cardsY, w: frame.w - 48, h: 140, rotation: 0 }, { color: "#475569", size: 12, weight: 500 }), pageRootId, created);
  return created;
}

function addReservationCreatePanel(doc: Doc, pageRootId: string, frame: Frame) {
  const created: string[] = [];
  const isNarrow = frame.w <= 420;
  const actionFrame = isNarrow
    ? { x: frame.x + 24, y: frame.y + 322, w: frame.w - 48, h: 44, rotation: 0 }
    : { x: frame.x + frame.w - 188, y: frame.y + 322, w: 164, h: 44, rotation: 0 };
  const listY = isNarrow ? frame.y + 390 : frame.y + 392;
  const statesY = isNarrow ? frame.y + 472 : frame.y + 462;
  const panel = makeFrameNode("Reservation Form Panel", frame, {
    fill: "#FFFFFF",
    stroke: { color: "#E2E8F0", width: 1 },
    radius: 24,
  });
  panel.style.effects = [{ type: "shadow", x: 0, y: 14, blur: 30, color: "#0F172A", opacity: 0.08 }];
  panel.service = { dataSource: { source: "reservations.list", limit: 8, orderBy: "created_at", orderDir: "desc" } };
  addTrackedNode(doc, panel, pageRootId, created);
  addTrackedNode(doc, makeTextNode("Reservation Title", "예약 운영 보드", { x: frame.x + 24, y: frame.y + 24, w: frame.w - 48, h: 24, rotation: 0 }, { color: "#0F172A", size: 18, weight: 800 }), pageRootId, created);
  addTrackedNode(doc, makeTextNode("Reservation Body", "새 예약을 만들고, 바로 아래 상태 패널에서 현재 예약 상태가 바뀌는지 확인합니다.", { x: frame.x + 24, y: frame.y + 58, w: frame.w - 48, h: 36, rotation: 0 }, { color: "#64748B", size: 12, weight: 500 }), pageRootId, created);
  const titleInput = addServiceInputField(doc, pageRootId, { x: frame.x + 24, y: frame.y + 110, w: frame.w - 48, h: 72, rotation: 0 }, {
    label: "예약 제목",
    fieldKey: "reservation_title",
    placeholder: "새 예약 제목",
    valueType: "string",
    required: true,
  });
  created.push(...titleInput.created);
  const notesInput = addServiceInputField(doc, pageRootId, { x: frame.x + 24, y: frame.y + 194, w: frame.w - 48, h: 110, rotation: 0 }, {
    label: "예약 메모",
    fieldKey: "reservation_notes",
    placeholder: "예약 메모를 남기세요",
    valueType: "message",
    textarea: true,
  });
  created.push(...notesInput.created);
  created.push(
    ...addActionButton(
      doc,
      pageRootId,
      "예약 요청 생성",
      actionFrame,
      {
        type: "service",
        action: "reservation.create",
        dataSource: { source: "reservations.list", limit: 8, orderBy: "created_at", orderDir: "desc" },
        bindings: [
          { target: "title", source: "field", fieldKey: "reservation_title", required: true },
          { target: "notes", source: "field", fieldKey: "reservation_notes" },
          { target: "resourceId", source: "variable", variableId: "var_reservation_resource_id", required: true },
          { target: "customerKey", source: "variable", variableId: "var_reservation_customer_key", required: true },
          { target: "startsAt", source: "literal", value: "2026-04-10T10:00:00.000Z", required: true },
          { target: "endsAt", source: "literal", value: "2026-04-10T11:00:00.000Z", required: true },
        ],
      },
      { fill: "#7C3AED", stroke: null, textColor: "#FFFFFF" },
    ),
  );
  addTrackedNode(doc, makeTextNode("Reservation List", "{{ reservation_titles }}", { x: frame.x + 24, y: listY, w: frame.w - 48, h: 70, rotation: 0 }, { color: "#0F172A", size: 13, weight: 700 }), pageRootId, created);
  addTrackedNode(doc, makeTextNode("Reservation States", "{{ reservation_states }}", { x: frame.x + 24, y: statesY, w: frame.w - 48, h: 54, rotation: 0 }, { color: "#64748B", size: 12, weight: 500 }), pageRootId, created);
  return created;
}

function addReservationStatePanel(doc: Doc, pageRootId: string, frame: Frame) {
  const created: string[] = [];
  const isNarrow = frame.w <= 420;
  const buttonFrame = { x: frame.x + 24, y: frame.y + 212, w: isNarrow ? frame.w - 48 : 132, h: 42, rotation: 0 };
  const runtimeFrame = isNarrow
    ? { x: frame.x + 24, y: frame.y + 274, w: frame.w - 48, h: 180, rotation: 0 }
    : { x: frame.x + 184, y: frame.y + 112, w: frame.w - 208, h: 178, rotation: 0 };
  const panel = makeFrameNode("Reservation Status Panel", frame, {
    fill: "#FFFFFF",
    stroke: { color: "#E2E8F0", width: 1 },
    radius: 24,
  });
  panel.style.effects = [{ type: "shadow", x: 0, y: 14, blur: 30, color: "#0F172A", opacity: 0.08 }];
  panel.service = { dataSource: { source: "reservations.list", limit: 8, orderBy: "created_at", orderDir: "desc" } };
  addTrackedNode(doc, panel, pageRootId, created);
  addTrackedNode(doc, makeTextNode("Reservation State Title", "예약 상태 전이", { x: frame.x + 24, y: frame.y + 24, w: frame.w - 48, h: 24, rotation: 0 }, { color: "#0F172A", size: 18, weight: 800 }), pageRootId, created);
  addTrackedNode(doc, makeTextNode("Reservation State Body", "가장 최근 예약을 확정 상태로 넘기고 현재 상태 패널에서 변화가 바로 보이는지 확인합니다.", { x: frame.x + 24, y: frame.y + 58, w: frame.w - 48, h: 36, rotation: 0 }, { color: "#64748B", size: 12, weight: 500 }), pageRootId, created);
  addTrackedNode(doc, makeTextNode("Reservation Active Label", "현재 대상 예약", { x: frame.x + 24, y: frame.y + 112, w: 180, h: 16, rotation: 0 }, { color: "#64748B", size: 11, weight: 700 }), pageRootId, created);
  addTrackedNode(doc, makeTextNode("Reservation Active Title", "{{ reservation_active_title }}", { x: frame.x + 24, y: frame.y + 136, w: frame.w - 48, h: 22, rotation: 0 }, { color: "#0F172A", size: 16, weight: 700 }), pageRootId, created);
  addTrackedNode(doc, makeTextNode("Reservation Active State", "{{ reservation_active_state }}", { x: frame.x + 24, y: frame.y + 166, w: frame.w - 48, h: 18, rotation: 0 }, { color: "#7C3AED", size: 13, weight: 700 }), pageRootId, created);
  created.push(
    ...addActionButton(
      doc,
      pageRootId,
      "예약 확정",
      buttonFrame,
      {
        type: "service",
        action: "reservation.transition",
        dataSource: { source: "reservations.list", limit: 8, orderBy: "created_at", orderDir: "desc" },
        stateTransition: { machine: "reservation", to: "confirmed", recordIdField: "reservationId", statusField: "status" },
        bindings: [{ target: "reservationId", source: "variable", variableId: "var_reservation_active_id", required: true }],
      },
      { fill: "#EEF2FF", stroke: { color: "#C7D2FE", width: 1 }, textColor: "#4338CA" },
    ),
  );
  created.push(
    ...addRuntimeValuePanel(
      doc,
      pageRootId,
      "예약 상태 패널",
      "방금 생성하거나 확정한 예약이 이 패널에 바로 반영되어야 합니다.",
      runtimeFrame,
      [
        { label: "최근 예약", token: "reservation_active_title" },
        { label: "현재 상태", token: "reservation_active_state" },
      ],
    ),
  );
  return created;
}

function addTicketCreatePanel(doc: Doc, pageRootId: string, frame: Frame) {
  const created: string[] = [];
  const isNarrow = frame.w <= 420;
  const actionFrame = isNarrow
    ? { x: frame.x + 24, y: frame.y + 322, w: frame.w - 48, h: 44, rotation: 0 }
    : { x: frame.x + frame.w - 168, y: frame.y + 322, w: 144, h: 44, rotation: 0 };
  const panel = makeFrameNode("Ticket Create Panel", frame, {
    fill: "#FFFFFF",
    stroke: { color: "#E2E8F0", width: 1 },
    radius: 24,
  });
  panel.style.effects = [{ type: "shadow", x: 0, y: 14, blur: 30, color: "#0F172A", opacity: 0.08 }];
  panel.service = { dataSource: { source: "tickets.list", limit: 8, orderBy: "updated_at", orderDir: "desc" } };
  addTrackedNode(doc, panel, pageRootId, created);
  addTrackedNode(doc, makeTextNode("Ticket Create Title", "티켓 생성", { x: frame.x + 24, y: frame.y + 24, w: frame.w - 48, h: 24, rotation: 0 }, { color: "#0F172A", size: 18, weight: 800 }), pageRootId, created);
  addTrackedNode(doc, makeTextNode("Ticket Create Body", "파트너 포털에서 새 고객 지원 티켓을 만들고, 바로 아래 응답 패널에서 최근 티켓이 바뀌는지 확인합니다.", { x: frame.x + 24, y: frame.y + 58, w: frame.w - 48, h: 36, rotation: 0 }, { color: "#64748B", size: 12, weight: 500 }), pageRootId, created);
  const titleInput = addServiceInputField(doc, pageRootId, { x: frame.x + 24, y: frame.y + 110, w: frame.w - 48, h: 72, rotation: 0 }, {
    label: "티켓 제목",
    fieldKey: "ticket_title",
    placeholder: "새 지원 요청 제목",
    valueType: "string",
    required: true,
  });
  created.push(...titleInput.created);
  const bodyInput = addServiceInputField(doc, pageRootId, { x: frame.x + 24, y: frame.y + 194, w: frame.w - 48, h: 110, rotation: 0 }, {
    label: "요청 본문",
    fieldKey: "ticket_body",
    placeholder: "고객 지원 요청 내용을 적으세요",
    valueType: "message",
    required: true,
    textarea: true,
  });
  created.push(...bodyInput.created);
  created.push(
    ...addActionButton(
      doc,
      pageRootId,
      "티켓 생성",
      actionFrame,
      {
        type: "service",
        action: "ticket.create",
        dataSource: { source: "tickets.list", limit: 8, orderBy: "updated_at", orderDir: "desc" },
        bindings: [
          { target: "queueId", source: "variable", variableId: "var_ticket_queue_id", required: true },
          { target: "requesterKey", source: "variable", variableId: "var_ticket_requester_key", required: true },
          { target: "title", source: "field", fieldKey: "ticket_title", required: true },
          { target: "body", source: "field", fieldKey: "ticket_body", required: true },
          { target: "priority", source: "literal", value: "normal" },
        ],
      },
      { fill: "#2563EB", stroke: null, textColor: "#FFFFFF" },
    ),
  );
  addTrackedNode(doc, makeTextNode("Ticket Titles", "{{ ticket_titles }}", { x: frame.x + 24, y: frame.y + 392, w: frame.w - 48, h: 64, rotation: 0 }, { color: "#0F172A", size: 13, weight: 700 }), pageRootId, created);
  addTrackedNode(doc, makeTextNode("Ticket States", "{{ ticket_states }}", { x: frame.x + 24, y: frame.y + 462, w: frame.w - 48, h: 44, rotation: 0 }, { color: "#64748B", size: 12, weight: 500 }), pageRootId, created);
  return created;
}

function addTicketReplyPanel(doc: Doc, pageRootId: string, frame: Frame) {
  const created: string[] = [];
  const isNarrow = frame.w <= 420;
  const actionFrame = isNarrow
    ? { x: frame.x + 24, y: frame.y + 332, w: frame.w - 48, h: 44, rotation: 0 }
    : { x: frame.x + frame.w - 168, y: frame.y + 332, w: 144, h: 44, rotation: 0 };
  const runtimeFrame = { x: frame.x + 24, y: isNarrow ? frame.y + 398 : frame.y + 398, w: frame.w - 48, h: isNarrow ? 214 : 178, rotation: 0 };
  const panel = makeFrameNode("Ticket Reply Panel", frame, {
    fill: "#FFFFFF",
    stroke: { color: "#E2E8F0", width: 1 },
    radius: 24,
  });
  panel.style.effects = [{ type: "shadow", x: 0, y: 14, blur: 30, color: "#0F172A", opacity: 0.08 }];
  panel.service = { dataSource: { source: "tickets.list", limit: 8, orderBy: "updated_at", orderDir: "desc" } };
  addTrackedNode(doc, panel, pageRootId, created);
  addTrackedNode(doc, makeTextNode("Ticket Reply Title", "티켓 응답", { x: frame.x + 24, y: frame.y + 24, w: frame.w - 48, h: 24, rotation: 0 }, { color: "#0F172A", size: 18, weight: 800 }), pageRootId, created);
  addTrackedNode(doc, makeTextNode("Ticket Reply Body", "가장 최근 티켓에 응답을 남기고 메시지 패널이 즉시 갱신되는지 확인합니다.", { x: frame.x + 24, y: frame.y + 58, w: frame.w - 48, h: 36, rotation: 0 }, { color: "#64748B", size: 12, weight: 500 }), pageRootId, created);
  addTrackedNode(doc, makeTextNode("Ticket Active Label", "현재 응답 대상", { x: frame.x + 24, y: frame.y + 112, w: 180, h: 16, rotation: 0 }, { color: "#64748B", size: 11, weight: 700 }), pageRootId, created);
  addTrackedNode(doc, makeTextNode("Ticket Active Title", "{{ ticket_active_title }}", { x: frame.x + 24, y: frame.y + 136, w: frame.w - 48, h: 22, rotation: 0 }, { color: "#0F172A", size: 16, weight: 700 }), pageRootId, created);
  addTrackedNode(doc, makeTextNode("Ticket Active State", "{{ ticket_active_state }}", { x: frame.x + 24, y: frame.y + 166, w: frame.w - 48, h: 18, rotation: 0 }, { color: "#2563EB", size: 13, weight: 700 }), pageRootId, created);
  const replyInput = addServiceInputField(doc, pageRootId, { x: frame.x + 24, y: frame.y + 204, w: frame.w - 48, h: 110, rotation: 0 }, {
    label: "응답 본문",
    fieldKey: "ticket_reply_body",
    placeholder: "최신 티켓에 남길 응답",
    valueType: "message",
    required: true,
    textarea: true,
  });
  created.push(...replyInput.created);
  created.push(
    ...addActionButton(
      doc,
      pageRootId,
      "응답 등록",
      actionFrame,
      {
        type: "service",
        action: "ticket.reply",
        dataSource: { source: "tickets.list", limit: 8, orderBy: "updated_at", orderDir: "desc" },
        stateTransition: { machine: "ticket", to: "answered", recordIdField: "ticketId", statusField: "status" },
        bindings: [
          { target: "ticketId", source: "variable", variableId: "var_ticket_active_id", required: true },
          { target: "body", source: "field", fieldKey: "ticket_reply_body", required: true },
          { target: "authorKey", source: "variable", variableId: "var_ticket_author_key", required: true },
          { target: "visibility", source: "literal", value: "public" },
        ],
      },
      { fill: "#0F172A", stroke: null, textColor: "#FFFFFF" },
    ),
  );
  created.push(
    ...addRuntimeValuePanel(
      doc,
      pageRootId,
      "최근 티켓 메시지",
      "응답 등록 후 아래 두 줄이 즉시 바뀌어야 합니다.",
      runtimeFrame,
      [
        { label: "최근 티켓", token: "ticket_active_title" },
        { label: "최근 응답", token: "ticket_messages" },
      ],
    ),
  );
  return created;
}

function addCrmLeadMovePanel(doc: Doc, pageRootId: string, frame: Frame) {
  const created: string[] = [];
  const isNarrow = frame.w <= 420;
  const actionFrame = isNarrow
    ? { x: frame.x + 24, y: frame.y + 248, w: frame.w - 48, h: 44, rotation: 0 }
    : { x: frame.x + frame.w - 188, y: frame.y + 112, w: 164, h: 44, rotation: 0 };
  const runtimeFrame = isNarrow
    ? { x: frame.x + 24, y: frame.y + 314, w: frame.w - 48, h: 220, rotation: 0 }
    : { x: frame.x + 24, y: frame.y + 274, w: frame.w - 48, h: 220, rotation: 0 };
  const panel = makeFrameNode("CRM Lead Move Panel", frame, {
    fill: "#FFFFFF",
    stroke: { color: "#E2E8F0", width: 1 },
    radius: 24,
  });
  panel.style.effects = [{ type: "shadow", x: 0, y: 14, blur: 30, color: "#0F172A", opacity: 0.08 }];
  panel.service = { dataSource: { source: "crm.leads", limit: 8, orderBy: "updated_at", orderDir: "desc" } };
  addTrackedNode(doc, panel, pageRootId, created);
  addTrackedNode(
    doc,
    makeTextNode(
      "CRM Panel Title",
      "CRM 리드 단계 이동",
      { x: frame.x + 24, y: frame.y + 24, w: frame.w - 48, h: 24, rotation: 0 },
      { color: "#0F172A", size: 18, weight: 800 },
    ),
    pageRootId,
    created,
  );
  addTrackedNode(
    doc,
    makeTextNode(
      "CRM Panel Body",
      "현재 리드를 다음 단계로 넘기고, 바로 아래 상태 패널에서 리드와 단계가 함께 바뀌는지 확인합니다.",
      { x: frame.x + 24, y: frame.y + 58, w: frame.w - 48, h: 36, rotation: 0 },
      { color: "#64748B", size: 12, weight: 500 },
    ),
    pageRootId,
    created,
  );
  addTrackedNode(
    doc,
    makeTextNode(
      "CRM Active Label",
      "현재 리드",
      { x: frame.x + 24, y: frame.y + 112, w: 180, h: 16, rotation: 0 },
      { color: "#64748B", size: 11, weight: 700 },
    ),
    pageRootId,
    created,
  );
  addTrackedNode(
    doc,
    makeTextNode(
      "CRM Active Title",
      "{{ crm_active_lead_title }}",
      { x: frame.x + 24, y: frame.y + 136, w: frame.w - 48, h: 22, rotation: 0 },
      { color: "#0F172A", size: 16, weight: 700 },
    ),
    pageRootId,
    created,
  );
  addTrackedNode(
    doc,
    makeTextNode(
      "CRM Active Stage",
      "{{ crm_active_stage_name }}",
      { x: frame.x + 24, y: frame.y + 166, w: frame.w - 48, h: 18, rotation: 0 },
      { color: "#7C3AED", size: 13, weight: 700 },
    ),
    pageRootId,
    created,
  );
  addTrackedNode(
    doc,
    makeTextNode(
      "CRM Next Label",
      "다음 단계",
      { x: frame.x + 24, y: frame.y + 198, w: 180, h: 16, rotation: 0 },
      { color: "#64748B", size: 11, weight: 700 },
    ),
    pageRootId,
    created,
  );
  addTrackedNode(
    doc,
    makeTextNode(
      "CRM Next Stage",
      "{{ crm_next_stage_name }}",
      { x: frame.x + 24, y: frame.y + 222, w: frame.w - 48, h: 18, rotation: 0 },
      { color: "#0F172A", size: 14, weight: 700 },
    ),
    pageRootId,
    created,
  );
  created.push(
    ...addActionButton(
      doc,
      pageRootId,
      "다음 단계 이동",
      actionFrame,
      {
        type: "service",
        action: "crm.lead.move",
        dataSource: { source: "crm.leads", limit: 8, orderBy: "updated_at", orderDir: "desc" },
        stateTransition: { machine: "crmLead", to: "proposal", recordIdField: "leadId", statusField: "status" },
        bindings: [
          { target: "leadId", source: "variable", variableId: "var_crm_active_lead_id", required: true },
          { target: "stageId", source: "variable", variableId: "var_crm_next_stage_id", required: true },
          { target: "status", source: "variable", variableId: "var_crm_next_stage_key", required: true },
        ],
      },
      { fill: "#7C3AED", stroke: null, textColor: "#FFFFFF" },
    ),
  );
  created.push(
    ...addRuntimeValuePanel(
      doc,
      pageRootId,
      "CRM 상태 패널",
      "리드 단계 이동 후 아래 세 줄이 즉시 갱신되어야 합니다.",
      runtimeFrame,
      [
        { label: "리드 제목", token: "crm_active_lead_title" },
        { label: "현재 단계", token: "crm_active_stage_name" },
        { label: "다음 단계", token: "crm_next_stage_name" },
      ],
    ),
  );
  return created;
}

function addApprovalDecisionPanel(doc: Doc, pageRootId: string, frame: Frame) {
  const created: string[] = [];
  const isNarrow = frame.w <= 420;
  const approveFrame = isNarrow
    ? { x: frame.x + 24, y: frame.y + 214, w: frame.w - 48, h: 44, rotation: 0 }
    : { x: frame.x + 24, y: frame.y + 214, w: 166, h: 44, rotation: 0 };
  const rejectFrame = isNarrow
    ? { x: frame.x + 24, y: frame.y + 270, w: frame.w - 48, h: 44, rotation: 0 }
    : { x: frame.x + 206, y: frame.y + 214, w: 156, h: 44, rotation: 0 };
  const runtimeFrame = isNarrow
    ? { x: frame.x + 24, y: frame.y + 338, w: frame.w - 48, h: 234, rotation: 0 }
    : { x: frame.x + 24, y: frame.y + 284, w: frame.w - 48, h: 214, rotation: 0 };
  const panel = makeFrameNode("Approval Decision Panel", frame, {
    fill: "#FFFFFF",
    stroke: { color: "#E2E8F0", width: 1 },
    radius: 24,
  });
  panel.style.effects = [{ type: "shadow", x: 0, y: 14, blur: 30, color: "#0F172A", opacity: 0.08 }];
  panel.service = { dataSource: { source: "documents.list", limit: 8, orderBy: "updated_at", orderDir: "desc" } };
  addTrackedNode(doc, panel, pageRootId, created);
  addTrackedNode(
    doc,
    makeTextNode(
      "Approval Title",
      "승인 문서",
      { x: frame.x + 24, y: frame.y + 24, w: frame.w - 48, h: 24, rotation: 0 },
      { color: "#0F172A", size: 18, weight: 800 },
    ),
    pageRootId,
    created,
  );
  addTrackedNode(
    doc,
    makeTextNode(
      "Approval Body",
      "현재 제출된 문서를 검토하고 상태와 문서 목록이 즉시 갱신되는지 확인합니다.",
      { x: frame.x + 24, y: frame.y + 58, w: frame.w - 48, h: 36, rotation: 0 },
      { color: "#64748B", size: 12, weight: 500 },
    ),
    pageRootId,
    created,
  );
  addTrackedNode(
    doc,
    makeTextNode(
      "Approval Active Label",
      "현재 문서",
      { x: frame.x + 24, y: frame.y + 112, w: 180, h: 16, rotation: 0 },
      { color: "#64748B", size: 11, weight: 700 },
    ),
    pageRootId,
    created,
  );
  addTrackedNode(
    doc,
    makeTextNode(
      "Approval Active Title",
      "{{ document_active_title }}",
      { x: frame.x + 24, y: frame.y + 136, w: frame.w - 48, h: 22, rotation: 0 },
      { color: "#0F172A", size: 16, weight: 700 },
    ),
    pageRootId,
    created,
  );
  addTrackedNode(
    doc,
    makeTextNode(
      "Approval Active Status",
      "{{ document_active_status }}",
      { x: frame.x + 24, y: frame.y + 166, w: frame.w - 48, h: 18, rotation: 0 },
      { color: "#2563EB", size: 13, weight: 700 },
    ),
    pageRootId,
    created,
  );
  created.push(
    ...addActionButton(
      doc,
      pageRootId,
      "문서 승인",
      approveFrame,
      {
        type: "service",
        action: "document.decide",
        dataSource: { source: "documents.list", limit: 8, orderBy: "updated_at", orderDir: "desc" },
        stateTransition: { machine: "document", to: "approved", recordIdField: "documentId", statusField: "status" },
        bindings: [
          { target: "documentId", source: "variable", variableId: "var_document_active_id", required: true },
          { target: "requestId", source: "variable", variableId: "var_document_request_id", required: true },
        ],
      },
      { fill: "#0F766E", stroke: null, textColor: "#FFFFFF" },
    ),
  );
  created.push(
    ...addActionButton(
      doc,
      pageRootId,
      "문서 반려",
      rejectFrame,
      {
        type: "service",
        action: "document.decide",
        dataSource: { source: "documents.list", limit: 8, orderBy: "updated_at", orderDir: "desc" },
        stateTransition: { machine: "document", to: "rejected", recordIdField: "documentId", statusField: "status" },
        bindings: [
          { target: "documentId", source: "variable", variableId: "var_document_active_id", required: true },
          { target: "requestId", source: "variable", variableId: "var_document_request_id", required: true },
        ],
      },
      { fill: "#FEE2E2", stroke: { color: "#FCA5A5", width: 1 }, textColor: "#B91C1C" },
    ),
  );
  created.push(
    ...addRuntimeValuePanel(
      doc,
      pageRootId,
      "승인 상태 패널",
      "승인 또는 반려 직후 현재 문서와 상태 토큰이 바로 바뀌어야 합니다.",
      runtimeFrame,
      [
        { label: "문서 목록", token: "document_titles" },
        { label: "상태 목록", token: "document_states" },
        { label: "현재 상태", token: "document_active_status" },
      ],
    ),
  );
  return created;
}

function addOpsReleasePanel(doc: Doc, pageRootId: string, frame: Frame) {
  const created: string[] = [];
  const isNarrow = frame.w <= 420;
  const recordFrame = isNarrow
    ? { x: frame.x + 24, y: frame.y + 282, w: frame.w - 48, h: 44, rotation: 0 }
    : { x: frame.x + 24, y: frame.y + 282, w: 168, h: 44, rotation: 0 };
  const runbookFrame = isNarrow
    ? { x: frame.x + 24, y: frame.y + 338, w: frame.w - 48, h: 44, rotation: 0 }
    : { x: frame.x + 208, y: frame.y + 282, w: 176, h: 44, rotation: 0 };
  const runtimeFrame = isNarrow
    ? { x: frame.x + 24, y: frame.y + 402, w: frame.w - 48, h: 332, rotation: 0 }
    : { x: frame.x + 24, y: frame.y + 350, w: frame.w - 48, h: 312, rotation: 0 };
  const panel = makeFrameNode("Operations Release Panel", frame, {
    fill: "#FFFFFF",
    stroke: { color: "#E2E8F0", width: 1 },
    radius: 24,
  });
  panel.style.effects = [{ type: "shadow", x: 0, y: 14, blur: 30, color: "#0F172A", opacity: 0.08 }];
  panel.service = { dataSource: { source: "operations.releases", limit: 10, orderBy: "created_at", orderDir: "desc" } };
  addTrackedNode(doc, panel, pageRootId, created);
  addTrackedNode(
    doc,
    makeTextNode(
      "Operations Release Title",
      "배포와 릴리스",
      { x: frame.x + 24, y: frame.y + 24, w: frame.w - 48, h: 24, rotation: 0 },
      { color: "#0F172A", size: 18, weight: 800 },
    ),
    pageRootId,
    created,
  );
  addTrackedNode(
    doc,
    makeTextNode(
      "Operations Release Body",
      "릴리스를 기록하고 런북을 새로고침한 뒤 같은 배포 화면에서 값이 바뀌는지 확인합니다.",
      { x: frame.x + 24, y: frame.y + 58, w: frame.w - 48, h: 36, rotation: 0 },
      { color: "#64748B", size: 12, weight: 500 },
    ),
    pageRootId,
    created,
  );

  const noteInput = addServiceInputField(
    doc,
    pageRootId,
    { x: frame.x + 24, y: frame.y + 108, w: frame.w - 48, h: 72, rotation: 0 },
    {
      label: "릴리스 노트",
      fieldKey: "note",
      placeholder: "최신 배포 내용을 요약하세요",
      valueType: "string",
      required: true,
    },
  );
  created.push(...noteInput.created);
  const deployUrlInput = addServiceInputField(
    doc,
    pageRootId,
    { x: frame.x + 24, y: frame.y + 192, w: frame.w - 48, h: 72, rotation: 0 },
    {
      label: "배포 URL",
      fieldKey: "deployUrl",
      placeholder: "https://service.null.local",
      valueType: "string",
    },
  );
  created.push(...deployUrlInput.created);

  created.push(
    ...addActionButton(
      doc,
      pageRootId,
      "릴리스 기록",
      recordFrame,
      {
        type: "service",
        action: "operations.release.record",
        dataSource: { source: "operations.releases", limit: 10, orderBy: "created_at", orderDir: "desc" },
        bindings: [
          { target: "note", source: "field", fieldKey: "note", required: true },
          { target: "deployUrl", source: "field", fieldKey: "deployUrl" },
          { target: "environmentKey", source: "literal", value: "prod" },
          { target: "deployed", source: "literal", value: true },
        ],
      },
      { fill: "#0F766E", stroke: null, textColor: "#FFFFFF" },
    ),
  );
  created.push(
    ...addActionButton(
      doc,
      pageRootId,
      "런북 새로고침",
      runbookFrame,
      {
        type: "service",
        action: "operations.runbook.generate",
        dataSource: { source: "operations.releases", limit: 10, orderBy: "created_at", orderDir: "desc" },
      },
      { fill: "#DBEAFE", stroke: null, textColor: "#0F172A" },
    ),
  );

  created.push(
    ...addRuntimeValuePanel(
      doc,
      pageRootId,
      "현재 배포 상태",
      "릴리스를 기록하고 런북을 갱신한 뒤 이 값들이 즉시 바뀌어야 합니다.",
      runtimeFrame,
      [
        { label: "버전", token: "ops_current_version_id" },
        { label: "최신 노트", token: "ops_latest_release_note" },
        { label: "환경", token: "ops_latest_release_env" },
        { label: "운영 URL", token: "ops_prod_url" },
      ],
    ),
  );

  return created;
}

function addPolicyEvaluationPanel(doc: Doc, pageRootId: string, frame: Frame) {
  const created: string[] = [];
  const isNarrow = frame.w <= 420;
  const actionFrame = { x: frame.x + 24, y: frame.y + 196, w: isNarrow ? frame.w - 48 : 240, h: 44, rotation: 0 };
  const panel = makeFrameNode("Policy Evaluation Panel", frame, {
    fill: "#FFFFFF",
    stroke: { color: "#E2E8F0", width: 1 },
    radius: 24,
  });
  panel.style.effects = [{ type: "shadow", x: 0, y: 14, blur: 30, color: "#0F172A", opacity: 0.08 }];
  panel.service = { dataSource: { source: "policy.rules", limit: 10, orderBy: "priority", orderDir: "asc" } };
  addTrackedNode(doc, panel, pageRootId, created);
  addTrackedNode(
    doc,
    makeTextNode(
      "Policy Evaluation Title",
      "정책과 리스크",
      { x: frame.x + 24, y: frame.y + 24, w: frame.w - 48, h: 24, rotation: 0 },
      { color: "#0F172A", size: 18, weight: 800 },
    ),
    pageRootId,
    created,
  );
  addTrackedNode(
    doc,
    makeTextNode(
      "Policy Evaluation Body",
      "로그인한 운영자 기준으로 예약 액션을 평가하고 결정, 리스크 점수, 집계가 즉시 바뀌는지 확인합니다.",
      { x: frame.x + 24, y: frame.y + 58, w: frame.w - 48, h: 36, rotation: 0 },
      { color: "#64748B", size: 12, weight: 500 },
    ),
    pageRootId,
    created,
  );

  const subjectInput = addServiceInputField(
    doc,
    pageRootId,
    { x: frame.x + 24, y: frame.y + 108, w: frame.w - 48, h: 72, rotation: 0 },
    {
      label: "주체 키",
      fieldKey: "subjectKey",
      placeholder: "로그인한 운영자 이메일을 사용하세요",
      valueType: "string",
      required: true,
    },
  );
  created.push(...subjectInput.created);
  created.push(
    ...addActionButton(
      doc,
      pageRootId,
      "예약 정책 평가",
      actionFrame,
      {
        type: "service",
        action: "policy.evaluate",
        dataSource: { source: "policy.rules", limit: 10, orderBy: "priority", orderDir: "asc" },
        bindings: [
          { target: "subjectKey", source: "field", fieldKey: "subjectKey", required: true },
          { target: "actionKey", source: "literal", value: "reservation.manage" },
          { target: "resourceType", source: "literal", value: "reservation" },
          { target: "context.operatorEmail", source: "variable", variableId: "var_app_user_email" },
        ],
      },
      { fill: "#EA580C", stroke: null, textColor: "#FFFFFF" },
    ),
  );

  created.push(
    ...addRuntimeValuePanel(
      doc,
      pageRootId,
      "정책 평가 결과",
      "평가 액션이 실행된 뒤 결정과 리스크 필드가 바로 갱신되어야 합니다.",
      { x: frame.x + 24, y: frame.y + 264, w: frame.w - 48, h: 250, rotation: 0 },
      [
        { label: "결정", token: "policy_eval_decision" },
        { label: "리스크 점수", token: "policy_eval_risk_score" },
        { label: "사유", token: "policy_eval_reasons" },
      ],
    ),
  );
  created.push(
    ...addRuntimeValuePanel(
      doc,
      pageRootId,
      "리스크 집계",
      "운영자가 검토할 수 있도록 규칙, 인시던트, 제재 수치가 계속 보여야 합니다.",
      { x: frame.x + 24, y: frame.y + 532, w: frame.w - 48, h: 250, rotation: 0 },
      [
        { label: "정책 규칙", token: "ops_policy_rule_count" },
        { label: "리스크 인시던트", token: "ops_risk_incident_count" },
        { label: "제재 건수", token: "ops_sanction_count" },
      ],
    ),
  );

  return created;
}

function addBillingSettlementPanel(doc: Doc, pageRootId: string, frame: Frame) {
  const created: string[] = [];
  const isNarrow = frame.w <= 420;
  const chargeFrame = isNarrow
    ? { x: frame.x + 24, y: frame.y + 282, w: frame.w - 48, h: 44, rotation: 0 }
    : { x: frame.x + 24, y: frame.y + 282, w: 164, h: 44, rotation: 0 };
  const payFrame = isNarrow
    ? { x: frame.x + 24, y: frame.y + 338, w: frame.w - 48, h: 44, rotation: 0 }
    : { x: frame.x + 204, y: frame.y + 282, w: 188, h: 44, rotation: 0 };
  const invoiceFrame = isNarrow
    ? { x: frame.x + 24, y: frame.y + 402, w: frame.w - 48, h: 270, rotation: 0 }
    : { x: frame.x + 24, y: frame.y + 350, w: frame.w - 48, h: 250, rotation: 0 };
  const settlementFrame = isNarrow
    ? { x: frame.x + 24, y: frame.y + 692, w: frame.w - 48, h: 240, rotation: 0 }
    : { x: frame.x + 24, y: frame.y + 618, w: frame.w - 48, h: 220, rotation: 0 };
  const panel = makeFrameNode("Billing Settlement Panel", frame, {
    fill: "#FFFFFF",
    stroke: { color: "#E2E8F0", width: 1 },
    radius: 24,
  });
  panel.style.effects = [{ type: "shadow", x: 0, y: 14, blur: 30, color: "#0F172A", opacity: 0.08 }];
  panel.service = { dataSource: { source: "billing.invoices", limit: 10, orderBy: "created_at", orderDir: "desc" } };
  addTrackedNode(doc, panel, pageRootId, created);
  addTrackedNode(
    doc,
    makeTextNode(
      "Billing Settlement Title",
      "과금과 정산",
      { x: frame.x + 24, y: frame.y + 24, w: frame.w - 48, h: 24, rotation: 0 },
      { color: "#0F172A", size: 18, weight: 800 },
    ),
    pageRootId,
    created,
  );
  addTrackedNode(
    doc,
    makeTextNode(
      "Billing Settlement Body",
      "시드 계정에 청구를 만들고 최신 인보이스를 결제한 뒤 같은 콘솔에서 상태가 유지되는지 확인합니다.",
      { x: frame.x + 24, y: frame.y + 58, w: frame.w - 48, h: 36, rotation: 0 },
      { color: "#64748B", size: 12, weight: 500 },
    ),
    pageRootId,
    created,
  );

  const descriptionInput = addServiceInputField(
    doc,
    pageRootId,
    { x: frame.x + 24, y: frame.y + 108, w: frame.w - 48, h: 72, rotation: 0 },
    {
      label: "청구 설명",
      fieldKey: "description",
      placeholder: "프리미엄 예약 변경 수수료",
      valueType: "string",
      required: true,
    },
  );
  created.push(...descriptionInput.created);
  const amountInput = addServiceInputField(
    doc,
    pageRootId,
    { x: frame.x + 24, y: frame.y + 192, w: frame.w - 48, h: 72, rotation: 0 },
    {
      label: "Amount (KRW cents)",
      fieldKey: "unitAmountCents",
      placeholder: "2900",
      valueType: "string",
      required: true,
    },
  );
  created.push(...amountInput.created);

  created.push(
    ...addActionButton(
      doc,
      pageRootId,
      "청구 생성",
      chargeFrame,
      {
        type: "service",
        action: "billing.checkout",
        dataSource: { source: "billing.invoices", limit: 10, orderBy: "created_at", orderDir: "desc" },
        bindings: [
          { target: "accountId", source: "variable", variableId: "var_billing_latest_account_id", required: true },
          { target: "description", source: "field", fieldKey: "description", required: true },
          { target: "unitAmountCents", source: "field", fieldKey: "unitAmountCents", required: true },
          { target: "currency", source: "literal", value: "KRW" },
          { target: "quantity", source: "literal", value: 1 },
          { target: "kind", source: "literal", value: "addon" },
        ],
      },
      { fill: "#2563EB", stroke: null, textColor: "#FFFFFF" },
    ),
  );
  created.push(
    ...addActionButton(
      doc,
      pageRootId,
      "최신 인보이스 결제",
      payFrame,
      {
        type: "service",
        action: "billing.invoice.pay",
        dataSource: { source: "billing.invoices", limit: 10, orderBy: "created_at", orderDir: "desc" },
        bindings: [
          { target: "invoiceId", source: "variable", variableId: "var_billing_latest_invoice_id", required: true },
          { target: "amountPaidCents", source: "variable", variableId: "var_billing_latest_invoice_total_cents", required: true },
        ],
      },
      { fill: "#0F766E", stroke: null, textColor: "#FFFFFF" },
    ),
  );

  created.push(
    ...addRuntimeValuePanel(
      doc,
      pageRootId,
      "인보이스 스냅샷",
      "청구 생성 또는 결제 뒤에 이 값들이 즉시 갱신되어야 합니다.",
      invoiceFrame,
      [
        { label: "계정 수", token: "billing_account_count" },
        { label: "인보이스 수", token: "billing_invoice_count" },
        { label: "최신 인보이스", token: "billing_latest_invoice_id" },
        { label: "인보이스 상태", token: "billing_latest_invoice_status" },
        { label: "인보이스 합계", token: "billing_latest_invoice_total_cents" },
      ],
    ),
  );
  created.push(
    ...addRuntimeValuePanel(
      doc,
      pageRootId,
      "정산 스냅샷",
      "과금 액션 뒤에도 최신 정산 값이 운영자에게 계속 보여야 합니다.",
      settlementFrame,
      [
        { label: "최신 정산", token: "billing_latest_settlement_id" },
        { label: "정산 상태", token: "billing_latest_settlement_status" },
        { label: "정산 순액", token: "billing_latest_settlement_net_cents" },
      ],
    ),
  );

  return created;
}

function addOpsTelemetryPanel(doc: Doc, pageRootId: string, frame: Frame) {
  return addRuntimeValuePanel(
    doc,
    pageRootId,
    "운영 텔레메트리",
    "큐 상태, 이벤트 처리량, 데이터 규모를 같은 운영 화면에서 계속 확인할 수 있어야 합니다.",
    frame,
    [
      { label: "이벤트(24시간)", token: "ops_events_24h" },
      { label: "대기 작업", token: "ops_queued_jobs" },
      { label: "실패 보관 작업", token: "ops_dead_lettered_jobs" },
      { label: "앱 컬렉션", token: "ops_app_collections" },
      { label: "앱 레코드", token: "ops_app_records" },
      { label: "미디어 자산", token: "ops_media_assets" },
    ],
  );
}

function addOpsAuditPanel(doc: Doc, pageRootId: string, frame: Frame) {
  return addRuntimeValuePanel(
    doc,
    pageRootId,
    "감사 로그",
    "에디터 산출물 콘솔을 벗어나지 않고 최근 페이지/앱 감사 이력을 읽을 수 있어야 합니다.",
    frame,
    [
      { label: "페이지 감사(24시간)", token: "ops_page_audit_24h" },
      { label: "앱 감사(24시간)", token: "ops_app_audit_24h" },
      { label: "최근 페이지 액션", token: "ops_latest_page_audit_action" },
      { label: "최근 페이지 시각", token: "ops_latest_page_audit_at" },
      { label: "최근 앱 액션", token: "ops_latest_app_audit_action" },
      { label: "최근 앱 시각", token: "ops_latest_app_audit_at" },
    ],
  );
}

function addPageTabs(
  doc: Doc,
  pageRootId: string,
  pages: Array<{ id: string; name: string }>,
  currentPageId: string,
  originY = 40,
) {
  pages.forEach((page, index) => {
    const isActive = page.id === currentPageId;
    const x = 40 + index * 190;
    const tab = makeFrameNode(
      "Page Tab",
      { x, y: originY, w: 168, h: 42, rotation: 0 },
      {
        fill: isActive ? "#0F172A" : "#FFFFFF",
        stroke: isActive ? null : { color: "#CBD5E1", width: 1 },
        radius: 999,
      },
    );
    tab.style.effects = [{ type: "shadow", x: 0, y: 10, blur: 28, color: "#0F172A", opacity: 0.06 }];
    if (!isActive) {
      tab.prototype = {
        interactions: [
          {
            id: `tab_${currentPageId}_${page.id}`,
            trigger: "click",
            action: { type: "navigate", targetPageId: page.id, transition: { type: "smart", duration: 260, easing: "ease-out" } },
          },
        ],
      };
    }
    addNode(doc, tab, pageRootId);
    addNode(
      doc,
      makeTextNode(
        "Page Tab Text",
        page.name,
        { x: 24, y: 12, w: 120, h: 18, rotation: 0 },
        { color: isActive ? "#FFFFFF" : "#0F172A", size: 13, weight: 800, align: "center" },
      ),
      tab.id,
    );
  });
}

function addRuntimeValuePanel(
  doc: Doc,
  pageRootId: string,
  title: string,
  subtitle: string,
  frame: Frame,
  rows: Array<{ label: string; token: string }>,
) {
  const created: string[] = [];
  const isGrid = frame.w >= 520 && rows.length > 4;
  const columns = isGrid ? 2 : 1;
  const rowGap = 12;
  const rowHeight = 50;
  const columnGap = 12;
  const boxWidth = isGrid ? (frame.w - 52) / 2 : frame.w - 40;
  const panel = makeFrameNode("Runtime Value Panel", frame, {
    fill: "#FFFFFF",
    stroke: { color: "#DBEAFE", width: 1 },
    radius: 22,
  });
  panel.style.effects = [{ type: "shadow", x: 0, y: 12, blur: 28, color: "#1D4ED8", opacity: 0.08 }];
  addTrackedNode(doc, panel, pageRootId, created);
  addTrackedNode(
    doc,
    makeTextNode("Runtime Panel Title", title, { x: frame.x + 24, y: frame.y + 22, w: frame.w - 48, h: 24, rotation: 0 }, { color: "#0F172A", size: 18, weight: 800 }),
    pageRootId,
    created,
  );
  addTrackedNode(
    doc,
    makeTextNode("Runtime Panel Subtitle", subtitle, { x: frame.x + 24, y: frame.y + 52, w: frame.w - 48, h: 36, rotation: 0 }, { color: "#64748B", size: 12, weight: 500 }),
    pageRootId,
    created,
  );

  rows.forEach((row, index) => {
    const column = isGrid ? index % columns : 0;
    const gridRow = isGrid ? Math.floor(index / columns) : index;
    const rowX = frame.x + 20 + column * (boxWidth + columnGap);
    const rowY = frame.y + 104 + gridRow * (rowHeight + rowGap);
    const box = makeFrameNode("Runtime Value Row", { x: rowX, y: rowY, w: boxWidth, h: rowHeight, rotation: 0 }, {
      fill: "#F8FAFC",
      stroke: { color: "#E2E8F0", width: 1 },
      radius: 16,
    });
    addTrackedNode(doc, box, pageRootId, created);
    addTrackedNode(
      doc,
      makeTextNode("Runtime Label", row.label, { x: rowX + 20, y: rowY + 12, w: boxWidth - 40, h: 16, rotation: 0 }, { color: "#64748B", size: 11, weight: 700 }),
      pageRootId,
      created,
    );
    addTrackedNode(
      doc,
      makeTextNode("Runtime Value", `{{ ${row.token} }}`, { x: rowX + 20, y: rowY + 28, w: boxWidth - 40, h: 18, rotation: 0 }, { color: "#0F172A", size: 13, weight: 700 }),
      pageRootId,
      created,
    );
  });

  return created;
}

function addDarkFeatureCard(doc: Doc, pageRootId: string, title: string, body: string, frame: Frame) {
  const created: string[] = [];
  const card = makeFrameNode("Dark Feature Card", frame, {
    fill: "#020617",
    stroke: null,
    radius: 22,
  });
  card.style.effects = [{ type: "shadow", x: 0, y: 18, blur: 34, color: "#0F172A", opacity: 0.18 }];
  addTrackedNode(doc, card, pageRootId, created);
  addTrackedNode(
    doc,
    makeTextNode("Dark Feature Title", title, { x: frame.x + 24, y: frame.y + 22, w: frame.w - 48, h: 24, rotation: 0 }, { color: "#FFFFFF", size: 18, weight: 800 }),
    pageRootId,
    created,
  );
  addTrackedNode(
    doc,
    makeTextNode("Dark Feature Body", body, { x: frame.x + 24, y: frame.y + 58, w: frame.w - 48, h: 40, rotation: 0 }, { color: "#CBD5E1", size: 13, weight: 500 }),
    pageRootId,
    created,
  );

  return created;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function addPlaceholderPage(
  doc: Doc,
  pageRootId: string,
  pages: Array<{ id: string; name: string }>,
  currentPageId: string,
  title: string,
  body: string,
  cards: Array<{ title: string; body: string; x: number; y: number; accent: string }>,
) {
  addPageTabs(doc, pageRootId, pages, currentPageId);
  addHero(doc, pageRootId, title, body, 110);
  cards.forEach((card) => {
    addNavigationCard(
      doc,
      pageRootId,
      card.title,
      card.body,
      currentPageId,
      { x: card.x, y: card.y, w: 760, h: 170, rotation: 0 },
      card.accent,
    );
  });
}

function buildRuntimeVariables(): Variable[] {
  return [
    { id: "var_app_user_email", name: "$app_user.email", type: "string", value: "" },
    { id: "var_app_user_display_name", name: "$app_user.display_name", type: "string", value: "" },
    { id: "var_app_user_role", name: "$app_user.role", type: "string", value: "" },
    { id: "var_app_user_logged_in", name: "$app_user.logged_in", type: "boolean", value: false },
    { id: "var_service_last_ok", name: "service_last_ok", type: "boolean", value: false },
    { id: "var_service_last_error", name: "service_last_error", type: "string", value: "" },
    { id: "var_service_last_response", name: "service_last_response", type: "string", value: "" },
    { id: "var_chat_titles", name: "chat_titles", type: "string", value: "" },
    { id: "var_chat_messages", name: "chat_messages", type: "string", value: "" },
    { id: "var_chat_times", name: "chat_times", type: "string", value: "" },
    { id: "var_notification_titles", name: "notification_titles", type: "string", value: "" },
    { id: "var_notification_metas", name: "notification_metas", type: "string", value: "" },
    { id: "var_todo_items", name: "todo_items", type: "string", value: "" },
    { id: "var_todo_list", name: "todo_list", type: "string", value: "" },
    { id: "var_todo_meta", name: "todo_meta", type: "string", value: "" },
    { id: "var_note_content", name: "note_content", type: "string", value: "" },
    { id: "var_note_content_alt", name: "noteContent", type: "string", value: "" },
    { id: "var_kanban_columns", name: "kanban_columns", type: "string", value: "" },
    { id: "var_kanban_columns_alt", name: "kanbanColumns", type: "string", value: "" },
    { id: "var_kanban_cards", name: "kanban_cards", type: "string", value: "" },
    { id: "var_kanban_cards_alt", name: "kanbanCards", type: "string", value: "" },
    { id: "var_reservation_titles", name: "reservation_titles", type: "string", value: "" },
    { id: "var_reservation_states", name: "reservation_states", type: "string", value: "" },
    { id: "var_reservation_active_id", name: "reservation_active_id", type: "string", value: "" },
    { id: "var_reservation_active_title", name: "reservation_active_title", type: "string", value: "" },
    { id: "var_reservation_active_state", name: "reservation_active_state", type: "string", value: "" },
    { id: "var_reservation_resource_id", name: "reservation_resource_id", type: "string", value: "" },
    { id: "var_reservation_customer_key", name: "reservation_customer_key", type: "string", value: "" },
    { id: "var_ticket_titles", name: "ticket_titles", type: "string", value: "" },
    { id: "var_ticket_states", name: "ticket_states", type: "string", value: "" },
    { id: "var_ticket_messages", name: "ticket_messages", type: "string", value: "" },
    { id: "var_ticket_active_id", name: "ticket_active_id", type: "string", value: "" },
    { id: "var_ticket_active_title", name: "ticket_active_title", type: "string", value: "" },
    { id: "var_ticket_active_state", name: "ticket_active_state", type: "string", value: "" },
    { id: "var_ticket_queue_id", name: "ticket_queue_id", type: "string", value: "" },
    { id: "var_ticket_requester_key", name: "ticket_requester_key", type: "string", value: "" },
    { id: "var_ticket_author_key", name: "ticket_author_key", type: "string", value: "" },
    { id: "var_crm_lead_titles", name: "crm_lead_titles", type: "string", value: "" },
    { id: "var_crm_lead_stages", name: "crm_lead_stages", type: "string", value: "" },
    { id: "var_crm_active_lead_id", name: "crm_active_lead_id", type: "string", value: "" },
    { id: "var_crm_active_lead_title", name: "crm_active_lead_title", type: "string", value: "" },
    { id: "var_crm_active_stage_id", name: "crm_active_stage_id", type: "string", value: "" },
    { id: "var_crm_active_stage_name", name: "crm_active_stage_name", type: "string", value: "" },
    { id: "var_crm_pipeline_id", name: "crm_pipeline_id", type: "string", value: "" },
    { id: "var_crm_next_stage_id", name: "crm_next_stage_id", type: "string", value: "" },
    { id: "var_crm_next_stage_name", name: "crm_next_stage_name", type: "string", value: "" },
    { id: "var_crm_next_stage_key", name: "crm_next_stage_key", type: "string", value: "" },
    { id: "var_document_titles", name: "document_titles", type: "string", value: "" },
    { id: "var_document_states", name: "document_states", type: "string", value: "" },
    { id: "var_document_active_id", name: "document_active_id", type: "string", value: "" },
    { id: "var_document_active_title", name: "document_active_title", type: "string", value: "" },
    { id: "var_document_active_status", name: "document_active_status", type: "string", value: "" },
    { id: "var_document_request_id", name: "document_request_id", type: "string", value: "" },
    { id: "var_approval_status", name: "approval_status", type: "string", value: "" },
    { id: "var_ops_release_count", name: "ops_release_count", type: "string", value: "" },
    { id: "var_ops_latest_release_note", name: "ops_latest_release_note", type: "string", value: "" },
    { id: "var_ops_latest_release_env", name: "ops_latest_release_env", type: "string", value: "" },
    { id: "var_ops_latest_release_url", name: "ops_latest_release_url", type: "string", value: "" },
    { id: "var_ops_latest_release_at", name: "ops_latest_release_at", type: "string", value: "" },
    { id: "var_ops_deployed_at", name: "ops_deployed_at", type: "string", value: "" },
    { id: "var_ops_current_version_id", name: "ops_current_version_id", type: "string", value: "" },
    { id: "var_ops_prod_url", name: "ops_prod_url", type: "string", value: "" },
    { id: "var_ops_last_backup_kind", name: "ops_last_backup_kind", type: "string", value: "" },
    { id: "var_ops_runbook_release", name: "ops_runbook_release", type: "string", value: "" },
    { id: "var_ops_runbook_rollback", name: "ops_runbook_rollback", type: "string", value: "" },
    { id: "var_ops_runbook_backup", name: "ops_runbook_backup", type: "string", value: "" },
    { id: "var_ops_policy_rule_count", name: "ops_policy_rule_count", type: "string", value: "" },
    { id: "var_ops_risk_incident_count", name: "ops_risk_incident_count", type: "string", value: "" },
    { id: "var_ops_sanction_count", name: "ops_sanction_count", type: "string", value: "" },
    { id: "var_ops_approval_request_count", name: "ops_approval_request_count", type: "string", value: "" },
    { id: "var_ops_events_24h", name: "ops_events_24h", type: "string", value: "" },
    { id: "var_ops_app_collections", name: "ops_app_collections", type: "string", value: "" },
    { id: "var_ops_app_records", name: "ops_app_records", type: "string", value: "" },
    { id: "var_ops_media_assets", name: "ops_media_assets", type: "string", value: "" },
    { id: "var_ops_queued_jobs", name: "ops_queued_jobs", type: "string", value: "" },
    { id: "var_ops_dead_lettered_jobs", name: "ops_dead_lettered_jobs", type: "string", value: "" },
    { id: "var_ops_page_audit_24h", name: "ops_page_audit_24h", type: "string", value: "" },
    { id: "var_ops_app_audit_24h", name: "ops_app_audit_24h", type: "string", value: "" },
    { id: "var_ops_latest_app_audit_action", name: "ops_latest_app_audit_action", type: "string", value: "" },
    { id: "var_ops_latest_app_audit_at", name: "ops_latest_app_audit_at", type: "string", value: "" },
    { id: "var_ops_latest_page_audit_action", name: "ops_latest_page_audit_action", type: "string", value: "" },
    { id: "var_ops_latest_page_audit_at", name: "ops_latest_page_audit_at", type: "string", value: "" },
    { id: "var_billing_account_count", name: "billing_account_count", type: "string", value: "" },
    { id: "var_billing_invoice_count", name: "billing_invoice_count", type: "string", value: "" },
    { id: "var_billing_latest_account_id", name: "billing_latest_account_id", type: "string", value: "" },
    { id: "var_billing_latest_invoice_id", name: "billing_latest_invoice_id", type: "string", value: "" },
    { id: "var_billing_latest_invoice_status", name: "billing_latest_invoice_status", type: "string", value: "" },
    { id: "var_billing_latest_invoice_total_cents", name: "billing_latest_invoice_total_cents", type: "string", value: "" },
    { id: "var_billing_latest_settlement_id", name: "billing_latest_settlement_id", type: "string", value: "" },
    { id: "var_billing_latest_settlement_status", name: "billing_latest_settlement_status", type: "string", value: "" },
    { id: "var_billing_latest_settlement_net_cents", name: "billing_latest_settlement_net_cents", type: "string", value: "" },
    { id: "var_policy_eval_decision", name: "policy_eval_decision", type: "string", value: "" },
    { id: "var_policy_eval_allowed", name: "policy_eval_allowed", type: "boolean", value: false },
    { id: "var_policy_eval_requires_approval", name: "policy_eval_requires_approval", type: "boolean", value: false },
    { id: "var_policy_eval_blocked", name: "policy_eval_blocked", type: "boolean", value: false },
    { id: "var_policy_eval_risk_score", name: "policy_eval_risk_score", type: "number", value: 0 },
    { id: "var_policy_eval_reasons", name: "policy_eval_reasons", type: "string", value: "" },
    { id: "var_policy_eval_request_id", name: "policy_eval_request_id", type: "string", value: "" },
  ];
}

export function buildIntegratedServiceDoc(options?: {
  credentials?: IntegratedServiceCredential[];
}) {
  const credentials = options?.credentials?.length ? options.credentials : DEFAULT_CREDENTIALS;
  const doc = createDoc();
  const userAppPage = doc.nodes[doc.pages[0]!.rootId]!;
  setPageFrame(userAppPage, { x: 0, y: 0, w: PAGE_SIZE.w, h: PAGE_SIZE.h, rotation: 0 }, "사용자 앱");
  doc.pages[0]!.name = "사용자 앱";
  doc.variables = buildRuntimeVariables();
  if (doc.prototype) {
    doc.prototype.startPageId = doc.pages[0]!.id;
  }
  setPageBreakpoints(doc, doc.pages[0]!.id, USER_APP_BREAKPOINTS);

  const partnerPage = createAdditionalPage(doc, "파트너 포털", PAGE_SIZE.w + 320);
  const opsPage = createAdditionalPage(doc, "운영 콘솔", PAGE_SIZE.w * 2 + 640);
  const userHeroIds = addHero(
    doc,
    userAppPage.id,
    "NULL 통합 검증 서비스",
    "기본 자산을 그대로 두지 않고, 에디터 산출물 사용자 앱에서 로그인, 세션, 채팅, 알림 흐름을 직접 검증하는 첫 번째 완성 페이지입니다.",
    110,
  );
  const userStatIds = addStats(doc, userAppPage.id, [
    { label: "서비스 면", value: "3개", x: 40 },
    { label: "데모 계정", value: "3종", x: 308 },
    { label: "시드 메시지", value: "3건", x: 576 },
    { label: "활성 알림", value: "2건", x: 844 },
    { label: "로그인 흐름", value: "실동작", x: 1112 },
  ]);
  const userFeatureIds = addDarkFeatureCard(
    doc,
    userAppPage.id,
    "사용자 앱 검증 포인트",
    "Linear처럼 밀도 있게, Vercel처럼 절제된 상단 구조로 로그인, 채팅, 알림, 개인 작업을 한 화면에서 확인합니다.",
    { x: 40, y: 460, w: 1560, h: 132, rotation: 0 },
  );
  const userSessionLabelIds = addSectionLabel(doc, userAppPage.id, "로그인과 세션", 40, 650);
  const userAuthLoginId = addPreset(doc, userAppPage.id, "asset-auth-login", { x: 40, y: 700 });
  const userAuthProfileId = addPreset(doc, userAppPage.id, "asset-auth-profile", { x: 500, y: 700 });
  const userRuntimeIds = addRuntimeValuePanel(
    doc,
    userAppPage.id,
    "현재 세션 상태",
    "로그인/로그아웃 뒤에 실제 앱 사용자 정보와 최근 액션 결과가 이 카드에서 바뀌어야 합니다.",
    { x: 960, y: 700, w: 640, h: 432, rotation: 0 },
    [
      { label: "로그인 여부", token: "$app_user.logged_in" },
      { label: "세션 이메일", token: "$app_user.email" },
      { label: "표시 이름", token: "$app_user.display_name" },
      { label: "역할", token: "$app_user.role" },
      { label: "최근 액션 성공", token: "service_last_ok" },
    ],
  );
  const userCredentialIds = addCredentialPanel(doc, userAppPage.id, credentials, { x: 960, y: 1160, w: 640, h: 450, rotation: 0 });
  const userMessagingLabelIds = addSectionLabel(doc, userAppPage.id, "메시지와 알림", 40, 1050);
  const userChatListId = addPreset(doc, userAppPage.id, "asset-chat-list", { x: 40, y: 1100 });
  const userChatRoomId = addPreset(doc, userAppPage.id, "asset-chat-room", { x: 500, y: 1100 });
  const userNotificationId = addPreset(doc, userAppPage.id, "asset-notification-center", { x: 40, y: 1660 });
  const userFeatureGridIds = addFeatureGridPanel(
    doc,
    userAppPage.id,
    "사용자 앱에서 바로 확인할 것",
    [
      { label: "로그인", value: "이메일/이름/역할 반영", accent: "#1D4ED8" },
      { label: "로그아웃", value: "세션 변수 초기화", accent: "#334155" },
      { label: "채팅", value: "목록 · 룸 동시 반영", accent: "#7C3AED" },
      { label: "알림", value: "알림 센터 실데이터 노출", accent: "#EA580C" },
    ],
    { x: 500, y: 1660, w: 1100, h: 260, rotation: 0 },
  );
  const userPassCriteriaIds = addBulletListPanel(
    doc,
    userAppPage.id,
    "사용자 앱 합격 기준",
    [
      { title: "로그인 후 세션 카드와 프로필 카드가 실제 사용자 정보로 바뀐다", meta: "빈 문자열이나 플레이스홀더면 실패" },
      { title: "로그아웃 후 세션 카드가 비로그인 상태로 돌아간다", meta: "버튼 실제 동작 필요" },
      { title: "채팅 전송 후 채팅 목록과 채팅룸이 같이 바뀐다", meta: "실시간/응답 반영 필요" },
      { title: "알림 센터가 시드 알림을 보여주고 채팅 문맥과 같이 보인다", meta: "정적 장식이면 실패" },
    ],
    { x: 40, y: 1970, w: 1560, h: 320, rotation: 0 },
    { accent: "#1D4ED8", subtitle: "이 페이지는 실제 사용자 앱처럼 로그인/세션과 채팅/알림을 함께 검증하는 첫 번째 완성 페이지입니다." },
  );
  const userWorkLabelIds = addSectionLabel(doc, userAppPage.id, "개인 작업 흐름", 40, 2340);
  const userTodoIds = addTodoPanel(doc, userAppPage.id, { x: 40, y: 2390, w: 420, h: 390, rotation: 0 });
  const userNoteIds = addNotePanel(doc, userAppPage.id, { x: 500, y: 2390, w: 500, h: 490, rotation: 0 });
  const userKanbanIds = addKanbanPanel(doc, userAppPage.id, { x: 40, y: 2850, w: 960, h: 430, rotation: 0 });
  const userWorkFeatureIds = addFeatureGridPanel(
    doc,
    userAppPage.id,
    "개인 작업에서 바로 확인할 것",
    [
      { label: "할 일", value: "추가 · 체크 · 목록 반영", accent: "#1D4ED8" },
      { label: "노트", value: "저장 후 내용 유지", accent: "#7C3AED" },
      { label: "칸반", value: "컬럼 · 카드 표시", accent: "#0F766E" },
      { label: "시드 상태", value: "초기 데이터 채워짐", accent: "#EA580C" },
    ],
    { x: 1040, y: 2850, w: 560, h: 260, rotation: 0 },
  );
  const userWorkCriteriaIds = addBulletListPanel(
    doc,
    userAppPage.id,
    "개인 작업 합격 기준",
    [
      { title: "할 일 목록이 초기 데이터 4건을 보여주고 새 항목 추가 뒤 즉시 반영된다", meta: "입력만 되고 목록이 안 바뀌면 실패" },
      { title: "노트 저장 뒤 내용이 유지되고 다시 열어도 같은 텍스트가 보인다", meta: "버튼 장식만 있으면 실패" },
      { title: "칸반 보드가 대기/진행 중/완료 컬럼과 시드 카드들을 실제로 보여준다", meta: "빈 칸반이면 실패" },
      { title: "사용자 앱 한 면에서 채팅 · 알림 · 개인 작업이 함께 공존해도 레이아웃이 무너지지 않는다", meta: "겹침/overflow가 있으면 실패" },
    ],
    { x: 1040, y: 3140, w: 560, h: 420, rotation: 0 },
    { accent: "#0F766E", subtitle: "이번 배치에서는 사용자 앱 안에서 할 일, 노트, 칸반까지 직접 검증할 수 있어야 합니다." },
  );
  const userMessageJumpIds = addActionButton(
    doc,
    userAppPage.id,
    "메시지 보기",
    { x: 1200, y: 506, w: 164, h: 40, rotation: 0 },
    { type: "scrollTo", targetNodeId: userMessagingLabelIds[0]!, axis: "y", offset: -24, transition: { type: "smart", duration: 220, easing: "ease-out" } },
    { fill: "#FFFFFF", stroke: null, textColor: "#1D4ED8" },
  );
  const userWorkJumpIds = addActionButton(
    doc,
    userAppPage.id,
    "개인 작업 보기",
    { x: 1380, y: 506, w: 180, h: 40, rotation: 0 },
    { type: "scrollTo", targetNodeId: userWorkLabelIds[0]!, axis: "y", offset: -24, transition: { type: "smart", duration: 220, easing: "ease-out" } },
    { fill: "#DBEAFE", stroke: null, textColor: "#0F172A" },
  );

  const userAppDesktopIds = [
    ...userHeroIds,
    ...userStatIds,
    ...userFeatureIds,
    ...userMessageJumpIds,
    ...userWorkJumpIds,
    ...userSessionLabelIds,
    ...(userAuthLoginId ? [userAuthLoginId] : []),
    ...(userAuthProfileId ? [userAuthProfileId] : []),
    ...userRuntimeIds,
    ...userCredentialIds,
    ...userMessagingLabelIds,
    ...(userChatListId ? [userChatListId] : []),
    ...(userChatRoomId ? [userChatRoomId] : []),
    ...(userNotificationId ? [userNotificationId] : []),
    ...userFeatureGridIds,
    ...userPassCriteriaIds,
    ...userWorkLabelIds,
    ...userTodoIds,
    ...userNoteIds,
    ...userKanbanIds,
    ...userWorkFeatureIds,
    ...userWorkCriteriaIds,
  ];

  const compactHeroIds = addHero(
    doc,
    userAppPage.id,
    "NULL 통합 검증 서비스",
    "좁은 데스크톱 폭에서도 로그인, 세션, 채팅, 알림, 개인 작업 흐름을 끊김 없이 확인하는 사용자 앱 레이아웃입니다.",
    { x: 40, y: 110, w: 1100, h: 280, rotation: 0 },
  );
  const compactStatIds = addStats(doc, userAppPage.id, [
    { label: "서비스 면", value: "3개", x: 40, y: 420 },
    { label: "데모 계정", value: "3종", x: 300, y: 420 },
    { label: "시드 메시지", value: "3건", x: 560, y: 420 },
    { label: "활성 알림", value: "2건", x: 820, y: 420 },
    { label: "로그인 흐름", value: "실동작", x: 40, y: 548 },
  ]);
  const compactFeatureIds = addDarkFeatureCard(
    doc,
    userAppPage.id,
    "좁은 데스크톱 사용자 앱",
    "Stripe 대시보드처럼 핵심 흐름만 남겨 좁은 폭에서도 검증 포인트를 빠르게 이동합니다.",
    { x: 40, y: 706, w: 1100, h: 132, rotation: 0 },
  );
  const compactSessionLabelIds = addSectionLabel(doc, userAppPage.id, "로그인과 세션", 40, 1140);
  const compactAuthLoginId = addPreset(doc, userAppPage.id, "asset-auth-login", { x: 40, y: 1190 });
  const compactAuthProfileId = addPreset(doc, userAppPage.id, "asset-auth-profile", { x: 500, y: 1190 });
  const compactRuntimeIds = addRuntimeValuePanel(
    doc,
    userAppPage.id,
    "현재 세션 상태",
    "좁은 데스크톱에서도 로그인/로그아웃 뒤 실제 세션과 결과가 이 카드에서 바뀌어야 합니다.",
    { x: 40, y: 1750, w: 1100, h: 350, rotation: 0 },
    [
      { label: "로그인 여부", token: "$app_user.logged_in" },
      { label: "세션 이메일", token: "$app_user.email" },
      { label: "표시 이름", token: "$app_user.display_name" },
      { label: "역할", token: "$app_user.role" },
      { label: "최근 액션 성공", token: "service_last_ok" },
    ],
  );
  const compactCredentialIds = addCredentialPanel(doc, userAppPage.id, credentials, { x: 40, y: 2140, w: 1100, h: 450, rotation: 0 });
  const compactMessagingLabelIds = addSectionLabel(doc, userAppPage.id, "메시지와 알림", 40, 2630);
  const compactChatListId = addPreset(doc, userAppPage.id, "asset-chat-list", { x: 40, y: 2680 });
  const compactChatRoomId = addPreset(doc, userAppPage.id, "asset-chat-room", { x: 40, y: 3240 });
  const compactNotificationId = addPreset(doc, userAppPage.id, "asset-notification-center", { x: 40, y: 3860 });
  const compactFeatureGridIds = addFeatureGridPanel(
    doc,
    userAppPage.id,
    "사용자 앱에서 바로 확인할 것",
    [
      { label: "로그인", value: "이메일/이름/역할 반영", accent: "#1D4ED8" },
      { label: "로그아웃", value: "세션 변수 초기화", accent: "#334155" },
      { label: "채팅", value: "목록 · 룸 동시 반영", accent: "#7C3AED" },
      { label: "알림", value: "알림 센터 실데이터 노출", accent: "#EA580C" },
    ],
    { x: 40, y: 4320, w: 1100, h: 260, rotation: 0 },
  );
  const compactPassCriteriaIds = addBulletListPanel(
    doc,
    userAppPage.id,
    "사용자 앱 합격 기준",
    [
      { title: "로그인 후 세션 카드와 프로필 카드가 실제 사용자 정보로 바뀐다", meta: "빈 문자열이나 플레이스홀더면 실패" },
      { title: "로그아웃 후 세션 카드가 비로그인 상태로 돌아간다", meta: "버튼 실제 동작 필요" },
      { title: "채팅 전송 후 채팅 목록과 채팅룸이 같이 바뀐다", meta: "실시간/응답 반영 필요" },
      { title: "알림 센터가 시드 알림을 보여주고 채팅 문맥과 같이 보인다", meta: "정적 장식이면 실패" },
    ],
    { x: 40, y: 4620, w: 1100, h: 340, rotation: 0 },
    { accent: "#1D4ED8", subtitle: "좁은 데스크톱 폭에서도 사용자 앱 검증 기준이 그대로 유지되어야 합니다." },
  );
  const compactWorkLabelIds = addSectionLabel(doc, userAppPage.id, "개인 작업 흐름", 40, 5000);
  const compactTodoIds = addTodoPanel(doc, userAppPage.id, { x: 40, y: 5050, w: 1100, h: 390, rotation: 0 });
  const compactNoteIds = addNotePanel(doc, userAppPage.id, { x: 40, y: 5460, w: 1100, h: 470, rotation: 0 });
  const compactKanbanIds = addKanbanPanel(doc, userAppPage.id, { x: 40, y: 5950, w: 1100, h: 430, rotation: 0 });
  const compactWorkFeatureIds = addFeatureGridPanel(
    doc,
    userAppPage.id,
    "개인 작업에서 바로 확인할 것",
    [
      { label: "할 일", value: "추가 · 체크 · 목록 반영", accent: "#1D4ED8" },
      { label: "노트", value: "저장 후 내용 유지", accent: "#7C3AED" },
      { label: "칸반", value: "컬럼 · 카드 표시", accent: "#0F766E" },
      { label: "시드 상태", value: "초기 데이터 채워짐", accent: "#EA580C" },
    ],
    { x: 40, y: 6410, w: 1100, h: 260, rotation: 0 },
  );
  const compactWorkCriteriaIds = addBulletListPanel(
    doc,
    userAppPage.id,
    "개인 작업 합격 기준",
    [
      { title: "할 일 목록이 초기 데이터 4건을 보여주고 새 항목 추가 뒤 즉시 반영된다", meta: "입력만 되고 목록이 안 바뀌면 실패" },
      { title: "노트 저장 뒤 내용이 유지되고 다시 열어도 같은 텍스트가 보인다", meta: "버튼 장식만 있으면 실패" },
      { title: "칸반 보드가 대기/진행 중/완료 컬럼과 시드 카드들을 실제로 보여준다", meta: "빈 칸반이면 실패" },
      { title: "좁은 데스크톱에서도 채팅 · 알림 · 개인 작업이 겹치지 않고 끝까지 보인다", meta: "겹침/overflow가 있으면 실패" },
    ],
    { x: 40, y: 6700, w: 1100, h: 420, rotation: 0 },
    { accent: "#0F766E", subtitle: "이번 배치에서는 사용자 앱 전체가 좁은 데스크톱 폭에서도 그대로 검증되어야 합니다." },
  );
  const compactMessageJumpIds = addActionButton(
    doc,
    userAppPage.id,
    "메시지 보기",
    { x: 744, y: 728, w: 164, h: 40, rotation: 0 },
    { type: "scrollTo", targetNodeId: compactMessagingLabelIds[0]!, axis: "y", offset: -24, transition: { type: "smart", duration: 220, easing: "ease-out" } },
    { fill: "#FFFFFF", stroke: null, textColor: "#1D4ED8" },
  );
  const compactWorkJumpIds = addActionButton(
    doc,
    userAppPage.id,
    "개인 작업 보기",
    { x: 924, y: 728, w: 176, h: 40, rotation: 0 },
    { type: "scrollTo", targetNodeId: compactWorkLabelIds[0]!, axis: "y", offset: -24, transition: { type: "smart", duration: 220, easing: "ease-out" } },
    { fill: "#DBEAFE", stroke: null, textColor: "#0F172A" },
  );

  const userAppCompactIds = [
    ...compactHeroIds,
    ...compactStatIds,
    ...compactFeatureIds,
    ...compactMessageJumpIds,
    ...compactWorkJumpIds,
    ...compactSessionLabelIds,
    ...(compactAuthLoginId ? [compactAuthLoginId] : []),
    ...(compactAuthProfileId ? [compactAuthProfileId] : []),
    ...compactRuntimeIds,
    ...compactCredentialIds,
    ...compactMessagingLabelIds,
    ...(compactChatListId ? [compactChatListId] : []),
    ...(compactChatRoomId ? [compactChatRoomId] : []),
    ...(compactNotificationId ? [compactNotificationId] : []),
    ...compactFeatureGridIds,
    ...compactPassCriteriaIds,
    ...compactWorkLabelIds,
    ...compactTodoIds,
    ...compactNoteIds,
    ...compactKanbanIds,
    ...compactWorkFeatureIds,
    ...compactWorkCriteriaIds,
  ];

  markNodesHidden(doc, userAppCompactIds, true);
  setBreakpointHidden(doc, userAppDesktopIds, USER_APP_COMPACT_BREAKPOINT_ID, true);
  setBreakpointHidden(doc, userAppCompactIds, USER_APP_COMPACT_BREAKPOINT_ID, false);
  setBreakpointFrame(doc, userAppPage.id, USER_APP_COMPACT_BREAKPOINT_ID, { w: 1180, h: 6840 });

  const userMobileHeroIds = addHero(
    doc,
    userAppPage.id,
    "NULL 통합 검증 서비스",
    "모바일에서도 로그인, 메시지, 알림, 개인 작업 흐름이 겹치지 않고 읽혀야 하는 사용자 앱 레이아웃입니다.",
    { x: 20, y: 110, w: MOBILE_CONTENT_WIDTH, h: 260, rotation: 0 },
  );
  const userMobileStatIds = addStats(doc, userAppPage.id, [
    { label: "서비스 면", value: "3개", x: 20, y: 400, w: 160, h: 104 },
    { label: "데모 계정", value: "3종", x: 210, y: 400, w: 160, h: 104 },
    { label: "시드 메시지", value: "3건", x: 20, y: 520, w: 160, h: 104 },
    { label: "활성 알림", value: "2건", x: 210, y: 520, w: 160, h: 104 },
    { label: "로그인 흐름", value: "실동작", x: 20, y: 640, w: 350, h: 104 },
  ]);
  const userMobileFeatureIds = addDarkFeatureCard(
    doc,
    userAppPage.id,
    "모바일 사용자 앱",
    "불필요한 교차 이동 카드는 제거하고 핵심 섹션으로만 빠르게 이동합니다.",
    { x: 20, y: 768, w: MOBILE_CONTENT_WIDTH, h: 132, rotation: 0 },
  );
  const userMobileSessionLabelIds: string[] = [];
  const userMobileAuthLoginId = addScaledPreset(doc, userAppPage.id, "asset-auth-login", { x: 20, y: 1210 }, 0.78);
  const userMobileAuthProfileId = addScaledPreset(doc, userAppPage.id, "asset-auth-profile", { x: 20, y: 1630 }, 0.78);
  const userMobileRuntimeIds = addRuntimeValuePanel(
    doc,
    userAppPage.id,
    "현재 세션 상태",
    "모바일에서도 세션 값이 동일하게 반영되어야 합니다.",
    { x: 20, y: 2050, w: MOBILE_CONTENT_WIDTH, h: 430, rotation: 0 },
    [
      { label: "로그인 여부", token: "$app_user.logged_in" },
      { label: "세션 이메일", token: "$app_user.email" },
      { label: "표시 이름", token: "$app_user.display_name" },
      { label: "역할", token: "$app_user.role" },
      { label: "최근 액션 성공", token: "service_last_ok" },
    ],
  );
  const userMobileCredentialIds = addCredentialPanel(doc, userAppPage.id, credentials, { x: 20, y: 2500, w: MOBILE_CONTENT_WIDTH, h: 600, rotation: 0 });
  const userMobileMessagingLabelIds = addSectionLabel(doc, userAppPage.id, "메시지와 알림", 20, 3130);
  const userMobileChatId = addScaledPreset(doc, userAppPage.id, "asset-chat-working", { x: 20, y: 3180 }, 0.94);
  const userMobileNotificationId = addScaledPreset(doc, userAppPage.id, "asset-notification-center", { x: 20, y: 3700 }, 0.92);
  const userMobileFeatureGridIds = addFeatureGridPanel(
    doc,
    userAppPage.id,
    "모바일에서 바로 확인할 것",
    [
      { label: "로그인", value: "계정 정보 반영", accent: "#1D4ED8" },
      { label: "채팅", value: "메시지 즉시 반영", accent: "#7C3AED" },
      { label: "알림", value: "실데이터 노출", accent: "#EA580C" },
      { label: "안정성", value: "겹침 없는 단일 열", accent: "#0F766E" },
    ],
    { x: 20, y: 4340, w: MOBILE_CONTENT_WIDTH, h: 450, rotation: 0 },
  );
  const userMobilePassCriteriaIds = addBulletListPanel(
    doc,
    userAppPage.id,
    "모바일 합격 기준",
    [
      { title: "세션 카드와 메시지 카드가 가로 스크롤 없이 보인다", meta: "텍스트 잘림과 겹침 금지" },
      { title: "알림과 채팅이 같은 흐름 안에서 읽힌다", meta: "숨겨진 데이터 없이 노출" },
      { title: "버튼과 입력이 한 손 폭 안에서 눌린다", meta: "겹친 CTA 금지" },
      { title: "스크롤 흐름이 자연스럽고 섹션 이동이 유지된다", meta: "고정 폭 장식 금지" },
    ],
    { x: 20, y: 4820, w: MOBILE_CONTENT_WIDTH, h: 390, rotation: 0 },
    { accent: "#1D4ED8", subtitle: "모바일은 축소판이 아니라 실제 서비스 사용 흐름으로 읽혀야 합니다." },
  );
  const userMobileWorkLabelIds = addSectionLabel(doc, userAppPage.id, "개인 작업 흐름", 20, 5240);
  const userMobileTodoIds = addTodoPanel(doc, userAppPage.id, { x: 20, y: 5290, w: MOBILE_CONTENT_WIDTH, h: 470, rotation: 0 });
  const userMobileNoteIds = addNotePanel(doc, userAppPage.id, { x: 20, y: 5780, w: MOBILE_CONTENT_WIDTH, h: 560, rotation: 0 });
  const userMobileKanbanIds = addKanbanPanel(doc, userAppPage.id, { x: 20, y: 6360, w: MOBILE_CONTENT_WIDTH, h: 520, rotation: 0 });
  const userMobileWorkFeatureIds = addFeatureGridPanel(
    doc,
    userAppPage.id,
    "개인 작업 핵심 확인",
    [
      { label: "할 일", value: "즉시 추가", accent: "#1D4ED8" },
      { label: "노트", value: "내용 유지", accent: "#7C3AED" },
      { label: "칸반", value: "컬럼 표시", accent: "#0F766E" },
      { label: "레이아웃", value: "겹침 없음", accent: "#EA580C" },
    ],
    { x: 20, y: 6900, w: MOBILE_CONTENT_WIDTH, h: 450, rotation: 0 },
  );
  const userMobileWorkCriteriaIds = addBulletListPanel(
    doc,
    userAppPage.id,
    "모바일 개인 작업 기준",
    [
      { title: "할 일 추가 버튼과 입력이 같은 줄에서 겹치지 않는다", meta: "단일 열 CTA 유지" },
      { title: "노트와 칸반 콘텐츠가 카드 표면 밖으로 넘치지 않는다", meta: "overflow 금지" },
      { title: "모바일에서도 데이터 바인딩이 유지된다", meta: "정적 장식이면 실패" },
      { title: "긴 텍스트와 상태 문자열도 줄바꿈 안에서 유지된다", meta: "깨짐과 겹침 금지" },
    ],
    { x: 20, y: 7370, w: MOBILE_CONTENT_WIDTH, h: 500, rotation: 0 },
    { accent: "#0F766E", subtitle: "모바일은 데모가 아니라 실제 운영 가능한 단일 열 화면으로 정리합니다." },
  );
  const userMobileMessageJumpIds = addActionButton(
    doc,
    userAppPage.id,
    "메시지 보기",
    { x: 20, y: 918, w: 160, h: 40, rotation: 0 },
    { type: "scrollTo", targetNodeId: userMobileMessagingLabelIds[0]!, axis: "y", offset: -20, transition: { type: "smart", duration: 220, easing: "ease-out" } },
    { fill: "#FFFFFF", stroke: null, textColor: "#1D4ED8" },
  );
  const userMobileWorkJumpIds = addActionButton(
    doc,
    userAppPage.id,
    "개인 작업 보기",
    { x: 210, y: 918, w: 160, h: 40, rotation: 0 },
    { type: "scrollTo", targetNodeId: userMobileWorkLabelIds[0]!, axis: "y", offset: -20, transition: { type: "smart", duration: 220, easing: "ease-out" } },
    { fill: "#DBEAFE", stroke: null, textColor: "#0F172A" },
  );

  const userAppMobileIds = [
    ...userMobileHeroIds,
    ...userMobileStatIds,
    ...userMobileFeatureIds,
    ...userMobileMessageJumpIds,
    ...userMobileWorkJumpIds,
    ...userMobileSessionLabelIds,
    ...(userMobileAuthLoginId ? [userMobileAuthLoginId] : []),
    ...(userMobileAuthProfileId ? [userMobileAuthProfileId] : []),
    ...userMobileRuntimeIds,
    ...userMobileCredentialIds,
    ...userMobileMessagingLabelIds,
    ...(userMobileChatId ? [userMobileChatId] : []),
    ...(userMobileNotificationId ? [userMobileNotificationId] : []),
    ...userMobileFeatureGridIds,
    ...userMobilePassCriteriaIds,
    ...userMobileWorkLabelIds,
    ...userMobileTodoIds,
    ...userMobileNoteIds,
    ...userMobileKanbanIds,
    ...userMobileWorkFeatureIds,
    ...userMobileWorkCriteriaIds,
  ];

  markNodesHidden(doc, userAppMobileIds, true);
  setBreakpointHidden(doc, userAppDesktopIds, USER_APP_MOBILE_BREAKPOINT_ID, true);
  setBreakpointHidden(doc, userAppCompactIds, USER_APP_MOBILE_BREAKPOINT_ID, true);
  setBreakpointHidden(doc, userAppMobileIds, USER_APP_MOBILE_BREAKPOINT_ID, false);
  setBreakpointFrame(doc, userAppPage.id, USER_APP_MOBILE_BREAKPOINT_ID, { w: MOBILE_PAGE_WIDTH, h: 8040 });

  setPageBreakpoints(doc, partnerPage.id, PARTNER_PORTAL_BREAKPOINTS);
  const partnerDesktopHeroIds = addHero(
    doc,
    partnerPage.id,
    "파트너 포털",
    "예약 운영, 고객 지원 응답, CRM 단계 이동을 실제 포털 화면처럼 확인하는 두 번째 완성 페이지입니다. 이번 배치는 예약, 티켓, CRM 세 흐름을 먼저 닫습니다.",
    110,
  );
  const partnerDesktopStatIds = addStats(doc, partnerPage.id, [
    { label: "예약 리소스", value: "1개", x: 40 },
    { label: "기본 티켓 큐", value: "1개", x: 308 },
    { label: "시드 예약", value: "2건", x: 576 },
    { label: "시드 티켓", value: "1건", x: 844 },
    { label: "현재 배치", value: "예약·티켓·CRM", x: 1112 },
  ], 310);
  const partnerDesktopFeatureIds = addDarkFeatureCard(
    doc,
    partnerPage.id,
    "파트너 포털 검증 포인트",
    "Stripe Billing과 Notion의 운영 포털처럼 예약, 티켓, CRM, 승인 흐름을 한 화면에서 차례대로 검증합니다.",
    { x: 40, y: 460, w: 1560, h: 132, rotation: 0 },
  );
  const partnerDesktopReservationCreateIds = addReservationCreatePanel(doc, partnerPage.id, { x: 40, y: 620, w: 760, h: 530, rotation: 0 });
  const partnerDesktopTicketCreateIds = addTicketCreatePanel(doc, partnerPage.id, { x: 840, y: 620, w: 760, h: 530, rotation: 0 });
  const partnerDesktopReservationStateIds = addReservationStatePanel(doc, partnerPage.id, { x: 40, y: 1180, w: 760, h: 320, rotation: 0 });
  const partnerDesktopTicketReplyIds = addTicketReplyPanel(doc, partnerPage.id, { x: 840, y: 1180, w: 760, h: 610, rotation: 0 });
  const partnerDesktopCrmIds = addCrmLeadMovePanel(doc, partnerPage.id, { x: 40, y: 1820, w: 760, h: 520, rotation: 0 });
  const partnerDesktopInfoIds = addInfoPanel(
    doc,
    partnerPage.id,
    "파트너 포털 검증 기준",
    [
      "예약 생성과 확정, 티켓 생성과 응답, CRM 단계 이동, 승인 문서 상태 전이가 모두 이어져야 합니다.",
      "운영자용 교차 이동 카드는 제거하고 같은 포털 안에서 섹션 점프만 남겼습니다.",
      "긴 텍스트나 상태값이 들어와도 카드 겹침 없이 읽혀야 합니다.",
    ],
    { x: 840, y: 1820, w: 760, h: 220, rotation: 0 },
  );

  const partnerDesktopApprovalIds = addApprovalDecisionPanel(doc, partnerPage.id, { x: 840, y: 2060, w: 760, h: 520, rotation: 0 });
  const partnerDesktopReservationJumpIds = addActionButton(
    doc,
    partnerPage.id,
    "예약",
    { x: 916, y: 506, w: 146, h: 40, rotation: 0 },
    { type: "scrollTo", targetNodeId: partnerDesktopReservationCreateIds[0]!, axis: "y", offset: -24, transition: { type: "smart", duration: 220, easing: "ease-out" } },
    { fill: "#FFFFFF", stroke: null, textColor: "#1D4ED8" },
  );
  const partnerDesktopTicketJumpIds = addActionButton(
    doc,
    partnerPage.id,
    "티켓",
    { x: 1076, y: 506, w: 146, h: 40, rotation: 0 },
    { type: "scrollTo", targetNodeId: partnerDesktopTicketCreateIds[0]!, axis: "y", offset: -24, transition: { type: "smart", duration: 220, easing: "ease-out" } },
    { fill: "#FFFFFF", stroke: null, textColor: "#1D4ED8" },
  );
  const partnerDesktopCrmJumpIds = addActionButton(
    doc,
    partnerPage.id,
    "CRM",
    { x: 1236, y: 506, w: 146, h: 40, rotation: 0 },
    { type: "scrollTo", targetNodeId: partnerDesktopCrmIds[0]!, axis: "y", offset: -24, transition: { type: "smart", duration: 220, easing: "ease-out" } },
    { fill: "#FFFFFF", stroke: null, textColor: "#1D4ED8" },
  );
  const partnerDesktopApprovalJumpIds = addActionButton(
    doc,
    partnerPage.id,
    "승인",
    { x: 1396, y: 506, w: 164, h: 40, rotation: 0 },
    { type: "scrollTo", targetNodeId: partnerDesktopApprovalIds[0]!, axis: "y", offset: -24, transition: { type: "smart", duration: 220, easing: "ease-out" } },
    { fill: "#DBEAFE", stroke: null, textColor: "#0F172A" },
  );
  const partnerDesktopIds = [
    ...partnerDesktopHeroIds,
    ...partnerDesktopStatIds,
    ...partnerDesktopFeatureIds,
    ...partnerDesktopReservationJumpIds,
    ...partnerDesktopTicketJumpIds,
    ...partnerDesktopCrmJumpIds,
    ...partnerDesktopApprovalJumpIds,
    ...partnerDesktopReservationCreateIds,
    ...partnerDesktopTicketCreateIds,
    ...partnerDesktopReservationStateIds,
    ...partnerDesktopTicketReplyIds,
    ...partnerDesktopCrmIds,
    ...partnerDesktopInfoIds,
    ...partnerDesktopApprovalIds,
  ];

  const partnerCompactHeroIds = addHero(
    doc,
    partnerPage.id,
    "파트너 포털",
    "예약 생성과 상태 전이, 고객 지원 티켓 생성과 응답, CRM 단계 이동, 승인 문서 상태를 좁은 데스크톱에서도 한 화면 흐름으로 검증합니다.",
    { x: 40, y: 110, w: 1100, h: 272, rotation: 0 },
  );
  const partnerCompactStatIds = addStats(
    doc,
    partnerPage.id,
    [
      { label: "예약 리소스", value: "1개", x: 40, y: 412 },
      { label: "기본 티켓 큐", value: "1개", x: 310, y: 412 },
      { label: "시드 예약", value: "2건", x: 580, y: 412 },
      { label: "시드 티켓", value: "1건", x: 40, y: 532 },
      { label: "현재 배치", value: "예약·티켓·CRM", x: 310, y: 532 },
    ],
    412,
  );
  const partnerCompactFeatureIds = addDarkFeatureCard(
    doc,
    partnerPage.id,
    "좁은 데스크톱 파트너 포털",
    "교차 이동 카드를 덜어내고, 예약부터 승인까지 한 열 흐름으로 차례대로 검증합니다.",
    { x: 40, y: 664, w: 1100, h: 132, rotation: 0 },
  );
  const partnerCompactReservationCreateIds = addReservationCreatePanel(doc, partnerPage.id, { x: 40, y: 944, w: 1100, h: 530, rotation: 0 });
  const partnerCompactTicketCreateIds = addTicketCreatePanel(doc, partnerPage.id, { x: 40, y: 1498, w: 1100, h: 530, rotation: 0 });
  const partnerCompactReservationStateIds = addReservationStatePanel(doc, partnerPage.id, { x: 40, y: 2052, w: 1100, h: 320, rotation: 0 });
  const partnerCompactTicketReplyIds = addTicketReplyPanel(doc, partnerPage.id, { x: 40, y: 2396, w: 1100, h: 610, rotation: 0 });
  const partnerCompactCrmIds = addCrmLeadMovePanel(doc, partnerPage.id, { x: 40, y: 3030, w: 1100, h: 520, rotation: 0 });
  const partnerCompactApprovalIds = addApprovalDecisionPanel(doc, partnerPage.id, { x: 40, y: 3574, w: 1100, h: 520, rotation: 0 });
  const partnerCompactInfoIds = addInfoPanel(
    doc,
    partnerPage.id,
    "파트너 포털 검증 기준",
    [
      "예약 생성/확정, 티켓 생성/응답, CRM 단계 이동, 승인 문서 승인까지 한 열 흐름으로 확인합니다.",
      "좁은 데스크톱에서는 2열 대신 1열 배치로 바꿔 카드 겹침을 없앱니다.",
      "모든 CTA는 같은 포털 안의 섹션 점프로 정리합니다.",
    ],
    { x: 40, y: 4118, w: 1100, h: 196, rotation: 0 },
  );
  const partnerCompactReservationJumpIds = addActionButton(
    doc,
    partnerPage.id,
    "예약",
    { x: 40, y: 820, w: 250, h: 40, rotation: 0 },
    { type: "scrollTo", targetNodeId: partnerCompactReservationCreateIds[0]!, axis: "y", offset: -24, transition: { type: "smart", duration: 220, easing: "ease-out" } },
  );
  const partnerCompactTicketJumpIds = addActionButton(
    doc,
    partnerPage.id,
    "티켓",
    { x: 320, y: 820, w: 250, h: 40, rotation: 0 },
    { type: "scrollTo", targetNodeId: partnerCompactTicketCreateIds[0]!, axis: "y", offset: -24, transition: { type: "smart", duration: 220, easing: "ease-out" } },
  );
  const partnerCompactCrmJumpIds = addActionButton(
    doc,
    partnerPage.id,
    "CRM",
    { x: 600, y: 820, w: 250, h: 40, rotation: 0 },
    { type: "scrollTo", targetNodeId: partnerCompactCrmIds[0]!, axis: "y", offset: -24, transition: { type: "smart", duration: 220, easing: "ease-out" } },
  );
  const partnerCompactApprovalJumpIds = addActionButton(
    doc,
    partnerPage.id,
    "승인",
    { x: 880, y: 820, w: 260, h: 40, rotation: 0 },
    { type: "scrollTo", targetNodeId: partnerCompactApprovalIds[0]!, axis: "y", offset: -24, transition: { type: "smart", duration: 220, easing: "ease-out" } },
  );
  const partnerCompactIds = [
    ...partnerCompactHeroIds,
    ...partnerCompactStatIds,
    ...partnerCompactFeatureIds,
    ...partnerCompactReservationJumpIds,
    ...partnerCompactTicketJumpIds,
    ...partnerCompactCrmJumpIds,
    ...partnerCompactApprovalJumpIds,
    ...partnerCompactReservationCreateIds,
    ...partnerCompactTicketCreateIds,
    ...partnerCompactReservationStateIds,
    ...partnerCompactTicketReplyIds,
    ...partnerCompactCrmIds,
    ...partnerCompactApprovalIds,
    ...partnerCompactInfoIds,
  ];

  markNodesHidden(doc, partnerCompactIds, true);
  setBreakpointHidden(doc, partnerDesktopIds, PARTNER_PORTAL_COMPACT_BREAKPOINT_ID, true);
  setBreakpointHidden(doc, partnerCompactIds, PARTNER_PORTAL_COMPACT_BREAKPOINT_ID, false);
  setBreakpointFrame(doc, partnerPage.id, PARTNER_PORTAL_COMPACT_BREAKPOINT_ID, { w: 1180, h: 4520 });

  const partnerMobileHeroIds = addHero(
    doc,
    partnerPage.id,
    "파트너 포털",
    "모바일에서도 예약, 티켓, CRM, 승인 흐름을 한 열 포털 화면으로 검증합니다.",
    { x: 20, y: 110, w: MOBILE_CONTENT_WIDTH, h: 260, rotation: 0 },
  );
  const partnerMobileStatIds = addStats(doc, partnerPage.id, [
    { label: "예약 리소스", value: "1개", x: 20, y: 400, w: 160, h: 104 },
    { label: "기본 티켓 큐", value: "1개", x: 210, y: 400, w: 160, h: 104 },
    { label: "시드 예약", value: "2건", x: 20, y: 520, w: 160, h: 104 },
    { label: "시드 티켓", value: "1건", x: 210, y: 520, w: 160, h: 104 },
    { label: "승인 흐름", value: "실동작", x: 20, y: 640, w: 350, h: 104 },
  ]);
  const partnerMobileFeatureIds = addDarkFeatureCard(
    doc,
    partnerPage.id,
    "모바일 파트너 포털",
    "교차 이동 대신 예약, 티켓, CRM, 승인 섹션으로만 빠르게 이동합니다.",
    { x: 20, y: 768, w: MOBILE_CONTENT_WIDTH, h: 132, rotation: 0 },
  );
  const partnerMobileReservationIds = addReservationCreatePanel(doc, partnerPage.id, { x: 20, y: 1030, w: MOBILE_CONTENT_WIDTH, h: 560, rotation: 0 });
  const partnerMobileReservationStateIds = addReservationStatePanel(doc, partnerPage.id, { x: 20, y: 1610, w: MOBILE_CONTENT_WIDTH, h: 470, rotation: 0 });
  const partnerMobileTicketCreateIds = addTicketCreatePanel(doc, partnerPage.id, { x: 20, y: 2100, w: MOBILE_CONTENT_WIDTH, h: 560, rotation: 0 });
  const partnerMobileTicketReplyIds = addTicketReplyPanel(doc, partnerPage.id, { x: 20, y: 2680, w: MOBILE_CONTENT_WIDTH, h: 660, rotation: 0 });
  const partnerMobileCrmIds = addCrmLeadMovePanel(doc, partnerPage.id, { x: 20, y: 3360, w: MOBILE_CONTENT_WIDTH, h: 560, rotation: 0 });
  const partnerMobileApprovalIds = addApprovalDecisionPanel(doc, partnerPage.id, { x: 20, y: 3940, w: MOBILE_CONTENT_WIDTH, h: 620, rotation: 0 });
  const partnerMobileInfoIds = addInfoPanel(
    doc,
    partnerPage.id,
    "모바일 파트너 포털 기준",
    [
      "예약부터 승인까지 모든 흐름이 한 손 스크롤 안에서 이어져야 합니다.",
      "버튼과 입력은 한 줄에서 겹치지 않고 단일 열로 정렬되어야 합니다.",
      "긴 상태 문자열과 문서 제목도 카드 바깥으로 넘치면 안 됩니다.",
    ],
    { x: 20, y: 4580, w: MOBILE_CONTENT_WIDTH, h: 220, rotation: 0 },
  );
  const partnerMobileReservationJumpIds = addActionButton(
    doc,
    partnerPage.id,
    "예약",
    { x: 20, y: 918, w: 160, h: 40, rotation: 0 },
    { type: "scrollTo", targetNodeId: partnerMobileReservationIds[0]!, axis: "y", offset: -20, transition: { type: "smart", duration: 220, easing: "ease-out" } },
  );
  const partnerMobileTicketJumpIds = addActionButton(
    doc,
    partnerPage.id,
    "티켓",
    { x: 210, y: 918, w: 160, h: 40, rotation: 0 },
    { type: "scrollTo", targetNodeId: partnerMobileTicketCreateIds[0]!, axis: "y", offset: -20, transition: { type: "smart", duration: 220, easing: "ease-out" } },
  );
  const partnerMobileCrmJumpIds = addActionButton(
    doc,
    partnerPage.id,
    "CRM",
    { x: 20, y: 970, w: 160, h: 40, rotation: 0 },
    { type: "scrollTo", targetNodeId: partnerMobileCrmIds[0]!, axis: "y", offset: -20, transition: { type: "smart", duration: 220, easing: "ease-out" } },
  );
  const partnerMobileApprovalJumpIds = addActionButton(
    doc,
    partnerPage.id,
    "승인",
    { x: 210, y: 970, w: 160, h: 40, rotation: 0 },
    { type: "scrollTo", targetNodeId: partnerMobileApprovalIds[0]!, axis: "y", offset: -20, transition: { type: "smart", duration: 220, easing: "ease-out" } },
  );
  const partnerMobileIds = [
    ...partnerMobileHeroIds,
    ...partnerMobileStatIds,
    ...partnerMobileFeatureIds,
    ...partnerMobileReservationJumpIds,
    ...partnerMobileTicketJumpIds,
    ...partnerMobileCrmJumpIds,
    ...partnerMobileApprovalJumpIds,
    ...partnerMobileReservationIds,
    ...partnerMobileReservationStateIds,
    ...partnerMobileTicketCreateIds,
    ...partnerMobileTicketReplyIds,
    ...partnerMobileCrmIds,
    ...partnerMobileApprovalIds,
    ...partnerMobileInfoIds,
  ];

  markNodesHidden(doc, partnerMobileIds, true);
  setBreakpointHidden(doc, partnerDesktopIds, PARTNER_PORTAL_MOBILE_BREAKPOINT_ID, true);
  setBreakpointHidden(doc, partnerCompactIds, PARTNER_PORTAL_MOBILE_BREAKPOINT_ID, true);
  setBreakpointHidden(doc, partnerMobileIds, PARTNER_PORTAL_MOBILE_BREAKPOINT_ID, false);
  setBreakpointFrame(doc, partnerPage.id, PARTNER_PORTAL_MOBILE_BREAKPOINT_ID, { w: MOBILE_PAGE_WIDTH, h: 4860 });

  setPageBreakpoints(doc, opsPage.id, OPS_CONSOLE_BREAKPOINTS);
  const opsDesktopStartNodeIds = new Set(Object.keys(doc.nodes));
  addHero(
    doc,
    opsPage.id,
    "운영 콘솔",
    "배포된 에디터 산출물에서 릴리스 기록, 런북 갱신, 텔레메트리 확인, 정책 평가까지 한 화면에서 검증합니다.",
    110,
  );
  addStats(
    doc,
    opsPage.id,
    [
      { label: "릴리스 수", value: "{{ ops_release_count }}", x: 40 },
      { label: "정책 규칙", value: "{{ ops_policy_rule_count }}", x: 308 },
      { label: "리스크 인시던트", value: "{{ ops_risk_incident_count }}", x: 576 },
      { label: "승인 요청", value: "{{ ops_approval_request_count }}", x: 844 },
      { label: "최근 환경", value: "{{ ops_latest_release_env }}", x: 1112 },
    ],
    310,
  );
  addDarkFeatureCard(
    doc,
    opsPage.id,
    "운영 콘솔 검증 포인트",
    "Vercel Observability처럼 절제된 상단에서 릴리스, 과금, 정책, 로그 섹션으로만 빠르게 이동합니다.",
    { x: 40, y: 460, w: 1560, h: 132, rotation: 0 },
  );
  const opsDesktopReleaseIds = addOpsReleasePanel(doc, opsPage.id, { x: 40, y: 620, w: 760, h: 690, rotation: 0 });
  const opsDesktopPolicyIds = addPolicyEvaluationPanel(doc, opsPage.id, { x: 840, y: 620, w: 760, h: 810, rotation: 0 });
  const opsDesktopBillingIds = addBillingSettlementPanel(doc, opsPage.id, { x: 840, y: 1460, w: 760, h: 860, rotation: 0 });
  addRuntimeValuePanel(
    doc,
    opsPage.id,
    "런북 요약",
    "런북을 생성한 뒤 이 값들이 즉시 갱신되어야 합니다.",
    { x: 40, y: 1340, w: 760, h: 310, rotation: 0 },
    [
      { label: "릴리스 단계", token: "ops_runbook_release" },
      { label: "롤백 단계", token: "ops_runbook_rollback" },
      { label: "백업 단계", token: "ops_runbook_backup" },
    ],
  );
  addRuntimeValuePanel(
    doc,
    opsPage.id,
    "운영 상태",
    "배포, 백업, 정책 관련 값이 같은 운영 콘솔에서 계속 보여야 합니다.",
    { x: 40, y: 1680, w: 760, h: 250, rotation: 0 },
    [
      { label: "배포 시각", token: "ops_deployed_at" },
      { label: "최근 릴리스 시각", token: "ops_latest_release_at" },
      { label: "최근 백업 종류", token: "ops_last_backup_kind" },
    ],
  );
  const opsDesktopTelemetryIds = addOpsTelemetryPanel(doc, opsPage.id, { x: 40, y: 2050, w: 760, h: 438, rotation: 0 });
  addOpsAuditPanel(doc, opsPage.id, { x: 840, y: 2050, w: 760, h: 438, rotation: 0 });
  addActionButton(
    doc,
    opsPage.id,
    "릴리스",
    { x: 40, y: 590, w: 156, h: 44, rotation: 0 },
    { type: "scrollTo", targetNodeId: opsDesktopReleaseIds[0]!, axis: "y", offset: -24, transition: { type: "smart", duration: 220, easing: "ease-out" } },
  );
  addActionButton(
    doc,
    opsPage.id,
    "정책",
    { x: 214, y: 590, w: 156, h: 44, rotation: 0 },
    { type: "scrollTo", targetNodeId: opsDesktopPolicyIds[0]!, axis: "y", offset: -24, transition: { type: "smart", duration: 220, easing: "ease-out" } },
  );
  addActionButton(
    doc,
    opsPage.id,
    "과금",
    { x: 388, y: 590, w: 156, h: 44, rotation: 0 },
    { type: "scrollTo", targetNodeId: opsDesktopBillingIds[0]!, axis: "y", offset: -24, transition: { type: "smart", duration: 220, easing: "ease-out" } },
  );
  addActionButton(
    doc,
    opsPage.id,
    "로그",
    { x: 562, y: 590, w: 156, h: 44, rotation: 0 },
    { type: "scrollTo", targetNodeId: opsDesktopTelemetryIds[0]!, axis: "y", offset: -24, transition: { type: "smart", duration: 220, easing: "ease-out" } },
  );
  addInfoPanel(
    doc,
    opsPage.id,
    "운영 콘솔 검증 기준",
    [
      "릴리스 기록, 정책 평가, 과금/정산, 텔레메트리, 감사 로그가 한 콘솔 안에서 모두 이어져야 합니다.",
      "교차 이동 카드는 제거하고 섹션 점프와 데이터 카드만 남겨 실제 운영 화면처럼 읽히게 합니다.",
      "공개 URL에서도 같은 값과 같은 액션이 그대로 동작해야 합니다.",
    ],
    { x: 40, y: 2520, w: 1560, h: 180, rotation: 0 },
  );
  const opsDesktopIds = Object.keys(doc.nodes).filter((nodeId) => !opsDesktopStartNodeIds.has(nodeId));

  const opsCompactHeroIds = addHero(
    doc,
    opsPage.id,
    "운영 콘솔",
    "좁은 데스크톱에서도 릴리스, 과금, 정책, 텔레메트리, 로그를 한 화면에서 유지하는 운영 콘솔입니다.",
    { x: 40, y: 110, w: 1100, h: 280, rotation: 0 },
  );
  const opsCompactStatIds = addStats(
    doc,
    opsPage.id,
    [
      { label: "릴리스 수", value: "{{ ops_release_count }}", x: 40, y: 420 },
      { label: "정책 규칙", value: "{{ ops_policy_rule_count }}", x: 310, y: 420 },
      { label: "대기 작업", value: "{{ ops_queued_jobs }}", x: 580, y: 420 },
      { label: "앱 감사", value: "{{ ops_app_audit_24h }}", x: 40, y: 548 },
      { label: "최근 환경", value: "{{ ops_latest_release_env }}", x: 310, y: 548 },
    ],
    420,
  );
  const opsCompactFeatureIds = addDarkFeatureCard(
    doc,
    opsPage.id,
    "좁은 데스크톱 운영 콘솔",
    "교차 이동을 걷어내고 핵심 운영 섹션만 남겨 단일 열에서도 빠르게 점프할 수 있게 정리합니다.",
    { x: 40, y: 676, w: 1100, h: 132, rotation: 0 },
  );
  const opsCompactReleaseIds = addOpsReleasePanel(doc, opsPage.id, { x: 40, y: 940, w: 1100, h: 760, rotation: 0 });
  const opsCompactRunbookIds = addRuntimeValuePanel(
    doc,
    opsPage.id,
    "런북 요약",
    "런북 생성 뒤 이 값들이 바로 갱신되어야 합니다.",
    { x: 40, y: 1730, w: 1100, h: 310, rotation: 0 },
    [
      { label: "릴리스 단계", token: "ops_runbook_release" },
      { label: "롤백 단계", token: "ops_runbook_rollback" },
      { label: "백업 단계", token: "ops_runbook_backup" },
    ],
  );
  const opsCompactStatusIds = addRuntimeValuePanel(
    doc,
    opsPage.id,
    "운영 상태",
    "배포, 백업, 정책 관련 값이 좁은 폭에서도 계속 보여야 합니다.",
    { x: 40, y: 2060, w: 1100, h: 250, rotation: 0 },
    [
      { label: "배포 시각", token: "ops_deployed_at" },
      { label: "최근 릴리스 시각", token: "ops_latest_release_at" },
      { label: "최근 백업 종류", token: "ops_last_backup_kind" },
    ],
  );
  const opsCompactPolicyIds = addPolicyEvaluationPanel(doc, opsPage.id, { x: 40, y: 2340, w: 1100, h: 810, rotation: 0 });
  const opsCompactBillingIds = addBillingSettlementPanel(doc, opsPage.id, { x: 40, y: 3240, w: 1100, h: 940, rotation: 0 });
  const opsCompactTelemetryIds = addOpsTelemetryPanel(doc, opsPage.id, { x: 40, y: 4210, w: 1100, h: 438, rotation: 0 });
  const opsCompactAuditIds = addOpsAuditPanel(doc, opsPage.id, { x: 40, y: 4670, w: 1100, h: 438, rotation: 0 });
  const opsCompactReleaseJumpIds = addActionButton(
    doc,
    opsPage.id,
    "릴리스",
    { x: 40, y: 820, w: 250, h: 44, rotation: 0 },
    { type: "scrollTo", targetNodeId: opsCompactReleaseIds[0]!, axis: "y", offset: -24, transition: { type: "smart", duration: 220, easing: "ease-out" } },
  );
  const opsCompactPolicyJumpIds = addActionButton(
    doc,
    opsPage.id,
    "정책",
    { x: 320, y: 820, w: 250, h: 44, rotation: 0 },
    { type: "scrollTo", targetNodeId: opsCompactPolicyIds[0]!, axis: "y", offset: -24, transition: { type: "smart", duration: 220, easing: "ease-out" } },
  );
  const opsCompactBillingJumpIds = addActionButton(
    doc,
    opsPage.id,
    "과금",
    { x: 600, y: 820, w: 250, h: 44, rotation: 0 },
    { type: "scrollTo", targetNodeId: opsCompactBillingIds[0]!, axis: "y", offset: -24, transition: { type: "smart", duration: 220, easing: "ease-out" } },
  );
  const opsCompactLogsJumpIds = addActionButton(
    doc,
    opsPage.id,
    "로그",
    { x: 880, y: 820, w: 260, h: 44, rotation: 0 },
    { type: "scrollTo", targetNodeId: opsCompactTelemetryIds[0]!, axis: "y", offset: -24, transition: { type: "smart", duration: 220, easing: "ease-out" } },
  );
  const opsCompactInfoIds = addInfoPanel(
    doc,
    opsPage.id,
    "좁은 데스크톱 운영 콘솔 기준",
    [
      "릴리스, 과금, 정책, 텔레메트리, 감사 로그가 단일 열에서도 모두 유지되어야 합니다.",
      "섹션 버튼은 같은 런타임 페이지 안에서 스마트 스크롤로만 이동합니다.",
      "공개 URL에서도 같은 액션과 같은 값이 그대로 보이는지 확인합니다.",
    ],
    { x: 40, y: 5130, w: 1100, h: 196, rotation: 0 },
  );
  const opsCompactIds = [
    ...opsCompactHeroIds,
    ...opsCompactStatIds,
    ...opsCompactFeatureIds,
    ...opsCompactReleaseIds,
    ...opsCompactRunbookIds,
    ...opsCompactStatusIds,
    ...opsCompactPolicyIds,
    ...opsCompactBillingIds,
    ...opsCompactTelemetryIds,
    ...opsCompactAuditIds,
    ...opsCompactReleaseJumpIds,
    ...opsCompactPolicyJumpIds,
    ...opsCompactBillingJumpIds,
    ...opsCompactLogsJumpIds,
    ...opsCompactInfoIds,
  ];

  markNodesHidden(doc, opsCompactIds, true);
  setBreakpointHidden(doc, opsDesktopIds, OPS_CONSOLE_COMPACT_BREAKPOINT_ID, true);
  setBreakpointHidden(doc, opsCompactIds, OPS_CONSOLE_COMPACT_BREAKPOINT_ID, false);
  setBreakpointFrame(doc, opsPage.id, OPS_CONSOLE_COMPACT_BREAKPOINT_ID, { w: 1180, h: 5590 });

  const opsMobileHeroIds = addHero(
    doc,
    opsPage.id,
    "운영 콘솔",
    "모바일에서도 릴리스, 과금, 정책, 텔레메트리, 감사 로그가 한 화면에서 읽혀야 합니다.",
    { x: 20, y: 110, w: MOBILE_CONTENT_WIDTH, h: 260, rotation: 0 },
  );
  const opsMobileStatIds = addStats(doc, opsPage.id, [
    { label: "릴리스 수", value: "{{ ops_release_count }}", x: 20, y: 400, w: 160, h: 104 },
    { label: "정책 규칙", value: "{{ ops_policy_rule_count }}", x: 210, y: 400, w: 160, h: 104 },
    { label: "대기 작업", value: "{{ ops_queued_jobs }}", x: 20, y: 520, w: 160, h: 104 },
    { label: "앱 감사", value: "{{ ops_app_audit_24h }}", x: 210, y: 520, w: 160, h: 104 },
    { label: "최근 환경", value: "{{ ops_latest_release_env }}", x: 20, y: 640, w: 350, h: 104 },
  ]);
  const opsMobileFeatureIds = addDarkFeatureCard(
    doc,
    opsPage.id,
    "모바일 운영 콘솔",
    "운영 화면은 교차 이동 대신 핵심 섹션 점프만 유지해 한 손 스크롤에서도 읽혀야 합니다.",
    { x: 20, y: 768, w: MOBILE_CONTENT_WIDTH, h: 132, rotation: 0 },
  );
  const opsMobileReleaseIds = addOpsReleasePanel(doc, opsPage.id, { x: 20, y: 1030, w: MOBILE_CONTENT_WIDTH, h: 860, rotation: 0 });
  const opsMobileRunbookIds = addRuntimeValuePanel(
    doc,
    opsPage.id,
    "런북 요약",
    "모바일에서도 런북 단계가 바로 보여야 합니다.",
    { x: 20, y: 1910, w: MOBILE_CONTENT_WIDTH, h: 320, rotation: 0 },
    [
      { label: "릴리스 단계", token: "ops_runbook_release" },
      { label: "롤백 단계", token: "ops_runbook_rollback" },
      { label: "백업 단계", token: "ops_runbook_backup" },
    ],
  );
  const opsMobileStatusIds = addRuntimeValuePanel(
    doc,
    opsPage.id,
    "운영 상태",
    "배포와 백업 값이 모바일에서도 읽혀야 합니다.",
    { x: 20, y: 2250, w: MOBILE_CONTENT_WIDTH, h: 280, rotation: 0 },
    [
      { label: "배포 시각", token: "ops_deployed_at" },
      { label: "최근 릴리스 시각", token: "ops_latest_release_at" },
      { label: "최근 백업 종류", token: "ops_last_backup_kind" },
    ],
  );
  const opsMobilePolicyIds = addPolicyEvaluationPanel(doc, opsPage.id, { x: 20, y: 2550, w: MOBILE_CONTENT_WIDTH, h: 900, rotation: 0 });
  const opsMobileBillingIds = addBillingSettlementPanel(doc, opsPage.id, { x: 20, y: 3470, w: MOBILE_CONTENT_WIDTH, h: 1000, rotation: 0 });
  const opsMobileTelemetryIds = addOpsTelemetryPanel(doc, opsPage.id, { x: 20, y: 4500, w: MOBILE_CONTENT_WIDTH, h: 460, rotation: 0 });
  const opsMobileAuditIds = addOpsAuditPanel(doc, opsPage.id, { x: 20, y: 4980, w: MOBILE_CONTENT_WIDTH, h: 460, rotation: 0 });
  const opsMobileInfoIds = addInfoPanel(
    doc,
    opsPage.id,
    "모바일 운영 콘솔 기준",
    [
      "릴리스, 정책, 과금, 로그가 한 손 폭 안에서 겹치지 않아야 합니다.",
      "섹션 버튼은 같은 공개 URL 안에서 스마트 스크롤로만 이동합니다.",
      "배포 후 실제 값과 액션 결과가 모바일에서도 동일하게 보여야 합니다.",
    ],
    { x: 20, y: 5460, w: MOBILE_CONTENT_WIDTH, h: 220, rotation: 0 },
  );
  const opsMobileReleaseJumpIds = addActionButton(
    doc,
    opsPage.id,
    "릴리스",
    { x: 20, y: 918, w: 160, h: 40, rotation: 0 },
    { type: "scrollTo", targetNodeId: opsMobileReleaseIds[0]!, axis: "y", offset: -20, transition: { type: "smart", duration: 220, easing: "ease-out" } },
  );
  const opsMobilePolicyJumpIds = addActionButton(
    doc,
    opsPage.id,
    "정책",
    { x: 210, y: 918, w: 160, h: 40, rotation: 0 },
    { type: "scrollTo", targetNodeId: opsMobilePolicyIds[0]!, axis: "y", offset: -20, transition: { type: "smart", duration: 220, easing: "ease-out" } },
  );
  const opsMobileBillingJumpIds = addActionButton(
    doc,
    opsPage.id,
    "과금",
    { x: 20, y: 970, w: 160, h: 40, rotation: 0 },
    { type: "scrollTo", targetNodeId: opsMobileBillingIds[0]!, axis: "y", offset: -20, transition: { type: "smart", duration: 220, easing: "ease-out" } },
  );
  const opsMobileLogsJumpIds = addActionButton(
    doc,
    opsPage.id,
    "로그",
    { x: 210, y: 970, w: 160, h: 40, rotation: 0 },
    { type: "scrollTo", targetNodeId: opsMobileTelemetryIds[0]!, axis: "y", offset: -20, transition: { type: "smart", duration: 220, easing: "ease-out" } },
  );
  const opsMobileIds = [
    ...opsMobileHeroIds,
    ...opsMobileStatIds,
    ...opsMobileFeatureIds,
    ...opsMobileReleaseJumpIds,
    ...opsMobilePolicyJumpIds,
    ...opsMobileBillingJumpIds,
    ...opsMobileLogsJumpIds,
    ...opsMobileReleaseIds,
    ...opsMobileRunbookIds,
    ...opsMobileStatusIds,
    ...opsMobilePolicyIds,
    ...opsMobileBillingIds,
    ...opsMobileTelemetryIds,
    ...opsMobileAuditIds,
    ...opsMobileInfoIds,
  ];

  markNodesHidden(doc, opsMobileIds, true);
  setBreakpointHidden(doc, opsDesktopIds, OPS_CONSOLE_MOBILE_BREAKPOINT_ID, true);
  setBreakpointHidden(doc, opsCompactIds, OPS_CONSOLE_MOBILE_BREAKPOINT_ID, true);
  setBreakpointHidden(doc, opsMobileIds, OPS_CONSOLE_MOBILE_BREAKPOINT_ID, false);
  setBreakpointFrame(doc, opsPage.id, OPS_CONSOLE_MOBILE_BREAKPOINT_ID, { w: MOBILE_PAGE_WIDTH, h: 5710 });

  normalizeIntegratedServiceNodeDesign(doc);
  return serializeDoc(doc);
}

export function buildIntegratedServiceThumbnailDataUrl() {
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f172a"/>
      <stop offset="52%" stop-color="#1d4ed8"/>
      <stop offset="100%" stop-color="#14b8a6"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" rx="32" fill="url(#bg)"/>
  <rect x="48" y="52" width="264" height="42" rx="21" fill="#dbeafe"/>
  <text x="72" y="79" font-family="Inter, Arial, sans-serif" font-size="20" font-weight="700" fill="#1d4ed8">NULL 실서비스 검증</text>
  <text x="64" y="188" font-family="Inter, Arial, sans-serif" font-size="64" font-weight="800" fill="#ffffff">NULL 통합 검증 서비스</text>
  <text x="64" y="246" font-family="Inter, Arial, sans-serif" font-size="26" font-weight="500" fill="#dbeafe">사용자 앱 / 파트너 포털 / 운영 콘솔을 전부 에디터 산출물로 완성하는 기준 프로젝트입니다.</text>
  <rect x="64" y="330" width="284" height="170" rx="28" fill="#ffffff" fill-opacity="0.14"/>
  <rect x="374" y="330" width="284" height="170" rx="28" fill="#ffffff" fill-opacity="0.14"/>
  <rect x="684" y="330" width="452" height="170" rx="28" fill="#ffffff" fill-opacity="0.14"/>
  <text x="92" y="378" font-family="Inter, Arial, sans-serif" font-size="18" font-weight="700" fill="#ffffff">사용자 앱</text>
  <text x="92" y="414" font-family="Inter, Arial, sans-serif" font-size="14" fill="#e2e8f0">로그인 · 세션 · 채팅 · 알림</text>
  <text x="402" y="378" font-family="Inter, Arial, sans-serif" font-size="18" font-weight="700" fill="#ffffff">파트너 포털</text>
  <text x="402" y="414" font-family="Inter, Arial, sans-serif" font-size="14" fill="#e2e8f0">예약 · 티켓 · CRM · 승인</text>
  <text x="712" y="378" font-family="Inter, Arial, sans-serif" font-size="18" font-weight="700" fill="#ffffff">운영 콘솔</text>
  <text x="712" y="414" font-family="Inter, Arial, sans-serif" font-size="14" fill="#e2e8f0">배포 · 과금 · 정책 · 운영 로그</text>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
