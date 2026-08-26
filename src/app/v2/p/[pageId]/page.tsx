type Props = {
  params: Promise<{ pageId: string }>;
};

export default async function V2PublishedPage({ params }: Props) {
  const { pageId } = await params;

  return (
    <main className="min-h-screen bg-[#f5f7fb] px-6 py-16 text-slate-950">
      <div className="mx-auto max-w-5xl rounded-[28px] border border-slate-200 bg-white p-10 shadow-[0_16px_48px_rgba(15,23,42,0.08)]">
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
          V2 Runtime Scaffold
        </div>
        <h1 className="mt-4 text-3xl font-semibold">Published page placeholder</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
          This route is reserved for v2 preview/publish parity work. The current scaffold only
          confirms the namespace and page handoff boundary.
        </p>
        <div className="mt-8 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          pageId: <span className="font-mono">{pageId}</span>
        </div>
      </div>
    </main>
  );
}

