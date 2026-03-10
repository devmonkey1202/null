import { prisma } from "@/lib/db";
import { parseSemver, isWithinRange } from "@/lib/semver";
import pkg from "../../package.json";

type PluginActionBase = {
  id: string;
  label: string;
  params?: Record<string, unknown>;
};

export type PluginAction =
  | (PluginActionBase & { type: "macro"; steps: PluginAction[] })
  | (PluginActionBase & { type: "align" | "distribute" | "exportTokens" | "exportSelectionPng" | "exportSelectionSvg" | "toggleGrid" | "togglePixelGrid" | "toggleAudit" | "togglePerformance" })
  | (PluginActionBase & { type: "openUrl"; url: string })
  | (PluginActionBase & { type: string });

export type PluginManifest = {
  id: string;
  name: string;
  description?: string;
  version?: string;
  minAppVersion?: string;
  maxAppVersion?: string;
  permissions?: string[];
  actions: PluginAction[];
  storeId?: string;
  storeVersion?: string;
  digest?: string;
  frozen?: boolean;
  installedAt?: string;
};

export type PluginPermissionGrant = {
  id: string;
  name: string;
  version?: string;
  permissions: string[];
  grantedAt: string;
};

export type PluginUpdatePolicy = {
  id: string;
  policy: "manual" | "auto" | "pinned";
  pinnedVersion?: string;
  updatedAt: string;
};

const PLUGIN_SETTING_KEY = "app_plugins";
const PLUGIN_PERMISSION_KEY = "app_plugin_permissions";
const PLUGIN_UPDATE_POLICY_KEY = "app_plugin_update_policies";
const MAX_PLUGIN_MANIFESTS = 50;
const MAX_PLUGIN_ACTIONS = 200;
const MAX_PLUGIN_STEPS = 50;
const MAX_PLUGIN_DEPTH = 4;

const APP_VERSION = typeof pkg?.version === "string" ? pkg.version : "0.1.0";

const ALLOWED_PLUGIN_ACTIONS = new Set([
  "macro",
  "align",
  "distribute",
  "exportTokens",
  "exportSelectionPng",
  "exportSelectionSvg",
  "toggleGrid",
  "togglePixelGrid",
  "toggleAudit",
  "togglePerformance",
  "openUrl",
]);

const ALLOWED_PERMISSIONS = new Set([
  "editor",
  "export",
  "network",
  "ui",
  "data_read",
  "data_write",
  "workflow",
  "secrets_read",
]);

const ACTION_PERMISSION: Record<string, string | null> = {
  align: "editor",
  distribute: "editor",
  exportTokens: "export",
  exportSelectionPng: "export",
  exportSelectionSvg: "export",
  toggleGrid: "ui",
  togglePixelGrid: "ui",
  toggleAudit: "ui",
  togglePerformance: "ui",
  openUrl: "network",
  macro: null,
};

function isSafeExternalUrl(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function normalizePluginAction(
  raw: unknown,
  depth: number,
  budget: { count: number },
  permissions: Set<string>,
): PluginAction | null {
  if (!raw || typeof raw !== "object") return null;
  if (depth > MAX_PLUGIN_DEPTH) return null;
  const input = raw as Record<string, unknown>;
  if (typeof input.id !== "string" || typeof input.label !== "string" || typeof input.type !== "string") return null;
  if (!ALLOWED_PLUGIN_ACTIONS.has(input.type)) return null;
  const requiredPermission = ACTION_PERMISSION[input.type] ?? null;
  if (requiredPermission && !permissions.has(requiredPermission)) return null;
  if (budget.count >= MAX_PLUGIN_ACTIONS) return null;

  const action: PluginAction = {
    id: String(input.id),
    label: String(input.label),
    type: String(input.type),
  } as PluginAction;
  budget.count += 1;

  if (input.params && typeof input.params === "object" && !Array.isArray(input.params)) {
    (action as PluginAction).params = input.params as Record<string, unknown>;
  }

  if (action.type === "openUrl") {
    const safe = typeof input.url === "string" ? isSafeExternalUrl(input.url) : null;
    if (!safe) return null;
    (action as PluginAction & { url: string }).url = safe;
  }

  if (action.type === "macro") {
    const stepsRaw = Array.isArray(input.steps) ? input.steps : [];
    const steps: PluginAction[] = [];
    for (const step of stepsRaw) {
      const normalized = normalizePluginAction(step, depth + 1, budget, permissions);
      if (normalized) steps.push(normalized);
      if (steps.length >= MAX_PLUGIN_STEPS) break;
    }
    if (!steps.length) return null;
    (action as PluginAction & { steps: PluginAction[] }).steps = steps;
  }

  return action;
}

function normalizePluginManifest(raw: unknown): PluginManifest | null {
  if (!raw || typeof raw !== "object") return null;
  const input = raw as Record<string, unknown>;
  if (typeof input.id !== "string" || typeof input.name !== "string") return null;

  const permissions = Array.isArray(input.permissions)
    ? input.permissions.filter((p) => typeof p === "string" && ALLOWED_PERMISSIONS.has(p))
    : [];

  const minVersion = parseSemver(typeof input.minAppVersion === "string" ? input.minAppVersion : "");
  const maxVersion = parseSemver(typeof input.maxAppVersion === "string" ? input.maxAppVersion : "");
  const appVersion = parseSemver(APP_VERSION);
  if (appVersion && !isWithinRange(appVersion, minVersion, maxVersion)) return null;

  const budget = { count: 0 };
  const actionsRaw = Array.isArray(input.actions) ? input.actions : [];
  const actions = actionsRaw
    .map((a) => normalizePluginAction(a, 0, budget, new Set(permissions)))
    .filter((a): a is PluginAction => Boolean(a));

  if (!actions.length) return null;

  const storeId = typeof input.storeId === "string" ? input.storeId : undefined;
  const storeVersion = typeof input.storeVersion === "string" ? input.storeVersion : undefined;
  const digest = typeof input.digest === "string" ? input.digest : undefined;
  const frozen = typeof input.frozen === "boolean" ? input.frozen : undefined;
  const installedAt = typeof input.installedAt === "string" ? input.installedAt : undefined;

  return {
    id: String(input.id),
    name: String(input.name),
    description: typeof input.description === "string" ? input.description : undefined,
    version: typeof input.version === "string" ? input.version : undefined,
    minAppVersion: typeof input.minAppVersion === "string" ? input.minAppVersion : undefined,
    maxAppVersion: typeof input.maxAppVersion === "string" ? input.maxAppVersion : undefined,
    permissions: permissions.length ? permissions : undefined,
    actions,
    storeId,
    storeVersion,
    digest,
    frozen,
    installedAt,
  };
}

function normalizePluginList(raw: unknown): PluginManifest[] {
  const list = Array.isArray(raw) ? raw : [];
  const normalized = list
    .slice(0, MAX_PLUGIN_MANIFESTS)
    .map((item) => normalizePluginManifest(item))
    .filter((item): item is PluginManifest => Boolean(item));
  const map = new Map<string, PluginManifest>();
  normalized.forEach((p) => map.set(p.id, p));
  return Array.from(map.values());
}

export function previewPlugins(raw: unknown): PluginManifest[] {
  return normalizePluginList(raw);
}

export async function getPlugins(pageId: string) {
  const row = await prisma.pageSetting.findUnique({
    where: { page_id_key: { page_id: pageId, key: PLUGIN_SETTING_KEY } },
    select: { value: true },
  });
  return normalizePluginList(row?.value ?? []);
}

export async function setPlugins(pageId: string, plugins: PluginManifest[]) {
  const normalized = normalizePluginList(plugins);
  const current = await getPlugins(pageId);
  const currentMap = new Map(current.map((p) => [p.id, p]));
  const merged = normalized.map((plugin) => {
    const existing = currentMap.get(plugin.id);
    if (existing?.frozen) {
      const digestChanged = existing.digest && plugin.digest ? existing.digest !== plugin.digest : true;
      if (digestChanged) {
        return existing;
      }
    }
    if (existing?.installedAt && !plugin.installedAt) {
      return { ...plugin, installedAt: existing.installedAt };
    }
    return plugin;
  });
  await prisma.pageSetting.upsert({
    where: { page_id_key: { page_id: pageId, key: PLUGIN_SETTING_KEY } },
    update: { value: merged as unknown as object },
    create: { page_id: pageId, key: PLUGIN_SETTING_KEY, value: merged as unknown as object },
  });
  return merged;
}

export async function getPluginPermissionGrants(pageId: string) {
  const row = await prisma.pageSetting.findUnique({
    where: { page_id_key: { page_id: pageId, key: PLUGIN_PERMISSION_KEY } },
    select: { value: true },
  });
  return (Array.isArray(row?.value) ? row?.value : []) as PluginPermissionGrant[];
}

export async function setPluginPermissionGrants(pageId: string, grants: PluginPermissionGrant[]) {
  await prisma.pageSetting.upsert({
    where: { page_id_key: { page_id: pageId, key: PLUGIN_PERMISSION_KEY } },
    update: { value: grants as unknown as object },
    create: { page_id: pageId, key: PLUGIN_PERMISSION_KEY, value: grants as unknown as object },
  });
  return grants;
}

export async function grantPluginPermissions(pageId: string, plugin: PluginManifest) {
  const current = await getPluginPermissionGrants(pageId);
  const next = current.filter((g) => g.id !== plugin.id);
  next.push({
    id: plugin.id,
    name: plugin.name,
    version: plugin.version,
    permissions: Array.isArray(plugin.permissions) ? plugin.permissions : [],
    grantedAt: new Date().toISOString(),
  });
  return setPluginPermissionGrants(pageId, next);
}

export async function revokePluginPermissions(pageId: string, pluginId: string) {
  const current = await getPluginPermissionGrants(pageId);
  const next = current.filter((g) => g.id !== pluginId);
  return setPluginPermissionGrants(pageId, next);
}

export async function getPluginUpdatePolicies(pageId: string) {
  const row = await prisma.pageSetting.findUnique({
    where: { page_id_key: { page_id: pageId, key: PLUGIN_UPDATE_POLICY_KEY } },
    select: { value: true },
  });
  return (Array.isArray(row?.value) ? row?.value : []) as PluginUpdatePolicy[];
}

export async function setPluginUpdatePolicies(pageId: string, policies: PluginUpdatePolicy[]) {
  await prisma.pageSetting.upsert({
    where: { page_id_key: { page_id: pageId, key: PLUGIN_UPDATE_POLICY_KEY } },
    update: { value: policies as unknown as object },
    create: { page_id: pageId, key: PLUGIN_UPDATE_POLICY_KEY, value: policies as unknown as object },
  });
  return policies;
}

export async function upsertPluginUpdatePolicy(pageId: string, policy: PluginUpdatePolicy) {
  const current = await getPluginUpdatePolicies(pageId);
  const next = current.filter((p) => p.id !== policy.id);
  next.push(policy);
  return setPluginUpdatePolicies(pageId, next);
}

export async function addPlugins(pageId: string, plugins: PluginManifest[]) {
  const current = await getPlugins(pageId);
  const map = new Map(current.map((p) => [p.id, p]));
  for (const plugin of normalizePluginList(plugins)) {
    const existing = map.get(plugin.id);
    let next = plugin;
    if (existing?.frozen) {
      const digestChanged = existing.digest && plugin.digest ? existing.digest !== plugin.digest : true;
      if (digestChanged) {
        next = existing;
      }
    }
    if (existing?.installedAt && !next.installedAt) {
      next = { ...next, installedAt: existing.installedAt };
    }
    map.set(plugin.id, next);
  }
  return setPlugins(pageId, Array.from(map.values()));
}

export async function removePlugin(pageId: string, pluginId: string) {
  const current = await getPlugins(pageId);
  const next = current.filter((p) => p.id !== pluginId);
  return setPlugins(pageId, next);
}
