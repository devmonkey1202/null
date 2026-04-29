"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

type TelemetrySnapshot = {
  generatedAt: string;
  windowHours: number;
  files: {
    system: { exists: boolean; bytes: number; modifiedAt: string | null };
    security: { exists: boolean; bytes: number; modifiedAt: string | null };
    availability: { exists: boolean; bytes: number; modifiedAt: string | null };
  };
  availability: {
    total: number;
    okCount: number;
    okRate: number | null;
    dbOkCount: number;
    dbOkRate: number | null;
    avgLatencyMs: number | null;
    latest: { ts: string; ok: boolean; db_ok?: boolean; latency_ms: number; source: string } | null;
    buckets: Array<{ bucket: string; total: number; okCount: number; avgLatencyMs: number | null }>;
  };
  system: {
    total: number;
    byLevel: Record<"info" | "warn" | "error" | "fatal", number>;
    topMessages: Array<{ key: string; count: number }>;
    latestErrors: Array<{ ts: string; level: string; message: string; source?: string }>;
  };
  security: {
    total: number;
    topActions: Array<{ key: string; count: number }>;
    latest: Array<{ ts: string; action: string; path?: string }>;
  };
};

type TelemetryResponse = {
  ok: boolean;
  snapshot: TelemetrySnapshot;
  overview: {
    openReports: number;
    liveCount: number;
  };
};

type AccessMode = "pending" | "session" | "missing";

function formatTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatRate(value: number | null) {
  if (value == null) return "-";
  return `${Math.round(value * 100)}%`;
}

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function formatError(code: string) {
  switch (code) {
    case "no_session":
    case "expired_or_invalid":
    case "forbidden":
      return "관리자 세션이 필요합니다.";
    case "inactive":
      return "비활성화된 관리자 계정입니다.";
    case "not_configured":
      return "관리자 구성이 아직 완료되지 않았습니다.";
    default:
      return code || "텔레메트리를 불러오지 못했습니다.";
  }
}

function getAccessSummary(mode: AccessMode) {
  if (mode === "session") {
    return {
      label: "세션 기반 접근",
      tone: "sky" as const,
      description: "관리자 세션 쿠키를 사용해 텔레메트리를 조회하고 있습니다.",
    };
  }
  if (mode === "missing") {
    return {
      label: "인증 필요",
      tone: "amber" as const,
      description: "운영 콘솔에서 관리자 세션을 시작한 뒤 다시 조회해 주세요.",
    };
  }
  return {
    label: "세션 확인 중",
    tone: "slate" as const,
    description: "현재 브라우저의 관리자 세션 상태를 확인하고 있습니다.",
  };
}

export default function OpsTelemetryConsole({ slug }: { slug: string }) {
  const [windowHours, setWindowHours] = useState(24);
  const [hydrated, setHydrated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<TelemetryResponse | null>(null);
  const [accessMode, setAccessMode] = useState<AccessMode>("pending");
  const [lastLoadedAt, setLastLoadedAt] = useState<string | null>(null);

  useEffect(() => {
    setHydrated(true);
  }, []);

  const refresh = useCallback(async () => {
    if (!hydrated) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/ops/telemetry?window_hours=${windowHours}`, {
        credentials: "include",
      });
      const payload = (await res.json().catch(() => null)) as TelemetryResponse | { error?: string } | null;
      if (!res.ok || !payload || !("ok" in payload) || !payload.ok) {
        const code = (payload && "error" in payload && payload.error) || "telemetry_fetch_failed";
        if (["no_session", "expired_or_invalid", "forbidden", "inactive", "not_configured"].includes(code)) {
          setAccessMode("missing");
        }
        throw new Error(code);
      }
      setAccessMode("session");
      setData(payload);
      setLastLoadedAt(new Date().toISOString());
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "telemetry_fetch_failed");
    } finally {
      setLoading(false);
    }
  }, [hydrated, windowHours]);

  useEffect(() => {
    if (!hydrated) return;
    void refresh();
  }, [hydrated, refresh]);

  const availabilityPeak = useMemo(() => {
    const buckets = data?.snapshot.availability.buckets ?? [];
    return buckets.reduce((max, item) => Math.max(max, item.total), 0);
  }, [data?.snapshot.availability.buckets]);

  const accessSummary = getAccessSummary(accessMode);
  const authError = error && ["no_session", "expired_or_invalid", "forbidden", "inactive", "not_configured"].includes(error);

  return (
    <div className="min-h-screen bg-[#F5F7FB] px-6 py-8 text-sm text-neutral-900">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header className="rounded-[28px] border border-[#D8E1FF] bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.14),_transparent_40%),linear-gradient(135deg,#0F172A_0%,#0F766E_55%,#0EA5E9_100%)] p-6 text-white shadow-[0_24px_80px_rgba(15,23,42,0.18)]">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="max-w-2xl">
              <div className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-100">Telemetry</div>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight">운영 텔레메트리 콘솔</h1>
              <p className="mt-3 text-sm leading-6 text-cyan-50/90">
                시스템 로그, 보안 이벤트, 가용성 체크를 한 화면에서 확인하고 운영 콘솔과 바로 연결합니다.
              </p>
            </div>

            <div className="grid min-w-[320px] gap-3 rounded-[24px] border border-white/15 bg-white/10 p-4 backdrop-blur">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] font-medium text-cyan-100">접근 상태</div>
                  <div className="mt-1">
                    <StatusBadge tone={accessSummary.tone}>{accessSummary.label}</StatusBadge>
                  </div>
                </div>
                <div className="text-right text-[11px] text-cyan-100">
                  <div>최근 갱신</div>
                  <div className="mt-1 font-medium text-white">{formatTime(lastLoadedAt)}</div>
                </div>
              </div>
              <p className="text-[12px] leading-5 text-cyan-50/85">{accessSummary.description}</p>
              <div className="flex flex-wrap gap-2">
                <Link
                  href={`/ops/${slug}`}
                  className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-white/20"
                >
                  운영 콘솔로 돌아가기
                </Link>
                <button
                  type="button"
                  onClick={() => void refresh()}
                  className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-white/20"
                  disabled={loading || !hydrated}
                >
                  지금 새로고침
                </button>
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <select
              value={windowHours}
              onChange={(event) => setWindowHours(Number(event.target.value) || 24)}
              className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm text-white outline-none"
            >
              <option value={6}>최근 6시간</option>
              <option value={24}>최근 24시간</option>
              <option value={72}>최근 72시간</option>
              <option value={168}>최근 7일</option>
            </select>
            <div className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm text-cyan-50/90">
              운영 콘솔에서 시작한 관리자 세션을 사용해 자동으로 텔레메트리를 조회합니다.
            </div>
          </div>
        </header>

        {authError && !data ? (
          <NoticePanel tone="info">
            {formatError(error ?? "no_session")} <Link href={`/ops/${slug}`} className="font-semibold underline underline-offset-4">운영 콘솔로 돌아가 세션을 시작한 뒤</Link> 다시 조회해 주세요.
          </NoticePanel>
        ) : null}

        {error && !authError ? <NoticePanel tone="error">{formatError(error)}</NoticePanel> : null}

        {data ? (
          <>
            <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
              <MetricCard label="가용성" value={formatRate(data.snapshot.availability.okRate)} sublabel={`${data.snapshot.availability.total} checks`} />
              <MetricCard label="DB 응답률" value={formatRate(data.snapshot.availability.dbOkRate)} sublabel={`${data.snapshot.availability.dbOkCount} healthy`} />
              <MetricCard
                label="평균 지연"
                value={data.snapshot.availability.avgLatencyMs != null ? `${data.snapshot.availability.avgLatencyMs} ms` : "-"}
                sublabel="availability.log"
              />
              <MetricCard label="열린 신고" value={String(data.overview.openReports)} sublabel="admin stats" />
              <MetricCard label="라이브 페이지" value={String(data.overview.liveCount)} sublabel="admin stats" />
              <MetricCard label="마지막 생성" value={formatTime(data.snapshot.generatedAt)} sublabel={`${data.snapshot.windowHours}h window`} />
            </section>

            <section className="grid gap-4 xl:grid-cols-[1.3fr_1fr]">
              <article className="rounded-[24px] border border-[#DDE4F3] bg-white p-5 shadow-[0_18px_48px_rgba(15,23,42,0.06)]">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h2 className="text-sm font-semibold text-slate-950">가용성 추이</h2>
                    <p className="mt-1 text-xs text-slate-500">시간 버킷별 체크 수와 성공 비율을 한눈에 봅니다.</p>
                  </div>
                  <div className="text-xs text-slate-500">마지막 체크 {formatTime(data.snapshot.availability.latest?.ts ?? null)}</div>
                </div>
                <div className="mt-4 flex min-h-40 items-end gap-2 rounded-[20px] border border-slate-100 bg-slate-50 p-4">
                  {data.snapshot.availability.buckets.length ? (
                    data.snapshot.availability.buckets.map((bucket) => {
                      const height =
                        availabilityPeak > 0 ? Math.max(12, Math.round((bucket.total / availabilityPeak) * 112)) : 12;
                      const okRate = bucket.total > 0 ? bucket.okCount / bucket.total : 0;
                      return (
                        <div key={bucket.bucket} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                          <div className="flex h-28 w-full items-end justify-center">
                            <div
                              className="w-full rounded-t-md bg-cyan-500/80"
                              style={{ height }}
                              title={`${formatTime(bucket.bucket)} / ${bucket.total} checks / ${Math.round(okRate * 100)}%`}
                            />
                          </div>
                          <div className="text-center text-[10px] text-slate-500">{new Date(bucket.bucket).getHours()}h</div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-xs text-slate-500">표시할 가용성 데이터가 없습니다.</div>
                  )}
                </div>
              </article>

              <article className="rounded-[24px] border border-[#DDE4F3] bg-white p-5 shadow-[0_18px_48px_rgba(15,23,42,0.06)]">
                <h2 className="text-sm font-semibold text-slate-950">로그 파일 상태</h2>
                <div className="mt-4 space-y-3 text-xs">
                  {Object.entries(data.snapshot.files).map(([name, meta]) => (
                    <div key={name} className="rounded-[18px] border border-slate-100 bg-slate-50 px-4 py-3">
                      <div className="font-medium text-slate-800">{name}</div>
                      <div className="mt-1 text-slate-500">
                        {meta.exists ? `${formatBytes(meta.bytes)} / ${formatTime(meta.modifiedAt)}` : "파일 없음"}
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            </section>

            <section className="grid gap-4 xl:grid-cols-3">
              <article className="rounded-[24px] border border-[#DDE4F3] bg-white p-5 shadow-[0_18px_48px_rgba(15,23,42,0.06)]">
                <h2 className="text-sm font-semibold text-slate-950">시스템 로그 분포</h2>
                <div className="mt-4 grid gap-2 text-xs">
                  {(["info", "warn", "error", "fatal"] as const).map((level) => (
                    <div key={level} className="flex items-center justify-between rounded-[18px] border border-slate-100 bg-slate-50 px-3 py-2">
                      <span className="font-medium text-slate-700">{level}</span>
                      <span className="tabular-nums text-slate-950">{data.snapshot.system.byLevel[level]}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-4 space-y-2 text-xs">
                  <div className="font-medium text-slate-700">상위 메시지</div>
                  {data.snapshot.system.topMessages.length ? (
                    data.snapshot.system.topMessages.map((item) => (
                      <div key={item.key} className="flex items-start justify-between gap-2 rounded-[18px] border border-slate-100 px-3 py-2">
                        <span className="line-clamp-2 text-slate-600">{item.key}</span>
                        <span className="shrink-0 tabular-nums text-slate-900">{item.count}</span>
                      </div>
                    ))
                  ) : (
                    <div className="text-slate-500">최근 시스템 로그가 없습니다.</div>
                  )}
                </div>
              </article>

              <article className="rounded-[24px] border border-[#DDE4F3] bg-white p-5 shadow-[0_18px_48px_rgba(15,23,42,0.06)]">
                <h2 className="text-sm font-semibold text-slate-950">최근 오류 / 경고</h2>
                <div className="mt-4 space-y-2 text-xs">
                  {data.snapshot.system.latestErrors.length ? (
                    data.snapshot.system.latestErrors.map((entry, index) => (
                      <div key={`${entry.ts}_${index}`} className="rounded-[18px] border border-slate-100 bg-slate-50 px-3 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-slate-800">{entry.level}</span>
                          <span className="text-[11px] text-slate-500">{formatTime(entry.ts)}</span>
                        </div>
                        <div className="mt-1 text-slate-600">{entry.message}</div>
                        {entry.source ? <div className="mt-1 text-[11px] text-slate-500">{entry.source}</div> : null}
                      </div>
                    ))
                  ) : (
                    <div className="text-slate-500">최근 경고/오류 로그가 없습니다.</div>
                  )}
                </div>
              </article>

              <article className="rounded-[24px] border border-[#DDE4F3] bg-white p-5 shadow-[0_18px_48px_rgba(15,23,42,0.06)]">
                <h2 className="text-sm font-semibold text-slate-950">보안 이벤트</h2>
                <div className="mt-4 space-y-2 text-xs">
                  {data.snapshot.security.topActions.length ? (
                    data.snapshot.security.topActions.map((entry) => (
                      <div key={entry.key} className="flex items-center justify-between rounded-[18px] border border-slate-100 bg-slate-50 px-3 py-2">
                        <span className="line-clamp-1 text-slate-700">{entry.key}</span>
                        <span className="tabular-nums text-slate-950">{entry.count}</span>
                      </div>
                    ))
                  ) : (
                    <div className="text-slate-500">최근 보안 이벤트가 없습니다.</div>
                  )}
                </div>
                <div className="mt-4 space-y-2 text-xs">
                  <div className="font-medium text-slate-700">최근 이벤트</div>
                  {data.snapshot.security.latest.length ? (
                    data.snapshot.security.latest.map((entry, index) => (
                      <div key={`${entry.ts}_${index}`} className="rounded-[18px] border border-slate-100 px-3 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-slate-800">{entry.action}</span>
                          <span className="text-[11px] text-slate-500">{formatTime(entry.ts)}</span>
                        </div>
                        <div className="mt-1 text-[11px] text-slate-500">{entry.path ?? "-"}</div>
                      </div>
                    ))
                  ) : (
                    <div className="text-slate-500">표시할 보안 이벤트가 없습니다.</div>
                  )}
                </div>
              </article>
            </section>
          </>
        ) : loading ? (
          <div className="rounded-[24px] border border-[#DDE4F3] bg-white px-4 py-8 text-center text-sm text-slate-500">
            운영 텔레메트리를 불러오는 중입니다.
          </div>
        ) : null}
      </div>
    </div>
  );
}

function MetricCard({ label, value, sublabel }: { label: string; value: string; sublabel: string }) {
  return (
    <div className="rounded-[22px] border border-[#DDE4F3] bg-white p-4 shadow-[0_18px_48px_rgba(15,23,42,0.05)]">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">{value}</div>
      <div className="mt-1 text-[11px] text-slate-500">{sublabel}</div>
    </div>
  );
}

function StatusBadge({
  tone,
  children,
}: {
  tone: "slate" | "emerald" | "amber" | "sky";
  children: ReactNode;
}) {
  const style =
    tone === "emerald"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : tone === "amber"
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : tone === "sky"
          ? "border-sky-200 bg-sky-50 text-sky-700"
          : "border-slate-200 bg-slate-50 text-slate-700";

  return <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${style}`}>{children}</span>;
}

function NoticePanel({ tone, children }: { tone: "info" | "error"; children: ReactNode }) {
  const style =
    tone === "error"
      ? "border-rose-200 bg-rose-50 text-rose-700"
      : "border-blue-200 bg-blue-50 text-blue-700";

  return <div className={`rounded-[22px] border px-4 py-3 text-sm ${style}`}>{children}</div>;
}
