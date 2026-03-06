"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { io } from "socket.io-client";

import CanvasRender from "@/components/canvas-render";
import AdvancedRuntimePlayer from "@/advanced/runtime/player";
import PageActions from "@/components/page-actions";
import { useToast } from "@/components/toast";
import { GhostLayer, PulseLayer, type GhostTrace, type Pulse } from "@/components/live-overlays";

import type { BuilderAction, CanvasDocument, CanvasContentV2 } from "@/lib/canvas";
import { DEFAULT_CANVAS, normalizeContentToV2, pickScene, toDocument } from "@/lib/canvas";
import { hydrateDoc, type SerializableDoc } from "@/advanced/doc/scene";
import { layoutDoc } from "@/advanced/layout/engine";
import { getPageContentBounds } from "@/advanced/runtime/bounds";
import { installResourceTimingTracker, installRuntimeMetrics } from "@/lib/runtime-metrics";

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

function formatDuration(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = String(Math.floor(total / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
  const seconds = String(total % 60).padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
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

type Spike = { start: string; end: string; clicks: number; leaves: number };
type SpikesResponse = { ok: true; highlights: Spike[] } | { ok: false; error: string };

export default function WorkView({ pageId, standalone = false }: { pageId: string; standalone?: boolean }) {
  const searchParams = useSearchParams();
  const sceneParam = searchParams.get("s");

  const [contentV2, setContentV2] = useState<CanvasContentV2 | null>(null);
  const [doc, setDoc] = useState<CanvasDocument>({ ...DEFAULT_CANVAS, nodes: [...DEFAULT_CANVAS.nodes] });
  const [advancedDoc, setAdvancedDoc] = useState<SerializableDoc | null>(null);
  const [advancedSize, setAdvancedSize] = useState<{ width: number; height: number } | null>(null);
  const [advancedPageId, setAdvancedPageId] = useState<string | null>(null);
  const [runtimeState, setRuntimeState] = useState<Record<string, unknown>>({});
  const setRuntimeStatePatch = useCallback((patch: Record<string, unknown>) => {
    setRuntimeState((prev) => ({ ...prev, ...patch }));
  }, []);
  const onCanvasAction = useCallback(
    (action: BuilderAction) => {
      if (!action || action.type === "none") return;
      if (action.type === "link") {
        const href = action.url?.trim();
        if (!href || typeof window === "undefined") return;
        try {
          const target = new URL(href, window.location.href);
          if (target.origin === window.location.origin) {
            window.location.href = target.toString();
          } else {
            window.open(href, "_blank", "noopener,noreferrer");
          }
        } catch {
          // fallback to open as-is
          window.open(href, "_blank", "noopener,noreferrer");
        }
        return;
      }
      if (action.type === "scene") {
        if (!contentV2) return;
        const scene = pickScene(contentV2, action.sceneId);
        setDoc(toDocument(scene));
        setRuntimeState({});
        if (typeof window !== "undefined") {
          const url = new URL(window.location.href);
          if (action.sceneId) url.searchParams.set("s", action.sceneId);
          else url.searchParams.delete("s");
          window.history.replaceState({}, "", url.toString());
        }
      }
    },
    [contentV2],
  );

  const onAdvancedPageChange = useCallback((newPageId: string) => {
    setAdvancedPageId(newPageId);
  }, []);

  const [viewerCount, setViewerCount] = useState(1);
  const [ghostTraces, setGhostTraces] = useState<GhostTrace[]>([]);
  const [pulses, setPulses] = useState<Pulse[]>([]);
  const [title, setTitle] = useState<string>("");
  const [anonNumber, setAnonNumber] = useState<number | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [summaryClicks, setSummaryClicks] = useState<number[]>([]);
  const [upvotes, setUpvotes] = useState<number>(0);
  const [metrics, setMetrics] = useState({ avgDurationMs: 0, totalClicks: 0, bounceRate: 0 });

  const [pageLoadError, setPageLoadError] = useState<"not_found" | "error" | null>(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [spikes, setSpikes] = useState<Spike[] | null>(null);
  const [spikesBlocked, setSpikesBlocked] = useState(false);
  const [stats, setStats] = useState<{
    clicks_10s: number;
    visits_60s: number;
    top_element_id: string | null;
    top_elements: { element_id: string | null; count: number }[];
    avg_dwell_s: number;
    replay_enabled: boolean;
  } | null>(null);

  const canvasRef = useRef<HTMLDivElement | null>(null);
  const canvasSectionRef = useRef<HTMLElement | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [showLiveCursors, setShowLiveCursors] = useState(true);
  const socketRef = useRef<ReturnType<typeof io> | null>(null);
  const lastMoveAt = useRef(0);
  const lastThrottleMs = useRef(MOVE_THROTTLE_DEFAULT_MS);
  const lastSentX = useRef<number | null>(null);
  const lastSentY = useRef<number | null>(null);
  const dwellSentAt = useRef<number>(0);
  const toast = useToast();

  useEffect(() => {
    const onScroll = () => setShowScrollTop(typeof window !== "undefined" && (window.scrollY ?? document.documentElement.scrollTop) > 300);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const initialQueryParams = useMemo(() => {
    const o: Record<string, string> = {};
    searchParams.forEach((v, k) => {
      if (k === "s") return;
      o[k] = v;
    });
    return Object.keys(o).length ? o : undefined;
  }, [searchParams]);

  const [tick, setTick] = useState(0);
  const progress = useMemo(() => ((tick * TICK_MS) % LOOP_MS) / LOOP_MS, [tick]);

  useEffect(() => {
    let cancelled = false;
    setPageLoadError(null);
    setPageLoading(true);

    fetch(`/api/pages/${pageId}`)
      .then((res) => {
        if (cancelled) return null;
        if (res.status === 404) {
          setPageLoadError("not_found");
          return null;
        }
        if (!res.ok) {
          setPageLoadError("error");
          return null;
        }
        return res.json();
      })
      .then((data) => {
        if (!data || cancelled) return;

        setTitle(typeof data?.page?.title === "string" ? data.page.title : "");
        setAnonNumber(typeof data?.page?.anon_number === "number" ? data.page.anon_number : null);
        setExpiresAt(data?.page?.live_expires_at ?? null);

        setUpvotes(typeof data?.page?.upvote_count === "number" ? data.page.upvote_count : 0);
        setMetrics({
          avgDurationMs: typeof data?.page?.avg_duration_ms === "number" ? data.page.avg_duration_ms : 0,
          totalClicks: typeof data?.page?.total_clicks === "number" ? data.page.total_clicks : 0,
          bounceRate: typeof data?.page?.bounce_rate === "number" ? data.page.bounce_rate : 0,
        });

        const rawContent = data?.version?.content_json;
        if (rawContent && rawContent.schema === "null_advanced_v1") {
          const advanced = rawContent as SerializableDoc;
          const startPageId = advanced.prototype?.startPageId ?? advanced.pages?.[0]?.id ?? null;
          setContentV2(null);
          setAdvancedDoc(advanced);
          setAdvancedPageId(startPageId);
          setAdvancedSize(getAdvancedCanvasSize(advanced, startPageId));
          return;
        }

        setAdvancedDoc(null);
        setAdvancedSize(null);
        setAdvancedPageId(null);
        const normalized = normalizeContentToV2(rawContent);
        setContentV2(normalized);

        const scene = pickScene(normalized, sceneParam);
        setDoc(toDocument(scene));
      })
      .catch(() => {
        if (!cancelled) setPageLoadError("error");
      })
      .finally(() => {
        if (!cancelled) setPageLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [pageId, sceneParam]);

  useEffect(() => {
    if (!contentV2) return;
    const scene = pickScene(contentV2, sceneParam);
    setDoc(toDocument(scene));
  }, [contentV2, sceneParam]);

  useEffect(() => {
    setRuntimeState({});
  }, [pageId, sceneParam]);

  useEffect(() => {
    if (!advancedDoc) return;
    setAdvancedSize(getAdvancedCanvasSize(advancedDoc, advancedPageId));
  }, [advancedDoc, advancedPageId]);

  useEffect(() => {
    if (standalone) return;
    let cancelled = false;
    fetch(`/api/pages/${pageId}/ghost`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data || cancelled) return;
        if (Array.isArray(data.traces)) setGhostTraces(data.traces as GhostTrace[]);
      })
      .catch(() => null);
    return () => {
      cancelled = true;
    };
  }, [pageId, standalone]);

  useEffect(() => {
    if (standalone) return;
    let cancelled = false;
    fetch(`/api/pages/${pageId}/stats`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data || cancelled) return;
        setStats({
          clicks_10s: typeof data.clicks_10s === "number" ? data.clicks_10s : 0,
          visits_60s: typeof data.visits_60s === "number" ? data.visits_60s : 0,
          top_element_id: data.top_element_id ?? null,
          top_elements: Array.isArray(data.top_elements) ? data.top_elements : [],
          avg_dwell_s: typeof data.avg_dwell_s === "number" ? data.avg_dwell_s : 0,
          replay_enabled: Boolean(data.replay_enabled),
        });
      })
      .catch(() => null);
    const interval = setInterval(() => {
      fetch(`/api/pages/${pageId}/stats`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (!data) return;
          setStats((prev) =>
            prev
              ? {
                  ...prev,
                  clicks_10s: typeof data.clicks_10s === "number" ? data.clicks_10s : prev.clicks_10s,
                  visits_60s: typeof data.visits_60s === "number" ? data.visits_60s : prev.visits_60s,
                  top_element_id: data.top_element_id ?? prev.top_element_id,
                  top_elements: Array.isArray(data.top_elements) ? data.top_elements : prev.top_elements,
                  avg_dwell_s: typeof data.avg_dwell_s === "number" ? data.avg_dwell_s : prev.avg_dwell_s,
                  replay_enabled: Boolean(data.replay_enabled),
                }
              : null
          );
        })
        .catch(() => null);
    }, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [pageId, standalone]);

  useEffect(() => {
    if (standalone) return;
    let cancelled = false;

    const fetchSpikes = async () => {
      try {
        const res = await fetch(`/api/pages/${pageId}/spikes`);
        if (cancelled) return;

        if (res.status === 402) {
          setSpikesBlocked(true);
          setSpikes(null);
          return;
        }
        const data = (await res.json().catch(() => null)) as SpikesResponse | null;
        if (!data) return;

        if (data.ok) {
          setSpikes(Array.isArray(data.highlights) ? data.highlights : []);
          setSpikesBlocked(false);
        }
      } catch {
        // silent
      }
    };

    fetchSpikes();
    const interval = setInterval(fetchSpikes, 30000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [pageId, standalone]);

  const socketQuery = useMemo(() => {
    const q: Record<string, string | number> = {
      pageId,
      vw: typeof window !== "undefined" ? window.innerWidth : 0,
      vh: typeof window !== "undefined" ? window.innerHeight : 0,
    };
    if (typeof window !== "undefined" && window.location?.search) {
      const u = new URLSearchParams(window.location.search);
      const utm: Record<string, string> = {};
      ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"].forEach((k) => {
        const v = u.get(k);
        if (v) utm[k] = v;
      });
      if (Object.keys(utm).length) q.utm = JSON.stringify(utm);
    }
    return q;
  }, [pageId]);

  useEffect(() => {
    if (standalone) return;
    const socket = io({
      path: "/socket.io",
      query: socketQuery as Record<string, string>,
    });
    socketRef.current = socket;

    socket.on("presence", (payload) => {
      const count = safeNumber(payload?.count);
      if (count !== null) setViewerCount(count);
    });

    socket.on("live:click", (payload) => {
      const x = safeNumber(payload?.x);
      const y = safeNumber(payload?.y);
      if (x === null || y === null) return;

      const id = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
      setPulses((prev) => [...prev, { id, x, y, createdAt: Date.now() }]);
      setSummaryClicks((prev) => [...prev, Date.now()]);
    });

    socket.on("ghost:update", (payload) => {
      if (Array.isArray(payload?.traces)) setGhostTraces(payload.traces as GhostTrace[]);
    });

    let hadDisconnected = false;
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
    });

    (window as unknown as { __nullTrack?: (name: string, props?: Record<string, unknown>) => void }).__nullTrack = (
      name: string,
      props?: Record<string, unknown>
    ) => {
      socketRef.current?.emit("track", { name, ...props });
    };

    return () => {
      delete (window as unknown as { __nullTrack?: unknown }).__nullTrack;
      socket.disconnect();
      socketRef.current = null;
    };
  }, [pageId, standalone, toast]);

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setPulses((prev) => prev.filter((pulse) => now - pulse.createdAt < PULSE_MS));
      setSummaryClicks((prev) => prev.filter((ts) => now - ts < 10000));
    }, 200);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => setTick((prev) => prev + 1), TICK_MS);
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

  // 31.1: Emit scroll depth (0~1) for live view, throttled to 400ms.
  useEffect(() => {
    if (standalone) return;
    const el = canvasSectionRef.current;
    if (!el) return;
    let lastEmit = 0;
    const SCROLL_THROTTLE_MS = 400;
    const onScroll = () => {
      const socket = socketRef.current;
      if (!socket) return;
      const now = Date.now();
      if (now - lastEmit < SCROLL_THROTTLE_MS) return;
      const { scrollTop, scrollHeight, clientHeight } = el;
      const maxScroll = Math.max(0, scrollHeight - clientHeight);
      const depth = maxScroll > 0 ? Math.min(1, Math.max(0, scrollTop / maxScroll)) : 0;
      lastEmit = now;
      socket.emit("scroll", { depth });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [standalone]);

  useEffect(() => {
    if (standalone) return;
    const track = (window as unknown as { __nullTrack?: (name: string, props?: Record<string, unknown>) => void }).__nullTrack;
    if (typeof track !== "function") return;
    const cleanupVitals = installRuntimeMetrics(track);
    const cleanupResources = installResourceTimingTracker(track);
    return () => {
      cleanupVitals?.();
      cleanupResources?.();
    };
  }, [standalone]);

  useEffect(() => {
    if (standalone) return;
    let prev = typeof window !== "undefined" ? window.location.hash || window.location.pathname || "" : "";
    const onRouteChange = () => {
      const s = socketRef.current;
      if (!s) return;
      const next = window.location.hash || window.location.pathname || "";
      if (prev !== next) {
        const track = (window as unknown as { __nullTrack?: (name: string, props?: Record<string, unknown>) => void }).__nullTrack;
        if (typeof track === "function") track("route_change", { from: prev, to: next });
        prev = next;
      }
    };
    window.addEventListener("hashchange", onRouteChange);
    window.addEventListener("popstate", onRouteChange);
    return () => {
      window.removeEventListener("hashchange", onRouteChange);
      window.removeEventListener("popstate", onRouteChange);
    };
  }, [standalone]);

  // 31.1: Track form focus/blur/change/submit events (track("form_*"))
  useEffect(() => {
    if (standalone) return;
    const root = () => canvasSectionRef.current ?? canvasRef.current;
    const send = (eventType: string, target: EventTarget | null) => {
      const el = target && "closest" in (target as HTMLElement) ? (target as HTMLElement).closest?.("[data-node-id]") : null;
      const elementId = el?.getAttribute?.("data-node-id") ?? undefined;
      const elementType = el?.getAttribute?.("data-node-type") ?? undefined;
      const track = (window as unknown as { __nullTrack?: (name: string, props?: Record<string, unknown>) => void }).__nullTrack;
      if (typeof track === "function") track(eventType, { elementId, elementType });
    };
    const onFocusIn = (e: FocusEvent) => {
      if (!root()?.contains(e.target as Node)) return;
      const t = e.target as HTMLElement;
      if (!t || !/^(INPUT|TEXTAREA|SELECT|FORM)$/i.test(t.tagName)) return;
      send("form_focus", e.target);
    };
    const onFocusOut = (e: FocusEvent) => {
      if (!root()?.contains(e.target as Node)) return;
      const t = e.target as HTMLElement;
      if (!t || !/^(INPUT|TEXTAREA|SELECT|FORM)$/i.test(t.tagName)) return;
      send("form_blur", e.target);
    };
    const onChange = (e: Event) => {
      if (!root()?.contains(e.target as Node)) return;
      const t = e.target as HTMLElement;
      if (!t || !/^(INPUT|TEXTAREA|SELECT)$/i.test(t.tagName)) return;
      send("form_change", e.target);
    };
    const onSubmit = (e: Event) => {
      if (!root()?.contains(e.target as Node)) return;
      const t = e.target as HTMLElement;
      if (!t?.tagName || t.tagName !== "FORM") return;
      send("form_submit", e.target);
    };
    document.addEventListener("focusin", onFocusIn, true);
    document.addEventListener("focusout", onFocusOut, true);
    document.addEventListener("change", onChange, true);
    document.addEventListener("submit", onSubmit, true);
    return () => {
      document.removeEventListener("focusin", onFocusIn, true);
      document.removeEventListener("focusout", onFocusOut, true);
      document.removeEventListener("change", onChange, true);
      document.removeEventListener("submit", onSubmit, true);
    };
  }, [standalone]);

  useEffect(() => {
    if (standalone) return;
    const onError = (event: ErrorEvent) => {
      const s = socketRef.current;
      if (!s) return;
      s.emit("error", {
        message: event.message ?? String(event.error),
        source: event.filename ?? null,
        lineno: event.lineno ?? null,
        colno: event.colno ?? null,
        stack: event.error?.stack ?? null,
      });
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      const s = socketRef.current;
      if (!s) return;
      const msg = event.reason instanceof Error ? event.reason.message : String(event.reason);
      const stack = event.reason instanceof Error ? event.reason.stack : null;
      s.emit("error", { message: msg, source: null, lineno: null, colno: null, stack });
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, [standalone]);

  const remainingMs = expiresAt ? new Date(expiresAt).getTime() - Date.now() : 0;
  const isExpired = remainingMs <= 0;
  const displayTitle = title || (anonNumber ? `익명 작품 #${anonNumber}` : "익명 작품");
  const presenceLabel = viewerCount <= 1 ? "현재 관람자 1명" : `현재 관람자 ${viewerCount}명`;
  const canvasWidth = advancedSize?.width ?? doc.width;
  const canvasHeight = advancedSize?.height ?? doc.height;
  const replayEnabled = stats?.replay_enabled ?? false;

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      canvasSectionRef.current?.requestFullscreen?.();
    }
  };

  const emitMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (standalone) return;
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
    dwellSentAt.current = 0;

    socket.emit("move", { x, y });
  };

  useEffect(() => {
    if (standalone) return;
    const DWELL_MS = 2000;
    const iv = setInterval(() => {
      const now = Date.now();
      if (now - lastMoveAt.current < DWELL_MS || dwellSentAt.current > 0) return;
      const x = lastSentX.current;
      const y = lastSentY.current;
      if (x == null || y == null) return;
      const track = (window as unknown as { __nullTrack?: (name: string, props?: Record<string, unknown>) => void }).__nullTrack;
      if (typeof track === "function") track("dwell", { x, y, duration_s: 2 });
      dwellSentAt.current = now;
    }, 500);
    return () => clearInterval(iv);
  }, [standalone]);

  const emitClick = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (standalone) return;
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

  if (pageLoadError) {
    if (standalone) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-white text-sm text-[#666666]">
          <p role="alert">{pageLoadError === "not_found" ? "페이지를 찾을 수 없습니다." : "문제가 발생했습니다. 다시 시도해 주세요."}</p>
        </div>
      );
    }
    return (
      <div className="min-h-screen bg-[#FAFAFA] px-6 py-12 text-sm text-[#111111]">
        <div className="mx-auto max-w-md text-center">
          <p className="text-[#666666]" role="alert">
            {pageLoadError === "not_found"
              ? "페이지를 찾을 수 없습니다. 링크를 확인해 주세요."
              : "문제가 발생했습니다. 다시 시도해 주세요."}
          </p>
          <div className="mt-6 flex flex-col gap-2">
            <Link href="/" className="rounded-[14px] border border-[#111111] bg-white px-4 py-3 text-sm font-semibold text-[#111111]">
              홈으로
            </Link>
            {pageLoadError === "error" && (
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

  if (standalone) {
    return (
      <div className="min-h-screen overflow-auto bg-white">
        <div className="flex min-h-full w-full items-start justify-center p-0">
              {pageLoading ? (
                <div
                  className="relative min-h-[400px] w-full max-w-[375px] animate-pulse rounded-[14px] bg-[#EAEAEA]"
                  aria-busy="true"
                  aria-label="로딩 중"
                />
              ) : (
            <div
              ref={canvasRef}
              className="relative"
              style={{ width: canvasWidth, height: canvasHeight }}
            >
              {advancedDoc ? (
                <div className="absolute inset-0">
                  <AdvancedRuntimePlayer
                    doc={advancedDoc}
                    initialPageId={advancedPageId ?? undefined}
                    initialQueryParams={initialQueryParams}
                    appPageId={pageId}
                    onPageChange={onAdvancedPageChange}
                    className="relative h-full w-full"
                    fitToContent
                  />
                </div>
              ) : (
                <CanvasRender
                  doc={doc}
                  interactive
                  runtime={{ state: runtimeState, setState: setRuntimeStatePatch, onAction: onCanvasAction }}
                  className="absolute inset-0 shadow-none"
                />
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FFFFFF] px-6 py-8 text-sm text-[#111111]">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <header className="sticky top-0 z-20 -mx-6 flex flex-wrap items-center justify-between gap-4 border-b border-[#EAEAEA] bg-white/95 px-6 py-4 backdrop-blur">
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/" className="flex items-center gap-1 text-[#666666] hover:text-[#111111]" aria-label="홈">
              <span className="text-lg"></span>
              <span className="text-xs">홈</span>
            </Link>
            <span className="text-[#EAEAEA]">|</span>
            <span className={`inline-flex h-2 w-2 rounded-full ${isExpired ? "bg-[#666666]" : "bg-red-500"}`} aria-hidden />
            <span className="text-xs font-semibold text-[#666666]">{isExpired ? "만료" : "라이브"}</span>
            <div className="min-w-0 max-w-full truncate text-lg font-semibold text-[#111111]" title={displayTitle}>
              {displayTitle}
            </div>
            {!isExpired && (
              <span className="rounded-full border border-[#EAEAEA] px-2 py-1 text-xs text-[#666666]">
                남은 시간 {formatDuration(remainingMs)}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-[#666666]">
            <span>관람자: {viewerCount}명</span>
            <button
              type="button"
              onClick={() => setShowLiveCursors((v) => !v)}
              className={`rounded-full border px-2 py-1 text-[11px] ${showLiveCursors ? "border-[#EAEAEA] bg-white" : "border-[#999] bg-[#F0F0F0] text-[#666]"}`}
              title={showLiveCursors ? "실시간 커서 켜짐" : "실시간 커서 꺼짐"}
              aria-label={showLiveCursors ? "실시간 커서 켜짐" : "실시간 커서 꺼짐"}
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
                    toast.show("링크가 복사되었습니다.");
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
                    toast.show("링크가 복사되었습니다.");
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
            {replayEnabled ? (
                <Link
                  href={`/replay/${pageId}`}
                  className="rounded-full border border-[#111111] bg-[#111111] px-3 py-1 text-[11px] font-medium text-white hover:bg-[#333333]"
                  title="리플레이 / 24시간"
                  aria-label="리플레이 / 24시간"
                >
                  리플레이 / 24시간
                </Link>
            ) : (
                <Link
                  href="/upgrade"
                  className="rounded-full border border-[#EAEAEA] bg-white px-3 py-1 text-[11px] font-medium text-[#111111] hover:bg-[#FAFAFA]"
                  title="리플레이 (Pro)"
                  aria-label="리플레이 (Pro)"
                >
                  리플레이 (Pro)
                </Link>
            )}
            <button
              type="button"
              onClick={toggleFullscreen}
              className="rounded-full border border-[#EAEAEA] bg-white px-3 py-1 text-[11px] font-medium text-[#111111] hover:bg-[#FAFAFA]"
              title={isFullscreen ? "전체 화면 종료" : "전체 화면"}
              aria-label={isFullscreen ? "전체 화면 종료" : "전체 화면"}
            >
              {isFullscreen ? "전체 화면 종료" : "전체 화면"}
            </button>
            <PageActions pageId={pageId} initialUpvotes={upvotes} />
          </div>
        </header>

        <section className="rounded-[14px] border border-[#EAEAEA] bg-white px-4 py-3 text-xs text-[#666666] shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-[11px] font-semibold text-[#111111]">관람자</span>
            <span className="text-[11px]">{presenceLabel}</span>
            <span className="text-[11px] text-[#666666]">실시간 커서와 클릭이 캔버스에 표시됩니다.</span>
          </div>
        </section>

        <div className="grid w-full gap-6 lg:grid-cols-[1fr_260px]">
          <section
            ref={canvasSectionRef}
            className="relative w-full overflow-auto rounded-[14px] border border-[#EAEAEA] bg-white shadow-[0_2px_8px_rgba(0,0,0,0.04)]"
          >
            <div className="flex w-full items-start justify-start bg-neutral-50 p-6">
              {pageLoading ? (
                <div
                  className="relative min-h-[400px] w-full max-w-[375px] animate-pulse rounded-[14px] bg-[#EAEAEA]"
                  aria-busy="true"
                  aria-label="로딩 중"
                />
              ) : (
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
                      initialQueryParams={initialQueryParams}
                      appPageId={pageId}
                      onPageChange={onAdvancedPageChange}
                      className="relative h-full w-full"
                      fitToContent
                    />
                  </div>
                ) : (
                  <CanvasRender
                    doc={doc}
                    interactive
                    runtime={{ state: runtimeState, setState: setRuntimeStatePatch, onAction: onCanvasAction }}
                    className="absolute inset-0 shadow-none"
                  />
                )}
                <GhostLayer traces={ghostTraces} progress={progress} />
                {showLiveCursors ? <PulseLayer pulses={pulses.slice(-20)} /> : null}
              </div>
              )}
            </div>
          </section>

          <aside className="flex flex-col gap-3">
            <SummaryCard
              label="클릭 (10초)"
              value={stats === null ? "-" : stats?.clicks_10s ?? summaryClicks.length}
            />
            <SummaryCard
              label="방문 (60초)"
              value={stats === null ? "-" : stats?.visits_60s ?? 0}
            />
            <SummaryCard
              label="상위 요소"
              value={
                stats === null ? "-" : stats?.top_element_id ? stats.top_element_id.slice(0, 12) + "" : "-"
              }
            />
            <SummaryCard
              label="평균 체류(초)"
              value={stats === null ? "-" : stats?.avg_dwell_s ?? Math.round(metrics.avgDurationMs / 1000)}
            />
            <SummaryCard label="관람자" value={viewerCount} />
            <SummaryCard label="이탈률" value={`${Math.round(metrics.bounceRate * 100)}%`} />

            <div className="rounded-[14px] border border-[#EAEAEA] bg-white p-4 text-xs text-[#666666]">
              <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#666666]">급증 구간</div>
              {spikesBlocked ? (
                <div className="mt-2 text-[11px]">최근 24시간 급증 구간은 Pro에서 제공됩니다.</div>
              ) : spikes && spikes.length ? (
                <div className="mt-2 flex flex-col gap-2">
                  {spikes.slice(0, 3).map((s, idx) => (
                    <div
                      key={`${s.start}_${idx}`}
                      className="flex items-center justify-between rounded-[12px] border border-[#EAEAEA] px-3 py-2 text-[11px]"
                    >
                      <div className="flex items-center gap-2">
                        <span className="rounded-full border border-[#EAEAEA] px-2 py-[2px] text-[10px] text-[#666666]">
                          #{idx + 1}
                        </span>
                        <span className="font-medium text-[#111111]">
                          {new Date(s.start).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })} ~{" "}
                          {new Date(s.end).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                      <div className="text-[#666666]">클릭 {s.clicks} | 이탈 {s.leaves}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-2 text-[11px]">최근 24시간 내 급증 구간이 없습니다.</div>
              )}
            </div>

            <div className="rounded-[14px] border border-[#EAEAEA] bg-white p-4 text-xs text-[#666666]">
              <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#666666]">리플레이</div>
              {replayEnabled ? (
                <p className="mt-2">
                  리플레이는 최근 24시간 기록만 제공합니다.{" "}
                  <Link href={`/replay/${pageId}`} className="font-medium text-[#111111] underline">
                    리플레이 보기
                  </Link>
                </p>
              ) : (
                <p className="mt-2">리플레이는 Pro 플랜(24시간 보관)에서 제공됩니다.</p>
              )}
            </div>
          </aside>
        </div>
      </div>
      {showScrollTop ? (
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="fixed bottom-6 right-6 z-30 flex h-10 w-10 items-center justify-center rounded-full border border-[#EAEAEA] bg-white shadow-[0_2px_8px_rgba(0,0,0,0.08)] hover:bg-[#FAFAFA]"
          aria-label="맨 위로"
          title="맨 위로"
        >
          <span className="text-xs font-semibold text-[#111111]">맨 위로</span>
        </button>
      ) : null}
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-[14px] border border-[#EAEAEA] bg-white p-4 text-xs text-[#666666]">
      <div className="text-[10px] uppercase tracking-[0.2em] text-[#666666]"></div>
      <div className="mt-2 text-sm font-semibold text-[#111111]">{value}</div>
      <div className="mt-1 text-[11px]">{label}</div>
    </div>
  );
}
