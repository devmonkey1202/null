import { NextResponse } from "next/server";
import { getStorePlugin, listStorePlugins } from "@/lib/plugin-store";
import { withPublicCache } from "@/lib/cache-policy";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get("q") ?? undefined;
  const category = (url.searchParams.get("category") as "editor" | "export" | "runtime" | "ops" | "all" | null) ?? undefined;
  const storeId = url.searchParams.get("storeId") ?? undefined;
  const catalog = storeId ? { version: listStorePlugins().version, plugins: [getStorePlugin(storeId)].filter(Boolean) } : listStorePlugins({ q, category, storeId });
  const res = NextResponse.json(catalog);
  return withPublicCache(res, { maxAgeSeconds: 60, staleWhileRevalidateSeconds: 600, tags: ["plugin-store"] });
}
