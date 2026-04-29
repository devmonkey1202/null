"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import CanvasRender from "@/components/canvas-render";
import type { CanvasDocument } from "@/lib/canvas";

type ReplayEvent = {
  id: string;
  ts: string;
  type: "enter" | "leave" | "move" | "click" | "scroll" | "error" | "custom";
  x: number | null;
  y: number | null;
  element_id: string | null;
  element_type: string | null;
  payload: Record<string, unknown> | null;
};

type Filters = {
  move: boolean;
  click: boolean;
  enter: boolean;
  leave: boolean;
  scroll: boolean;
  custom: boolean;
};

/** §29.3 재생 속도 0.5x~10x */
const SPEEDS = [0.5, 1, 2, 5, 10] as const;

type ReplayPlayerProps = {
  events: ReplayEvent[];
  doc: CanvasDocument;
  highlights?: { start_ms: number; end_ms: number; label: string; type: string }[];
  seekToMs?: number | null;
  onSeekDone?: () => void;
};

export default function ReplayPlayer({ events, doc, seekToMs, onSeekDone }: ReplayPlayerProps) {
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1 as (typeof SPEEDS)[number]);
  /** §29.3 루프 on/off: 재생 끝에 정지 vs 처음부터 반복 */
  const [loop, setLoop] = useState(false);
  const [filters, setFilters] = useState<Filters>({
    move: true,
    click: true,
    enter: false,
    leave: false,
    scroll: false,
    custom: true,
  });
  const [current, setCurrent] = useState(0);
  const rafRef = useRef<number | null>(null);
  const lastTick = useRef<number | null>(null);

  const timeline = useMemo(() => {
    if (events.length === 0) {
      return { start: 0, end: 0, duration: 0 };
    }
    const times = events.map((event) => new Date(event.ts).getTime());
    const start = Math.min(...times);
    const end = Math.max(...times);
    return { start, end, duration: Math.max(end - start, 0) };
  }, [events]);

  useEffect(() => {
    if (seekToMs != null && Number.isFinite(seekToMs)) {
      Promise.resolve().then(() => {
        setCurrent(seekToMs);
        setPlaying(false);
        onSeekDone?.();
      });
    }
  }, [seekToMs, onSeekDone]);

  // §29.3 키보드: 스페이스 재생/일시정지, 좌우 seek
  useEffect(() => {
    const container = document.getElementById("replay-player-root");
    const el = container ?? document;
    const onKeyDown = (event: Event) => {
      const e = event as KeyboardEvent;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === "Space") {
        e.preventDefault();
        setPlaying((p) => !p);
      } else if (e.code === "ArrowLeft") {
        e.preventDefault();
        setCurrent((c) => Math.max(0, c - 5000));
      } else if (e.code === "ArrowRight") {
        e.preventDefault();
        setCurrent((c) => Math.min(timeline.duration, c + 5000));
      }
    };
    el.addEventListener("keydown", onKeyDown);
    return () => el.removeEventListener("keydown", onKeyDown);
  }, [timeline.duration]);

  useEffect(() => {
    if (!playing) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      lastTick.current = null;
      return;
    }

    const tick = (time: number) => {
      if (lastTick.current == null) lastTick.current = time;
      const delta = time - lastTick.current;
      lastTick.current = time;
      setCurrent((prev) => {
        const next = prev + delta * speed;
        if (next >= timeline.duration) {
          if (loop) return (next - timeline.duration) % Math.max(timeline.duration, 1);
          setPlaying(false);
          return timeline.duration;
        }
        return next;
      });
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [playing, speed, timeline.duration, loop]);

  const filtered = useMemo(() => {
    const now = timeline.start + current;
    return events.filter((event) => {
      if (!(event.type in filters) || !filters[event.type as keyof Filters]) return false;
      return new Date(event.ts).getTime() <= now;
    });
  }, [current, events, filters, timeline.start]);

  const cursor = findCursor(filtered);

  const clicks = useMemo(() => {
    const now = timeline.start + current;
    return filtered.filter((event) => {
      if (event.type !== "click" || event.x == null || event.y == null) return false;
      const age = now - new Date(event.ts).getTime();
      return age >= 0 && age < 700;
    });
  }, [current, filtered, timeline.start]);

  /** §31.3 dwell 등 custom 이벤트 중 x,y 있는 것 (payload 또는 top-level, 오버레이 표시) */
  const dwells = useMemo(() => {
    const now = timeline.start + current;
    return filtered
      .filter((event) => {
        if (event.type !== "custom") return false;
        const x = event.x ?? (event.payload as { x?: number } | null)?.x;
        const y = event.y ?? (event.payload as { y?: number } | null)?.y;
        return x != null && y != null;
      })
      .map((event) => {
        const x = event.x ?? (event.payload as { x?: number } | null)?.x ?? 0;
        const y = event.y ?? (event.payload as { y?: number } | null)?.y ?? 0;
        return { ...event, x, y };
      })
      .filter((event) => {
        const age = now - new Date(event.ts).getTime();
        return age >= 0 && age < 3000;
      });
  }, [current, filtered, timeline.start]);

  const [, setFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const id = "replay-player-root";
    el.id = id;
    return () => {
      if (el.id === id) el.removeAttribute("id");
    };
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen?.();
      setFullscreen(true);
    } else {
      document.exitFullscreen?.();
      setFullscreen(false);
    }
  };

  useEffect(() => {
    const onFullscreenChange = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  return (
    <div ref={containerRef} className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4 text-xs text-neutral-600">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPlaying((prev) => !prev)}
            className="rounded-full border border-neutral-900 px-3 py-1 text-neutral-900"
          >
            {playing ? "일시정지" : "재생"}
          </button>
          <div className="flex items-center gap-1 rounded-full border border-neutral-200 bg-white px-2 py-1">
            {SPEEDS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setSpeed(option)}
                className={`rounded-full px-2 py-1 text-[11px] ${speed === option ? "bg-neutral-900 text-white" : "text-[#111111]"}`}
              >
                {option}x
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setLoop((v) => !v)}
            className={`rounded-full border px-2 py-1 text-[11px] ${loop ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-200 bg-white text-[#111111]"}`}
            title={loop ? "루프 재생 켜짐" : "루프 재생 끔"}
            aria-label={loop ? "루프 끄기" : "루프 켜기"}
          >
            루프 {loop ? "ON" : "OFF"}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={toggleFullscreen}
            className="rounded-full border border-neutral-200 px-3 py-1 text-[11px] text-neutral-600"
            title="전체화면"
          >
            전체화면
          </button>
          {(["click", "move", "enter", "leave", "scroll", "custom"] as const).map((type) => (
            <label key={type} className="flex items-center gap-1 text-[11px]">
              <input
                type="checkbox"
                checked={filters[type]}
                onChange={(event) => setFilters((prev) => ({ ...prev, [type]: event.target.checked }))}
              />
              {type === "click"
                ? "클릭"
                : type === "move"
                  ? "커서"
                  : type === "enter"
                    ? "입장"
                    : type === "leave"
                      ? "이탈"
                      : type === "scroll"
                        ? "스크롤"
                        : "체류/커스텀"}
            </label>
          ))}
        </div>
      </div>

      <div className="flex justify-center rounded-[14px] border border-neutral-200 bg-neutral-50 p-6">
        <div className="relative" data-replay-canvas>
          <CanvasRender doc={doc} className="shadow-none" />
          {cursor ? (
            <span
              className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-neutral-900"
              style={{ left: `${cursor.x * 100}%`, top: `${cursor.y * 100}%` }}
            />
          ) : null}
          {clicks.map((event) => (
            <span
              key={event.id}
              className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-red-500/70 trace-pulse"
              style={{ left: `${(event.x ?? 0) * 100}%`, top: `${(event.y ?? 0) * 100}%` }}
            />
          ))}
          {dwells.map((event) => (
            <span
              key={event.id}
              className="absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-amber-500/80 bg-amber-400/30"
              style={{ left: `${(event.x ?? 0) * 100}%`, top: `${(event.y ?? 0) * 100}%` }}
              title="체류"
            />
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2 text-xs text-neutral-600">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">타임라인 00:00~24:00:00</div>
        <input
          type="range"
          min={0}
          max={timeline.duration}
          value={current}
          onChange={(event) => setCurrent(Number(event.target.value))}
        />
        <div className="flex items-center justify-between text-[11px] text-neutral-400">
          <span>{formatMs(current)}</span>
          <span>{formatMs(timeline.duration)}</span>
        </div>
      </div>
    </div>
  );
}

function findCursor(events: ReplayEvent[]) {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i];
    if (event.type === "move" && event.x != null && event.y != null) {
      return { x: event.x, y: event.y };
    }
  }
  return null;
}

function formatMs(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = String(Math.floor(total / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
  const seconds = String(total % 60).padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}
