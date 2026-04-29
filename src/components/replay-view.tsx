"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import ReplayPlayer from "@/components/replay-player";
import { DEFAULT_CANVAS, type CanvasDocument } from "@/lib/canvas";

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

export type ReplayHighlight = {
  start_ts: string;
  end_ts: string;
  start_ms: number;
  end_ms: number;
  label: string;
  type: "click_spike" | "leave_spike" | "button_focus";
};

export default function ReplayView({ pageId }: { pageId: string }) {
  const [planChecked, setPlanChecked] = useState(false);
  const [replayEnabled, setReplayEnabled] = useState(false);
  const [events, setEvents] = useState<ReplayEvent[]>([]);
  const [highlights, setHighlights] = useState<ReplayHighlight[]>([]);
  const [doc, setDoc] = useState<CanvasDocument>({ ...DEFAULT_CANVAS, nodes: [...DEFAULT_CANVAS.nodes] });
  const [error, setError] = useState<string | null>(null);
  const [seekToMs, setSeekToMs] = useState<number | null>(null);
  const [videoExporting, setVideoExporting] = useState(false);
  const [videoMessage, setVideoMessage] = useState<string | null>(null);
  const replayCaptureRef = useRef<HTMLDivElement | null>(null);
  const timeline = useMemo(() => computeTimeline(events), [events]);

  useEffect(() => {
    fetch("/api/me", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        setPlanChecked(true);
        if (data?.features?.replayEnabled) {
          setReplayEnabled(true);
        } else {
          setReplayEnabled(false);
          setError(null);
        }
      })
      .catch(() => setPlanChecked(true));
  }, []);

  useEffect(() => {
    if (!replayEnabled) return;
    fetch(`/api/pages/${pageId}`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data?.version?.content_json) return;
        const content = data.version.content_json;
        setDoc({
          width: content.width ?? DEFAULT_CANVAS.width,
          height: content.height ?? DEFAULT_CANVAS.height,
          nodes: Array.isArray(content.nodes) ? content.nodes : [],
        });
      })
      .catch(() => null);
  }, [pageId, replayEnabled]);

  useEffect(() => {
    if (!replayEnabled) return;
    fetch(`/api/pages/${pageId}/replay`, { credentials: "include" })
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          if (data?.error === "upgrade_required") {
            setReplayEnabled(false);
            setError("리플레이는 유료 플랜에서만 열 수 있습니다.");
          } else {
            setError("리플레이 데이터를 불러오지 못했습니다.");
          }
          return;
        }
        setEvents(Array.isArray(data.events) ? data.events : []);
        setHighlights(Array.isArray(data.highlights) ? data.highlights : []);
      })
      .catch(() => {
        setError("리플레이 데이터를 불러오지 못했습니다.");
      });
  }, [pageId, replayEnabled]);

  const exportReplayVideo = useCallback(async () => {
    if (videoExporting) return;
    setVideoExporting(true);
    setVideoMessage(null);

    try {
      if (typeof window === "undefined") {
        setVideoMessage("브라우저 환경에서만 내보내기를 사용할 수 있습니다.");
        return;
      }
      if (!("MediaRecorder" in window)) {
        setVideoMessage("현재 브라우저는 영상 녹화를 지원하지 않습니다.");
        return;
      }
      if (!replayCaptureRef.current) {
        setVideoMessage("리플레이 영역을 찾지 못했습니다.");
        return;
      }
      if (events.length === 0 || timeline.duration <= 0) {
        setVideoMessage("내보낼 이벤트가 없습니다.");
        return;
      }

      const target = replayCaptureRef.current.querySelector("[data-replay-canvas]") as HTMLElement | null;
      if (!target) {
        setVideoMessage("캡처 대상 영역을 찾지 못했습니다.");
        return;
      }

      const rect = target.getBoundingClientRect();
      const width = Math.max(1, Math.round(rect.width));
      const height = Math.max(1, Math.round(rect.height));
      const outputCanvas = document.createElement("canvas");
      outputCanvas.width = width;
      outputCanvas.height = height;
      const ctx = outputCanvas.getContext("2d");
      if (!ctx) {
        setVideoMessage("캔버스를 초기화하지 못했습니다.");
        return;
      }

      const { default: html2canvas } = await import("html2canvas");

      const fps = 10;
      const stepMs = Math.max(100, Math.floor(1000 / fps));
      const mime = pickRecorderMime();
      const stream = outputCanvas.captureStream(fps);
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) chunks.push(event.data);
      };
      recorder.start();

      for (let t = 0; t <= timeline.duration; t += stepMs) {
        setSeekToMs(t);
        await waitFrame();
        await sleep(15);
        const frame = await html2canvas(target, { backgroundColor: "#ffffff", scale: 1 });
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(frame, 0, 0, width, height);
      }

      await new Promise<void>((resolve) => {
        recorder.onstop = () => resolve();
        recorder.stop();
      });

      const blob = new Blob(chunks, { type: mime || "video/webm" });
      const ext = blob.type.includes("mp4") ? "mp4" : "webm";
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `replay-${pageId}-${Date.now()}.${ext}`;
      anchor.click();
      URL.revokeObjectURL(url);
      setVideoMessage(ext === "mp4" ? "MP4로 내보냈습니다." : "WebM으로 내보냈습니다.");
    } catch (err) {
      setVideoMessage(err instanceof Error ? err.message : "영상 내보내기에 실패했습니다.");
    } finally {
      setVideoExporting(false);
      setSeekToMs(null);
    }
  }, [events.length, pageId, timeline.duration, videoExporting]);

  const eventCounts = useMemo(() => {
    return events.reduce<Record<string, number>>((acc, event) => {
      acc[event.type] = (acc[event.type] ?? 0) + 1;
      return acc;
    }, {});
  }, [events]);

  if (!planChecked) {
    return (
      <div className="min-h-screen bg-[linear-gradient(180deg,#f7f3eb_0%,#f4efe5_35%,#fbfaf8_100%)] px-6 py-8 text-sm text-neutral-900">
        <div className="mx-auto max-w-5xl text-[#6b665f]">리플레이 정보를 불러오는 중입니다.</div>
      </div>
    );
  }

  if (!replayEnabled) {
    return (
      <div className="min-h-screen bg-[linear-gradient(180deg,#f7f3eb_0%,#f4efe5_35%,#fbfaf8_100%)] px-6 py-8 text-sm text-neutral-900">
        <div className="mx-auto flex max-w-5xl flex-col gap-6">
          <header className="rounded-[28px] border border-black/8 bg-[#161616] px-6 py-6 text-white shadow-[0_24px_90px_rgba(0,0,0,0.14)]">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-[#f4c46a]">Replay</div>
                <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em]">리플레이</h1>
                <p className="mt-3 max-w-2xl text-sm leading-7 text-white/72">
                  방문자의 이동, 클릭, 이탈 지점을 다시 보고 싶다면 리플레이 기능이 필요합니다. 현재 계정에서는 아직 이 기능이
                  열려 있지 않습니다.
                </p>
              </div>
              <Link
                href="/upgrade"
                className="rounded-full bg-[#f4c46a] px-4 py-2 text-sm font-semibold text-[#161616] transition hover:bg-[#f8d48d]"
              >
                Pro 업그레이드
              </Link>
            </div>
          </header>

          <div className="rounded-[28px] border border-black/8 bg-white p-6 shadow-[0_20px_70px_rgba(17,17,17,0.05)]">
            <p className="text-lg font-semibold text-[#161616]">리플레이는 유료 플랜에서만 제공됩니다.</p>
            <p className="mt-3 text-sm leading-6 text-[#6b665f]">
              최근 24시간 행동 흐름을 다시 보려면 Pro 이상으로 업그레이드해 주세요. 업그레이드 후에는 현재 프로젝트의 공개
              흐름을 바로 복기할 수 있습니다.
            </p>
            <Link
              href="/upgrade"
              className="mt-5 inline-flex rounded-full bg-[#f4c46a] px-4 py-2 text-sm font-semibold text-[#161616] transition hover:bg-[#f8d48d]"
            >
              업그레이드하기
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f7f3eb_0%,#f4efe5_35%,#fbfaf8_100%)] px-6 py-8 text-sm text-neutral-900">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <header className="rounded-[28px] border border-black/8 bg-white px-6 py-6 shadow-[0_20px_70px_rgba(17,17,17,0.05)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#8f7b5a]">Replay</div>
              <div className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[#161616]">리플레이</div>
              <p className="mt-2 text-sm leading-6 text-[#6b665f]">
                재생 구간을 이동하며 사용자의 행동 흐름과 주요 이벤트를 다시 확인합니다.
              </p>
            </div>
            <Link
              href={`/p/${pageId}`}
              className="rounded-full border border-black/10 bg-[#f7f3eb] px-4 py-2 text-sm font-semibold text-[#161616] transition hover:bg-[#efe7d8]"
            >
              공개 페이지 보기
            </Link>
          </div>
        </header>

        {error ? (
          <div className="rounded-[22px] border border-rose-200 bg-white p-6 text-sm text-rose-700">{error}</div>
        ) : null}

        {!error && events.length === 0 ? (
          <div className="rounded-[22px] border border-black/8 bg-white p-6 text-center text-sm text-[#6b665f]">
            아직 재생할 이벤트가 없습니다.
          </div>
        ) : null}

        {!error && events.length > 0 ? (
          <>
            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <ReplayMetric label="전체 이벤트" value={String(events.length)} />
              <ReplayMetric label="리플레이 길이" value={formatTs(timeline.duration)} />
              <ReplayMetric label="하이라이트" value={String(highlights.length)} />
              <ReplayMetric label="클릭 수" value={String(eventCounts.click ?? 0)} />
            </section>

            <div ref={replayCaptureRef} className="rounded-[28px] border border-black/8 bg-white p-4 shadow-[0_20px_70px_rgba(17,17,17,0.05)]">
              <ReplayPlayer
                events={events}
                doc={doc}
                highlights={highlights}
                seekToMs={seekToMs}
                onSeekDone={() => setSeekToMs(null)}
              />
            </div>

            <section className="grid gap-4 lg:grid-cols-[1fr_0.9fr]">
              <article className="rounded-[22px] border border-black/8 bg-white p-4 shadow-[0_20px_70px_rgba(17,17,17,0.05)]">
                <div className="text-xs font-semibold uppercase tracking-[0.22em] text-[#8f7b5a]">Highlights</div>
                {highlights.length ? (
                  <ul className="mt-3 flex flex-col gap-2">
                    {highlights.map((highlight, index) => (
                      <li key={`${highlight.start_ts}-${index}`}>
                        <button
                          type="button"
                          className="flex w-full items-center justify-between gap-3 rounded-[16px] border border-black/8 bg-[#fbfaf7] px-4 py-3 text-left transition hover:bg-[#f5efdf]"
                          onClick={() => setSeekToMs(highlight.start_ms)}
                        >
                          <div>
                            <div className="text-sm font-semibold text-[#161616]">{highlight.label}</div>
                            <div className="mt-1 text-[12px] text-[#6b665f]">
                              {formatTs(highlight.start_ms)} ~ {formatTs(highlight.end_ms)}
                            </div>
                          </div>
                          <span className="rounded-full bg-[#efe8dc] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#6d5c39]">
                            {highlight.type}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 text-sm text-[#6b665f]">하이라이트가 아직 생성되지 않았습니다.</p>
                )}
              </article>

              <div className="grid gap-4">
                <article className="rounded-[22px] border border-black/8 bg-white p-4 shadow-[0_20px_70px_rgba(17,17,17,0.05)]">
                  <div className="text-xs font-semibold uppercase tracking-[0.22em] text-[#8f7b5a]">Summary</div>
                  <p className="mt-2 text-sm leading-6 text-[#6b665f]">
                    이벤트와 하이라이트 요약을 JSON으로 내려받습니다. 조사 공유용 기본 산출물입니다.
                  </p>
                  <button
                    type="button"
                    className="mt-4 rounded-full border border-[#111111] bg-[#111111] px-3 py-1.5 text-xs font-medium text-white"
                    onClick={() => downloadSummaryReport(pageId, events, highlights)}
                  >
                    요약 리포트 다운로드
                  </button>
                </article>

                <article className="rounded-[22px] border border-black/8 bg-white p-4 text-xs text-[#6b665f] shadow-[0_20px_70px_rgba(17,17,17,0.05)]">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>리플레이 영상 내보내기</span>
                    <button
                      type="button"
                      onClick={exportReplayVideo}
                      disabled={videoExporting || events.length === 0}
                      className="rounded-full border border-[#111111] bg-[#111111] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
                    >
                      {videoExporting ? "내보내는 중" : "MP4 또는 WebM"}
                    </button>
                  </div>
                  <p className="mt-2 text-[11px] text-[#6b665f]">
                    브라우저가 MP4를 지원하면 MP4로, 그렇지 않으면 WebM으로 저장합니다.
                  </p>
                  {videoMessage ? <p className="mt-2 text-[11px] text-[#6b665f]">{videoMessage}</p> : null}
                </article>
              </div>
            </section>
          </>
        ) : null}
      </div>
    </div>
  );
}

function ReplayMetric({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-[22px] border border-black/8 bg-white px-5 py-4 shadow-[0_16px_40px_rgba(17,17,17,0.05)]">
      <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#8f7b5a]">{label}</div>
      <div className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-[#161616]">{value}</div>
    </article>
  );
}

function formatTs(ms: number) {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
}

function computeTimeline(events: ReplayEvent[]) {
  if (events.length === 0) return { start: 0, end: 0, duration: 0 };
  const times = events.map((event) => new Date(event.ts).getTime());
  const start = Math.min(...times);
  const end = Math.max(...times);
  return { start, end, duration: Math.max(end - start, 0) };
}

function pickRecorderMime() {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = ["video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9", "video/webm"];
  for (const mime of candidates) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return "";
}

function waitFrame() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function downloadSummaryReport(pageId: string, events: ReplayEvent[], highlights: ReplayHighlight[]) {
  const byType = events.reduce<Record<string, number>>((acc, event) => {
    acc[event.type] = (acc[event.type] ?? 0) + 1;
    return acc;
  }, {});
  const times = events.map((event) => new Date(event.ts).getTime());
  const startMs = times.length ? Math.min(...times) : 0;
  const endMs = times.length ? Math.max(...times) : 0;
  const summary = {
    page_id: pageId,
    generated_at: new Date().toISOString(),
    window: {
      start_iso: times.length ? new Date(startMs).toISOString() : null,
      end_iso: times.length ? new Date(endMs).toISOString() : null,
      duration_ms: endMs - startMs,
    },
    events: {
      total: events.length,
      by_type: byType,
    },
    highlights: highlights.map((highlight) => ({
      type: highlight.type,
      label: highlight.label,
      start_ms: highlight.start_ms,
      end_ms: highlight.end_ms,
      start_ts: highlight.start_ts,
      end_ts: highlight.end_ts,
    })),
  };

  const blob = new Blob([JSON.stringify(summary, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `replay-summary-${pageId}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}
