import Link from "next/link";

import { listStorePlugins, type StorePluginFilters } from "@/lib/plugin-store";

type Props = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const CATEGORY_LABELS: Record<NonNullable<StorePluginFilters["category"]>, string> = {
  all: "전체",
  editor: "에디터",
  export: "내보내기",
  runtime: "런타임",
  ops: "운영",
};

function readSingle(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeFilters(params: Record<string, string | string[] | undefined>): StorePluginFilters {
  const q = readSingle(params.q)?.trim();
  const category = readSingle(params.category)?.trim() as StorePluginFilters["category"];
  return {
    q: q || undefined,
    category: category || "all",
  };
}

export default async function PluginStoreIndexPage({ searchParams }: Props) {
  const params = searchParams ? await searchParams : {};
  const filters = normalizeFilters(params);
  const catalog = listStorePlugins(filters);
  const featuredCount = catalog.plugins.filter((plugin) => plugin.featured).length;
  const approvalCount = catalog.plugins.filter((plugin) => plugin.approvalRequired).length;

  return (
    <main className="market-store-shell min-h-screen px-6 py-10 text-slate-900">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <section className="market-store-hero overflow-hidden rounded-[32px] border border-[#D7E0F8] p-8 text-slate-950 shadow-[0_28px_90px_rgba(15,23,42,0.18)]">
          <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Plugin Store</div>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight">플러그인 스토어</h1>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-600">
                에디터, 내보내기, 런타임, 운영 플러그인을 공개 카탈로그에서 먼저 확인하고 바로 편집기로
                넘길 수 있게 정리했습니다. 지금은 화려함보다 설치 판단과 권한 확인이 빠른 구조를 우선했습니다.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  href="/editor/advanced"
                  className="rounded-full bg-[#111111] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#252525]"
                >
                  고급 편집기 열기
                </Link>
                <Link
                  href="/widgets/store"
                  className="rounded-full border border-black/10 bg-white/65 px-4 py-2 text-sm font-medium text-[#111111] transition hover:bg-white"
                >
                  위젯 스토어 보기
                </Link>
              </div>
            </div>

            <div className="market-store-stats grid gap-3 rounded-[28px] border border-black/[0.08] bg-white/55 p-5 backdrop-blur">
              <MetricCard label="카탈로그 버전" value={catalog.version} description="스토어 동결 기준" />
              <MetricCard label="표시 항목" value={`${catalog.plugins.length}개`} description="현재 필터 결과" />
              <MetricCard label="추천 플러그인" value={`${featuredCount}개`} description="즉시 시작 가능" />
              <MetricCard label="승인 필요" value={`${approvalCount}개`} description="운영 검토 후 설치" />
            </div>
          </div>
        </section>

        <section className="rounded-[28px] border border-[#DDE4F3] bg-white p-5 shadow-[0_18px_48px_rgba(15,23,42,0.06)]">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Filter</div>
              <h2 className="mt-2 text-xl font-semibold text-slate-950">필요한 플러그인만 바로 추리기</h2>
              <p className="mt-2 text-sm text-slate-500">
                검색어와 카테고리만 남겼습니다. 리포트 빌더 같은 과한 기능보다 설치 판단이 먼저입니다.
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
              placeholder="플러그인 이름, 기능, 태그 검색"
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
          {catalog.plugins.length ? (
            catalog.plugins.map((plugin) => (
              <article
                key={plugin.storeId}
                className="rounded-[28px] border border-[#DDE4F3] bg-white p-6 shadow-[0_18px_48px_rgba(15,23,42,0.06)]"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                    {CATEGORY_LABELS[plugin.category]}
                  </div>
                  {plugin.featured ? (
                    <span className="rounded-full bg-slate-950 px-2.5 py-1 text-[10px] font-semibold text-white">
                      추천
                    </span>
                  ) : null}
                  {plugin.approvalRequired ? (
                    <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-semibold text-amber-800">
                      승인 필요
                    </span>
                  ) : null}
                </div>

                <div className="mt-3 flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-xl font-semibold text-slate-950">{plugin.name}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{plugin.description}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-right text-xs text-slate-500">
                    <div>v{plugin.version}</div>
                    <div className="mt-1">{plugin.actions?.length ?? 0}개 액션</div>
                  </div>
                </div>

                {plugin.detail ? <p className="mt-4 text-sm leading-6 text-slate-500">{plugin.detail}</p> : null}

                <div className="mt-5 grid gap-3 md:grid-cols-3">
                  <InfoTile label="권한" value={`${plugin.permissions?.length ?? 0}개`} />
                  <InfoTile label="설치 경로" value="에디터에서 바로 삽입" />
                  <InfoTile label="해시" value={plugin.digest.slice(0, 10)} />
                </div>

                <div className="mt-5 flex flex-wrap gap-2 text-xs text-slate-500">
                  {(plugin.tags ?? []).map((tag) => (
                    <span key={tag} className="rounded-full border border-slate-200 px-2.5 py-1">
                      {tag}
                    </span>
                  ))}
                </div>

                <div className="mt-6 flex flex-wrap gap-3">
                  <Link
                    href={plugin.sharePath ?? `/plugins/store/${plugin.storeId}`}
                    className="rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white"
                  >
                    상세 보기
                  </Link>
                  <Link
                    href={`/editor/advanced?pluginStoreId=${encodeURIComponent(plugin.storeId)}`}
                    className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700"
                  >
                    편집기에서 열기
                  </Link>
                </div>
              </article>
            ))
          ) : (
            <div className="rounded-[28px] border border-dashed border-slate-300 bg-white px-6 py-16 text-center text-sm text-slate-500 xl:col-span-2">
              현재 조건에 맞는 플러그인이 없습니다. 검색어를 줄이거나 카테고리를 전체로 바꿔 보십시오.
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
