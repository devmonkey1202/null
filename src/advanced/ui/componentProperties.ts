import type { NodeType } from "../doc/scene";

export type ComponentPropertyKind = "text" | "boolean" | "instance";

export type ComponentPropertyDefinition = {
  kind: ComponentPropertyKind;
  name: string;
};

export type ComponentPropertyMap = Record<string, ComponentPropertyDefinition>;

function normalizeName(value: string, fallback: string) {
  const trimmed = value.trim();
  return trimmed || fallback.trim() || "Property";
}

export function isComponentPropertyKindCompatible(
  nodeType: NodeType | undefined,
  kind: ComponentPropertyKind,
) {
  if (kind === "text") return nodeType === "text";
  if (kind === "instance") return nodeType === "instance";
  return true;
}

export function findDuplicateComponentPropertyNames(definitions?: ComponentPropertyMap) {
  if (!definitions) return [];
  const counts = new Map<string, number>();
  Object.values(definitions).forEach((definition) => {
    const normalized = definition.name.trim().toLowerCase();
    if (!normalized) return;
    counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
  });
  return Array.from(counts.entries())
    .filter(([, count]) => count > 1)
    .map(([name]) => name);
}

export function getUniqueComponentPropertyName(
  definitions: ComponentPropertyMap | undefined,
  targetId: string,
  desiredName: string,
  fallbackName: string,
) {
  const base = normalizeName(desiredName, fallbackName);
  const used = new Set(
    Object.entries(definitions ?? {})
      .filter(([id]) => id !== targetId)
      .map(([, definition]) => definition.name.trim().toLowerCase())
      .filter(Boolean),
  );
  if (!used.has(base.toLowerCase())) return base;

  let index = 2;
  while (used.has(`${base} ${index}`.toLowerCase())) {
    index += 1;
  }
  return `${base} ${index}`;
}

export function upsertComponentPropertyDefinition(
  definitions: ComponentPropertyMap | undefined,
  targetId: string,
  definition: ComponentPropertyDefinition | null,
  fallbackName: string,
) {
  const next = { ...(definitions ?? {}) };
  if (!definition) {
    delete next[targetId];
    return Object.keys(next).length ? next : undefined;
  }

  next[targetId] = {
    ...definition,
    name: getUniqueComponentPropertyName(next, targetId, definition.name, fallbackName),
  };
  return next;
}
