export type DevCodegenPayload = {
  meta: {
    name: string;
    type: string;
  };
  frame: {
    x: number;
    y: number;
    w: number;
    h: number;
  };
  style: {
    fill?: string | null;
    stroke?: {
      color: string;
      width: number;
    } | null;
    opacity?: number;
    radius?: number | { tl: number; tr: number; br: number; bl: number };
    blendMode?: string | null;
  };
  text?: {
    value: string;
    style?: {
      fontFamily?: string;
      fontSize?: number;
      fontWeight?: number;
      lineHeight?: number;
      letterSpacing?: number;
      align?: string;
      textCase?: string;
      fontFeatureSettings?: string;
      fontVariationSettings?: string;
    } | null;
  } | null;
  tokens?: {
    fillStyle?: string | null;
    strokeStyle?: string | null;
    effectStyle?: string | null;
    textStyle?: string | null;
    fillVariable?: string | null;
    strokeVariable?: string | null;
    activeMode?: string | null;
  };
  handoff?: {
    readyForDev?: boolean;
    codeLinks?: Array<{
      title: string;
      kind: string;
      url?: string | null;
      exportKey?: string | null;
    }>;
  };
};

function quote(value: string) {
  return JSON.stringify(value);
}

function px(value: number) {
  return `${Math.round(value * 100) / 100}px`;
}

function buildRadiusValue(radius: DevCodegenPayload["style"]["radius"]) {
  if (typeof radius === "number") return px(radius);
  if (!radius) return null;
  return `${px(radius.tl)} ${px(radius.tr)} ${px(radius.br)} ${px(radius.bl)}`;
}

function buildTokenCommentLines(tokens: DevCodegenPayload["tokens"]) {
  if (!tokens) return [];
  const lines = [
    tokens.activeMode ? `active mode: ${tokens.activeMode}` : null,
    tokens.fillStyle ? `fill style: ${tokens.fillStyle}` : null,
    tokens.strokeStyle ? `stroke style: ${tokens.strokeStyle}` : null,
    tokens.effectStyle ? `effect style: ${tokens.effectStyle}` : null,
    tokens.textStyle ? `text style: ${tokens.textStyle}` : null,
    tokens.fillVariable ? `fill variable: ${tokens.fillVariable}` : null,
    tokens.strokeVariable ? `stroke variable: ${tokens.strokeVariable}` : null,
  ].filter(Boolean) as string[];
  return lines.length ? lines.map((line) => `// ${line}`) : [];
}

function buildHandoffCommentLines(handoff: DevCodegenPayload["handoff"]) {
  if (!handoff) return [];
  const lines: string[] = [];
  if (handoff.readyForDev) lines.push("ready for dev: true");
  handoff.codeLinks?.slice(0, 3).forEach((link) => {
    const suffix = link.url ? ` ${link.url}` : link.exportKey ? ` ${link.exportKey}` : "";
    lines.push(`${link.kind}: ${link.title}${suffix}`);
  });
  return lines.map((line) => `// ${line}`);
}

export function buildReactStyleObjectSnippet(payload: DevCodegenPayload, constName = "nodeStyle") {
  const radiusValue = buildRadiusValue(payload.style.radius);
  const textStyle = payload.text?.style;
  const entries: string[] = [
    "position: \"absolute\"",
    "left: 0",
    "top: 0",
    `transform: ${quote(`translate(${px(payload.frame.x)}, ${px(payload.frame.y)})`)}`,
    `width: ${quote(px(payload.frame.w))}`,
    `height: ${quote(px(payload.frame.h))}`,
  ];

  if (payload.style.opacity != null) entries.push(`opacity: ${payload.style.opacity}`);
  if (payload.style.fill && payload.style.fill !== "transparent") entries.push(`background: ${quote(payload.style.fill)}`);
  if (payload.style.stroke && payload.style.stroke.width > 0 && payload.style.stroke.color !== "transparent") {
    entries.push(`border: ${quote(`${Math.max(1, payload.style.stroke.width)}px solid ${payload.style.stroke.color}`)}`);
  }
  if (radiusValue) entries.push(`borderRadius: ${quote(radiusValue)}`);
  if (payload.style.blendMode && payload.style.blendMode !== "normal") {
    entries.push(`mixBlendMode: ${quote(payload.style.blendMode)}`);
  }

  if (textStyle) {
    if (textStyle.fontFamily) entries.push(`fontFamily: ${quote(textStyle.fontFamily)}`);
    if (textStyle.fontSize) entries.push(`fontSize: ${quote(px(textStyle.fontSize))}`);
    if (textStyle.fontWeight) entries.push(`fontWeight: ${textStyle.fontWeight}`);
    if (textStyle.lineHeight) entries.push(`lineHeight: ${textStyle.lineHeight}`);
    if (textStyle.letterSpacing != null) entries.push(`letterSpacing: ${quote(`${textStyle.letterSpacing}px`)}`);
    if (textStyle.align) entries.push(`textAlign: ${quote(textStyle.align)}`);
    if (textStyle.fontFeatureSettings) entries.push(`fontFeatureSettings: ${quote(textStyle.fontFeatureSettings)}`);
    if (textStyle.fontVariationSettings) entries.push(`fontVariationSettings: ${quote(textStyle.fontVariationSettings)}`);
    entries.push('fontKerning: "normal"');
    if (payload.style.fill && payload.style.fill !== "transparent") entries.push(`color: ${quote(payload.style.fill)}`);
  }

  return [`const ${constName} = {`, ...entries.map((entry) => `  ${entry},`), "} as const;"].join("\n");
}

export function buildJsxSnippet(payload: DevCodegenPayload, constName = "nodeStyle") {
  const tag = payload.meta.type === "text" ? "p" : "div";
  const tokenComments = buildTokenCommentLines(payload.tokens);
  const handoffComments = buildHandoffCommentLines(payload.handoff);
  const content = payload.meta.type === "text" ? payload.text?.value ?? payload.meta.name : payload.meta.name;
  return [
    ...tokenComments,
    ...handoffComments,
    `<${tag} style={${constName}}>${content}</${tag}>`,
  ].join("\n");
}

export function buildTailwindSnippet(payload: DevCodegenPayload) {
  const classes = [
    "absolute",
    `w-[${Math.round(payload.frame.w * 100) / 100}px]`,
    `h-[${Math.round(payload.frame.h * 100) / 100}px]`,
  ];
  if (payload.style.opacity != null && payload.style.opacity < 1) {
    classes.push(`opacity-[${payload.style.opacity}]`);
  }
  if (typeof payload.style.radius === "number" && payload.style.radius > 0) {
    classes.push(`rounded-[${Math.round(payload.style.radius * 100) / 100}px]`);
  }
  if (payload.style.fill && payload.style.fill !== "transparent") {
    classes.push(`bg-[${payload.style.fill}]`);
  }
  if (payload.style.stroke && payload.style.stroke.width > 0 && payload.style.stroke.color !== "transparent") {
    classes.push(`border-[${Math.max(1, payload.style.stroke.width)}px]`);
    classes.push(`border-[${payload.style.stroke.color}]`);
  }
  if (payload.text?.style?.align) {
    classes.push(`text-${payload.text.style.align}`);
  }
  if (payload.text?.style?.fontSize) {
    classes.push(`text-[${Math.round(payload.text.style.fontSize * 100) / 100}px]`);
  }
  if (payload.text?.style?.fontWeight) {
    classes.push(`font-[${payload.text.style.fontWeight}]`);
  }

  const tokenComments = buildTokenCommentLines(payload.tokens);
  const handoffComments = buildHandoffCommentLines(payload.handoff);
  const styleComment = `style={{ transform: "translate(${px(payload.frame.x)}, ${px(payload.frame.y)})" }}`;
  const tag = payload.meta.type === "text" ? "p" : "div";
  const content = payload.meta.type === "text" ? payload.text?.value ?? payload.meta.name : payload.meta.name;
  return [
    ...tokenComments,
    ...handoffComments,
    `<${tag} className="${classes.join(" ")}" ${styleComment}>${content}</${tag}>`,
  ].join("\n");
}

export function buildDevCodegenBundle(payload: DevCodegenPayload) {
  const reactStyle = buildReactStyleObjectSnippet(payload);
  return {
    reactStyle,
    jsx: buildJsxSnippet(payload),
    tailwind: buildTailwindSnippet(payload),
  };
}
