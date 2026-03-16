import { cloneDoc, type Doc } from "../doc/scene";
import type { StoreWidget } from "@/lib/widget-store";

export function createStoreWidgetPayload(widget: StoreWidget & { digest?: string }) {
  return {
    ...widget.widget,
    storeId: widget.storeId,
    storeVersion: widget.version,
    digest: widget.digest,
  };
}

export function applyStoreWidgetUpdate(doc: Doc, widget: StoreWidget & { digest?: string }) {
  const next = cloneDoc(doc);
  let updated = 0;
  Object.values(next.nodes).forEach((node) => {
    if (node.widget?.storeId !== widget.storeId) return;
    node.name = widget.name;
    node.widget = createStoreWidgetPayload(widget);
    updated += 1;
  });
  return { doc: next, updated };
}
