import Link from "next/link";
import { notFound } from "next/navigation";

import { getStoreWidget } from "@/lib/widget-store";

type Props = { params: Promise<{ storeId: string }> };

export default async function WidgetStoreDetailPage({ params }: Props) {
  const { storeId } = await params;
  const widget = getStoreWidget(storeId);
  if (!widget) notFound();

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <p className="text-xs uppercase tracking-[0.2em] text-neutral-400">Widget Store</p>
      <h1 className="mt-2 text-3xl font-semibold text-neutral-900">{widget.name}</h1>
      <p className="mt-3 text-sm text-neutral-600">{widget.description}</p>
      {widget.detail ? <p className="mt-3 text-sm text-neutral-500">{widget.detail}</p> : null}
      <div className="mt-6 grid gap-3 rounded-xl border border-neutral-200 bg-white p-4 text-sm text-neutral-700">
        <div>Store ID: {widget.storeId}</div>
        <div>Category: {widget.category}</div>
        <div>Version: {widget.version}</div>
        <div>Default Frame: {widget.defaultFrame.w} × {widget.defaultFrame.h}</div>
        <div>Digest: {widget.digest}</div>
      </div>
      <div className="mt-6">
        <Link href="/editor/advanced" className="text-sm text-neutral-700 underline underline-offset-4">
          Open editor
        </Link>
      </div>
    </main>
  );
}
