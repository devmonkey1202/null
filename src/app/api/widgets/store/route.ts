import { NextResponse } from "next/server";

import { withPublicCache } from "@/lib/cache-policy";
import { getStoreWidget, listStoreWidgets, type StoreWidgetCategory } from "@/lib/widget-store";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get("q") ?? undefined;
  const category = (url.searchParams.get("category") as StoreWidgetCategory | "all" | null) ?? undefined;
  const storeId = url.searchParams.get("storeId") ?? undefined;
  const catalog = storeId ? { version: listStoreWidgets().version, widgets: [getStoreWidget(storeId)].filter(Boolean) } : listStoreWidgets({ q, category, storeId });
  const res = NextResponse.json(catalog);
  return withPublicCache(res, { maxAgeSeconds: 60, staleWhileRevalidateSeconds: 600, tags: ["widget-store"] });
}
