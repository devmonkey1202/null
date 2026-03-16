import {
  cloneDoc,
  type Doc,
  type Node,
  type StyleToken,
  type TextRange,
  type TextStyleVariableBindings,
  type Variable,
} from "../doc/scene";

export type TokenBundle = {
  version: 1;
  styles: StyleToken[];
  variables: Variable[];
  variableModes: string[];
  activeMode: string | null;
  manifest: {
    exportedAt: string;
    styleCount: number;
    variableCount: number;
  };
};

type ImportMode = "merge" | "replace";

function styleKey(style: StyleToken) {
  return `${style.type}:${style.name.trim().toLowerCase()}`;
}

function variableKey(variable: Variable) {
  return `${variable.type}:${variable.name.trim().toLowerCase()}`;
}

function mergeVariableValue(existing: Variable, incoming: Variable): Variable {
  const mergedModes = { ...(existing.modes ?? {}), ...(incoming.modes ?? {}) };
  const mergedModeAliases = { ...(existing.modeAliases ?? {}), ...(incoming.modeAliases ?? {}) };
  return {
    ...existing,
    ...incoming,
    id: existing.id,
    modes: Object.keys(mergedModes).length ? mergedModes : undefined,
    modeAliases: Object.keys(mergedModeAliases).length ? mergedModeAliases : undefined,
  };
}

function reconcileStyles(current: StyleToken[], incoming: StyleToken[], mode: ImportMode) {
  const currentById = new Map(current.map((style) => [style.id, style] as const));
  const currentByKey = new Map(current.map((style) => [styleKey(style), style] as const));
  const next = mode === "replace" ? [] as StyleToken[] : [...current];
  const nextById = new Map(next.map((style, index) => [style.id, index] as const));
  const keyToResolvedId = new Map<string, string>();

  incoming.forEach((style) => {
    const key = styleKey(style);
    const existing = currentById.get(style.id) ?? currentByKey.get(key);
    const resolvedId = existing?.id ?? style.id;
    const value = { ...style, id: resolvedId };
    keyToResolvedId.set(key, resolvedId);

    if (mode === "replace") {
      next.push(value);
      return;
    }

    const index = nextById.get(resolvedId);
    if (index == null) {
      nextById.set(resolvedId, next.length);
      next.push(value);
      return;
    }
    next[index] = value;
  });

  return {
    styles: next,
    currentById,
    nextIds: new Set(next.map((style) => style.id)),
    keyToResolvedId,
  };
}

function reconcileVariables(current: Variable[], incoming: Variable[], mode: ImportMode) {
  const currentById = new Map(current.map((variable) => [variable.id, variable] as const));
  const currentByKey = new Map(current.map((variable) => [variableKey(variable), variable] as const));
  const next = mode === "replace" ? [] as Variable[] : [...current];
  const nextById = new Map(next.map((variable, index) => [variable.id, index] as const));
  const keyToResolvedId = new Map<string, string>();

  incoming.forEach((variable) => {
    const key = variableKey(variable);
    const existing = currentById.get(variable.id) ?? currentByKey.get(key);
    const resolvedId = existing?.id ?? variable.id;
    const value = existing ? mergeVariableValue(existing, { ...variable, id: resolvedId }) : { ...variable, id: resolvedId };
    currentById.set(variable.id, value);
    keyToResolvedId.set(key, resolvedId);

    if (mode === "replace") {
      next.push(value);
      return;
    }

    const index = nextById.get(resolvedId);
    if (index == null) {
      nextById.set(resolvedId, next.length);
      next.push(value);
      return;
    }
    next[index] = value;
  });

  return {
    variables: next,
    currentById,
    nextIds: new Set(next.map((variable) => variable.id)),
    keyToResolvedId,
  };
}

function resolveStyleRef(
  currentId: string | undefined,
  currentById: Map<string, StyleToken>,
  nextIds: Set<string>,
  keyToResolvedId: Map<string, string>,
) {
  if (!currentId) return undefined;
  if (nextIds.has(currentId)) return currentId;
  const current = currentById.get(currentId);
  if (!current) return undefined;
  return keyToResolvedId.get(styleKey(current));
}

function resolveVariableRef(
  currentId: string | undefined,
  currentById: Map<string, Variable>,
  nextIds: Set<string>,
  keyToResolvedId: Map<string, string>,
) {
  if (!currentId) return undefined;
  if (nextIds.has(currentId)) return currentId;
  const current = currentById.get(currentId);
  if (!current) return undefined;
  return keyToResolvedId.get(variableKey(current));
}

function rebindFillVariableRefs(
  fills: Node["style"]["fills"] | undefined,
  variableRefs: ReturnType<typeof reconcileVariables>,
) {
  return fills?.map((fill) => {
    if (fill.type !== "linear" && fill.type !== "radial") return { ...fill };
    return {
      ...fill,
      stops: fill.stops?.map((stop) => ({
        ...stop,
        colorRef: resolveVariableRef(stop.colorRef, variableRefs.currentById, variableRefs.nextIds, variableRefs.keyToResolvedId),
      })),
    };
  });
}

function rebindTextStyleBindings(
  bindings: TextStyleVariableBindings | undefined,
  variableRefs: ReturnType<typeof reconcileVariables>,
) {
  if (!bindings) return undefined;
  const next = Object.fromEntries(
    Object.entries(bindings).map(([key, value]) => [
      key,
      resolveVariableRef(value, variableRefs.currentById, variableRefs.nextIds, variableRefs.keyToResolvedId),
    ]),
  ) as TextStyleVariableBindings;
  return Object.keys(next).length ? next : undefined;
}

function rebindTextRanges(
  ranges: TextRange[] | undefined,
  variableRefs: ReturnType<typeof reconcileVariables>,
) {
  return ranges?.map((range) => ({
    ...range,
    fillRef: resolveVariableRef(range.fillRef, variableRefs.currentById, variableRefs.nextIds, variableRefs.keyToResolvedId),
    styleBindings: rebindTextStyleBindings(range.styleBindings, variableRefs),
  }));
}

function rebindVariableAliases(variables: Variable[], variableRefs: ReturnType<typeof reconcileVariables>) {
  return variables.map((variable) => ({
    ...variable,
    aliasOf: resolveVariableRef(variable.aliasOf, variableRefs.currentById, variableRefs.nextIds, variableRefs.keyToResolvedId),
    modeAliases: variable.modeAliases
      ? Object.fromEntries(
          Object.entries(variable.modeAliases)
            .map(([mode, targetId]) => [
              mode,
              resolveVariableRef(targetId, variableRefs.currentById, variableRefs.nextIds, variableRefs.keyToResolvedId),
            ])
            .filter((entry): entry is [string, string] => Boolean(entry[1])),
        )
      : undefined,
  }));
}

function rebindStyleTokenVariableRefs(styles: StyleToken[], variableRefs: ReturnType<typeof reconcileVariables>) {
  return styles.map((style) => {
    if (style.type === "fill" && Array.isArray(style.value)) {
      return { ...style, value: rebindFillVariableRefs(style.value as Node["style"]["fills"], variableRefs) };
    }
    if (style.type === "text" && style.value && typeof style.value === "object") {
      const value = style.value as Record<string, unknown>;
      return {
        ...style,
        value: {
          ...value,
          styleBindings: rebindTextStyleBindings(
            (value as { styleBindings?: TextStyleVariableBindings }).styleBindings,
            variableRefs,
          ),
        },
      };
    }
    return style;
  });
}

function rebindNodeTokenRefs(
  node: Node,
  styleRefs: ReturnType<typeof reconcileStyles>,
  variableRefs: ReturnType<typeof reconcileVariables>,
) {
  node.style.fills = rebindFillVariableRefs(node.style.fills, variableRefs) ?? node.style.fills;
  node.style.fillStyleId = resolveStyleRef(node.style.fillStyleId, styleRefs.currentById, styleRefs.nextIds, styleRefs.keyToResolvedId);
  node.style.strokeStyleId = resolveStyleRef(node.style.strokeStyleId, styleRefs.currentById, styleRefs.nextIds, styleRefs.keyToResolvedId);
  node.style.effectStyleId = resolveStyleRef(node.style.effectStyleId, styleRefs.currentById, styleRefs.nextIds, styleRefs.keyToResolvedId);
  node.style.fillRef = resolveVariableRef(node.style.fillRef, variableRefs.currentById, variableRefs.nextIds, variableRefs.keyToResolvedId);
  node.style.strokeRef = resolveVariableRef(node.style.strokeRef, variableRefs.currentById, variableRefs.nextIds, variableRefs.keyToResolvedId);
  if (node.type === "text" && node.text) {
    node.text.styleRef = resolveStyleRef(node.text.styleRef, styleRefs.currentById, styleRefs.nextIds, styleRefs.keyToResolvedId);
    node.text.valueRef = resolveVariableRef(node.text.valueRef, variableRefs.currentById, variableRefs.nextIds, variableRefs.keyToResolvedId);
    node.text.styleBindings = rebindTextStyleBindings(node.text.styleBindings, variableRefs);
    node.text.ranges = rebindTextRanges(node.text.ranges, variableRefs);
  }
  if (node.overrides?.style) {
    node.overrides.style.fills = rebindFillVariableRefs(node.overrides.style.fills, variableRefs) ?? node.overrides.style.fills;
    node.overrides.style.fillStyleId = resolveStyleRef(
      node.overrides.style.fillStyleId,
      styleRefs.currentById,
      styleRefs.nextIds,
      styleRefs.keyToResolvedId,
    );
    node.overrides.style.strokeStyleId = resolveStyleRef(
      node.overrides.style.strokeStyleId,
      styleRefs.currentById,
      styleRefs.nextIds,
      styleRefs.keyToResolvedId,
    );
    node.overrides.style.effectStyleId = resolveStyleRef(
      node.overrides.style.effectStyleId,
      styleRefs.currentById,
      styleRefs.nextIds,
      styleRefs.keyToResolvedId,
    );
    node.overrides.style.fillRef = resolveVariableRef(
      node.overrides.style.fillRef,
      variableRefs.currentById,
      variableRefs.nextIds,
      variableRefs.keyToResolvedId,
    );
    node.overrides.style.strokeRef = resolveVariableRef(
      node.overrides.style.strokeRef,
      variableRefs.currentById,
      variableRefs.nextIds,
      variableRefs.keyToResolvedId,
    );
  }
  if (node.overrides?.text) {
    node.overrides.text.styleRef = resolveStyleRef(
      node.overrides.text.styleRef,
      styleRefs.currentById,
      styleRefs.nextIds,
      styleRefs.keyToResolvedId,
    );
    node.overrides.text.valueRef = resolveVariableRef(
      node.overrides.text.valueRef,
      variableRefs.currentById,
      variableRefs.nextIds,
      variableRefs.keyToResolvedId,
    );
    node.overrides.text.styleBindings = rebindTextStyleBindings(node.overrides.text.styleBindings, variableRefs);
    node.overrides.text.ranges = rebindTextRanges(node.overrides.text.ranges, variableRefs);
  }
}

export function exportTokenBundle(doc: Doc): TokenBundle {
  return {
    version: 1,
    styles: doc.styles.map((style) => ({ ...style })),
    variables: doc.variables.map((variable) => ({
      ...variable,
      modes: variable.modes ? { ...variable.modes } : undefined,
      modeAliases: variable.modeAliases ? { ...variable.modeAliases } : undefined,
    })),
    variableModes: [...(doc.variableModes ?? [])],
    activeMode: doc.variableMode ?? null,
    manifest: {
      exportedAt: new Date().toISOString(),
      styleCount: doc.styles.length,
      variableCount: doc.variables.length,
    },
  };
}

export function importTokenBundleIntoDoc(doc: Doc, bundle: TokenBundle, mode: ImportMode) {
  const draft = cloneDoc(doc);
  const incomingStyles = Array.isArray(bundle.styles) ? bundle.styles : [];
  const incomingVariables = Array.isArray(bundle.variables) ? bundle.variables : [];
  const incomingModes = Array.isArray(bundle.variableModes) ? bundle.variableModes.filter(Boolean) : [];
  const incomingActiveMode =
    typeof bundle.activeMode === "string" && bundle.activeMode.trim().length ? bundle.activeMode : null;
  const styles = reconcileStyles(draft.styles, incomingStyles, mode);
  const variables = reconcileVariables(draft.variables, incomingVariables, mode);

  draft.styles = rebindStyleTokenVariableRefs(styles.styles, variables);
  draft.variables = rebindVariableAliases(variables.variables, variables);

  if (mode === "replace") {
    const nextModes = incomingModes.length ? [...incomingModes] : draft.variableModes ?? ["Default"];
    if (incomingActiveMode && !nextModes.includes(incomingActiveMode)) nextModes.push(incomingActiveMode);
    draft.variableModes = nextModes;
    draft.variableMode = incomingActiveMode ?? nextModes[0];
  } else {
    const baseModes = draft.variableModes?.length ? draft.variableModes : ["Default"];
    const nextModes = Array.from(new Set([...baseModes, ...incomingModes]));
    draft.variableModes = nextModes;
    if (incomingActiveMode) draft.variableMode = incomingActiveMode;
  }

  Object.values(draft.nodes).forEach((node) => rebindNodeTokenRefs(node, styles, variables));
  return draft;
}
