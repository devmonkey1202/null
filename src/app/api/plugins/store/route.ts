import { NextResponse } from "next/server";
import { listStorePlugins } from "@/lib/plugin-store";
import { withPublicCache } from "@/lib/cache-policy";

export async function GET() {
  const catalog = listStorePlugins();
  const res = NextResponse.json(catalog);
  return withPublicCache(res, { maxAgeSeconds: 60, staleWhileRevalidateSeconds: 600 });
}
