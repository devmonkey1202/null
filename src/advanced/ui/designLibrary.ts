import { cloneDoc, type Doc, type LibraryRef, type Node, type StyleToken, type Variable } from "../doc/scene";
import { makeRuntimeId } from "./AdvancedEditor.utils";

export type PublishedLibraryComponent = {
  publishedKey: string;
  name: string;
  nodes: Record<string, Node>;
};

export type PublishedLibrarySnapshot = {
  schema: "null_design_library_v1";
  library: {
    id: string;
    name: string;
    versionId: string;
    publishedAt: string;
  };
  manifest: {
    componentKeys: string[];
    styleKeys: string[];
    variableKeys: string[];
  };
  variableModes?: string[];
  components: PublishedLibraryComponent[];
  styles: StyleToken[];
  variables: Variable[];
};

export type LibraryPreviewBucket = {
  added: string[];
  updated: string[];
  removed: string[];
};

export type LibraryUsageSummary = {
  componentDefinitions: number;
  componentInstances: number;
  styleRefs: number;
  variableRefs: number;
};

export type LibraryUpdatePreview = {
  libraryId: string;
  name: string;
  currentVersionId?: string;
  nextVersionId: string;
  hasChanges: boolean;
  components: LibraryPreviewBucket;
  styles: LibraryPreviewBucket;
  variables: LibraryPreviewBucket;
  usage: LibraryUsageSummary;
};

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
}

function collectSubtree(doc: Doc, nodeId: string, out: string[]) {
  const node = doc.nodes[nodeId];
  if (!node) return;
  out.push(nodeId);
  node.children.forEach((childId) => collectSubtree(doc, childId, out));
}

function compareJson(a: unknown, b: unknown) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function buildLibraryStyleKey(token: StyleToken) {
  return token.publishedKey ?? `style:${token.type}:${token.id}`;
}

function buildLibraryVariableKey(variable: Variable) {
  return variable.publishedKey ?? `variable:${variable.id}`;
}

function buildLibraryComponentKey(node: Node) {
  return node.publishedKey ?? `component:${slugify(node.name) || node.id}`;
}

function buildLibraryRef(snapshot: PublishedLibrarySnapshot, previous?: LibraryRef): LibraryRef {
  return {
    id: snapshot.library.id,
    name: snapshot.library.name,
    currentVersionId: snapshot.library.versionId,
    latestVersionId: snapshot.library.versionId,
    status: "up-to-date",
    consumedAt: previous?.consumedAt ?? new Date().toISOString(),
    lastCheckedAt: new Date().toISOString(),
    componentKeys: snapshot.manifest.componentKeys,
    styleKeys: snapshot.manifest.styleKeys,
    variableKeys: snapshot.manifest.variableKeys,
  };
}

function mapTextRefs(text: Node["text"], styleKeyById: Map<string, string>, variableKeyById: Map<string, string>) {
  if (!text) return text;
  const next = deepClone(text);
  if (next.styleRef) next.styleRef = styleKeyById.get(next.styleRef) ?? next.styleRef;
  if (next.valueRef) next.valueRef = variableKeyById.get(next.valueRef) ?? next.valueRef;
  if (next.styleBindings) {
    Object.keys(next.styleBindings).forEach((key) => {
      const ref = next.styleBindings?.[key as keyof typeof next.styleBindings];
      if (ref) next.styleBindings![key as keyof typeof next.styleBindings] = variableKeyById.get(ref) ?? ref;
    });
  }
  next.ranges = next.ranges?.map((range) => ({
    ...range,
    fillRef: range.fillRef ? variableKeyById.get(range.fillRef) ?? range.fillRef : range.fillRef,
    styleBindings: range.styleBindings
      ? Object.fromEntries(
          Object.entries(range.styleBindings).map(([key, ref]) => [key, ref ? variableKeyById.get(ref) ?? ref : ref]),
        )
      : range.styleBindings,
  }));
  return next;
}

function remapPrototypeActionVars(action: Record<string, unknown>, variableMap: Map<string, string>) {
  if (typeof action.variableId === "string") action.variableId = variableMap.get(action.variableId) ?? action.variableId;
  if (typeof action.responseVariable === "string") {
    action.responseVariable = variableMap.get(action.responseVariable) ?? action.responseVariable;
  }
  if (typeof action.errorVariable === "string") {
    action.errorVariable = variableMap.get(action.errorVariable) ?? action.errorVariable;
  }
  if (action.condition && typeof action.condition === "object") {
    const condition = action.condition as Record<string, unknown>;
    if (typeof condition.variableId === "string") {
      condition.variableId = variableMap.get(condition.variableId) ?? condition.variableId;
    }
  }
  if (action.onSuccess && typeof action.onSuccess === "object") {
    remapPrototypeActionVars(action.onSuccess as Record<string, unknown>, variableMap);
  }
  if (action.onError && typeof action.onError === "object") {
    remapPrototypeActionVars(action.onError as Record<string, unknown>, variableMap);
  }
}

function mapPrototypeRefs(node: Node, variableMap: Map<string, string>) {
  node.prototype?.interactions.forEach((interaction) => remapPrototypeActionVars(interaction.action as unknown as Record<string, unknown>, variableMap));
  node.overrides?.prototype?.interactions.forEach((interaction) =>
    remapPrototypeActionVars(interaction.action as unknown as Record<string, unknown>, variableMap),
  );
}

function normalizeNodeForPublish(
  source: Node,
  keyMap: Map<string, string>,
  styleKeyById: Map<string, string>,
  variableKeyById: Map<string, string>,
  libraryId: string,
  versionId: string,
) {
  const node = deepClone(source);
  node.id = keyMap.get(source.id) ?? source.id;
  node.parentId = source.parentId ? keyMap.get(source.parentId) ?? source.parentId : null;
  node.children = source.children.map((childId) => keyMap.get(childId) ?? childId);
  node.publishedKey = node.id;
  node.sourceLibraryId = libraryId;
  node.sourceVersionId = versionId;
  if (node.instanceOf) node.instanceOf = keyMap.get(node.instanceOf) ?? node.instanceOf;
  if (node.sourceId) node.sourceId = keyMap.get(node.sourceId) ?? node.sourceId;
  if (node.componentId) node.componentId = keyMap.get(node.componentId) ?? node.componentId;
  if (node.style.fillStyleId) node.style.fillStyleId = styleKeyById.get(node.style.fillStyleId) ?? node.style.fillStyleId;
  if (node.style.strokeStyleId) node.style.strokeStyleId = styleKeyById.get(node.style.strokeStyleId) ?? node.style.strokeStyleId;
  if (node.style.effectStyleId) node.style.effectStyleId = styleKeyById.get(node.style.effectStyleId) ?? node.style.effectStyleId;
  if (node.style.fillRef) node.style.fillRef = variableKeyById.get(node.style.fillRef) ?? node.style.fillRef;
  if (node.style.strokeRef) node.style.strokeRef = variableKeyById.get(node.style.strokeRef) ?? node.style.strokeRef;
  node.text = mapTextRefs(node.text, styleKeyById, variableKeyById);
  if (node.variants?.length) {
    node.variants = node.variants.map((variant) => ({ ...variant, rootId: keyMap.get(variant.rootId) ?? variant.rootId }));
  }
  if (node.propertyDefinitions) {
    node.propertyDefinitions = Object.fromEntries(
      Object.entries(node.propertyDefinitions).map(([key, value]) => [keyMap.get(key) ?? key, value]),
    );
  }
  if (node.overrides?.instanceOf) node.overrides.instanceOf = keyMap.get(node.overrides.instanceOf) ?? node.overrides.instanceOf;
  if (node.overrides?.style?.fillStyleId) {
    node.overrides.style.fillStyleId = styleKeyById.get(node.overrides.style.fillStyleId) ?? node.overrides.style.fillStyleId;
  }
  if (node.overrides?.style?.strokeStyleId) {
    node.overrides.style.strokeStyleId = styleKeyById.get(node.overrides.style.strokeStyleId) ?? node.overrides.style.strokeStyleId;
  }
  if (node.overrides?.style?.effectStyleId) {
    node.overrides.style.effectStyleId = styleKeyById.get(node.overrides.style.effectStyleId) ?? node.overrides.style.effectStyleId;
  }
  if (node.overrides?.style?.fillRef) {
    node.overrides.style.fillRef = variableKeyById.get(node.overrides.style.fillRef) ?? node.overrides.style.fillRef;
  }
  if (node.overrides?.style?.strokeRef) {
    node.overrides.style.strokeRef = variableKeyById.get(node.overrides.style.strokeRef) ?? node.overrides.style.strokeRef;
  }
  if (node.overrides?.text) node.overrides.text = mapTextRefs(node.overrides.text, styleKeyById, variableKeyById);
  mapPrototypeRefs(node, variableKeyById);
  return node;
}

export function buildDesignLibrarySnapshot(
  doc: Doc,
  options?: { name?: string; libraryId?: string; versionId?: string; publishedAt?: string },
): PublishedLibrarySnapshot {
  const libraryName = options?.name?.trim() || "NULL Design Library";
  const matchingLibrary = doc.libraries?.find((library) => library.name === libraryName);
  const libraryId = options?.libraryId ?? matchingLibrary?.id ?? `lib:${slugify(libraryName) || makeRuntimeId("lib")}`;
  const versionId = options?.versionId ?? makeRuntimeId("libver");
  const publishedAt = options?.publishedAt ?? new Date().toISOString();
  const styleKeyById = new Map(doc.styles.map((style) => [style.id, buildLibraryStyleKey(style)] as const));
  const variableKeyById = new Map(doc.variables.map((variable) => [variable.id, buildLibraryVariableKey(variable)] as const));
  const componentIds = Array.from(
    new Set([
      ...Object.values(doc.components),
      ...Object.values(doc.nodes)
        .filter((node) => node.type === "component")
        .map((node) => node.id),
    ]),
  ).filter((id): id is string => Boolean(doc.nodes[id]));

  const components = componentIds.map((componentId) => {
    const ids: string[] = [];
    collectSubtree(doc, componentId, ids);
    const root = doc.nodes[componentId]!;
    const rootKey = buildLibraryComponentKey(root);
    const keyMap = new Map<string, string>();
    ids.forEach((id) => {
      const node = doc.nodes[id];
      if (!node) return;
      keyMap.set(id, id === componentId ? rootKey : node.publishedKey ?? `${rootKey}/node:${node.sourceId ?? id}`);
    });
    return {
      publishedKey: rootKey,
      name: root.name,
      nodes: Object.fromEntries(
        ids.map((id) => {
          const node = normalizeNodeForPublish(doc.nodes[id]!, keyMap, styleKeyById, variableKeyById, libraryId, versionId);
          return [node.id, node] as const;
        }),
      ),
    };
  });

  const styles = doc.styles.map((style) => ({
    ...deepClone(style),
    publishedKey: buildLibraryStyleKey(style),
    sourceLibraryId: libraryId,
    sourceVersionId: versionId,
  }));
  const variables = doc.variables.map((variable) => ({
    ...deepClone(variable),
    publishedKey: buildLibraryVariableKey(variable),
    aliasOf: variable.aliasOf ? variableKeyById.get(variable.aliasOf) ?? variable.aliasOf : variable.aliasOf,
    modeAliases: variable.modeAliases
      ? Object.fromEntries(
          Object.entries(variable.modeAliases).map(([mode, aliasKey]) => [mode, variableKeyById.get(aliasKey) ?? aliasKey]),
        )
      : variable.modeAliases,
    sourceLibraryId: libraryId,
    sourceVersionId: versionId,
  }));

  return {
    schema: "null_design_library_v1",
    library: { id: libraryId, name: libraryName, versionId, publishedAt },
    manifest: {
      componentKeys: components.map((component) => component.publishedKey),
      styleKeys: styles.map((style) => style.publishedKey ?? buildLibraryStyleKey(style)),
      variableKeys: variables.map((variable) => variable.publishedKey ?? buildLibraryVariableKey(variable)),
    },
    variableModes: doc.variableModes ? [...doc.variableModes] : undefined,
    components,
    styles,
    variables,
  };
}

function remapTextRefsToLocalIds(text: Node["text"], styleIdByKey: Map<string, string>, variableIdByKey: Map<string, string>) {
  if (!text) return text;
  const next = deepClone(text);
  if (next.styleRef) next.styleRef = styleIdByKey.get(next.styleRef) ?? next.styleRef;
  if (next.valueRef) next.valueRef = variableIdByKey.get(next.valueRef) ?? next.valueRef;
  if (next.styleBindings) {
    Object.keys(next.styleBindings).forEach((key) => {
      const ref = next.styleBindings?.[key as keyof typeof next.styleBindings];
      if (ref) next.styleBindings![key as keyof typeof next.styleBindings] = variableIdByKey.get(ref) ?? ref;
    });
  }
  next.ranges = next.ranges?.map((range) => ({
    ...range,
    fillRef: range.fillRef ? variableIdByKey.get(range.fillRef) ?? range.fillRef : range.fillRef,
    styleBindings: range.styleBindings
      ? Object.fromEntries(
          Object.entries(range.styleBindings).map(([key, ref]) => [key, ref ? variableIdByKey.get(ref) ?? ref : ref]),
        )
      : range.styleBindings,
  }));
  return next;
}

function normalizeNodeForLocalDoc(
  publishedNode: Node,
  keyToLocalId: Map<string, string>,
  styleIdByKey: Map<string, string>,
  variableIdByKey: Map<string, string>,
  libraryId: string,
  versionId: string,
) {
  const node = deepClone(publishedNode);
  node.id = keyToLocalId.get(publishedNode.id) ?? publishedNode.id;
  node.parentId = publishedNode.parentId ? keyToLocalId.get(publishedNode.parentId) ?? publishedNode.parentId : null;
  node.children = publishedNode.children.map((childId) => keyToLocalId.get(childId) ?? childId);
  node.publishedKey = publishedNode.publishedKey ?? publishedNode.id;
  node.sourceLibraryId = libraryId;
  node.sourceVersionId = versionId;
  node.componentId = node.type === "component" ? node.id : undefined;
  if (node.style.fillStyleId) node.style.fillStyleId = styleIdByKey.get(node.style.fillStyleId) ?? node.style.fillStyleId;
  if (node.style.strokeStyleId) node.style.strokeStyleId = styleIdByKey.get(node.style.strokeStyleId) ?? node.style.strokeStyleId;
  if (node.style.effectStyleId) node.style.effectStyleId = styleIdByKey.get(node.style.effectStyleId) ?? node.style.effectStyleId;
  if (node.style.fillRef) node.style.fillRef = variableIdByKey.get(node.style.fillRef) ?? node.style.fillRef;
  if (node.style.strokeRef) node.style.strokeRef = variableIdByKey.get(node.style.strokeRef) ?? node.style.strokeRef;
  node.text = remapTextRefsToLocalIds(node.text, styleIdByKey, variableIdByKey);
  if (node.type === "instance") {
    node.instanceOf = node.instanceOf ? keyToLocalId.get(node.instanceOf) ?? node.instanceOf : node.instanceOf;
    node.sourceId = node.instanceOf ?? undefined;
    node.instanceLibraryId = libraryId;
  } else {
    node.instanceOf = node.instanceOf ? keyToLocalId.get(node.instanceOf) ?? node.instanceOf : node.instanceOf;
    node.sourceId = undefined;
  }
  if (node.variants?.length) {
    node.variants = node.variants.map((variant) => ({ ...variant, rootId: keyToLocalId.get(variant.rootId) ?? variant.rootId }));
  }
  if (node.propertyDefinitions) {
    node.propertyDefinitions = Object.fromEntries(
      Object.entries(node.propertyDefinitions).map(([key, value]) => [keyToLocalId.get(key) ?? key, value]),
    );
  }
  if (node.overrides?.instanceOf) node.overrides.instanceOf = keyToLocalId.get(node.overrides.instanceOf) ?? node.overrides.instanceOf;
  if (node.overrides?.style?.fillStyleId) {
    node.overrides.style.fillStyleId = styleIdByKey.get(node.overrides.style.fillStyleId) ?? node.overrides.style.fillStyleId;
  }
  if (node.overrides?.style?.strokeStyleId) {
    node.overrides.style.strokeStyleId = styleIdByKey.get(node.overrides.style.strokeStyleId) ?? node.overrides.style.strokeStyleId;
  }
  if (node.overrides?.style?.effectStyleId) {
    node.overrides.style.effectStyleId = styleIdByKey.get(node.overrides.style.effectStyleId) ?? node.overrides.style.effectStyleId;
  }
  if (node.overrides?.style?.fillRef) {
    node.overrides.style.fillRef = variableIdByKey.get(node.overrides.style.fillRef) ?? node.overrides.style.fillRef;
  }
  if (node.overrides?.style?.strokeRef) {
    node.overrides.style.strokeRef = variableIdByKey.get(node.overrides.style.strokeRef) ?? node.overrides.style.strokeRef;
  }
  if (node.overrides?.text) node.overrides.text = remapTextRefsToLocalIds(node.overrides.text, styleIdByKey, variableIdByKey);
  mapPrototypeRefs(node, variableIdByKey);
  return node;
}

function upsertStyleTokens(draft: Doc, snapshot: PublishedLibrarySnapshot) {
  const styleIdByKey = new Map<string, string>();
  const existingByKey = new Map(draft.styles.filter((style) => style.publishedKey).map((style) => [style.publishedKey!, style] as const));
  const nextStyles = [...draft.styles];
  snapshot.styles.forEach((style) => {
    const publishedKey = style.publishedKey ?? buildLibraryStyleKey(style);
    const existing = existingByKey.get(publishedKey);
    const nextStyle: StyleToken = {
      ...deepClone(style),
      id: existing?.id ?? makeRuntimeId("style"),
      publishedKey,
      sourceLibraryId: snapshot.library.id,
      sourceVersionId: snapshot.library.versionId,
    };
    styleIdByKey.set(publishedKey, nextStyle.id);
    const index = nextStyles.findIndex((item) => item.id === nextStyle.id);
    if (index >= 0) nextStyles[index] = nextStyle;
    else nextStyles.push(nextStyle);
  });
  draft.styles = nextStyles;
  return styleIdByKey;
}

function upsertVariables(draft: Doc, snapshot: PublishedLibrarySnapshot) {
  const variableIdByKey = new Map<string, string>();
  const existingByKey = new Map(draft.variables.filter((variable) => variable.publishedKey).map((variable) => [variable.publishedKey!, variable] as const));
  const nextVariables = [...draft.variables];
  snapshot.variables.forEach((variable) => {
    const publishedKey = variable.publishedKey ?? buildLibraryVariableKey(variable);
    const existing = existingByKey.get(publishedKey);
    const nextVariable: Variable = {
      ...deepClone(variable),
      id: existing?.id ?? makeRuntimeId("var"),
      aliasOf: undefined,
      modeAliases: undefined,
      publishedKey,
      sourceLibraryId: snapshot.library.id,
      sourceVersionId: snapshot.library.versionId,
    };
    variableIdByKey.set(publishedKey, nextVariable.id);
    const index = nextVariables.findIndex((item) => item.id === nextVariable.id);
    if (index >= 0) nextVariables[index] = nextVariable;
    else nextVariables.push(nextVariable);
  });
  nextVariables.forEach((variable, index) => {
    if (variable.sourceLibraryId !== snapshot.library.id) return;
    nextVariables[index] = {
      ...variable,
      aliasOf: variable.aliasOf ? variableIdByKey.get(variable.aliasOf) ?? variable.aliasOf : variable.aliasOf,
      modeAliases: variable.modeAliases
        ? Object.fromEntries(
            Object.entries(variable.modeAliases).map(([mode, aliasKey]) => [mode, variableIdByKey.get(aliasKey) ?? aliasKey]),
          )
        : variable.modeAliases,
    };
  });
  draft.variables = nextVariables;
  if (snapshot.variableModes?.length) draft.variableModes = [...snapshot.variableModes];
  return variableIdByKey;
}

function ensureRootChild(doc: Doc, nodeId: string) {
  const root = doc.nodes[doc.root];
  if (!root) return;
  if (!root.children.includes(nodeId)) root.children = [...root.children, nodeId];
}

function clearRemovedLibraryRefs(node: Node, styleIds: Set<string>, variableIds: Set<string>) {
  if (node.style.fillStyleId && styleIds.has(node.style.fillStyleId)) node.style.fillStyleId = undefined;
  if (node.style.strokeStyleId && styleIds.has(node.style.strokeStyleId)) node.style.strokeStyleId = undefined;
  if (node.style.effectStyleId && styleIds.has(node.style.effectStyleId)) node.style.effectStyleId = undefined;
  if (node.style.fillRef && variableIds.has(node.style.fillRef)) node.style.fillRef = undefined;
  if (node.style.strokeRef && variableIds.has(node.style.strokeRef)) node.style.strokeRef = undefined;
  if (node.text?.styleRef && styleIds.has(node.text.styleRef)) node.text.styleRef = undefined;
  if (node.text?.valueRef && variableIds.has(node.text.valueRef)) node.text.valueRef = undefined;
  if (node.text?.styleBindings) {
    Object.keys(node.text.styleBindings).forEach((key) => {
      const bindingKey = key as keyof typeof node.text.styleBindings;
      if (node.text?.styleBindings?.[bindingKey] && variableIds.has(node.text.styleBindings[bindingKey]!)) {
        node.text.styleBindings[bindingKey] = undefined;
      }
    });
  }
  node.text?.ranges?.forEach((range) => {
    if (range.fillRef && variableIds.has(range.fillRef)) range.fillRef = undefined;
    if (range.styleBindings) {
      Object.keys(range.styleBindings).forEach((key) => {
        const ref = range.styleBindings?.[key as keyof typeof range.styleBindings];
        if (ref && variableIds.has(ref)) range.styleBindings![key as keyof typeof range.styleBindings] = undefined;
      });
    }
  });
  if (node.overrides?.style?.fillStyleId && styleIds.has(node.overrides.style.fillStyleId)) node.overrides.style.fillStyleId = undefined;
  if (node.overrides?.style?.strokeStyleId && styleIds.has(node.overrides.style.strokeStyleId)) node.overrides.style.strokeStyleId = undefined;
  if (node.overrides?.style?.effectStyleId && styleIds.has(node.overrides.style.effectStyleId)) node.overrides.style.effectStyleId = undefined;
  if (node.overrides?.style?.fillRef && variableIds.has(node.overrides.style.fillRef)) node.overrides.style.fillRef = undefined;
  if (node.overrides?.style?.strokeRef && variableIds.has(node.overrides.style.strokeRef)) node.overrides.style.strokeRef = undefined;
  if (node.overrides?.text?.styleRef && styleIds.has(node.overrides.text.styleRef)) node.overrides.text.styleRef = undefined;
  if (node.overrides?.text?.valueRef && variableIds.has(node.overrides.text.valueRef)) node.overrides.text.valueRef = undefined;
  if (node.overrides?.text?.ranges) {
    node.overrides.text.ranges.forEach((range) => {
      if (range.fillRef && variableIds.has(range.fillRef)) range.fillRef = undefined;
    });
  }
}

export function consumeDesignLibrary(doc: Doc, snapshot: PublishedLibrarySnapshot) {
  const draft = cloneDoc(doc);
  const styleIdByKey = upsertStyleTokens(draft, snapshot);
  const variableIdByKey = upsertVariables(draft, snapshot);
  const incomingComponentKeys = new Set(snapshot.manifest.componentKeys);
  const existingByPublishedKey = new Map(
    Object.values(draft.nodes)
      .filter((node) => node.sourceLibraryId === snapshot.library.id && node.publishedKey)
      .map((node) => [node.publishedKey!, node.id] as const),
  );

  snapshot.components.forEach((component) => {
    const keyToLocalId = new Map<string, string>();
    Object.values(component.nodes).forEach((node) => {
      const publishedKey = node.publishedKey ?? node.id;
      keyToLocalId.set(publishedKey, existingByPublishedKey.get(publishedKey) ?? makeRuntimeId(node.type === "component" ? "component" : "node"));
    });
    const rootLocalId = keyToLocalId.get(component.publishedKey);
    if (!rootLocalId) return;
    const previousRoot = draft.nodes[rootLocalId];
    const previousParentId = previousRoot?.parentId ?? draft.root;
    const previousIds: string[] = [];
    if (previousRoot) collectSubtree(draft, previousRoot.id, previousIds);

    Object.values(component.nodes).forEach((publishedNode) => {
      const nextNode = normalizeNodeForLocalDoc(
        publishedNode,
        keyToLocalId,
        styleIdByKey,
        variableIdByKey,
        snapshot.library.id,
        snapshot.library.versionId,
      );
      if ((publishedNode.publishedKey ?? publishedNode.id) === component.publishedKey) nextNode.parentId = previousParentId;
      draft.nodes[nextNode.id] = nextNode;
    });

    const nextIds = new Set(keyToLocalId.values());
    previousIds.filter((id) => id !== rootLocalId && !nextIds.has(id)).forEach((id) => delete draft.nodes[id]);
    draft.components = { ...draft.components, [rootLocalId]: rootLocalId };
    ensureRootChild(draft, rootLocalId);
  });

  Object.values(draft.nodes)
    .filter(
      (node) =>
        node.type === "component" &&
        node.sourceLibraryId === snapshot.library.id &&
        node.publishedKey &&
        !incomingComponentKeys.has(node.publishedKey),
    )
    .forEach((rootNode) => {
      const ids: string[] = [];
      collectSubtree(draft, rootNode.id, ids);
      ids.forEach((id) => delete draft.nodes[id]);
      delete draft.components[rootNode.id];
      const root = draft.nodes[draft.root];
      if (root) root.children = root.children.filter((childId) => childId !== rootNode.id);
    });

  const incomingStyleKeys = new Set(snapshot.manifest.styleKeys);
  const removedStyleIds = new Set(
    draft.styles
      .filter((style) => style.sourceLibraryId === snapshot.library.id && style.publishedKey && !incomingStyleKeys.has(style.publishedKey))
      .map((style) => style.id),
  );
  const incomingVariableKeys = new Set(snapshot.manifest.variableKeys);
  const removedVariableIds = new Set(
    draft.variables
      .filter((variable) => variable.sourceLibraryId === snapshot.library.id && variable.publishedKey && !incomingVariableKeys.has(variable.publishedKey))
      .map((variable) => variable.id),
  );
  if (removedStyleIds.size || removedVariableIds.size) {
    Object.values(draft.nodes).forEach((node) => clearRemovedLibraryRefs(node, removedStyleIds, removedVariableIds));
    draft.styles = draft.styles.filter((style) => !removedStyleIds.has(style.id));
    draft.variables = draft.variables.filter((variable) => !removedVariableIds.has(variable.id));
  }

  const previousLibrary = draft.libraries?.find((library) => library.id === snapshot.library.id);
  const nextLibrary = buildLibraryRef(snapshot, previousLibrary);
  draft.libraries = [...(draft.libraries ?? []).filter((library) => library.id !== snapshot.library.id), nextLibrary];
  return draft;
}

export function computeDesignLibraryUsage(doc: Doc, libraryId: string): LibraryUsageSummary {
  const styleIds = new Set(doc.styles.filter((style) => style.sourceLibraryId === libraryId).map((style) => style.id));
  const variableIds = new Set(doc.variables.filter((variable) => variable.sourceLibraryId === libraryId).map((variable) => variable.id));
  const componentDefinitions = Object.values(doc.nodes).filter((node) => node.type === "component" && node.sourceLibraryId === libraryId).length;
  const componentInstances = Object.values(doc.nodes).filter((node) => {
    if (node.type !== "instance") return false;
    if (node.instanceLibraryId === libraryId) return true;
    const source = node.instanceOf ? doc.nodes[node.instanceOf] : null;
    return source?.sourceLibraryId === libraryId;
  }).length;
  let styleRefs = 0;
  let variableRefs = 0;
  Object.values(doc.nodes).forEach((node) => {
    if (node.style.fillStyleId && styleIds.has(node.style.fillStyleId)) styleRefs += 1;
    if (node.style.strokeStyleId && styleIds.has(node.style.strokeStyleId)) styleRefs += 1;
    if (node.style.effectStyleId && styleIds.has(node.style.effectStyleId)) styleRefs += 1;
    if (node.text?.styleRef && styleIds.has(node.text.styleRef)) styleRefs += 1;
    if (node.style.fillRef && variableIds.has(node.style.fillRef)) variableRefs += 1;
    if (node.style.strokeRef && variableIds.has(node.style.strokeRef)) variableRefs += 1;
    if (node.text?.valueRef && variableIds.has(node.text.valueRef)) variableRefs += 1;
    node.text?.ranges?.forEach((range) => {
      if (range.fillRef && variableIds.has(range.fillRef)) variableRefs += 1;
    });
  });
  return { componentDefinitions, componentInstances, styleRefs, variableRefs };
}

function normalizeStyleForCompare(style: StyleToken) {
  return {
    name: style.name,
    type: style.type,
    value: style.value,
    publishedKey: style.publishedKey ?? buildLibraryStyleKey(style),
  };
}

function normalizeVariableForCompare(variable: Variable) {
  return {
    name: variable.name,
    type: variable.type,
    value: variable.value,
    modes: variable.modes ?? null,
    aliasOf: variable.aliasOf ?? null,
    modeAliases: variable.modeAliases ?? null,
    publishedKey: variable.publishedKey ?? buildLibraryVariableKey(variable),
  };
}

function normalizeNodeForCompare(
  node: Node,
  styleKeyById: Map<string, string>,
  variableKeyById: Map<string, string>,
  nodeKeyById: Map<string, string>,
) {
  const next = deepClone(node);
  next.id = node.publishedKey ?? node.id;
  next.parentId = node.parentId ? nodeKeyById.get(node.parentId) ?? node.parentId : null;
  next.children = node.children.map((childId) => nodeKeyById.get(childId) ?? childId);
  next.sourceLibraryId = undefined;
  next.sourceVersionId = undefined;
  next.componentId = next.type === "component" ? next.id : undefined;
  if (next.style.fillStyleId) next.style.fillStyleId = styleKeyById.get(next.style.fillStyleId) ?? next.style.fillStyleId;
  if (next.style.strokeStyleId) next.style.strokeStyleId = styleKeyById.get(next.style.strokeStyleId) ?? next.style.strokeStyleId;
  if (next.style.effectStyleId) next.style.effectStyleId = styleKeyById.get(next.style.effectStyleId) ?? next.style.effectStyleId;
  if (next.style.fillRef) next.style.fillRef = variableKeyById.get(next.style.fillRef) ?? next.style.fillRef;
  if (next.style.strokeRef) next.style.strokeRef = variableKeyById.get(next.style.strokeRef) ?? next.style.strokeRef;
  next.text = mapTextRefs(next.text, styleKeyById, variableKeyById);
  if (next.variants?.length) {
    next.variants = next.variants.map((variant) => ({ ...variant, rootId: nodeKeyById.get(variant.rootId) ?? variant.rootId }));
  }
  if (next.propertyDefinitions) {
    next.propertyDefinitions = Object.fromEntries(
      Object.entries(next.propertyDefinitions).map(([key, value]) => [nodeKeyById.get(key) ?? key, value]),
    );
  }
  return next;
}

function buildCurrentComponentPayload(doc: Doc, libraryId: string, rootPublishedKey: string) {
  const root = Object.values(doc.nodes).find(
    (node) => node.type === "component" && node.sourceLibraryId === libraryId && node.publishedKey === rootPublishedKey,
  );
  if (!root) return null;
  const ids: string[] = [];
  collectSubtree(doc, root.id, ids);
  const nodes = ids.map((id) => doc.nodes[id]).filter((node): node is Node => Boolean(node));
  const nodeKeyById = new Map(nodes.filter((node) => node.publishedKey).map((node) => [node.id, node.publishedKey!] as const));
  const styleKeyById = new Map(doc.styles.filter((style) => style.publishedKey).map((style) => [style.id, style.publishedKey!] as const));
  const variableKeyById = new Map(doc.variables.filter((variable) => variable.publishedKey).map((variable) => [variable.id, variable.publishedKey!] as const));
  return Object.fromEntries(
    nodes.map((node) => {
      const normalized = normalizeNodeForCompare(node, styleKeyById, variableKeyById, nodeKeyById);
      return [normalized.publishedKey ?? normalized.id, normalized] as const;
    }),
  );
}

function buildPublishedComponentPayload(component: PublishedLibraryComponent) {
  const nodes = Object.values(component.nodes);
  const styleKeys = new Map<string, string>();
  const variableKeys = new Map<string, string>();
  const nodeKeys = new Map(nodes.map((node) => [node.id, node.publishedKey ?? node.id] as const));
  return Object.fromEntries(
    nodes.map((node) => {
      const normalized = normalizeNodeForCompare(node, styleKeys, variableKeys, nodeKeys);
      return [normalized.publishedKey ?? normalized.id, normalized] as const;
    }),
  );
}

export function buildDesignLibraryUpdatePreview(doc: Doc, snapshot: PublishedLibrarySnapshot): LibraryUpdatePreview {
  const current = doc.libraries?.find((library) => library.id === snapshot.library.id);
  const usage = computeDesignLibraryUsage(doc, snapshot.library.id);
  const components: LibraryPreviewBucket = { added: [], updated: [], removed: [] };
  const styles: LibraryPreviewBucket = { added: [], updated: [], removed: [] };
  const variables: LibraryPreviewBucket = { added: [], updated: [], removed: [] };

  const currentStyles = new Map(
    doc.styles
      .filter((style) => style.sourceLibraryId === snapshot.library.id && style.publishedKey)
      .map((style) => [style.publishedKey!, normalizeStyleForCompare(style)] as const),
  );
  const currentVariables = new Map(
    doc.variables
      .filter((variable) => variable.sourceLibraryId === snapshot.library.id && variable.publishedKey)
      .map((variable) => [variable.publishedKey!, normalizeVariableForCompare(variable)] as const),
  );
  const incomingStyles = new Map(
    snapshot.styles.map((style) => [(style.publishedKey ?? buildLibraryStyleKey(style)), normalizeStyleForCompare(style)] as const),
  );
  const incomingVariables = new Map(
    snapshot.variables.map((variable) => [
      variable.publishedKey ?? buildLibraryVariableKey(variable),
      normalizeVariableForCompare(variable),
    ] as const),
  );

  snapshot.manifest.componentKeys.forEach((componentKey) => {
    const currentPayload = buildCurrentComponentPayload(doc, snapshot.library.id, componentKey);
    const incomingComponent = snapshot.components.find((component) => component.publishedKey === componentKey);
    const incomingPayload = incomingComponent ? buildPublishedComponentPayload(incomingComponent) : null;
    if (!currentPayload) components.added.push(componentKey);
    else if (!compareJson(currentPayload, incomingPayload)) components.updated.push(componentKey);
  });
  (current?.componentKeys ?? []).forEach((componentKey) => {
    if (!snapshot.manifest.componentKeys.includes(componentKey)) components.removed.push(componentKey);
  });

  snapshot.manifest.styleKeys.forEach((styleKey) => {
    const existing = currentStyles.get(styleKey);
    const incoming = incomingStyles.get(styleKey);
    if (!existing || !incoming) {
      if (incoming) styles.added.push(styleKey);
    } else if (!compareJson(existing, incoming)) {
      styles.updated.push(styleKey);
    }
  });
  Array.from(currentStyles.keys()).forEach((styleKey) => {
    if (!incomingStyles.has(styleKey)) styles.removed.push(styleKey);
  });

  snapshot.manifest.variableKeys.forEach((variableKey) => {
    const existing = currentVariables.get(variableKey);
    const incoming = incomingVariables.get(variableKey);
    if (!existing || !incoming) {
      if (incoming) variables.added.push(variableKey);
    } else if (!compareJson(existing, incoming)) {
      variables.updated.push(variableKey);
    }
  });
  Array.from(currentVariables.keys()).forEach((variableKey) => {
    if (!incomingVariables.has(variableKey)) variables.removed.push(variableKey);
  });

  return {
    libraryId: snapshot.library.id,
    name: snapshot.library.name,
    currentVersionId: current?.currentVersionId,
    nextVersionId: snapshot.library.versionId,
    hasChanges:
      components.added.length + components.updated.length + components.removed.length +
        styles.added.length + styles.updated.length + styles.removed.length +
        variables.added.length + variables.updated.length + variables.removed.length >
      0,
    components,
    styles,
    variables,
    usage,
  };
}

export function markLibraryUpdateAvailable(doc: Doc, preview: LibraryUpdatePreview) {
  const draft = cloneDoc(doc);
  const libraries = [...(draft.libraries ?? [])];
  const index = libraries.findIndex((library) => library.id === preview.libraryId);
  if (index >= 0) {
    libraries[index] = {
      ...libraries[index],
      latestVersionId: preview.nextVersionId,
      lastCheckedAt: new Date().toISOString(),
      status: preview.hasChanges ? "update-available" : "up-to-date",
    };
  } else {
    libraries.push({
      id: preview.libraryId,
      name: preview.name,
      currentVersionId: preview.currentVersionId,
      latestVersionId: preview.nextVersionId,
      status: preview.hasChanges ? "update-available" : "up-to-date",
      lastCheckedAt: new Date().toISOString(),
    });
  }
  draft.libraries = libraries;
  return draft;
}
