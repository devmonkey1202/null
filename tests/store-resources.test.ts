import { describe, expect, it } from "vitest";

import { addNode, createDoc, createNode } from "@/advanced/doc/scene";
import { createDefaultStoreGovernanceState, upsertApprovalRequest } from "@/advanced/ui/storeGovernanceModel";
import { buildResourceHubEntries } from "@/advanced/ui/resourceHub";
import { applyStoreWidgetUpdate, createStoreWidgetPayload } from "@/advanced/ui/widgetStore";
import { listStorePlugins } from "@/lib/plugin-store";
import { getStoreWidget, listStoreWidgets } from "@/lib/widget-store";

describe("store resources", () => {
  it("filters plugin store entries by query and category", () => {
    const exportCatalog = listStorePlugins({ category: "export" });
    expect(exportCatalog.plugins.map((plugin) => plugin.storeId)).toEqual(["store-export-pack"]);

    const queryCatalog = listStorePlugins({ q: "overlay" });
    expect(queryCatalog.plugins.map((plugin) => plugin.storeId)).toContain("store-performance");
  });

  it("lists widget store entries and updates installed store widgets", () => {
    const widgets = listStoreWidgets({ category: "ops" });
    expect(widgets.widgets.map((widget) => widget.storeId)).toEqual(["widget-perf-monitor"]);

    const perfWidget = getStoreWidget("widget-perf-monitor");
    expect(perfWidget?.digest).toBeTruthy();

    const doc = createDoc();
    const page = doc.pages[0]!;
    const node = createNode("frame", {
      id: "widget_node",
      name: "Old Widget",
      parentId: page.rootId,
      frame: { x: 40, y: 40, w: 400, h: 260, rotation: 0 },
      widget: {
        kind: "sandbox",
        storeId: "widget-perf-monitor",
        storeVersion: "0.9.0",
        src: "https://old.example.com",
      },
    });
    addNode(doc, node, page.rootId);

    const updated = applyStoreWidgetUpdate(doc, perfWidget!);
    expect(updated.updated).toBe(1);
    expect(updated.doc.nodes.widget_node?.name).toBe("Performance Monitor");
    expect(updated.doc.nodes.widget_node?.widget?.storeVersion).toBe("1.0.1");
    expect(updated.doc.nodes.widget_node?.widget?.digest).toBe(perfWidget?.digest);
    expect(createStoreWidgetPayload(perfWidget!).storeId).toBe("widget-perf-monitor");
  });

  it("builds a searchable resource hub across libraries, plugins, and widgets", () => {
    const pluginCatalog = listStorePlugins().plugins;
    const widgetCatalog = listStoreWidgets().widgets;
    const governance = upsertApprovalRequest(createDefaultStoreGovernanceState(), {
      id: "req_widget",
      type: "widget",
      storeId: "widget-team-board",
      status: "approved",
      requestedAt: "2026-03-20T00:01:00.000Z",
      updatedAt: "2026-03-20T00:02:00.000Z",
      requestedByUserId: "user_1",
      decidedByUserId: "admin_1",
      note: null,
    });
    const entries = buildResourceHubEntries({
      query: "team",
      libraries: [
        {
          id: "lib_core",
          name: "Core UI",
          currentVersionId: "libver_2",
          status: "up-to-date",
          componentKeys: ["Button"],
          styleKeys: ["Fill / Primary"],
          variableKeys: ["Brand / Primary"],
        },
      ],
      installedPlugins: [
        {
          id: "align-kit",
          name: "Align Kit",
          actions: [],
          permissions: ["editor"],
          version: "1.0.0",
        },
      ],
      storePlugins: pluginCatalog,
      storeWidgets: widgetCatalog,
      savedPluginStoreIds: ["store-export-pack"],
      savedWidgetStoreIds: ["widget-team-board"],
      storeApprovalRequests: governance.requests,
      storeGovernancePolicy: governance.policy,
    });

    expect(entries.map((entry) => entry.id)).toEqual(["widget-team-board"]);
    expect(entries[0]?.saved).toBe(true);
    expect(entries[0]?.type).toBe("widget-store");
    expect(entries[0]?.status).toBe("approved");
  });
});
