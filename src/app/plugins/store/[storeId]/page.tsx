import Link from "next/link";
import { notFound } from "next/navigation";

import { getStorePlugin } from "@/lib/plugin-store";

type Props = { params: Promise<{ storeId: string }> };

export default async function PluginStoreDetailPage({ params }: Props) {
  const { storeId } = await params;
  const plugin = getStorePlugin(storeId);
  if (!plugin) notFound();

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <p className="text-xs uppercase tracking-[0.2em] text-neutral-400">Plugin Store</p>
      <h1 className="mt-2 text-3xl font-semibold text-neutral-900">{plugin.name}</h1>
      <p className="mt-3 text-sm text-neutral-600">{plugin.description}</p>
      {plugin.detail ? <p className="mt-3 text-sm text-neutral-500">{plugin.detail}</p> : null}
      <div className="mt-6 grid gap-3 rounded-xl border border-neutral-200 bg-white p-4 text-sm text-neutral-700">
        <div>Store ID: {plugin.storeId}</div>
        <div>Category: {plugin.category}</div>
        <div>Version: {plugin.version ?? "-"}</div>
        <div>Permissions: {(plugin.permissions ?? []).join(", ") || "-"}</div>
        <div>Digest: {plugin.digest}</div>
      </div>
      <div className="mt-6">
        <Link href="/editor/advanced" className="text-sm text-neutral-700 underline underline-offset-4">
          Open editor
        </Link>
      </div>
    </main>
  );
}
