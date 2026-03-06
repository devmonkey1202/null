"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import Link from "next/link";
import { io } from "socket.io-client";
import CanvasRender from "@/components/canvas-render";
import AdvancedRuntimePlayer from "@/advanced/runtime/player";
import PageActions from "@/components/page-actions";
import { useToast } from "@/components/toast";
import { GhostLayer, PulseLayer, type GhostTrace, type Pulse } from "@/components/live-overlays";
import type { CanvasDocument, CanvasContentV2 } from "@/lib/canvas";
import { DEFAULT_CANVAS, normalizeContentToV2, pickScene, toDocument } from "@/lib/canvas";
import { hydrateDoc, type SerializableDoc } from "@/advanced/doc/scene";
import { layoutDoc } from "@/advanced/layout/engine";
import { getPageContentBounds } from "@/advanced/runtime/bounds";

const LOOP_MS = 8000;
const PULSE_MS = 4000;
const TICK_MS = 80;
const MOVE_THROTTLE_MIN_MS = 66;
const MOVE_THROTTLE_MAX_MS = 166;
const MOVE_THROTTLE_DEFAULT_MS = 100;
const SPEED_SLOW_PER_MS = 0.0005;
const SPEED_FAST_PER_MS = 0.005;

function safeNumber(value: unknown) {
  return typeof value === "number" && !Number.isNaN(value) ? value : null;
}

function getAdvancedCanvasSize(doc: SerializableDoc | null, pageId?: string | null) {
  if (!doc) return null;
  const laidOut = layoutDoc(hydrateDoc(doc));
  const bounds = getPageContentBounds(laidOut, pageId);
  const page =
    Array.isArray(laidOut.pages) && laidOut.pages.length
      ? pageId
        ? laidOut.pages.find((p) => p.id === pageId) ?? laidOut.pages[0]
        : laidOut.pages[0]
      : null;
  const pageNode = page ? laidOut.nodes?.[page.rootId] : null;
  const pageWidth = pageNode?.frame?.w ? (pageNode.frame.w as number) : DEFAULT_CANVAS.width;
  const pageHeight = pageNode?.frame?.h ? (pageNode.frame.h as number) : DEFAULT_CANVAS.height;
  const isLargeCanvas = pageWidth >= 2400 || pageHeight >= 1800;
  if (bounds && bounds.w > 0 && bounds.h > 0) {
    if (isLargeCanvas) {
      return { width: Math.max(1, bounds.w), height: Math.max(1, bounds.h) };
    }
    const minX = Math.min(0, bounds.x);
    const minY = Math.min(0, bounds.y);
    const maxX = Math.max(pageWidth, bounds.x + bounds.w);
    const maxY = Math.max(pageHeight, bounds.y + bounds.h);
    return { width: maxX - minX, height: maxY - minY };
  }
  if (pageNode?.frame?.w && pageNode?.frame?.h) {
    return { width: pageWidth, height: pageHeight };
  }
  return { width: DEFAULT_CANVAS.width, height: DEFAULT_CANVAS.height };
}

export default function LiveView({ pageId }: { pageId: string }) {
  const [contentV2, setContentV2] = useState<CanvasContentV2 | null>(null);
  const [doc, setDoc] = useState<CanvasDocument>({ ...DEFAULT_CANVAS, nodes: [...DEFAULT_CANVAS.nodes] });
  const [advancedDoc, setAdvancedDoc] = useState<SerializableDoc | null>(null);
  const [advancedPageId, setAdvancedPageId] = useState<string | null>(null);
  const onAdvancedPageChange = useCallback((newPageId: string) => setAdvancedPageId(newPageId), []);

  const [viewerCount, setViewerCount] = useState(1);
  const [ghostTraces, setGhostTraces] = useState<GhostTrace[]>([]);
  const [pulses, setPulses] = useState<Pulse[]>([]);
  const [title, setTitle] = useState<string>("");
  const [anonNumber, setAnonNumber] = useState<number | null>(null);
  const [upvotes, setUpvotes] = useState<number>(0);
  const [tick, setTick] = useState(0);
  const [pageError, setPageError] = useState<"not_found" | "error" | null>(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [chatRefetchSignal, setChatRefetchSignal] = useState(0);
  const handleChatSent = useCallback(() => {
    socketRef.current?.emit("chat:notify");
  }, []);
  const [showLiveCursors, setShowLiveCursors] = useState(true);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const socketRef = useRef<ReturnType<typeof io> | null>(null);
  const lastMoveAt = useRef(0);
  const lastThrottleMs = useRef(MOVE_THROTTLE_DEFAULT_MS);
  const lastSentX = useRef<number | null>(null);
  const lastSentY = useRef<number | null>(null);
  const toast = useToast();

  useEffect(() => {
    const onScroll = () => setShowScrollTop(typeof window !== "undefined" && (window.scrollY ?? document.documentElement.scrollTop) > 300);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => {
      if (cancelled) return;
      setPageError(null);
      setPageLoading(true);
    });
    fetch(`/api/pages/${pageId}`)
      .then((res) => {
        if (cancelled) return null;
        if (res.status === 404) {
          setPageError("not_found");
          return null;
        }
        if (!res.ok) {
          setPageError("error");
          return null;
        }
        return res.json();
      })
      .then((data) => {
        if (!data || cancelled) return;
        setTitle(typeof data?.page?.title === "string" ? data.page.title : "");
        setAnonNumber(typeof data?.page?.anon_number === "number" ? data.page.anon_number : null);
        setUpvotes(typeof data?.page?.upvote_count === "number" ? data.page.upvote_count : 0);

        const rawContent = data?.version?.content_json;
        if (rawContent && rawContent.schema === "null_advanced_v1") {
          const advanced = rawContent as SerializableDoc;
          const startPageId = advanced.prototype?.startPageId ?? advanced.pages?.[0]?.id ?? null;
          setContentV2(null);
          setAdvancedDoc(advanced);
          setAdvancedPageId(startPageId);
          return;
        }
        setAdvancedDoc(null);
        setAdvancedPageId(null);
        if (rawContent) {
          const normalized = normalizeContentToV2(rawContent);
          setContentV2(normalized);
          setDoc(toDocument(pickScene(normalized, null)));
        } else {
          setContentV2(null);
          setDoc({ ...DEFAULT_CANVAS, nodes: [...DEFAULT_CANVAS.nodes] });
        }
      })
      .catch(() => {
        if (!cancelled) setPageError("error");
      })
      .finally(() => {
        if (!cancelled) setPageLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [pageId]);

  const advancedSize = useMemo(
    () => (advancedDoc ? getAdvancedCanvasSize(advancedDoc, advancedPageId) : null),
    [advancedDoc, advancedPageId],
  );

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/pages/${pageId}/ghost`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data || cancelled) return;
        if (Array.isArray(data.traces)) {
          setGhostTraces(data.traces as GhostTrace[]);
        }
      })
      .catch(() => null);
    return () => {
      cancelled = true;
    };
  }, [pageId]);

  useEffect(() => {
    const socket = io({
      path: "/socket.io",
      query: {
        pageId,
        vw: typeof window !== "undefined" ? window.innerWidth : 0,
        vh: typeof window !== "undefined" ? window.innerHeight : 0,
      },
    });
    // eslint-disable-next-line react-hooks/immutability
    socketRef.current = socket;
    let hadDisconnected = false;

    socket.on("presence", (payload) => {
      const count = safeNumber(payload?.count);
      if (count !== null) {
        setViewerCount(count);
      }
    });

    socket.on("live:click", (payload) => {
      const x = safeNumber(payload?.x);
      const y = safeNumber(payload?.y);
      if (x === null || y === null) return;

      const id = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
      setPulses((prev) => [...prev, { id, x, y, createdAt: Date.now() }]);
    });

    socket.on("ghost:update", (payload) => {
      if (Array.isArray(payload?.traces)) {
        setGhostTraces(payload.traces as GhostTrace[]);
      }
    });

    socket.on("chat:message", () => {
      setChatRefetchSignal((prev) => prev + 1);
    });

    socket.on("page:closed", () => {
      console.warn("[live-view] socket: page:closed received; socket will disconnect");
    });

    socket.on("disconnect", (reason) => {
      if (reason === "io server disconnect" || reason === "io client disconnect") return;
      hadDisconnected = true;
      toast.show("연결이 끊겼습니다. 재연결 중...", "err");
    });
    socket.on("connect", () => {
      if (hadDisconnected) {
        toast.show("재연결되었습니다.");
        hadDisconnected = false;
      }
      setChatRefetchSignal((prev) => prev + 1);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [pageId, toast]);

  useEffect(() => {
    const interval = setInterval(() => {
      setPulses((prev) => prev.filter((pulse) => Date.now() - pulse.createdAt < PULSE_MS));
    }, 200);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setTick((prev) => prev + 1);
    }, TICK_MS);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const onFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && document.fullscreenElement) document.exitFullscreen();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const progress = useMemo(() => ((tick * TICK_MS) % LOOP_MS) / LOOP_MS, [tick]);
  const canvasWidth = advancedSize?.width ?? doc.width;
  const canvasHeight = advancedSize?.height ?? doc.height;

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      canvasRef.current?.requestFullscreen?.();
    }
  };
  const displayTitle = title || (anonNumber ? `익명 작품 #${anonNumber}` : "익명 작품");

  if (pageError) {
    return (
      <div className="min-h-screen bg-[#FAFAFA] px-6 py-12 text-sm text-[#111111]">
        <div className="mx-auto max-w-md text-center">
          <p className="text-[#666666]" role="alert">
            {pageError === "not_found"
              ? "페이지를 찾을 수 없습니다. 삭제되었거나 만료되었을 수 있습니다."
              : "문제가 발생했습니다. 다시 시도해 주세요."}
          </p>
          <div className="mt-6 flex flex-col gap-2">
            <Link
              href="/"
              className="rounded-[14px] border border-[#111111] bg-white px-4 py-3 text-sm font-semibold text-[#111111]"
            >
              홈으로
            </Link>
            {pageError === "error" && (
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="rounded-[14px] border border-[#EAEAEA] bg-white px-4 py-3 text-sm font-semibold text-[#111111]"
              >
                다시 시도
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  const emitMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const now = Date.now();
    if (now - lastMoveAt.current < lastThrottleMs.current) return;

    const target = canvasRef.current;
    const socket = socketRef.current;
    if (!target || !socket) return;
    const rect = target.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    if (x < 0 || x > 1 || y < 0 || y > 1) return;

    const dt = (now - lastMoveAt.current) / 1000;
    if (dt > 0 && lastSentX.current != null && lastSentY.current != null) {
      const dx = x - lastSentX.current;
      const dy = y - lastSentY.current;
      const speed = Math.sqrt(dx * dx + dy * dy) / (dt * 1000);
      lastThrottleMs.current =
        speed < SPEED_SLOW_PER_MS ? MOVE_THROTTLE_MAX_MS : speed > SPEED_FAST_PER_MS ? MOVE_THROTTLE_MIN_MS : MOVE_THROTTLE_DEFAULT_MS;
    }
    lastMoveAt.current = now;
    lastSentX.current = x;
    lastSentY.current = y;
    socket.emit("move", { x, y });
  };

  const emitClick = (event: ReactPointerEvent<HTMLDivElement>) => {
    const target = canvasRef.current;
    const socket = socketRef.current;
    if (!target || !socket) return;
    const rect = target.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    if (x < 0 || x > 1 || y < 0 || y > 1) return;

    const el = (event.target as HTMLElement).closest?.("[data-node-id]");
    const elementId = el?.getAttribute?.("data-node-id") ?? undefined;
    const elementType = el?.getAttribute?.("data-node-type") ?? undefined;
    const elementLabelHash = el?.getAttribute?.("data-label-hash") ?? undefined;
    socket.emit("click", { x, y, elementId, elementType, elementLabelHash });
  };

  return (
    <div className="min-h-screen bg-[#FFFFFF] px-6 py-8 text-sm text-[#111111]">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <header className="sticky top-0 z-20 -mx-6 flex flex-wrap items-center justify-between gap-4 border-b border-[#EAEAEA] bg-white/95 px-6 py-4 backdrop-blur">
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/" className="flex items-center gap-1 text-[#666666] hover:text-[#111111]" aria-label="홈">
              <span className="text-lg">←</span>
              <span className="text-xs">홈</span>
            </Link>
            <span className="text-[#EAEAEA]">|</span>
            <span className="inline-flex h-2 w-2 rounded-full bg-red-500" aria-hidden />
            <span className="text-xs font-semibold text-[#666666]">제목</span>
            <div className="min-w-0 max-w-full truncate text-lg font-semibold text-[#111111]" title={displayTitle}>
              {displayTitle}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-[#666666]">
            <span>관람자 {viewerCount}명</span>
            <button
              type="button"
              onClick={() => setShowLiveCursors((v) => !v)}
              className={`rounded-full border px-2 py-1 ${showLiveCursors ? "border-[#EAEAEA] bg-white" : "border-[#999] bg-[#F0F0F0] text-[#666]"}`}
              title={showLiveCursors ? "실시간 커서 숨기기" : "실시간 커서 보이기"}
              aria-label={showLiveCursors ? "실시간 커서 숨기기" : "실시간 커서 보이기"}
            >
              실시간 커서 {showLiveCursors ? "켜짐" : "꺼짐"}
            </button>
            <button
              type="button"
              onClick={async () => {
                const url = typeof window !== "undefined" ? window.location.href : "";
                if (navigator.share) {
                  try {
                    await navigator.share({ title: displayTitle, url: url || "", text: displayTitle });
                    toast.show("공유되었습니다.");
                  } catch (err) {
                    if ((err as Error)?.name !== "AbortError") toast.show("공유에 실패했습니다.", "err");
                  }
                } else if (url && navigator.clipboard?.writeText) {
                  try {
                    await navigator.clipboard.writeText(url);
                    toast.show("복사되었습니다.");
                  } catch {
                    toast.show("복사에 실패했습니다.", "err");
                  }
                }
              }}
              className="rounded-full border border-[#EAEAEA] bg-white px-3 py-1 text-[11px] font-medium text-[#111111] hover:bg-[#FAFAFA]"
              title="공유"
              aria-label="공유"
            >
              공유
            </button>
            <button
              type="button"
              onClick={async () => {
                const url = typeof window !== "undefined" ? window.location.href : "";
                if (!url) return;
                try {
                  if (navigator.clipboard?.writeText) {
                    await navigator.clipboard.writeText(url);
                    toast.show("복사되었습니다.");
                  }
                } catch {
                  toast.show("복사에 실패했습니다.", "err");
                }
              }}
              className="rounded-full border border-[#EAEAEA] bg-white px-3 py-1 text-[11px] font-medium text-[#111111] hover:bg-[#FAFAFA]"
              title="링크 복사"
              aria-label="링크 복사"
            >
              링크 복사
            </button>
            <button
              type="button"
              onClick={toggleFullscreen}
              className="rounded-full border border-[#EAEAEA] bg-white px-3 py-1 text-[11px] font-medium text-[#111111] hover:bg-[#FAFAFA]"
              title={isFullscreen ? "전체 화면 종료" : "전체 화면"}
              aria-label={isFullscreen ? "전체 화면 종료" : "전체 화면"}
            >
              {isFullscreen ? "전체 화면 종료" : "전체 화면"}
            </button>
            <Link
              href={`/replay/${pageId}`}
              className="rounded-full border border-[#EAEAEA] bg-white px-3 py-1 text-[11px] font-medium text-[#111111] hover:bg-[#FAFAFA]"
              title="리플레이(Pro)"
              aria-label="리플레이(Pro)"
            >
              리플레이(Pro)
            </Link>
            <PageActions pageId={pageId} initialUpvotes={upvotes} />
          </div>
        </header>

        <section className="relative w-full overflow-auto rounded-[14px] border border-[#EAEAEA] bg-white shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
          {pageLoading ? (
            <div className="aspect-[9/16] w-full animate-pulse rounded-[14px] bg-[#EAEAEA]" aria-busy="true" aria-live="polite">
              <div className="flex h-full w-full items-center justify-center text-xs text-[#666666]">캔버스 불러오는 중...</div>
            </div>
          ) : (
            <div className="flex w-full justify-start bg-neutral-50 p-6">
              <div
                ref={canvasRef}
                className="relative"
                style={{ width: canvasWidth, height: canvasHeight }}
                onPointerMove={emitMove}
                onPointerDown={emitClick}
              >
                {advancedDoc ? (
                  <div className="absolute inset-0">
                    <AdvancedRuntimePlayer
                      doc={advancedDoc}
                      initialPageId={advancedPageId ?? undefined}
                      appPageId={pageId}
                      onPageChange={onAdvancedPageChange}
                      className="relative h-full w-full"
                      fitToContent
                      chatRefetchSignal={chatRefetchSignal}
                      onChatSent={handleChatSent}
                    />
                  </div>
                ) : (
                  <CanvasRender doc={doc} interactive className="absolute inset-0 shadow-none" />
                )}
                <GhostLayer traces={ghostTraces} progress={progress} />
                {showLiveCursors ? <PulseLayer pulses={pulses.slice(-20)} /> : null}
              </div>
            </div>
          )}
        </section>

        <div className="text-xs text-[#666666]">포인터 이동, 클릭, 스크롤이 기록됩니다.</div>
      </div>
      {showScrollTop ? (
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="fixed bottom-6 right-6 z-30 flex h-10 w-10 items-center justify-center rounded-full border border-[#EAEAEA] bg-white shadow-[0_2px_8px_rgba(0,0,0,0.08)] hover:bg-[#FAFAFA]"
          aria-label="맨 위로"
          title="맨 위로"
        >
          <span className="text-lg leading-none text-[#111111]">↑</span>
        </button>
      ) : null}
    </div>
  );
}
