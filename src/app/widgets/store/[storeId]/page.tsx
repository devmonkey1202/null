import Link from "next/link";
import { notFound } from "next/navigation";

import { getStoreWidget } from "@/lib/widget-store";

type Props = { params: Promise<{ storeId: string }> };

const CATEGORY_LABELS = {
  embed: "임베드",
  data: "데이터",
  ops: "운영",
} as const;

export default async function WidgetStoreDetailPage({ params }: Props) {
  const { storeId } = await params;
  const widget = getStoreWidget(storeId);
  if (!widget) notFound();

  return (
    <main className="min-h-screen bg-[#F5F7FB] px-6 py-10 text-slate-900">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <section className="overflow-hidden rounded-[32px] border border-[#D8E3F5] bg-[radial-gradient(circle_at_top_left,_rgba(45,212,191,0.2),_transparent_34%),linear-gradient(135deg,#0F172A_0%,#115E59_52%,#0891B2_100%)] p-8 text-white shadow-[0_28px_90px_rgba(15,23,42,0.18)]">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-medium text-cyan-50">
              {CATEGORY_LABELS[widget.category]}
            </span>
            {widget.featured ? (
              <span className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-slate-950">추천</span>
            ) : null}
            {widget.approvalRequired ? (
              <span className="rounded-full bg-amber-100 px-3 py-1 text-[11px] font-semibold text-amber-900">
                승인 필요
              </span>
            ) : null}
          </div>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight">{widget.name}</h1>
          <p className="mt-4 max-w-3xl text-sm leading-6 text-cyan-50/90">{widget.description}</p>
          {widget.detail ? <p className="mt-3 max-w-3xl text-sm leading-6 text-cyan-50/75">{widget.detail}</p> : null}

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href={`/editor/advanced?widgetStoreId=${encodeURIComponent(widget.storeId)}`}
              className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-950"
            >
              편집기에서 바로 열기
            </Link>
            <Link
              href="/widgets/store"
              className="rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium text-white"
            >
              카탈로그로 돌아가기
            </Link>
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
          <article className="rounded-[28px] border border-[#DDE4F3] bg-white p-6 shadow-[0_18px_48px_rgba(15,23,42,0.06)]">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Package</div>
            <h2 className="mt-2 text-xl font-semibold text-slate-950">삽입 전에 확인할 정보</h2>
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <SpecCard label="스토어 ID" value={widget.storeId} />
              <SpecCard label="버전" value={widget.version} />
              <SpecCard label="스토어 경로" value={widget.sharePath ?? `/widgets/store/${widget.storeId}`} />
              <SpecCard label="Digest" value={widget.digest} mono />
            </div>
          </article>

          <article className="rounded-[28px] border border-[#DDE4F3] bg-white p-6 shadow-[0_18px_48px_rgba(15,23,42,0.06)]">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Runtime</div>
            <h2 className="mt-2 text-xl font-semibold text-slate-950">실행과 검토 포인트</h2>
            <div className="mt-5 space-y-3">
              <SpecRow label="실행 방식">{widget.widget.execution ?? "-"}</SpecRow>
              <SpecRow label="기본 프레임">{`${widget.defaultFrame.w} × ${widget.defaultFrame.h}`}</SpecRow>
              <SpecRow label="승인">{widget.approvalRequired ? "운영 검토 후 삽입" : "즉시 삽입 가능"}</SpecRow>
            </div>
          </article>
        </section>

        <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <article className="rounded-[28px] border border-[#DDE4F3] bg-white p-6 shadow-[0_18px_48px_rgba(15,23,42,0.06)]">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Widget Config</div>
            <h2 className="mt-2 text-xl font-semibold text-slate-950">위젯 설정 값</h2>
            <div className="mt-5 space-y-3">
              <SpecRow label="타이틀">{widget.widget.title ?? "-"}</SpecRow>
              <SpecRow label="출처">{widget.widget.src ?? "-"}</SpecRow>
              <SpecRow label="Sandbox">{widget.widget.sandbox ?? "-"}</SpecRow>
              <SpecRow label="Allow">{widget.widget.allow ?? "-"}</SpecRow>
              <SpecRow label="Referrer Policy">{widget.widget.referrerPolicy ?? "-"}</SpecRow>
            </div>
          </article>

          <article className="rounded-[28px] border border-[#DDE4F3] bg-white p-6 shadow-[0_18px_48px_rgba(15,23,42,0.06)]">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Tags</div>
            <h2 className="mt-2 text-xl font-semibold text-slate-950">빠른 분류와 액션</h2>
            <div className="mt-5 flex flex-wrap gap-2">
              {(widget.tags ?? []).map((tag) => (
                <span key={tag} className="rounded-full border border-slate-200 px-3 py-1.5 text-xs text-slate-600">
                  {tag}
                </span>
              ))}
            </div>
            <div className="mt-6 rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-4 text-sm leading-6 text-slate-600">
              허용 액션: {(widget.widget.allowedActions ?? []).length ? widget.widget.allowedActions?.join(", ") : "별도 액션 없음"}
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
      <div className="mt-1 text-sm font-semibold text-slate-950 break-all">{children}</div>
    </div>
  );
}
