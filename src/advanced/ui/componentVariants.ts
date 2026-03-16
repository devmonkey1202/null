import type { ComponentVariant } from "../doc/scene";

export type VariantAxis = {
  key: string;
  values: string[];
};

export type VariantMatrixDuplicate = {
  props: Record<string, string>;
  variantIds: string[];
};

export type VariantMatrixReport = {
  axes: VariantAxis[];
  totalExpected: number;
  duplicates: VariantMatrixDuplicate[];
  missing: Record<string, string>[];
  complete: boolean;
};

export type MissingVariantFillPlan = {
  name: string;
  props: Record<string, string>;
  sourceVariantId: string;
};

function sortPropsEntries(props: Record<string, string>) {
  return Object.entries(props).sort((a, b) => a[0].localeCompare(b[0]));
}

function buildVariantSignature(props: Record<string, string>, axes: VariantAxis[]) {
  if (!axes.length) return "";
  return axes.map((axis) => `${axis.key}=${props[axis.key] ?? ""}`).join("|");
}

function buildCartesianProduct(axes: VariantAxis[]) {
  if (!axes.length) return [];
  return axes.reduce<Record<string, string>[]>(
    (acc, axis) =>
      acc.flatMap((item) =>
        axis.values.map((value) => ({
          ...item,
          [axis.key]: value,
        })),
      ),
    [{}],
  );
}

export function formatVariantProps(props?: Record<string, string>): string {
  if (!props || Object.keys(props).length === 0) return "";
  return sortPropsEntries(props)
    .map(([key, value]) => `${key}=${value}`)
    .join(", ");
}

export function getVariantProps(variant?: ComponentVariant | null): Record<string, string> {
  return variant?.props ? { ...variant.props } : {};
}

export function getVariantAxes(variants?: ComponentVariant[]): VariantAxis[] {
  if (!variants?.length) return [];
  const valuesByAxis = new Map<string, Set<string>>();

  variants.forEach((variant) => {
    Object.entries(variant.props ?? {}).forEach(([key, value]) => {
      if (!valuesByAxis.has(key)) valuesByAxis.set(key, new Set());
      valuesByAxis.get(key)!.add(value);
    });
  });

  return Array.from(valuesByAxis.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, values]) => ({
      key,
      values: Array.from(values).sort((a, b) => a.localeCompare(b)),
    }));
}

export function buildVariantPropsTemplate(variants?: ComponentVariant[]): Record<string, string> | undefined {
  const axes = getVariantAxes(variants);
  if (axes.length === 0) return undefined;
  const seed = getVariantProps(variants?.[variants.length - 1] ?? variants?.[0] ?? null);
  axes.forEach((axis) => {
    if (!seed[axis.key]) seed[axis.key] = axis.values[0] ?? "Default";
  });
  return seed;
}

export function setVariantProp(
  variant: ComponentVariant,
  key: string,
  value: string,
): ComponentVariant {
  const nextProps = { ...(variant.props ?? {}) };
  const trimmedKey = key.trim();
  if (!trimmedKey) return variant;
  if (value.trim()) nextProps[trimmedKey] = value.trim();
  else delete nextProps[trimmedKey];
  return {
    ...variant,
    props: Object.keys(nextProps).length ? nextProps : undefined,
  };
}

export function addVariantAxis(
  variants: ComponentVariant[] | undefined,
  key: string,
  defaultValue = "Default",
): ComponentVariant[] {
  const trimmedKey = key.trim();
  if (!trimmedKey || !variants?.length) return variants ?? [];
  return variants.map((variant) =>
    setVariantProp(
      variant,
      trimmedKey,
      (variant.props ?? {})[trimmedKey] ?? defaultValue,
    ),
  );
}

export function removeVariantAxis(
  variants: ComponentVariant[] | undefined,
  key: string,
): ComponentVariant[] {
  const trimmedKey = key.trim();
  if (!trimmedKey || !variants?.length) return variants ?? [];
  return variants.map((variant) => {
    if (!variant.props?.[trimmedKey]) return variant;
    const nextProps = { ...variant.props };
    delete nextProps[trimmedKey];
    return {
      ...variant,
      props: Object.keys(nextProps).length ? nextProps : undefined,
    };
  });
}

export function findVariantByProps(
  variants: ComponentVariant[] | undefined,
  props: Record<string, string>,
  fallbackVariantId?: string,
): ComponentVariant | null {
  if (!variants?.length) return null;
  const keys = Object.keys(props);
  if (keys.length === 0) {
    return variants.find((variant) => variant.id === fallbackVariantId) ?? variants[0] ?? null;
  }

  const exactMatch = variants.find((variant) =>
    keys.every((key) => (variant.props ?? {})[key] === props[key]),
  );
  if (exactMatch) return exactMatch;

  if (fallbackVariantId) {
    const fallback = variants.find((variant) => variant.id === fallbackVariantId);
    if (fallback) return fallback;
  }

  let best: ComponentVariant | null = null;
  let bestScore = -1;
  variants.forEach((variant) => {
    const score = keys.reduce((total, key) => total + (((variant.props ?? {})[key] === props[key]) ? 1 : 0), 0);
    if (score > bestScore) {
      best = variant;
      bestScore = score;
    }
  });
  return best ?? variants[0] ?? null;
}

export function analyzeVariantMatrix(variants?: ComponentVariant[]): VariantMatrixReport {
  const axes = getVariantAxes(variants);
  if (!variants?.length || !axes.length) {
    return {
      axes,
      totalExpected: variants?.length ? 1 : 0,
      duplicates: [],
      missing: [],
      complete: true,
    };
  }

  const bySignature = new Map<string, ComponentVariant[]>();
  variants.forEach((variant) => {
    const signature = buildVariantSignature(getVariantProps(variant), axes);
    const list = bySignature.get(signature) ?? [];
    list.push(variant);
    bySignature.set(signature, list);
  });

  const duplicates = Array.from(bySignature.values())
    .filter((list) => list.length > 1)
    .map((list) => ({
      props: getVariantProps(list[0]),
      variantIds: list.map((variant) => variant.id),
    }));

  const missing = buildCartesianProduct(axes).filter((props) => {
    const signature = buildVariantSignature(props, axes);
    return !bySignature.has(signature);
  });

  return {
    axes,
    totalExpected: axes.reduce((total, axis) => total * Math.max(1, axis.values.length), 1),
    duplicates,
    missing,
    complete: duplicates.length === 0 && missing.length === 0,
  };
}

export function planMissingVariantFill(variants?: ComponentVariant[]): MissingVariantFillPlan[] {
  if (!variants?.length) return [];
  const report = analyzeVariantMatrix(variants);
  return report.missing
    .map((props, index) => {
      const sourceVariant = findVariantByProps(variants, props);
      if (!sourceVariant) return null;
      return {
        name: formatVariantProps(props) || `Variant ${index + 1}`,
        props,
        sourceVariantId: sourceVariant.id,
      };
    })
    .filter((item): item is MissingVariantFillPlan => Boolean(item));
}
