import Link from "next/link";

import { listStoreWidgets, type StoreWidgetFilters } from "@/lib/widget-store";

type Props = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const CATEGORY_LABELS: Record<NonNullable<StoreWidgetFilters["category"]>, string> = {
  all: "전체",
  embed: "임베드",
  data: "데이터",
  ops: "운영",
};

function readSingle(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeFilters(params: Record<string, string | string[] | undefined>): StoreWidgetFilters {
  const q = readSingle(params.q)?.trim();
  const category = readSingle(params.category)?.trim() as StoreWidgetFilters["category"];
  return {
    q: q || undefined,
    category: category || "all",
  };
}

export default async function WidgetStoreIndexPage({ searchParams }: Props) {
  const params = searchParams ? await searchParams : {};
  const filters = normalizeFilters(params);
  const catalog = listStoreWidgets(filters);
  const featuredCount = catalog.widgets.filter((widget) => widget.featured).length;
  const approvalCount = catalog.widgets.filter((widget) => widget.approvalRequired).length;

  return (
    <main className="market-store-shell min-h-screen px-6 py-10 text-slate-900">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <section className="market-store-hero overflow-hidden rounded-[32px] border border-[#D8E3F5] p-8 text-slate-950 shadow-[0_28px_90px_rgba(15,23,42,0.18)]">
          <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Widget Store</div>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight">위젯 스토어</h1>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-600">
                공개 전에 화면 안에 삽입할 위젯을 카탈로그로 모았습니다. 임베드, 데이터, 운영 위젯을 같은
                기준으로 비교하고 편집기에서 바로 배치할 수 있게 정리했습니다.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  href="/editor/advanced"
                  className="rounded-full bg-[#111111] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#252525]"
                >
                  고급 편집기 열기
                </Link>
                <Link
                  href="/plugins/store"
                  className="rounded-full border border-black/10 bg-white/65 px-4 py-2 text-sm font-medium text-[#111111] transition hover:bg-white"
                >
                  플러그인 스토어 보기
                </Link>
              </div>
            </div>

            <div className="market-store-stats grid gap-3 rounded-[28px] border border-black/[0.08] bg-white/55 p-5 backdrop-blur">
              <MetricCard label="카탈로그 버전" value={catalog.version} description="동결 기준" />
              <MetricCard label="표시 항목" value={`${catalog.widgets.length}개`} description="현재 필터 결과" />
              <MetricCard label="추천 위젯" value={`${featuredCount}개`} description="즉시 삽입 가능" />
              <MetricCard label="승인 필요" value={`${approvalCount}개`} description="외부 리스크 확인" />
            </div>
          </div>
        </section>

        <section className="rounded-[28px] border border-[#DDE4F3] bg-white p-5 shadow-[0_18px_48px_rgba(15,23,42,0.06)]">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Filter</div>
              <h2 className="mt-2 text-xl font-semibold text-slate-950">삽입할 위젯 빠르게 고르기</h2>
              <p className="mt-2 text-sm text-slate-500">
                위젯은 프레임 크기와 승인 필요 여부가 중요합니다. 그래서 검색과 카테고리만 남기고 바로 비교할 수
                있게 했습니다.
              </p>
            </div>
            <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-600">
              현재 필터: {CATEGORY_LABELS[filters.category ?? "all"]}{filters.q ? ` · "${filters.q}"` : ""}
            </div>
          </div>

          <form className="mt-5 grid gap-3 md:grid-cols-[1fr_180px_auto]">
            <input
              type="search"
              name="q"
              defaultValue={filters.q ?? ""}
              placeholder="위젯 이름, 태그, 용도 검색"
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-slate-400"
            />
            <select
              name="category"
              defaultValue={filters.category ?? "all"}
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-slate-400"
            >
              {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <button type="submit" className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white">
              다시 보기
            </button>
          </form>
        </section>

        <section className="grid gap-4 xl:grid-cols-2">
          {catalog.widgets.length ? (
            catalog.widgets.map((widget) => (
              <article
                key={widget.storeId}
                className="rounded-[28px] border border-[#DDE4F3] bg-white p-6 shadow-[0_18px_48px_rgba(15,23,42,0.06)]"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                    {CATEGORY_LABELS[widget.category]}
                  </div>
                  {widget.featured ? (
                    <span className="rounded-full bg-slate-950 px-2.5 py-1 text-[10px] font-semibold text-white">
                      추천
                    </span>
                  ) : null}
                  {widget.approvalRequired ? (
                    <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-semibold text-amber-800">
                      승인 필요
                    </span>
                  ) : null}
                </div>

                <div className="mt-3 flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-xl font-semibold text-slate-950">{widget.name}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{widget.description}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-right text-xs text-slate-500">
                    <div>v{widget.version}</div>
                    <div className="mt-1">
                      {widget.defaultFrame.w} × {widget.defaultFrame.h}
                    </div>
                  </div>
                </div>

                {widget.detail ? <p className="mt-4 text-sm leading-6 text-slate-500">{widget.detail}</p> : null}

                <div className="mt-5 grid gap-3 md:grid-cols-3">
                  <InfoTile label="실행 방식" value={widget.widget.execution ?? "-"} />
                  <InfoTile label="기본 프레임" value={`${widget.defaultFrame.w} × ${widget.defaultFrame.h}`} />
                  <InfoTile label="해시" value={widget.digest.slice(0, 10)} />
                </div>

                <div className="mt-5 flex flex-wrap gap-2 text-xs text-slate-500">
                  {(widget.tags ?? []).map((tag) => (
                    <span key={tag} className="rounded-full border border-slate-200 px-2.5 py-1">
                      {tag}
                    </span>
                  ))}
                </div>

                <div className="mt-6 flex flex-wrap gap-3">
                  <Link
                    href={widget.sharePath ?? `/widgets/store/${widget.storeId}`}
                    className="rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white"
                  >
                    상세 보기
                  </Link>
                  <Link
                    href={`/editor/advanced?widgetStoreId=${encodeURIComponent(widget.storeId)}`}
                    className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700"
                  >
                    편집기에서 열기
                  </Link>
                </div>
              </article>
            ))
          ) : (
            <div className="rounded-[28px] border border-dashed border-slate-300 bg-white px-6 py-16 text-center text-sm text-slate-500 xl:col-span-2">
              현재 조건에 맞는 위젯이 없습니다. 검색어를 줄이거나 카테고리를 전체로 바꿔 보십시오.
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function MetricCard({ label, value, description }: { label: string; value: string; description: string }) {
  return (
    <div className="market-store-stat rounded-[22px] border border-black/10 bg-white/75 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
      <div className="text-[11px] font-medium text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-slate-950">{value}</div>
      <div className="mt-1 text-[12px] text-slate-500">{description}</div>
    </div>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="text-[11px] font-medium text-slate-500">{label}</div>
      <div className="mt-1 text-sm font-semibold text-slate-950">{value}</div>
    </div>
  );
}
