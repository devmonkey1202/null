import Link from "next/link";
import { notFound } from "next/navigation";

import { PERMISSION_LABELS } from "@/lib/plugin-permissions";
import { getStorePlugin } from "@/lib/plugin-store";

type Props = { params: Promise<{ storeId: string }> };

const CATEGORY_LABELS = {
  editor: "에디터",
  export: "내보내기",
  runtime: "런타임",
  ops: "운영",
} as const;

export default async function PluginStoreDetailPage({ params }: Props) {
  const { storeId } = await params;
  const plugin = getStorePlugin(storeId);
  if (!plugin) notFound();

  const permissions = (plugin.permissions ?? []).map((permission) => PERMISSION_LABELS[permission] ?? permission);

  return (
    <main className="market-store-shell min-h-screen px-6 py-10 text-slate-900">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <section className="market-detail-hero overflow-hidden rounded-[32px] border border-[#D7E0F8] bg-[radial-gradient(circle_at_top_left,_rgba(125,211,252,0.18),_transparent_34%),linear-gradient(135deg,#0F172A_0%,#172554_52%,#1D4ED8_100%)] p-8 text-white shadow-[0_28px_90px_rgba(15,23,42,0.18)]">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-medium text-blue-50">
              {CATEGORY_LABELS[plugin.category]}
            </span>
            {plugin.featured ? (
              <span className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-slate-950">추천</span>
            ) : null}
            {plugin.approvalRequired ? (
              <span className="rounded-full bg-amber-100 px-3 py-1 text-[11px] font-semibold text-amber-900">
                승인 필요
              </span>
            ) : null}
          </div>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight">{plugin.name}</h1>
          <p className="mt-4 max-w-3xl text-sm leading-6 text-blue-50/90">{plugin.description}</p>
          {plugin.detail ? <p className="mt-3 max-w-3xl text-sm leading-6 text-blue-50/75">{plugin.detail}</p> : null}

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href={`/editor/advanced?pluginStoreId=${encodeURIComponent(plugin.storeId)}`}
              className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-950"
            >
              편집기에서 바로 열기
            </Link>
            <Link
              href="/plugins/store"
              className="rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium text-white"
            >
              카탈로그로 돌아가기
            </Link>
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
          <article className="rounded-[28px] border border-[#DDE4F3] bg-white p-6 shadow-[0_18px_48px_rgba(15,23,42,0.06)]">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Package</div>
            <h2 className="mt-2 text-xl font-semibold text-slate-950">설치 판단에 필요한 정보</h2>
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <SpecCard label="스토어 ID" value={plugin.storeId} />
              <SpecCard label="버전" value={plugin.version ?? "-"} />
              <SpecCard label="스토어 경로" value={plugin.sharePath ?? `/plugins/store/${plugin.storeId}`} />
              <SpecCard label="Digest" value={plugin.digest} mono />
            </div>
          </article>

          <article className="rounded-[28px] border border-[#DDE4F3] bg-white p-6 shadow-[0_18px_48px_rgba(15,23,42,0.06)]">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Risk</div>
            <h2 className="mt-2 text-xl font-semibold text-slate-950">권한과 검토 포인트</h2>
            <div className="mt-5 space-y-3">
              <SpecRow label="권한">{permissions.length ? permissions.join(", ") : "별도 권한 없음"}</SpecRow>
              <SpecRow label="승인">{plugin.approvalRequired ? "운영 검토 후 설치" : "즉시 설치 가능"}</SpecRow>
              <SpecRow label="액션 수">{`${plugin.actions?.length ?? 0}개`}</SpecRow>
            </div>
          </article>
        </section>

        <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <article className="rounded-[28px] border border-[#DDE4F3] bg-white p-6 shadow-[0_18px_48px_rgba(15,23,42,0.06)]">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Actions</div>
            <h2 className="mt-2 text-xl font-semibold text-slate-950">설치 후 제공되는 액션</h2>
            <div className="mt-5 space-y-3">
              {(plugin.actions ?? []).length ? (
                plugin.actions?.map((action) => (
                  <div key={action.id} className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-4">
                    <div className="text-sm font-semibold text-slate-950">{action.label}</div>
                    <div className="mt-1 text-[12px] text-slate-500">
                      액션 ID {action.id} · 타입 {action.type}
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-[22px] border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
                  노출할 액션 정보가 없습니다.
                </div>
              )}
            </div>
          </article>

          <article className="rounded-[28px] border border-[#DDE4F3] bg-white p-6 shadow-[0_18px_48px_rgba(15,23,42,0.06)]">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Tags</div>
            <h2 className="mt-2 text-xl font-semibold text-slate-950">빠른 분류</h2>
            <div className="mt-5 flex flex-wrap gap-2">
              {(plugin.tags ?? []).map((tag) => (
                <span key={tag} className="rounded-full border border-slate-200 px-3 py-1.5 text-xs text-slate-600">
                  {tag}
                </span>
              ))}
            </div>
            <div className="mt-6 rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-4 text-sm leading-6 text-slate-600">
              이 상세 화면은 설치 여부를 빠르게 결정하는 용도입니다. 미리보기보다 권한, 액션, 검토 필요 여부를
              먼저 보여주도록 두었습니다.
            </div>
          </article>
        </section>
      </div>
    </main>
  );
}

function SpecCard({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-4">
      <div className="text-[11px] font-medium text-slate-500">{label}</div>
      <div className={`mt-2 text-sm font-semibold text-slate-950 ${mono ? "break-all font-mono text-[12px]" : ""}`}>{value}</div>
    </div>
  );
}

function SpecRow({ label, children }: { label: string; children: string }) {
  return (
    <div className="rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="text-[11px] font-medium text-slate-500">{label}</div>
      <div className="mt-1 text-sm font-semibold text-slate-950">{children}</div>
    </div>
  );
}
