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

type TopElement = { element_id: string; count: number };

type LibraryResponse = {
  live: PageItem[];
  drafts: PageItem[];
  history: PageItem[];
  summary?: {
    today?: {
      visits?: number;
      clicks?: number | null;
      top_element_id?: string | null;
      top_elements?: TopElement[] | null;
      last_seen_at?: string | null;
    };
    plan?: { tier?: string; replay_enabled?: boolean };
  };
};

type SortOption = "recent" | "name";
type StatusFilter = "all" | "live" | "draft" | "expired";

function getProjectTitle(item: PageItem) {
  return item.title?.trim() || `이름 없는 프로젝트 #${item.anon_number}`;
}

function formatLastSeen(iso: string | null | undefined) {
  if (!iso) return "-";
  const time = new Date(iso).getTime();
  if (!Number.isFinite(time)) return "-";
  const diff = Date.now() - time;
  if (diff < 60_000) return `${Math.max(1, Math.floor(diff / 1000))}초 전`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}분 전`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}시간 전`;
  return `${Math.floor(diff / 86_400_000)}일 전`;
}

function formatDuration(ms: number) {
  if (!Number.isFinite(ms) || ms <= 0) return "0초";
  if (ms < 60_000) return `${Math.round(ms / 1000)}초`;
  return `${Math.round(ms / 60_000)}분`;
}

export default function LibraryView() {
  const [data, setData] = useState<LibraryResponse | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [sort, setSort] = useState<SortOption>("recent");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  const [deployingId, setDeployingId] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [creatingSample, setCreatingSample] = useState(false);

  const allWorks = useMemo(() => {
    if (!data) return [];
    const list = [
      ...data.live.map((item) => ({ ...item, _status: "live" as const })),
      ...data.drafts.map((item) => ({ ...item, _status: "draft" as const })),
      ...data.history.map((item) => ({ ...item, _status: "expired" as const })),
    ];
    const byStatus = statusFilter === "all" ? list : list.filter((item) => item._status === statusFilter);
    const query = searchQuery.trim().toLowerCase();
    const byQuery = query
      ? byStatus.filter((item) => getProjectTitle(item).toLowerCase().includes(query) || String(item.anon_number).includes(query))
      : byStatus;
    const sorted = [...byQuery];
    if (sort === "name") {
      sorted.sort((left, right) => getProjectTitle(left).localeCompare(getProjectTitle(right), "ko"));
    } else {
      sorted.sort((left, right) => {
        const leftTime = new Date(left._status === "live" ? left.live_expires_at ?? left.updated_at ?? 0 : left.updated_at ?? 0).getTime();
        const rightTime = new Date(right._status === "live" ? right.live_expires_at ?? right.updated_at ?? 0 : right.updated_at ?? 0).getTime();
        return rightTime - leftTime;
      });
    }
    return sorted;
  }, [data, searchQuery, sort, statusFilter]);

  const fetchLibrary = useCallback(() => {
    const params = new URLSearchParams({ sort });
    if (statusFilter !== "all") params.set("status", statusFilter);
    fetch(`/api/library?${params}`, {
      credentials: "include",
      headers: withAnonHeaders(),
    })
      .then((res) => {
        if (res.status === 401) {
          window.location.href = "/login?next=" + encodeURIComponent("/library");
          return null;
        }
        if (!res.ok) {
          setMessage("라이브러리를 다시 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
          return null;
        }
        return res.json();
      })
      .then((payload) => {
        if (!payload) return;
        setData(payload);
        setMessage(null);
      })
      .catch(() => setMessage("라이브러리를 다시 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."));
  }, [sort, statusFilter]);

  useEffect(() => {
    fetchLibrary();
  }, [fetchLibrary]);

  async function createValidationSample() {
    setCreatingSample(true);
    setMessage(null);
    try {
      const result = await createIntegratedServiceProject();
      window.location.href = result.publicUrl;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "운영 샘플을 만들지 못했습니다.");
    } finally {
      setCreatingSample(false);
    }
  }

  async function publish(pageId: string) {
    setPublishingId(pageId);
    setMessage(null);
    try {
      const res = await fetch(`/api/pages/${pageId}/publish`, {
        method: "POST",
        credentials: "include",
        headers: withAnonHeaders(),
      });
      const body = await res.json().catch(() => null);
      if (res.ok) {
        setMessage("공개를 완료했습니다.");
        fetchLibrary();
      } else {
        setMessage(body?.error ?? "공개를 완료하지 못했습니다.");
      }
    } finally {
      setPublishingId(null);
    }
  }

  async function duplicate(pageId: string) {
    setDuplicatingId(pageId);
    setMessage(null);
    try {
      const res = await fetch(`/api/pages/${pageId}/duplicate`, {
        method: "POST",
        credentials: "include",
        headers: withAnonHeaders(),
      });
      const body = await res.json().catch(() => null);
      if (res.ok && body?.pageId) {
        setMessage("복제를 완료했습니다.");
        fetchLibrary();
      } else {
        setMessage(body?.error ?? body?.message ?? "복제를 완료하지 못했습니다.");
      }
    } finally {
      setDuplicatingId(null);
    }
  }

  async function deployPage(pageId: string, deploy: boolean) {
    setDeployingId(pageId);
    setMessage(null);
    try {
      const res = await fetch(`/api/pages/${pageId}/deploy`, {
        method: "POST",
        headers: withAnonHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify({ deploy }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage((payload?.message as string) ?? "배포 처리를 완료하지 못했습니다.");
        return;
      }
      setMessage(deploy ? "배포했습니다." : "배포를 취소했습니다.");
      fetchLibrary();
    } catch {
      setMessage("배포 처리를 완료하지 못했습니다.");
    } finally {
      setDeployingId(null);
    }
  }

  const totalProjects = (data?.live.length ?? 0) + (data?.drafts.length ?? 0) + (data?.history.length ?? 0);

  return (
    <div className="min-h-screen bg-white text-[#151515]">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-[14px] border border-black/[0.08] bg-white/90 p-5 shadow-[0_18px_48px_rgba(15,23,42,0.04)] backdrop-blur-xl sm:p-6">
            <div className="text-[12px] font-semibold uppercase tracking-[0.24em] text-[#8a7550]">Project Library</div>
            <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-[#111111] sm:text-[40px]">프로젝트 라이브러리</h1>
            <p className="sr-only">
              초안, 라이브, 보관 프로젝트를 한곳에서 정리하는 작업 인벤토리입니다. 여기서는 프로젝트를 찾고,
              공개 상태를 바꾸고, 대시보드나 편집기로 바로 넘어가는 흐름이 가장 중요합니다.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/editor/advanced"
                className="rounded-full bg-[#111111] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#2a2a2a]"
              >
                새 프로젝트 만들기
              </Link>
              <Link
                href="/dashboard"
                className="rounded-full border border-black/10 bg-[#f7f4ed] px-5 py-3 text-sm font-medium text-[#111111] transition hover:bg-[#ede7da]"
              >
                운영 대시보드 열기
              </Link>
            </div>
          </div>

          <aside className="rounded-[14px] border border-black/[0.08] bg-white/75 p-5 shadow-[0_18px_48px_rgba(15,23,42,0.035)] backdrop-blur-xl sm:p-6">
            <div className="text-[12px] font-semibold uppercase tracking-[0.24em] text-[#8a7550]">Optional Sample</div>
            <h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-[#111111]">통합 검증 서비스</h2>
            <p className="sr-only">
              일반 프로젝트를 대신하는 기본 템플릿이 아니라, 예약·알림·티켓·운영 상태를 한 번에 시험할 때 쓰는
              운영 샘플입니다. 필요할 때만 별도로 만드시면 됩니다.
            </p>
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

        <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="전체 프로젝트" value={`${totalProjects}`} description="현재 계정이 가진 전체 작업 수" />
          <MetricCard label="라이브" value={`${data?.live.length ?? 0}`} description="공개 중인 프로젝트 수" />
          <MetricCard label="초안" value={`${data?.drafts.length ?? 0}`} description="편집 중인 프로젝트 수" />
          <MetricCard
            label="오늘 활동"
            value={`${data?.summary?.today?.visits ?? 0}`}
            description={`마지막 수집 ${formatLastSeen(data?.summary?.today?.last_seen_at)}`}
          />
        </section>

        <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
          <div className="grid gap-3">
            <label className="text-sm font-semibold text-[#111111]" htmlFor="library-search">
              프로젝트 검색
            </label>
            <input
              id="library-search"
              type="text"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="프로젝트 제목이나 번호로 찾기"
              className="w-full rounded-[18px] border border-black/10 bg-white px-4 py-3 text-sm text-[#111111] outline-none transition focus:border-black/25"
              aria-label="프로젝트 검색"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {(["all", "live", "draft", "expired"] as const).map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => setStatusFilter(status)}
                className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                  statusFilter === status ? "bg-[#111111] text-white" : "bg-white text-[#555555] hover:bg-[#f1efe9]"
                }`}
              >
                {status === "all" ? "전체" : status === "live" ? "라이브" : status === "draft" ? "초안" : "보관"}
              </button>
            ))}
            <span className="text-[#b0aba3]">|</span>
            <button
              type="button"
              onClick={() => setSort("recent")}
              className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                sort === "recent" ? "bg-[#111111] text-white" : "bg-white text-[#555555] hover:bg-[#f1efe9]"
              }`}
            >
              최신순
            </button>
            <button
              type="button"
              onClick={() => setSort("name")}
              className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                sort === "name" ? "bg-[#111111] text-white" : "bg-white text-[#555555] hover:bg-[#f1efe9]"
              }`}
            >
              이름순
            </button>
          </div>
        </div>

        {message ? (
          <div className="mt-5 flex items-center gap-2 rounded-[18px] border border-black/8 bg-white px-4 py-3 text-sm text-[#635e56]" role="status" aria-live="polite">
            {message}
            <button
              type="button"
              onClick={() => {
                setMessage(null);
                fetchLibrary();
              }}
              className="rounded-full border border-black/10 px-3 py-1 text-xs font-medium text-[#111111]"
            >
              다시 시도
            </button>
          </div>
        ) : null}

        {!data ? (
          <div className="flex justify-center py-20">
            <NullSpinner />
          </div>
        ) : allWorks.length === 0 ? (
          <div className="mt-6 rounded-[28px] border border-black/8 bg-white p-12 text-center shadow-[0_18px_60px_rgba(17,17,17,0.05)]">
            <p className="text-lg font-semibold text-[#111111]">
              {searchQuery.trim() ? "검색 결과가 없습니다." : "아직 프로젝트가 없습니다."}
            </p>
            {!searchQuery.trim() ? (
              <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
                <Link
                  href="/editor/advanced"
                  className="rounded-full bg-[#111111] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#2a2a2a]"
                >
                  새 프로젝트 만들기
                </Link>
                <button
                  type="button"
                  onClick={createValidationSample}
                  disabled={creatingSample}
                  className="rounded-full border border-black/10 bg-[#f7f4ed] px-5 py-3 text-sm font-medium text-[#111111] transition hover:bg-[#ede7da] disabled:opacity-70"
                >
                  {creatingSample ? "운영 샘플 준비 중" : "운영 샘플 만들기"}
                </button>
              </div>
            ) : null}
          </div>
        ) : (
          <ul className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {allWorks.map((item) => (
              <li key={item.id}>
                <ProjectCard
                  item={item}
                  openMenuId={openMenuId}
                  setOpenMenuId={setOpenMenuId}
                  publishingId={publishingId}
                  duplicatingId={duplicatingId}
                  deployingId={deployingId}
                  onPublish={publish}
                  onDuplicate={duplicate}
                  onDeploy={deployPage}
                />
              </li>
            ))}
          </ul>
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

function ProjectCard({
  item,
  openMenuId,
  setOpenMenuId,
  publishingId,
  duplicatingId,
  deployingId,
  onPublish,
  onDuplicate,
  onDeploy,
}: {
  item: PageItem & { _status: "live" | "draft" | "expired" };
  openMenuId: string | null;
  setOpenMenuId: (value: string | null) => void;
  publishingId: string | null;
  duplicatingId: string | null;
  deployingId: string | null;
  onPublish: (pageId: string) => Promise<void>;
  onDuplicate: (pageId: string) => Promise<void>;
  onDeploy: (pageId: string, deploy: boolean) => Promise<void>;
}) {
  const title = getProjectTitle(item);
  const primaryHref =
    item._status === "draft" ? `/editor/advanced?pageId=${item.id}` : item._status === "live" ? `/live/${item.id}` : `/dashboard/${item.id}`;
  const primaryLabel = item._status === "draft" ? "편집하기" : item._status === "live" ? "라이브 보기" : "대시보드";

  return (
    <article className="group relative rounded-[20px] border border-black/[0.08] bg-white p-3 shadow-[0_14px_42px_rgba(15,23,42,0.045)] transition duration-200 hover:-translate-y-0.5 hover:border-black/[0.14] hover:shadow-[0_24px_60px_rgba(15,23,42,0.09)]">
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
        <div className="absolute left-3 top-3 flex flex-wrap gap-2">
          <StatusBadge status={item._status} />
          {item.deployed_at ? <StatusTag label="배포됨" tone="green" /> : null}
        </div>
        <div className="absolute inset-x-3 bottom-3 rounded-[14px] border border-white/70 bg-white/[0.78] px-3 py-2 shadow-[0_10px_28px_rgba(15,23,42,0.10)] backdrop-blur-xl">
          <h2 className="truncate text-sm font-semibold text-[#111111]" title={title}>
            {title}
          </h2>
          <div className="mt-1 flex items-center justify-between gap-2 text-[11px] font-medium text-[#5a6472]">
            <span>{item._status === "live" ? "종료 예정" : "최근 수정"} {formatLastSeen(item._status === "live" ? item.live_expires_at : item.updated_at)}</span>
            <span>#{item.anon_number}</span>
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setOpenMenuId(openMenuId === item.id ? null : item.id)}
        className="absolute right-6 top-6 rounded-full border border-white/70 bg-white/[0.82] px-3 py-1.5 text-xs font-semibold text-[#111111] shadow-[0_8px_24px_rgba(15,23,42,0.08)] backdrop-blur-xl transition hover:bg-white"
        aria-label="작업 더보기"
        aria-expanded={openMenuId === item.id}
      >
        더보기
      </button>
      {openMenuId === item.id ? (
        <>
          <div className="fixed inset-0 z-10" aria-hidden onClick={() => setOpenMenuId(null)} />
          <div className="absolute right-4 top-14 z-20 min-w-[180px] overflow-hidden rounded-[16px] border border-black/[0.08] bg-white py-1 shadow-[0_18px_48px_rgba(15,23,42,0.14)]">
            <a href={`/editor/advanced?pageId=${item.id}`} className="block px-4 py-2 text-sm text-[#111111] hover:bg-black/[0.04]">
              편집기에서 열기
            </a>
            {item._status !== "live" ? (
              <button
                type="button"
                onClick={() => {
                  void onPublish(item.id);
                  setOpenMenuId(null);
                }}
                disabled={publishingId === item.id}
                className="block w-full px-4 py-2 text-left text-sm text-[#111111] hover:bg-black/[0.04] disabled:opacity-60"
              >
                {publishingId === item.id ? "공개 중..." : "공개"}
              </button>
            ) : null}
            {item._status === "expired" ? (
              <button
                type="button"
                onClick={() => {
                  void onDuplicate(item.id);
                  setOpenMenuId(null);
                }}
                disabled={duplicatingId === item.id}
                className="block w-full px-4 py-2 text-left text-sm text-[#111111] hover:bg-black/[0.04] disabled:opacity-60"
              >
                {duplicatingId === item.id ? "복제 중..." : "복제"}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => {
                void onDeploy(item.id, !item.deployed_at);
                setOpenMenuId(null);
              }}
              disabled={deployingId === item.id}
              className="block w-full px-4 py-2 text-left text-sm text-[#111111] hover:bg-black/[0.04] disabled:opacity-60"
            >
              {item.deployed_at ? "배포 취소" : deployingId === item.id ? "배포 중..." : "배포"}
            </button>
          </div>
        </>
      ) : null}

      <div className="px-1 pb-1 pt-3">
        <div className="grid grid-cols-3 gap-2">
          <InfoBox label="방문" value={`${item.total_visits}`} />
          <InfoBox label="클릭" value={`${item.total_clicks}`} />
          <InfoBox label="체류" value={formatDuration(item.avg_duration_ms)} />
        </div>
        <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
          <Link href={primaryHref} className="rounded-full bg-[#111111] px-4 py-2.5 text-center text-sm font-semibold text-white transition hover:bg-[#2a2a2a]">
            {primaryLabel}
          </Link>
          <Link href={`/dashboard/${item.id}`} className="rounded-full border border-black/10 bg-white px-4 py-2.5 text-sm font-semibold text-[#111111] transition hover:bg-black/[0.04]">
            분석
          </Link>
        </div>
        <div className="mt-2">
          {item.deployed_at ? (
            <a
              href={`/p/${item.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-full justify-center rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100"
            >
              공개 URL 열기
            </a>
          ) : (
            <button
              type="button"
              onClick={() => void onDeploy(item.id, true)}
              disabled={deployingId === item.id}
              className="w-full rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-semibold text-[#111111] transition hover:bg-black/[0.04] disabled:opacity-60"
            >
              {deployingId === item.id ? "배포 중..." : "배포하기"}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

function StatusBadge({ status }: { status: "live" | "draft" | "expired" }) {
  if (status === "live") {
    return <StatusTag label="라이브" tone="dark" />;
  }
  if (status === "draft") {
    return <StatusTag label="초안" tone="warm" />;
  }
  return <StatusTag label="보관" tone="gray" />;
}

function StatusTag({
  label,
  tone,
}: {
  label: string;
  tone: "dark" | "warm" | "gray" | "green";
}) {
  const className =
    tone === "dark"
      ? "bg-[#111111] text-white"
      : tone === "warm"
        ? "bg-[#eee5d6] text-[#6d5b3a]"
        : tone === "green"
          ? "bg-emerald-50 text-emerald-700"
          : "bg-[#ececec] text-[#5c5c5c]";
  return <span className={`rounded-full px-3 py-1 text-xs font-semibold ${className}`}>{label}</span>;
}

function InfoBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[14px] border border-black/[0.06] bg-[#f7f8fa] px-3 py-2">
      <div className="text-[11px] font-medium text-[#5a6472]">{label}</div>
      <div className="mt-1 truncate text-sm font-semibold text-[#111111]">{value}</div>
    </div>
  );
}
