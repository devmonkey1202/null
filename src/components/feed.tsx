"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Countdown from "@/components/countdown";
import { useToast } from "@/components/toast";

const PULL_THRESHOLD = 80;

type FeedItem = {
  id: string;
  title: string | null;
  anon_number: number;
  live_started_at: string;
  live_expires_at: string;
  total_visits: number;
  avg_duration_ms: number;
  total_clicks: number;
  upvote_count: number;
  bounce_rate?: number;
  snapshot_thumbnail?: string | null;
  live_viewer_count?: number;
};

const tabs = [
  { id: "new", label: "신규" },
  { id: "popular", label: "인기" },
  { id: "time", label: "시간순" },
];

export default function Feed() {
  const [tab, setTab] = useState("new");
  const [liveOnly, setLiveOnly] = useState(false);
  const [endingSoon, setEndingSoon] = useState(false);
  const [feedSearch, setFeedSearch] = useState("");
  const [feedSearchDebounced, setFeedSearchDebounced] = useState("");
  const [items, setItems] = useState<FeedItem[]>([]);
  const [nextOffset, setNextOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [upvotedPageIds, setUpvotedPageIds] = useState<string[]>([]);
  const [viewerCounts, setViewerCounts] = useState<Record<string, number>>({});

  const limit = 18;

  useEffect(() => {
    const t = setTimeout(() => setFeedSearchDebounced(feedSearch), 400);
    return () => clearTimeout(t);
  }, [feedSearch]);

  const refetch = useCallback(() => {
    setFetchError(null);
    const params = `tab=${tab}&limit=${limit}&offset=0${liveOnly ? "&live_only=1" : ""}${endingSoon ? "&ending_soon=1" : ""}${feedSearchDebounced.trim() ? `&q=${encodeURIComponent(feedSearchDebounced.trim())}` : ""}`;
    fetch(`/api/feed?${params}`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data) return;
        const list = Array.isArray(data.items) ? data.items : [];
        setItems(list);
        setNextOffset(data.nextOffset ?? 0);
        setHasMore((data.nextOffset ?? 0) > 0 && (list.length ?? 0) >= limit);
        setUpvotedPageIds(Array.isArray(data.upvoted_page_ids) ? data.upvoted_page_ids : []);
        setViewerCounts((prev) => {
          const next = { ...prev };
          list.forEach((i: FeedItem) => {
            next[i.id] = i.live_viewer_count ?? 0;
          });
          return next;
        });
      })
      .catch(() => setFetchError("피드를 불러오지 못했습니다. 다시 시도해 주세요."));
  }, [tab, liveOnly, endingSoon, feedSearchDebounced]);

  const mainRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => {
      setLoading(true);
      setFetchError(null);
      setHasMore(true);
    });
    if (typeof window !== "undefined") window.scrollTo(0, 0);
    mainRef.current?.scrollIntoView?.({ behavior: "auto", block: "start" });
    fetch(
      `/api/feed?tab=${tab}&limit=${limit}&offset=0${liveOnly ? "&live_only=1" : ""}${endingSoon ? "&ending_soon=1" : ""}${feedSearchDebounced.trim() ? `&q=${encodeURIComponent(feedSearchDebounced.trim())}` : ""}`,
      { credentials: "include" },
    )
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data || cancelled) return;
        const list = Array.isArray(data.items) ? data.items : [];
        setItems(list);
        setNextOffset(data.nextOffset ?? 0);
        setHasMore((data.nextOffset ?? 0) > 0 && (list.length ?? 0) >= limit);
        setUpvotedPageIds(Array.isArray(data.upvoted_page_ids) ? data.upvoted_page_ids : []);
        setViewerCounts((prev) => {
          const next = { ...prev };
          list.forEach((i: FeedItem) => {
            next[i.id] = i.live_viewer_count ?? 0;
          });
          return next;
        });
      })
      .catch(() => {
        if (!cancelled) setFetchError("피드를 불러오지 못했습니다. 다시 시도해 주세요.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tab, liveOnly, endingSoon, feedSearchDebounced]);

  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    const params = `tab=${tab}&limit=${limit}&offset=${nextOffset}${liveOnly ? "&live_only=1" : ""}${endingSoon ? "&ending_soon=1" : ""}${feedSearchDebounced.trim() ? `&q=${encodeURIComponent(feedSearchDebounced.trim())}` : ""}`;
    fetch(`/api/feed?${params}`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data || !Array.isArray(data.items)) return;
        setItems((prev) => [...prev, ...data.items]);
        setNextOffset(data.nextOffset ?? 0);
        setHasMore((data.nextOffset ?? 0) > 0 && data.items.length >= limit);
        setUpvotedPageIds((prev) => [...new Set([...prev, ...(Array.isArray(data.upvoted_page_ids) ? data.upvoted_page_ids : [])])]);
        setViewerCounts((prev) => {
          const next = { ...prev };
          (data.items as FeedItem[]).forEach((i: FeedItem) => {
            next[i.id] = i.live_viewer_count ?? 0;
          });
          return next;
        });
      })
      .finally(() => setLoadingMore(false));
  }, [tab, liveOnly, endingSoon, feedSearchDebounced, nextOffset, hasMore, loadingMore]);

  const viewerPollIds = useMemo(() => items.slice(0, 50).map((i) => i.id).join(","), [items]);
  useEffect(() => {
    if (!viewerPollIds) return;
    const ids = viewerPollIds.split(",").filter(Boolean);
    const t = setInterval(() => {
      fetch(`/api/viewers?ids=${ids.join(",")}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data?.viewers && typeof data.viewers === "object") {
            setViewerCounts((prev) => ({ ...prev, ...data.viewers }));
          }
        })
        .catch(() => {});
    }, 45000);
    return () => clearInterval(t);
  }, [viewerPollIds]);

  const pullStartY = useRef(0);
  const [pullDistance, setPullDistance] = useState(0);
  const [showScrollTop, setShowScrollTop] = useState(false);

  useEffect(() => {
    const onScroll = () => setShowScrollTop(typeof window !== "undefined" && (window.scrollY ?? document.documentElement.scrollTop) > 400);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (typeof window !== "undefined" && (window.scrollY ?? document.documentElement.scrollTop) <= 0) {
      pullStartY.current = e.touches[0].clientY;
    }
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (typeof window !== "undefined" && (window.scrollY ?? document.documentElement.scrollTop) > 0) return;
    const y = e.touches[0].clientY;
    const diff = y - pullStartY.current;
    if (diff > 0) setPullDistance(Math.min(diff, 120));
  }, []);

  const onTouchEnd = useCallback(() => {
    if (pullDistance >= PULL_THRESHOLD) {
      setPullDistance(0);
      refetch();
    } else {
      setPullDistance(0);
    }
  }, [pullDistance, refetch]);

  return (
    <div
      className="min-h-screen bg-[#FFFFFF]"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <main ref={mainRef} className="mx-auto w-full max-w-6xl px-6 py-8">
        {pullDistance > 0 ? (
          <div className="mb-2 flex justify-center py-2 text-xs text-[#666666]" aria-live="polite">
            {pullDistance >= PULL_THRESHOLD ? "놓으면 새로고침" : "끌어서 새로고침"}
          </div>
        ) : null}
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-black/[0.08] bg-white/70 px-3 py-3 text-xs shadow-[0_12px_32px_rgba(15,23,42,0.04),inset_0_1px_0_rgba(255,255,255,0.92)] backdrop-blur-xl">
          <nav className="flex items-center gap-1 rounded-full border border-black/[0.08] bg-white/70 p-1" aria-label="피드 탭">
            {tabs.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                aria-label={`${item.label} 탭`}
                className={`rounded-full px-3 py-1.5 font-medium transition ${
                  tab === item.id ? "bg-[#111111] text-white" : "bg-transparent text-[#666666] hover:bg-black/[0.04] hover:text-[#111111]"
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>
          <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={feedSearch}
            onChange={(e) => setFeedSearch(e.target.value)}
            placeholder="작품 ID 또는 제목 검색"
            className="w-40 rounded-full border border-[#EAEAEA] px-3 py-1.5 text-[#111111] placeholder:text-[#666666]"
            aria-label="피드 검색(작품 ID, 제목)"
          />
          <span className="text-[#666666]">필터:</span>
          <button
            type="button"
            onClick={() => setLiveOnly((v) => !v)}
            className={`rounded-full border px-3 py-1 ${liveOnly ? "border-[#111111] bg-[#111111] text-white" : "border-[#EAEAEA] bg-white text-[#666666]"}`}
          >
            라이브만
          </button>
          <button
            type="button"
            onClick={() => setEndingSoon((v) => !v)}
            className={`rounded-full border px-3 py-1 ${endingSoon ? "border-[#111111] bg-[#111111] text-white" : "border-[#EAEAEA] bg-white text-[#666666]"}`}
          >
            만료 임박(1시간)
          </button>
          </div>
        </div>
        {loading ? (
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3" aria-live="polite" aria-busy="true">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex flex-col rounded-[14px] border border-[#EAEAEA] bg-white p-4">
                <div className="h-4 w-2/3 animate-pulse rounded bg-[#EAEAEA]" />
                <div className="mt-3 h-40 animate-pulse rounded-[12px] bg-[#EAEAEA]" />
                <div className="mt-3 flex gap-2">
                  <div className="h-6 w-16 animate-pulse rounded-full bg-[#EAEAEA]" />
                  <div className="h-6 w-16 animate-pulse rounded-full bg-[#EAEAEA]" />
                </div>
              </div>
            ))}
          </div>
        ) : fetchError ? (
          <div className="rounded-[14px] border border-[#EAEAEA] bg-white p-8 text-sm text-[#666666]" role="alert">
            <p>{fetchError}</p>
            <button
              type="button"
              onClick={() => refetch()}
              className="mt-4 rounded-[14px] border border-[#111111] bg-white px-4 py-2 text-xs font-semibold text-[#111111]"
            >
              다시 시도
            </button>
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-[14px] border border-dashed border-[#EAEAEA] bg-white p-8 text-center text-sm text-[#666666]">
            {liveOnly || endingSoon ? "조건에 맞는 작품이 없습니다." : "아직 작품이 없습니다."}
            <p className="mt-2 text-xs text-[#666666]">첫 작품을 만들어 보세요.</p>
          </div>
        ) : (
          <>
            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              {items.map((item) => (
                <FeedCard
                  key={item.id}
                  item={item}
                  upvoted={upvotedPageIds.includes(item.id)}
                  liveViewerCount={viewerCounts[item.id] ?? item.live_viewer_count ?? 0}
                  onUpvote={refetch}
                  onUpvoteToggle={(id, nowUpvoted) => setUpvotedPageIds((prev) => (nowUpvoted ? [...prev, id] : prev.filter((x) => x !== id)))}
                  onReport={refetch}
                />
              ))}
            </div>
            {hasMore && items.length > 0 ? (
              <div className="mt-8 flex justify-center">
                <button
                  type="button"
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="rounded-[14px] border border-[#EAEAEA] bg-white px-6 py-3 text-sm font-medium text-[#111111] disabled:opacity-60"
                >
                  {loadingMore ? "불러오는 중..." : "더 보기"}
                </button>
              </div>
            ) : null}
          </>
        )}
      </main>
      {showScrollTop ? (
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="fixed bottom-6 right-6 z-30 flex h-10 w-10 items-center justify-center rounded-full border border-[#EAEAEA] bg-white text-[#111111] shadow-[0_2px_8px_rgba(0,0,0,0.08)] hover:bg-[#FAFAFA]"
          aria-label="맨 위로"
          title="맨 위로"
        >
          <span className="text-lg leading-none text-[#111111]">↑</span>
        </button>
      ) : null}
    </div>
  );
}

const REPORT_REASONS = [
  { id: "spam", label: "스팸" },
  { id: "harmful", label: "유해 콘텐츠" },
  { id: "privacy", label: "개인정보 침해" },
  { id: "other", label: "기타" },
] as const;

function FeedCard({
  item,
  upvoted,
  liveViewerCount,
  onUpvote,
  onUpvoteToggle,
  onReport,
}: {
  item: FeedItem;
  upvoted: boolean;
  liveViewerCount?: number;
  onUpvote: () => void;
  onUpvoteToggle: (pageId: string, nowUpvoted: boolean) => void;
  onReport: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [upvoting, setUpvoting] = useState(false);
  const [optimisticUpvotes, setOptimisticUpvotes] = useState(0);
  const [serverUpvoteCount, setServerUpvoteCount] = useState<number | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [reportSubmitted, setReportSubmitted] = useState(false);
  const reportMenuRef = useRef<HTMLDivElement>(null);
  const reportTriggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!reportOpen) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setReportOpen(false);
        reportTriggerRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [reportOpen]);

  useEffect(() => {
    if (!reportOpen) return;
    const menu = reportMenuRef.current;
    if (!menu) return;
    const focusable = menu.querySelectorAll<HTMLButtonElement>('button[type="button"]');
    const first = focusable[0];
    first?.focus();
  }, [reportOpen]);

  const onReportMenuKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "Tab") return;
    const menu = reportMenuRef.current;
    if (!menu) return;
    const focusable = Array.from(menu.querySelectorAll<HTMLButtonElement>('button[type="button"]'));
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const target = e.target as HTMLElement;
    if (e.shiftKey) {
      if (target === first) {
        e.preventDefault();
        last?.focus();
      }
    } else {
      if (target === last) {
        e.preventDefault();
        first?.focus();
      }
    }
  };

  const handleUpvote = async () => {
    if (upvoting) return;
    setUpvoting(true);
    if (upvoted) setOptimisticUpvotes((n) => n - 1);
    else setOptimisticUpvotes((n) => n + 1);
    try {
      const method = upvoted ? "DELETE" : "POST";
      const res = await fetch(`/api/pages/${item.id}/upvote`, { method, credentials: "include" });
      const data = await res.json().catch(() => null);
      if (res.ok) {
        if (typeof data?.upvote_count === "number") setServerUpvoteCount(data.upvote_count);
        setOptimisticUpvotes(0);
        const nowUpvoted = data?.duplicated ? true : !upvoted;
        onUpvoteToggle(item.id, nowUpvoted);
        if (!upvoted && !data?.duplicated) onUpvote();
        if (upvoted && data?.removed) onUpvote();
      } else {
        setOptimisticUpvotes((n) => (upvoted ? n + 1 : Math.max(0, n - 1)));
        toast.show("추천에 실패했습니다. 다시 시도해 주세요.", "err");
      }
    } catch {
      setOptimisticUpvotes((n) => (upvoted ? n + 1 : Math.max(0, n - 1)));
      toast.show("다시 시도해 주세요.", "err");
    } finally {
      setUpvoting(false);
    }
  };

  const handleCardClick = (e: React.MouseEvent | React.KeyboardEvent) => {
    if (e.target && (e.target as HTMLElement).closest?.("a, button")) return;
    if ("key" in e && e.key === " ") e.preventDefault();
    router.push(`/live/${item.id}`);
  };

  const handleReport = async (reason: string) => {
    setReportOpen(false);
    if (reporting) return;
    setReporting(true);
    try {
      const res = await fetch(`/api/pages/${item.id}/report`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason ?? "" }),
      });
      if (res.ok) {
        setReportSubmitted(true);
        setTimeout(() => setReportSubmitted(false), 3000);
      }
      onReport();
    } finally {
      setReporting(false);
    }
  };

  const bouncePct = typeof item.bounce_rate === "number" ? Math.round(item.bounce_rate * 100) : 0;
  const liveViewers = liveViewerCount ?? item.live_viewer_count ?? 0;

  const baseCount = serverUpvoteCount ?? item.upvote_count;
  const displayUpvotes = Math.max(0, baseCount + optimisticUpvotes);
  const title = item.title || `익명 작품 #${item.anon_number}`;

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={handleCardClick}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && handleCardClick(e)}
      className="flex cursor-pointer flex-col rounded-[14px] border border-[#EAEAEA] bg-white shadow-[0_2px_8px_rgba(0,0,0,0.04)] transition-shadow hover:shadow-[0_4px_12px_rgba(0,0,0,0.08)]"
      aria-label={`작품 보기: ${title}`}
    >
      <div className="flex min-w-0 items-center justify-between gap-2 border-b border-[#EAEAEA] px-4 py-3 text-xs text-[#666666]">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="inline-flex h-2 w-2 rounded-full bg-red-500" aria-hidden />
          <span className="font-medium">제목</span>
          <span className="min-w-0 max-w-[120px] truncate font-medium text-[#111111] sm:max-w-[180px]" title={title}>
            {title}
          </span>
        </div>
        <span className="shrink-0 rounded-full border border-[#EAEAEA] px-2 py-1 font-medium text-[#111111]">
          남은 시간 <Countdown expiresAt={item.live_expires_at} />
        </span>
      </div>
      <div className="relative flex-1 px-4 py-4">
        <div className="group relative flex h-40 overflow-hidden rounded-[12px] border border-[#EAEAEA] bg-[#FAFAFA]">
          <div className="absolute inset-0 transition-transform duration-200 ease-out group-hover:scale-105">
            {item.snapshot_thumbnail ? (
              <img
                src={item.snapshot_thumbnail}
                alt={title}
                className="h-full w-full object-cover"
                loading="lazy"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                  const fallback = e.currentTarget.nextElementSibling as HTMLElement | null;
                  if (fallback) fallback.style.display = "flex";
                }}
              />
            ) : null}
            <div
              className="flex h-full w-full items-center justify-center text-xs text-[#666666]"
              style={item.snapshot_thumbnail ? { display: "none" } : undefined}
            >
              캔버스 미리보기
            </div>
          </div>
          <span className="absolute right-2 top-2 z-10 rounded-full border border-[#EAEAEA] bg-white/90 px-2 py-1 text-[11px] text-[#111111]">
            실시간 관람 {liveViewers}명
          </span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-[#666666]">
          <MetricPill label="평균 체류" value={`${Math.round(item.avg_duration_ms / 1000)}초`} />
          <MetricPill label="클릭" value={item.total_clicks} />
          <MetricPill label="이탈" value={`${bouncePct}%`} />
        </div>
      </div>
      <div className="flex items-center justify-between border-t border-[#EAEAEA] px-4 py-3 text-xs">
        <div className="flex items-center gap-2">
          <Link href={`/live/${item.id}`} className="flex items-center gap-1 font-medium text-[#111111]">
            <ArrowIcon />
            보러가기
          </Link>
          <button
            type="button"
            onClick={async () => {
              const url = typeof window !== "undefined" ? `${window.location.origin}/live/${item.id}` : "";
              if (!url) return;
              try {
                if (navigator.clipboard?.writeText) {
                  await navigator.clipboard.writeText(url);
                  toast.show("링크가 복사되었습니다.");
                }
              } catch {
                toast.show("복사에 실패했습니다.", "err");
              }
            }}
            className="rounded-full border border-[#EAEAEA] bg-white px-2 py-1 text-[11px] text-[#666666] hover:bg-[#FAFAFA]"
            title="링크 복사"
            aria-label="링크 복사"
          >
            링크 복사
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleUpvote}
            disabled={upvoting}
            className={`flex items-center gap-1 disabled:opacity-60 ${upvoted ? "text-[#111111] font-medium" : "text-[#666666]"}`}
            aria-label={upvoted ? "추천 취소" : "추천"}
            title={upvoted ? "추천 취소" : "추천"}
          >
            <ThumbIcon filled={upvoted} />
            {displayUpvotes}
          </button>
          <div className="relative">
            <button
              ref={reportTriggerRef}
              type="button"
              onClick={() => setReportOpen((v) => !v)}
              className="flex h-8 w-8 items-center justify-center rounded-full text-[#666666] hover:bg-[#EAEAEA]"
              aria-label="신고 메뉴"
              title="신고"
              aria-expanded={reportOpen}
              aria-haspopup="true"
            >
              <MoreIcon />
            </button>
            {reportSubmitted ? (
              <span className="text-[11px] text-[#666666]" role="status">
                접수됨
              </span>
            ) : reportOpen ? (
              <>
                <div className="fixed inset-0 z-10" aria-hidden onClick={() => setReportOpen(false)} />
                <div
                  ref={reportMenuRef}
                  role="menu"
                  aria-label="신고 사유"
                  className="absolute right-0 top-full z-20 mt-1 min-w-[140px] rounded-[14px] border border-[#EAEAEA] bg-white py-1 shadow-lg"
                  onKeyDown={onReportMenuKeyDown}
                >
                  {REPORT_REASONS.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      role="menuitem"
                      onClick={() => handleReport(r.label)}
                      className="w-full px-4 py-2 text-left text-xs text-[#111111] hover:bg-[#FAFAFA]"
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}

function MetricPill({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-full border border-[#EAEAEA] px-2 py-1 text-[#666666]">
      {label} {value}
    </div>
  );
}

function ThumbIcon({ filled }: { filled?: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.5">
      <path d="M7 10v10H4a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2h3z" />
      <path d="M7 10l4.5-6.5a2 2 0 0 1 3.7 1.1L14 10h5a2 2 0 0 1 2 2v2a6 6 0 0 1-6 6H7" />
    </svg>
  );
}

function MoreIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="6" cy="12" r="1.5" />
      <circle cx="18" cy="12" r="1.5" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M5 12h14" />
      <path d="M13 6l6 6-6 6" />
    </svg>
  );
}
