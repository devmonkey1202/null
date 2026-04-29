import type { Doc, GradientStop, NodeText, TextRange, TextStyle, TextStyleVariableBindings, Variable } from "../doc/scene";

export type VariableBindingOptions = {
  mode?: string;
  variableOverrides?: Record<string, string | number | boolean>;
};

function findVariable(doc: Doc, variableOrId: string | Variable | undefined) {
  if (!variableOrId) return null;
  if (typeof variableOrId !== "string") return variableOrId;
  const raw = variableOrId.trim();
  if (!raw) return null;
  return (
    doc.variables.find((item) => item.id === raw) ??
    doc.variables.find((item) => item.name === raw) ??
    null
  );
}

function resolveNumericBinding(value: string | number | boolean | undefined) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return undefined;
}

function resolveStringBinding(value: string | number | boolean | undefined) {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return String(value);
  return undefined;
}

function resolveVariableValueInternal(
  doc: Doc,
  variable: Variable | null,
  options: VariableBindingOptions | undefined,
  stack: Set<string>,
): string | number | boolean | undefined {
  if (!variable) return undefined;
  if (stack.has(variable.id)) return undefined;
  if (options?.variableOverrides && variable.id in options.variableOverrides) {
    return options.variableOverrides[variable.id];
  }
  if (options?.variableOverrides && variable.name in options.variableOverrides) {
    return options.variableOverrides[variable.name];
  }

  const nextStack = new Set(stack);
  nextStack.add(variable.id);

  const mode = options?.mode ?? doc.variableMode;
  const modeAliasId = mode ? variable.modeAliases?.[mode] : undefined;
  const aliasId = modeAliasId ?? variable.aliasOf;
  if (aliasId) {
    const target = doc.variables.find((item) => item.id === aliasId) ?? null;
    const resolvedAlias = resolveVariableValueInternal(doc, target, options, nextStack);
    if (resolvedAlias !== undefined) return resolvedAlias;
  }

  if (mode && variable.modes && mode in variable.modes) {
    return variable.modes[mode];
  }
  return variable.value;
}

export function resolveVariableValue(
  doc: Doc,
  variableOrId: string | Variable | undefined,
  options?: VariableBindingOptions,
) {
  return resolveVariableValueInternal(doc, findVariable(doc, variableOrId), options, new Set<string>());
}

export function resolveVariableColor(
  doc: Doc,
  variableId: string | undefined,
  options?: VariableBindingOptions,
) {
  const resolved = resolveVariableValue(doc, variableId, options);
  return typeof resolved === "string" ? resolved : null;
}

export function resolveVariableNumber(
  doc: Doc,
  variableId: string | undefined,
  options?: VariableBindingOptions,
) {
  return resolveNumericBinding(resolveVariableValue(doc, variableId, options));
}

export function resolveGradientStopColor(
  doc: Doc,
  stop: GradientStop,
  options?: VariableBindingOptions,
) {
  return resolveVariableColor(doc, stop.colorRef, options) ?? stop.color;
}

export function applyTextStyleVariableBindings(
  doc: Doc,
  baseStyle: TextStyle,
  bindings: TextStyleVariableBindings | undefined,
  options?: VariableBindingOptions,
): TextStyle {
  if (!bindings) return { ...baseStyle };
  const nextStyle: TextStyle = { ...baseStyle };

  const fontFamily = resolveStringBinding(resolveVariableValue(doc, bindings.fontFamily, options));
  if (fontFamily) nextStyle.fontFamily = fontFamily;

  const fontWeight = resolveNumericBinding(resolveVariableValue(doc, bindings.fontWeight, options));
  if (fontWeight != null) nextStyle.fontWeight = fontWeight;

  const fontSize = resolveNumericBinding(resolveVariableValue(doc, bindings.fontSize, options));
  if (fontSize != null) nextStyle.fontSize = fontSize;

  const lineHeight = resolveNumericBinding(resolveVariableValue(doc, bindings.lineHeight, options));
  if (lineHeight != null) nextStyle.lineHeight = lineHeight;

  const letterSpacing = resolveNumericBinding(resolveVariableValue(doc, bindings.letterSpacing, options));
  if (letterSpacing != null) nextStyle.letterSpacing = letterSpacing;

  const paragraphSpacing = resolveNumericBinding(resolveVariableValue(doc, bindings.paragraphSpacing, options));
  if (paragraphSpacing != null) nextStyle.paragraphSpacing = paragraphSpacing;

  return nextStyle;
}

function applyPartialTextStyleBindings(
  doc: Doc,
  baseStyle: Partial<TextStyle> | undefined,
  bindings: TextStyleVariableBindings | undefined,
  options?: VariableBindingOptions,
) {
  if (!baseStyle && !bindings) return undefined;
  const nextStyle: Partial<TextStyle> = baseStyle ? { ...baseStyle } : {};

  const fontFamily = resolveStringBinding(resolveVariableValue(doc, bindings?.fontFamily, options));
  if (fontFamily) nextStyle.fontFamily = fontFamily;

  const fontWeight = resolveNumericBinding(resolveVariableValue(doc, bindings?.fontWeight, options));
  if (fontWeight != null) nextStyle.fontWeight = fontWeight;

  const fontSize = resolveNumericBinding(resolveVariableValue(doc, bindings?.fontSize, options));
  if (fontSize != null) nextStyle.fontSize = fontSize;

  const lineHeight = resolveNumericBinding(resolveVariableValue(doc, bindings?.lineHeight, options));
  if (lineHeight != null) nextStyle.lineHeight = lineHeight;

  const letterSpacing = resolveNumericBinding(resolveVariableValue(doc, bindings?.letterSpacing, options));
  if (letterSpacing != null) nextStyle.letterSpacing = letterSpacing;

  const paragraphSpacing = resolveNumericBinding(resolveVariableValue(doc, bindings?.paragraphSpacing, options));
  if (paragraphSpacing != null) nextStyle.paragraphSpacing = paragraphSpacing;

  return Object.keys(nextStyle).length ? nextStyle : undefined;
}

export function resolveNodeTextValue(
  doc: Doc,
  text: NodeText | undefined,
  options?: VariableBindingOptions,
) {
  if (!text) return "";
  const bound = resolveVariableValue(doc, text.valueRef, options);
  if (typeof bound === "string" || typeof bound === "number" || typeof bound === "boolean") {
    return String(bound);
  }
  if (typeof text.value === "string" && text.value.trim()) {
    const implicit = findVariable(doc, text.value.trim());
    const implicitValue = resolveVariableValue(doc, implicit ?? undefined, options);
    if (
      typeof implicitValue === "string" ||
      typeof implicitValue === "number" ||
      typeof implicitValue === "boolean"
    ) {
      return String(implicitValue);
    }
  }
  return text.value;
}

export function resolveNodeTextStyle(
  doc: Doc,
  text: NodeText | undefined,
  baseStyle: TextStyle,
  options?: VariableBindingOptions,
) {
  if (!text) return { ...baseStyle };
  return applyTextStyleVariableBindings(doc, baseStyle, text.styleBindings, options);
}

export function resolveTextRangeBindings(
  doc: Doc,
  ranges: TextRange[] | undefined,
  options?: VariableBindingOptions,
) {
  return ranges?.map((range) => ({
    ...range,
    style: applyPartialTextStyleBindings(doc, range.style, range.styleBindings, options),
    fill: resolveVariableColor(doc, range.fillRef, options) ?? range.fill,
    styleBindings: range.styleBindings ? { ...range.styleBindings } : undefined,
  }));
}
