import type { LibraryRef } from "../doc/scene";
import type { StoreApprovalRequest, StoreGovernancePolicy } from "./storeGovernanceModel";
import type { PluginManifest } from "@/lib/app-plugins";
import type { StorePlugin } from "@/lib/plugin-store";
import { formatStoreApprovalLabel, getStorePluginGovernanceState, getStoreWidgetGovernanceState } from "@/lib/store-governance-rules";
import type { StoreWidget } from "@/lib/widget-store";

export type ResourceHubEntry =
  | { id: string; type: "library"; title: string; subtitle: string; keywords: string[]; status?: string; saved?: boolean }
  | { id: string; type: "installed-plugin"; title: string; subtitle: string; keywords: string[]; status?: string; saved?: boolean }
  | { id: string; type: "plugin-store"; title: string; subtitle: string; keywords: string[]; status?: string; saved?: boolean }
  | { id: string; type: "widget-store"; title: string; subtitle: string; keywords: string[]; status?: string; saved?: boolean };

export type ResourceHubFilters = {
  query?: string;
  type?: ResourceHubEntry["type"] | "all";
  libraries?: LibraryRef[];
  installedPlugins?: PluginManifest[];
  storePlugins?: (StorePlugin & { digest?: string; storeVersion?: string })[];
  storeWidgets?: (StoreWidget & { digest?: string; storeVersion?: string })[];
  savedPluginStoreIds?: string[];
  savedWidgetStoreIds?: string[];
  storeApprovalRequests?: StoreApprovalRequest[];
  storeGovernancePolicy?: StoreGovernancePolicy;
};

function matches(entry: ResourceHubEntry, filters: ResourceHubFilters) {
  if (filters.type && filters.type !== "all" && entry.type !== filters.type) return false;
  const query = filters.query?.trim().toLowerCase();
  if (!query) return true;
  return [entry.title, entry.subtitle, ...entry.keywords].some((value) => value.toLowerCase().includes(query));
}

export function buildResourceHubEntries(filters: ResourceHubFilters) {
  const libraries = (filters.libraries ?? []).map<ResourceHubEntry>((library) => ({
    id: library.id,
    type: "library",
    title: library.name,
    subtitle: library.currentVersionId ? `Library ${library.currentVersionId}` : "Library",
    keywords: [library.name, ...(library.componentKeys ?? []), ...(library.styleKeys ?? []), ...(library.variableKeys ?? [])],
    status: library.status,
  }));

  const installedPlugins = (filters.installedPlugins ?? []).map<ResourceHubEntry>((plugin) => ({
    id: plugin.id,
    type: "installed-plugin",
    title: plugin.name,
    subtitle: plugin.version ? `Installed plugin v${plugin.version}` : "Installed plugin",
    keywords: [plugin.name, plugin.description ?? "", ...(plugin.permissions ?? [])],
    status: plugin.frozen ? "frozen" : "installed",
  }));

  const storePlugins = (filters.storePlugins ?? []).map<ResourceHubEntry>((plugin) => {
    const governance = filters.storeGovernancePolicy
      ? getStorePluginGovernanceState(plugin, filters.storeGovernancePolicy, filters.storeApprovalRequests ?? [])
      : null;
    return {
      id: plugin.storeId,
      type: "plugin-store",
      title: plugin.name,
      subtitle: `${plugin.category} plugin${plugin.version ? ` · v${plugin.version}` : ""}`,
      keywords: [plugin.name, plugin.description ?? "", plugin.detail ?? "", ...(plugin.tags ?? [])],
      status:
        governance
          ? governance.blockedPermissions.length
            ? `blocked:${governance.blockedPermissions.join(",")}`
            : formatStoreApprovalLabel(governance.approval)
          : plugin.approvalRequired
            ? "approval-required"
            : "ready",
      saved: (filters.savedPluginStoreIds ?? []).includes(plugin.storeId),
    };
  });

  const storeWidgets = (filters.storeWidgets ?? []).map<ResourceHubEntry>((widget) => {
    const governance = filters.storeGovernancePolicy
      ? getStoreWidgetGovernanceState(widget, filters.storeGovernancePolicy, filters.storeApprovalRequests ?? [])
      : null;
    return {
      id: widget.storeId,
      type: "widget-store",
      title: widget.name,
      subtitle: `${widget.category} widget · v${widget.version}`,
      keywords: [widget.name, widget.description, widget.detail ?? "", ...(widget.tags ?? [])],
      status: governance ? formatStoreApprovalLabel(governance.approval) : widget.approvalRequired ? "approval-required" : "ready",
      saved: (filters.savedWidgetStoreIds ?? []).includes(widget.storeId),
    };
  });

  return [...libraries, ...installedPlugins, ...storePlugins, ...storeWidgets].filter((entry) => matches(entry, filters));
}
