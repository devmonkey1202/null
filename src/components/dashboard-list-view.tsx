"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import NullSpinner from "@/components/null-spinner";
import { withAnonHeaders } from "@/lib/anon-client";
import { createIntegratedServiceProject } from "@/lib/integrated-service-project-client";

type PageItem = {
  id: string;
  title: string | null;
  anon_number: number;
  status: "draft" | "live" | "expired";
  live_expires_at: string | null;
  deployed_at: string | null;
  total_visits: number;
  total_clicks: number;
  avg_duration_ms: number;
  snapshot_thumbnail?: string | null;
  updated_at?: string;
};

type LibraryResponse = {
  live: PageItem[];
  drafts: PageItem[];
  history: PageItem[];
};

function getProjectTitle(item: PageItem) {
  return item.title?.trim() || `이름 없는 프로젝트 #${item.anon_number}`;
}

function formatTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(ms: number) {
  if (!Number.isFinite(ms) || ms <= 0) return "0초";
  if (ms < 60_000) return `${Math.round(ms / 1000)}초`;
  return `${Math.round(ms / 60_000)}분`;
}

function attentionScore(item: PageItem) {
  const traffic = item.total_visits * 4 + item.total_clicks * 7;
  const statusBoost = item.status === "live" ? 30 : item.status === "draft" ? 16 : 5;
  return traffic + statusBoost;
}

export default function DashboardListView() {
  const [data, setData] = useState<LibraryResponse | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [creatingSample, setCreatingSample] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/library?sort=recent", {
        credentials: "include",
        headers: withAnonHeaders(),
      });
      if (res.status === 401) {
        window.location.href = `/login?next=${encodeURIComponent("/dashboard")}`;
        return;
      }
      if (!res.ok) {
        setMessage("대시보드 목록을 다시 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
        return;
      }
      const payload = (await res.json()) as LibraryResponse;
      setData(payload);
      setMessage(null);
    } catch {
      setMessage("대시보드 목록을 다시 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  async function createValidationSample() {
    setCreatingSample(true);
    setMessage(null);
    try {
      const result = await createIntegratedServiceProject();
      window.location.href = result.dashboardUrl;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "운영 샘플을 만들지 못했습니다.");
    } finally {
      setCreatingSample(false);
    }
  }

  const live = useMemo(() => data?.live ?? [], [data?.live]);
  const drafts = useMemo(() => data?.drafts ?? [], [data?.drafts]);
  const history = useMemo(() => data?.history ?? [], [data?.history]);
  const allProjects = useMemo(() => [...live, ...drafts, ...history], [drafts, history, live]);

  const totalVisits = allProjects.reduce((sum, item) => sum + item.total_visits, 0);
  const totalClicks = allProjects.reduce((sum, item) => sum + item.total_clicks, 0);
  const deployedCount = allProjects.filter((item) => Boolean(item.deployed_at)).length;
  const watchList = useMemo(
    () => [...allProjects].sort((left, right) => attentionScore(right) - attentionScore(left)).slice(0, 4),
    [allProjects],
  );

  const primaryLive = live[0] ?? null;
  const primaryDraft = drafts[0] ?? null;

  return (
    <div className="min-h-screen bg-white text-[#151515]">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <section className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
          <div className="rounded-[14px] border border-black/[0.08] bg-white/90 p-5 shadow-[0_18px_48px_rgba(15,23,42,0.04)] backdrop-blur-xl sm:p-6">
            <div className="text-[12px] font-semibold uppercase tracking-[0.24em] text-[#8a7550]">Operations Hub</div>
            <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-[#111111] sm:text-[42px]">
              프로젝트 운영 대시보드
            </h1>
            <p className="sr-only">
              상태를 예쁘게 포장하는 화면이 아니라, 어떤 프로젝트를 지금 봐야 하는지 바로 판단하고
              공개, 검증, 수정 흐름으로 이어지도록 정리한 운영 시작점입니다.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/library"
                className="rounded-full bg-[#111111] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#2a2a2a]"
              >
                프로젝트 목록 보기
              </Link>
              <Link
                href={primaryLive ? `/dashboard/${primaryLive.id}` : "/library"}
                className="rounded-full border border-black/10 bg-[#f7f4ed] px-5 py-3 text-sm font-medium text-[#111111] transition hover:bg-[#ede7da]"
              >
                최근 운영 프로젝트 열기
              </Link>
              <Link
                href="/editor/advanced"
                className="rounded-full border border-black/10 bg-white px-5 py-3 text-sm font-medium text-[#111111] transition hover:bg-[#f6f3ec]"
              >
                새 프로젝트 만들기
              </Link>
            </div>
          </div>

          <aside className="rounded-[14px] border border-black/[0.08] bg-white/75 p-5 shadow-[0_18px_48px_rgba(15,23,42,0.035)] backdrop-blur-xl sm:p-6">
            <div className="text-[12px] font-semibold uppercase tracking-[0.24em] text-[#8a7550]">Validation Sample</div>
            <h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-[#111111]">통합 검증 서비스</h2>
            <p className="sr-only">
              이 화면은 NULL의 기본 대시보드가 아닙니다. 예약, 알림, 티켓, 정책, 운영 상태를 한 번에 점검하려는
              경우에만 쓰는 샘플 프로젝트이자 검증용 앱입니다.
            </p>
            <ul className="sr-only">
              <li>일반 프로젝트를 대신하지 않습니다.</li>
              <li>운영 플로우를 시험하거나 데모를 구성할 때만 선택하면 됩니다.</li>
              <li>지금 필요한 기본 작업은 라이브러리와 프로젝트 대시보드에서 처리합니다.</li>
            </ul>
            <button
              type="button"
              onClick={createValidationSample}
              disabled={creatingSample}
              className="mt-5 w-full rounded-full border border-black/10 bg-white px-4 py-3 text-sm font-semibold text-[#111111] transition hover:bg-[#f1ece2] disabled:cursor-wait disabled:opacity-70"
            >
              {creatingSample ? "운영 샘플을 준비하고 있습니다" : "운영 샘플 만들기"}
            </button>
          </aside>
        </section>

        {message ? (
          <div className="flex flex-wrap items-center gap-3 rounded-[22px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <span>{message}</span>
            <button
              type="button"
              onClick={() => {
                setMessage(null);
                void fetchData();
              }}
              className="rounded-full border border-amber-200 bg-white px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-100"
            >
              다시 시도
            </button>
          </div>
        ) : null}

        {!data ? (
          <div className="flex justify-center py-24">
            <NullSpinner />
          </div>
        ) : (
          <>
            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard label="라이브" value={`${live.length}`} description="지금 공개 중인 프로젝트 수" />
              <MetricCard label="초안" value={`${drafts.length}`} description="수정과 검토가 남은 프로젝트 수" />
              <MetricCard label="방문" value={`${totalVisits}`} description={`전체 클릭 ${totalClicks}회`} />
              <MetricCard label="배포" value={`${deployedCount}`} description="공개 URL이 연결된 프로젝트 수" />
            </section>

            <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
              <article className="rounded-[28px] border border-black/8 bg-white p-6 shadow-[0_18px_60px_rgba(17,17,17,0.05)]">
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <div className="text-[12px] font-semibold uppercase tracking-[0.24em] text-[#8a7550]">Watch List</div>
                    <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[#111111]">지금 봐야 하는 프로젝트</h2>
                  </div>
                  <Link href="/library" className="text-sm font-medium text-[#6d5b3a] hover:text-[#111111]">
                    전체 목록 보기
                  </Link>
                </div>
                <div className="mt-5 grid gap-3 md:grid-cols-2">
                  {watchList.length ? (
                    watchList.map((item) => <WatchCard key={item.id} item={item} />)
                  ) : (
                    <EmptyPanel
                      title="아직 표시할 프로젝트가 없습니다."
                      description="프로젝트를 만들거나 공개하면 여기에 우선순위가 높은 항목부터 보이게 됩니다."
                    />
                  )}
                </div>
              </article>

              <article className="rounded-[28px] border border-black/8 bg-white p-6 shadow-[0_18px_60px_rgba(17,17,17,0.05)]">
                <div className="text-[12px] font-semibold uppercase tracking-[0.24em] text-[#8a7550]">Quick Actions</div>
                <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[#111111]">바로 이어서 할 일</h2>
                <div className="mt-5 grid gap-3">
                  <ActionCard
                    title="라이브 운영 확인"
                    description="최근 공개 프로젝트의 상태, 공개 URL, 검증 흐름으로 바로 이동합니다."
                    href={primaryLive ? `/dashboard/${primaryLive.id}` : "/library"}
                    label={primaryLive ? "최근 라이브 프로젝트 열기" : "라이브러리에서 프로젝트 고르기"}
                  />
                  <ActionCard
                    title="초안 이어서 수정"
                    description="가장 최근에 손댄 초안을 열어 바로 편집기로 이어갑니다."
                    href={primaryDraft ? `/editor/advanced?pageId=${primaryDraft.id}` : "/editor/advanced"}
                    label={primaryDraft ? "최근 초안 편집" : "새 초안 만들기"}
                  />
                  <ActionCard
                    title="검증과 운영 점검"
                    description="통합 검증 서비스는 기본 흐름이 아니라, 운영 데모와 검수용 샘플로만 사용합니다."
                    href={primaryLive ? `/validate/${primaryLive.id}` : "/library"}
                    label={primaryLive ? "현재 프로젝트 검증 보기" : "프로젝트부터 선택하기"}
                  />
                </div>
              </article>
            </section>

            <ProjectSection
              title="라이브 프로젝트"
              description="공개 중인 작업물입니다. 대시보드, 공개 URL, 라이브 화면으로 바로 이어집니다."
              items={live}
              emptyMessage="현재 라이브 프로젝트가 없습니다."
            />
            <ProjectSection
              title="초안"
              description="다음으로 편집하거나 검토할 작업물입니다."
              items={drafts}
              emptyMessage="현재 초안이 없습니다."
            />
            <ProjectSection
              title="보관 및 종료"
              description="만료되었거나 보관된 프로젝트입니다."
              items={history}
              emptyMessage="보관된 프로젝트가 없습니다."
            />
          </>
        )}
      </div>
    </div>
  );
}

function MetricCard({ label, value, description }: { label: string; value: string; description: string }) {
  return (
    <article className="rounded-[24px] border border-black/8 bg-white p-5 shadow-[0_14px_44px_rgba(17,17,17,0.05)]">
      <div className="text-[12px] font-semibold uppercase tracking-[0.22em] text-[#8a7550]">{label}</div>
      <div className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-[#111111]">{value}</div>
      <p className="mt-2 text-sm text-[#635e56]">{description}</p>
    </article>
  );
}

function ProjectSection({
  title,
  description,
  items,
  emptyMessage,
}: {
  title: string;
  description: string;
  items: PageItem[];
  emptyMessage: string;
}) {
  return (
    <section className="rounded-[24px] border border-black/[0.08] bg-white p-5 shadow-[0_18px_54px_rgba(15,23,42,0.055)] sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[#111111]">{title}</h2>
          <p className="sr-only">{description}</p>
        </div>
        <div className="rounded-full border border-black/[0.08] bg-white px-3 py-1 text-xs font-semibold text-[#5a6472]">{items.length}개</div>
      </div>

      {items.length ? (
        <ul className="mt-5 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => (
            <li key={item.id}>
              <ProjectCard item={item} />
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-5">
          <EmptyPanel
            title={emptyMessage}
            description="새 프로젝트를 만들거나 기존 프로젝트를 공개하면 이 영역이 채워집니다."
          />
        </div>
      )}
    </section>
  );
}

function ProjectCard({ item }: { item: PageItem }) {
  const title = getProjectTitle(item);
  const primaryHref = item.status === "draft" ? `/editor/advanced?pageId=${item.id}` : item.status === "live" ? `/live/${item.id}` : `/dashboard/${item.id}`;
  const primaryLabel = item.status === "draft" ? "편집하기" : item.status === "live" ? "라이브 보기" : "대시보드";

  return (
    <article className="group rounded-[20px] border border-black/[0.08] bg-white p-3 shadow-[0_14px_42px_rgba(15,23,42,0.045)] transition duration-200 hover:-translate-y-0.5 hover:border-black/[0.14] hover:shadow-[0_24px_60px_rgba(15,23,42,0.09)]">
      <div className="relative aspect-[16/9] overflow-hidden rounded-[16px] border border-black/[0.07] bg-[linear-gradient(135deg,#f6f7f9_0%,#eef1f5_54%,#ffffff_100%)]">
        {item.snapshot_thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.snapshot_thumbnail} alt={title} className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.02]" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_28%_20%,rgba(255,255,255,0.95),transparent_32%),linear-gradient(135deg,#f4f5f7,#e9edf2)]">
            <span className="rounded-full border border-black/[0.08] bg-white/70 px-3 py-2 text-sm font-semibold text-[#7a8493] shadow-sm backdrop-blur">
              NULL
            </span>
          </div>
        )}
        <div className="absolute left-3 top-3">
          <StatusBadge status={item.status} deployed={Boolean(item.deployed_at)} />
        </div>
        <div className="absolute inset-x-3 bottom-3 rounded-[14px] border border-white/70 bg-white/[0.78] px-3 py-2 shadow-[0_10px_28px_rgba(15,23,42,0.10)] backdrop-blur-xl">
          <div className="truncate text-sm font-semibold text-[#111111]" title={title}>
            {title}
          </div>
          <div className="mt-1 flex items-center justify-between gap-2 text-[11px] font-medium text-[#5a6472]">
            <span>{item.status === "live" ? "종료 예정" : "최근 수정"} {item.status === "live" ? formatTime(item.live_expires_at) : formatTime(item.updated_at)}</span>
            <span>#{item.anon_number}</span>
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <DataPill label="방문" value={`${item.total_visits}`} />
        <DataPill label="클릭" value={`${item.total_clicks}`} />
        <DataPill label="체류" value={formatDuration(item.avg_duration_ms)} />
      </div>

      <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
        <Link href={primaryHref} className="rounded-full bg-[#111111] px-4 py-2.5 text-center text-sm font-semibold text-white transition hover:bg-[#2a2a2a]">
          {primaryLabel}
        </Link>
        <ActionLink href={`/dashboard/${item.id}`}>분석</ActionLink>
      </div>

      <div className="mt-2 flex gap-2">
        {item.deployed_at ? (
          <ActionLink href={`/p/${item.id}`}>공개 URL</ActionLink>
        ) : item.status === "draft" ? (
          <ActionLink href={`/editor/advanced?pageId=${item.id}`}>수정</ActionLink>
        ) : item.status === "live" ? (
          <ActionLink href={`/live/${item.id}`}>라이브</ActionLink>
        ) : (
          <span className="rounded-full border border-black/10 bg-[#f7f8fa] px-3 py-2 text-xs font-semibold text-[#5a6472]">보관됨</span>
        )}
        <ActionLink href={`/validate/${item.id}`}>검증</ActionLink>
      </div>
    </article>
  );
}

function WatchCard({ item }: { item: PageItem }) {
  const title = getProjectTitle(item);

  return (
    <div className="rounded-[20px] border border-black/[0.08] bg-white p-4 shadow-[0_14px_42px_rgba(15,23,42,0.045)]">
      <div className="flex gap-3">
        <div className="flex h-16 w-20 shrink-0 items-center justify-center overflow-hidden rounded-[14px] border border-black/[0.07] bg-[linear-gradient(135deg,#f6f7f9,#e9edf2)]">
          {item.snapshot_thumbnail ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.snapshot_thumbnail} alt={title} className="h-full w-full object-cover" />
          ) : (
            <span className="text-xs font-semibold text-[#7a8493]">NULL</span>
          )}
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-[#111111]">{title}</div>
          <div className="mt-1 text-xs text-[#5a6472]">
            방문 {item.total_visits}회, 클릭 {item.total_clicks}회, 평균 체류 {formatDuration(item.avg_duration_ms)}
          </div>
        </div>
        <StatusBadge status={item.status} deployed={Boolean(item.deployed_at)} compact />
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <ActionLink href={`/dashboard/${item.id}`}>대시보드</ActionLink>
        <ActionLink href={`/validate/${item.id}`}>검증</ActionLink>
        <ActionLink href={item.status === "draft" ? `/editor/advanced?pageId=${item.id}` : `/live/${item.id}`}>
          {item.status === "draft" ? "편집" : "라이브"}
        </ActionLink>
      </div>
    </div>
  );
}

function ActionCard({
  title,
  description,
  href,
  label,
}: {
  title: string;
  description: string;
  href: string;
  label: string;
}) {
  return (
    <div className="rounded-[20px] border border-black/[0.08] bg-white px-4 py-4 shadow-[0_12px_34px_rgba(15,23,42,0.04)]">
      <div className="text-sm font-semibold text-[#111111]">{title}</div>
      <p className="sr-only">{description}</p>
      <Link
        href={href}
        className="mt-4 inline-flex rounded-full border border-black/10 bg-white px-3 py-1.5 text-[12px] font-semibold text-[#111111] transition hover:bg-black/[0.04]"
      >
        {label}
      </Link>
    </div>
  );
}

function EmptyPanel({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-[22px] border border-dashed border-black/12 bg-[#faf8f2] px-4 py-6 text-sm leading-6 text-[#635e56]">
      <p className="font-semibold text-[#111111]">{title}</p>
      <p className="mt-2">{description}</p>
    </div>
  );
}

function StatusBadge({
  status,
  deployed,
  compact = false,
}: {
  status: "live" | "draft" | "expired";
  deployed: boolean;
  compact?: boolean;
}) {
  return (
    <span className={`flex flex-wrap items-center gap-1.5 ${compact ? "justify-end" : ""}`}>
      {status === "live" ? (
        <span className="inline-flex items-center gap-1 rounded-full bg-[#111111] px-2 py-0.5 text-[10px] font-semibold text-white">
          <span className="h-1.5 w-1.5 rounded-full bg-[#f59e0b]" />
          라이브
        </span>
      ) : null}
      {status === "draft" ? (
        <span className="rounded-full bg-[#eee5d6] px-2 py-0.5 text-[10px] font-semibold text-[#6d5b3a]">초안</span>
      ) : null}
      {status === "expired" ? (
        <span className="rounded-full bg-[#ececec] px-2 py-0.5 text-[10px] font-semibold text-[#5c5c5c]">보관</span>
      ) : null}
      {deployed ? (
        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">배포</span>
      ) : null}
    </span>
  );
}

function ActionLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center justify-center rounded-full border border-black/10 bg-white px-3 py-2 text-xs font-semibold text-[#111111] transition hover:bg-black/[0.04]"
    >
      {children}
    </Link>
  );
}

function DataPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[14px] border border-black/[0.06] bg-[#f7f8fa] px-3 py-2">
      <div className="text-[11px] font-medium text-[#5a6472]">{label}</div>
      <div className="mt-1 truncate text-sm font-semibold text-[#111111]">{value}</div>
    </div>
  );
}
