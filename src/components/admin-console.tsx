"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

type Report = {
  id: string;
  reason?: string | null;
  status: string;
  action?: string | null;
  created_at: string;
  page?: {
    id: string;
    title?: string | null;
    status: string;
    is_hidden: boolean;
    live_expires_at?: string | null;
    report_count?: number | null;
  } | null;
};

type LivePage = {
  id: string;
  title?: string | null;
  anon_number: number;
  owner_id: string;
  status: string;
  is_hidden: boolean;
  live_started_at?: string | null;
  live_expires_at?: string | null;
  total_visits: number;
  total_clicks: number;
  avg_duration_ms: number;
  upvote_count: number;
  report_count: number;
  owner?: { anon_id: string } | null;
  created_at: string;
  updated_at: string;
};

type IpBlock = {
  id: string;
  ip_hash: string;
  reason?: string | null;
  created_at: string;
  expires_at?: string | null;
};

type TabId = "reports" | "live" | "ip" | "settings";
type NoticeTone = "error" | "success" | "info";
type AccessMode = "pending" | "session" | "missing";

type AdminStats = { open_reports: number; live_count: number };
type SettingsMap = {
  live_hours?: number;
  anon_prefix?: string;
  feed_popular_k?: number;
  allow_noip_fallback?: boolean;
  witness_cap_minutes?: number;
  spikes_window_hours?: number;
  spikes_bucket_minutes?: number;
  spikes_highlight_minutes?: number;
  spikes_top_k?: number;
  replay_highlight_window_ms?: number;
  replay_top_click_windows?: number;
  replay_top_leave_windows?: number;
  replay_top_button_clicks?: number;
};

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

function formatDuration(ms: number) {
  if (!Number.isFinite(ms) || ms <= 0) return "0초";
  if (ms < 60_000) return `${Math.round(ms / 1000)}초`;
  return `${Math.round(ms / 60_000)}분`;
}

function formatAdminError(code: string) {
  switch (code) {
    case "BAD_KEY":
      return "관리자 키가 올바르지 않습니다.";
    case "admin_key_missing":
    case "forbidden":
    case "no_session":
    case "expired_or_invalid":
      return "관리자 세션이 필요합니다.";
    case "inactive":
      return "비활성화된 관리자 계정입니다.";
    case "not_configured":
      return "관리자 환경 구성이 아직 완료되지 않았습니다.";
    case "BAD_PAGE":
      return "대상 페이지를 찾을 수 없습니다.";
    case "BAD_REPORT":
      return "대상 신고를 찾을 수 없습니다.";
    default:
      return code || "요청을 처리하지 못했습니다.";
  }
}

function getAccessSummary(mode: AccessMode) {
  if (mode === "session") {
    return {
      label: "세션 기반 접근",
      tone: "sky" as const,
      description: "관리자 세션 쿠키로 운영 API에 접근하고 있습니다.",
    };
  }
  if (mode === "missing") {
    return {
      label: "인증 필요",
      tone: "amber" as const,
      description: "관리자 세션 로그인이 필요합니다. 키를 입력해 세션을 시작해 주세요.",
    };
  }
  return {
    label: "세션 확인 중",
    tone: "slate" as const,
    description: "현재 브라우저의 관리자 세션 상태를 확인하고 있습니다.",
  };
}

export default function AdminConsole({ slug }: { slug: string }) {
  const [adminKey, setAdminKey] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [accessMode, setAccessMode] = useState<AccessMode>("pending");
  const [tab, setTab] = useState<TabId>("reports");
  const [reports, setReports] = useState<Report[]>([]);
  const [reportStatus, setReportStatus] = useState("open");
  const [reportSort, setReportSort] = useState<"date" | "priority">("date");
  const [pages, setPages] = useState<LivePage[]>([]);
  const [blocks, setBlocks] = useState<IpBlock[]>([]);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [noticeTone, setNoticeTone] = useState<NoticeTone>("info");
  const [ipDraft, setIpDraft] = useState("");
  const [ipReason, setIpReason] = useState("");
  const [reportNotes, setReportNotes] = useState<Record<string, string>>({});
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [, setSettings] = useState<SettingsMap>({});
  const [settingsDraft, setSettingsDraft] = useState<SettingsMap>({});
  const [confirmAction, setConfirmAction] = useState<{ type: "hide" | "expire"; pageId: string; title: string } | null>(
    null,
  );
  const [authLoading, setAuthLoading] = useState(false);
  const [liveSort, setLiveSort] = useState<"expires" | "viewers" | "clicks" | "reports">("expires");
  const [liveSearch, setLiveSearch] = useState("");
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(null);

  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!confirmAction) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setConfirmAction(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [confirmAction]);

  const adminFetch = useCallback(
    async (path: string, options?: RequestInit) => {
      const headers = new Headers(options?.headers);
      if (options?.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");

      const res = await fetch(path, {
        ...options,
        credentials: "include",
        headers,
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const code =
          data && typeof data === "object" && "error" in data && typeof data.error === "string"
            ? data.error
            : "request_failed";
        if (["forbidden", "no_session", "expired_or_invalid", "inactive", "not_configured"].includes(code)) {
          setAccessMode("missing");
        }
        throw new Error(code);
      }

      setAccessMode("session");
      setLastRefreshedAt(new Date().toISOString());
      return data;
    },
    [],
  );

  const refreshReports = useCallback(async () => {
    if (!hydrated) return;
    setLoading(true);
    setNotice(null);
    try {
      const data = await adminFetch(`/api/admin/reports?status=${reportStatus}&sort=${reportSort}`);
      setReports(Array.isArray(data?.reports) ? data.reports : []);
    } catch (error) {
      setNotice(formatAdminError(error instanceof Error ? error.message : "request_failed"));
      setNoticeTone("error");
    } finally {
      setLoading(false);
    }
  }, [adminFetch, hydrated, reportSort, reportStatus]);

  const refreshLivePages = useCallback(async () => {
    if (!hydrated) return;
    setLoading(true);
    setNotice(null);
    try {
      const query = liveSearch.trim() ? `&q=${encodeURIComponent(liveSearch.trim())}` : "";
      const data = await adminFetch(`/api/admin/pages/live?sort=${liveSort}${query}`);
      setPages(Array.isArray(data?.pages) ? data.pages : []);
    } catch (error) {
      setNotice(formatAdminError(error instanceof Error ? error.message : "request_failed"));
      setNoticeTone("error");
    } finally {
      setLoading(false);
    }
  }, [adminFetch, hydrated, liveSearch, liveSort]);

  const refreshBlocks = useCallback(async () => {
    if (!hydrated) return;
    setLoading(true);
    setNotice(null);
    try {
      const data = await adminFetch("/api/admin/ip-blocks");
      setBlocks(Array.isArray(data?.blocks) ? data.blocks : []);
    } catch (error) {
      setNotice(formatAdminError(error instanceof Error ? error.message : "request_failed"));
      setNoticeTone("error");
    } finally {
      setLoading(false);
    }
  }, [adminFetch, hydrated]);

  const refreshStats = useCallback(async () => {
    if (!hydrated) return;
    try {
      const data = await adminFetch("/api/admin/stats");
      setStats({ open_reports: data?.open_reports ?? 0, live_count: data?.live_count ?? 0 });
    } catch {
      setStats(null);
    }
  }, [adminFetch, hydrated]);

  const refreshSettings = useCallback(async () => {
    if (!hydrated) return;
    setLoading(true);
    setNotice(null);
    try {
      const data = await adminFetch("/api/admin/settings");
      const settings = (data?.settings ?? {}) as SettingsMap;
      setSettings(settings);
      setSettingsDraft({ ...settings });
    } catch (error) {
      setSettings({});
      setSettingsDraft({});
      setNotice(formatAdminError(error instanceof Error ? error.message : "request_failed"));
      setNoticeTone("error");
    } finally {
      setLoading(false);
    }
  }, [adminFetch, hydrated]);

  const refreshCurrentTab = useCallback(async () => {
    if (tab === "reports") {
      await refreshReports();
      return;
    }
    if (tab === "live") {
      await refreshLivePages();
      return;
    }
    if (tab === "ip") {
      await refreshBlocks();
      return;
    }
    await refreshSettings();
  }, [refreshBlocks, refreshLivePages, refreshReports, refreshSettings, tab]);

  useEffect(() => {
    if (!hydrated) return;
    void refreshStats();
  }, [hydrated, refreshStats]);

  useEffect(() => {
    if (!hydrated) return;
    void refreshCurrentTab();
  }, [hydrated, refreshCurrentTab]);

  const handleLogin = async () => {
    const trimmed = adminKey.trim();
    if (!trimmed) {
      setNotice("관리자 키를 입력해 주세요.");
      setNoticeTone("error");
      return;
    }

    setAuthLoading(true);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/session", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, key: trimmed }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        throw new Error(data?.error ?? "request_failed");
      }

      setAccessMode("session");
      setAdminKey("");
      setNotice("관리자 세션을 시작했습니다.");
      setNoticeTone("success");
      await Promise.all([refreshStats(), refreshCurrentTab()]);
    } catch (error) {
      setAccessMode("missing");
      setNotice(formatAdminError(error instanceof Error ? error.message : "request_failed"));
      setNoticeTone("error");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    setAuthLoading(true);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/session", {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        throw new Error(data?.error ?? "request_failed");
      }

      setAccessMode("missing");
      setReports([]);
      setPages([]);
      setBlocks([]);
      setStats(null);
      setSettings({});
      setSettingsDraft({});
      setLastRefreshedAt(null);
      setNotice("관리자 세션을 종료했습니다.");
      setNoticeTone("info");
    } catch (error) {
      setNotice(formatAdminError(error instanceof Error ? error.message : "request_failed"));
      setNoticeTone("error");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleReportAction = async (reportId: string, action: string, status = "resolved") => {
    setLoading(true);
    setNotice(null);
    try {
      const adminNote = reportNotes[reportId] ?? "";
      await adminFetch(`/api/admin/${reportId}/handle`, {
        method: "POST",
        body: JSON.stringify({ action, status, admin_note: adminNote }),
      });
      setNotice("신고 조치를 반영했습니다.");
      setNoticeTone("success");
      await Promise.all([refreshReports(), refreshStats()]);
    } catch (error) {
      setNotice(formatAdminError(error instanceof Error ? error.message : "request_failed"));
      setNoticeTone("error");
    } finally {
      setLoading(false);
    }
  };

  const handleHidePage = async (pageId: string) => {
    setLoading(true);
    setNotice(null);
    setConfirmAction(null);
    try {
      await adminFetch(`/api/admin/pages/${pageId}/hide`, {
        method: "POST",
        body: JSON.stringify({ reason: "admin_hide" }),
      });
      setNotice("페이지를 숨김 처리했습니다.");
      setNoticeTone("success");
      await Promise.all([refreshLivePages(), refreshStats()]);
    } catch (error) {
      setNotice(formatAdminError(error instanceof Error ? error.message : "request_failed"));
      setNoticeTone("error");
    } finally {
      setLoading(false);
    }
  };

  const handleExpirePage = async (pageId: string) => {
    setLoading(true);
    setNotice(null);
    setConfirmAction(null);
    try {
      await adminFetch(`/api/admin/pages/${pageId}/force-expire`, { method: "POST" });
      setNotice("페이지를 즉시 만료 처리했습니다.");
      setNoticeTone("success");
      await Promise.all([refreshLivePages(), refreshStats()]);
    } catch (error) {
      setNotice(formatAdminError(error instanceof Error ? error.message : "request_failed"));
      setNoticeTone("error");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSettings = async () => {
    setLoading(true);
    setNotice(null);
    try {
      await adminFetch("/api/admin/settings", {
        method: "POST",
        body: JSON.stringify(settingsDraft),
      });
      setSettings(settingsDraft);
      setNotice("운영 설정을 저장했습니다.");
      setNoticeTone("success");
    } catch (error) {
      setNotice(formatAdminError(error instanceof Error ? error.message : "request_failed"));
      setNoticeTone("error");
    } finally {
      setLoading(false);
    }
  };

  const handleAddIpBlock = async () => {
    const ip = ipDraft.trim();
    if (!ip) {
      setNotice("차단할 IP를 입력해 주세요.");
      setNoticeTone("error");
      return;
    }
    setLoading(true);
    setNotice(null);
    try {
      await adminFetch("/api/admin/ip-blocks", {
        method: "POST",
        body: JSON.stringify({ ip, reason: ipReason.trim() }),
      });
      setIpDraft("");
      setIpReason("");
      setNotice("IP 차단을 등록했습니다.");
      setNoticeTone("success");
      await refreshBlocks();
    } catch (error) {
      setNotice(formatAdminError(error instanceof Error ? error.message : "request_failed"));
      setNoticeTone("error");
    } finally {
      setLoading(false);
    }
  };

  const accessSummary = getAccessSummary(accessMode);
  const blockedCount = blocks.length;
  const urgentReports = reports.slice(0, 3);
  const watchPages = useMemo(
    () => [...pages].sort((left, right) => right.report_count - left.report_count || right.total_visits - left.total_visits).slice(0, 3),
    [pages],
  );

  return (
    <div className="min-h-screen bg-[#F5F7FB] px-6 py-8 text-sm text-neutral-900">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header className="rounded-[28px] border border-[#D8E1FF] bg-[radial-gradient(circle_at_top_left,_rgba(56,98,255,0.16),_transparent_42%),linear-gradient(135deg,#0F172A_0%,#172554_55%,#1D4ED8_100%)] p-6 text-white shadow-[0_24px_80px_rgba(15,23,42,0.18)]">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="max-w-2xl">
              <div className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-100">Operator Home</div>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight">운영 관리자 콘솔</h1>
              <p className="mt-3 text-sm leading-6 text-blue-50/90">
                신고 처리, 라이브 노출 감시, 차단 정책, 검증 화면 이동을 한 번에 묶어 두었습니다.
                운영자가 바로 판단하고 바로 조치하는 흐름만 남겼습니다.
              </p>
            </div>

            <div className="grid min-w-[320px] gap-3 rounded-[24px] border border-white/15 bg-white/10 p-4 backdrop-blur">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] font-medium text-blue-100">접근 상태</div>
                  <div className="mt-1 flex items-center gap-2">
                    <StatusBadge tone={accessSummary.tone}>{accessSummary.label}</StatusBadge>
                  </div>
                </div>
                <div className="text-right text-[11px] text-blue-100">
                  <div>최근 갱신</div>
                  <div className="mt-1 font-medium text-white">{formatTime(lastRefreshedAt)}</div>
                </div>
              </div>
              <p className="text-[12px] leading-5 text-blue-50/85">{accessSummary.description}</p>
              <div className="flex flex-wrap gap-2">
                <Link
                  href={`/ops/${slug}/telemetry`}
                  className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-white/20"
                >
                  텔레메트리 열기
                </Link>
                <button
                  type="button"
                  onClick={() => void refreshCurrentTab()}
                  className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-white/20"
                  disabled={loading || authLoading || !hydrated}
                >
                  현재 탭 새로고침
                </button>
              </div>
            </div>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto]">
            <input
              type="password"
              value={adminKey}
              onChange={(event) => setAdminKey(event.target.value)}
              placeholder="관리자 키를 입력해 세션을 시작합니다."
              className="w-full rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm text-white placeholder:text-blue-100/65 focus:border-white/35 focus:outline-none"
              disabled={authLoading}
            />
            <button
              type="button"
              className="rounded-2xl border border-white/15 bg-white px-4 py-3 text-sm font-semibold text-slate-950 hover:bg-blue-50"
              onClick={() => void (accessMode === "session" ? handleLogout() : handleLogin())}
              disabled={authLoading || (accessMode !== "session" && adminKey.trim().length === 0)}
            >
              {authLoading ? "처리 중..." : accessMode === "session" ? "세션 종료" : "세션 시작"}
            </button>
            <button
              type="button"
              className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm font-medium text-white hover:bg-white/20"
              onClick={() => setAdminKey("")}
              disabled={authLoading}
            >
              입력 지우기
            </button>
          </div>
          <p className="mt-3 text-xs leading-5 text-blue-50/80">
            운영 콘솔과 텔레메트리는 같은 관리자 세션을 사용합니다. 키를 브라우저에 저장하지 않고 세션 쿠키만 발급합니다.
          </p>
        </header>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <OverviewCard
            label="열린 신고"
            value={String(stats?.open_reports ?? reports.filter((report) => report.status === "open").length)}
            description="즉시 조치가 필요한 신고 건수"
          />
          <OverviewCard
            label="현재 라이브"
            value={String(stats?.live_count ?? pages.length)}
            description="공개 중인 페이지 수"
          />
          <OverviewCard
            label="차단 IP"
            value={String(blockedCount)}
            description="등록된 차단 항목"
          />
          <OverviewCard
            label="마지막 새로고침"
            value={formatTime(lastRefreshedAt)}
            description={loading ? "운영 데이터를 갱신 중입니다." : "현재 운영 홈 기준 시각"}
          />
        </section>

        <section className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
          <article className="rounded-[24px] border border-[#DDE4F3] bg-white p-5 shadow-[0_18px_48px_rgba(15,23,42,0.06)]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Quick Actions</div>
                <h2 className="mt-2 text-lg font-semibold text-slate-950">운영 흐름 바로가기</h2>
              </div>
              <div className="text-xs text-slate-500">{loading ? "동기화 중" : "준비됨"}</div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {([
                { id: "reports", label: "신고 큐" },
                { id: "live", label: "라이브 감시" },
                { id: "ip", label: "차단 목록" },
                { id: "settings", label: "운영 설정" },
              ] as Array<{ id: TabId; label: string }>).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                    tab === item.id
                      ? "border-slate-950 bg-slate-950 text-white"
                      : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                  }`}
                  onClick={() => setTab(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <div className="mt-5 grid gap-3 md:grid-cols-3">
              <QuickActionCard
                title="공개 흐름 점검"
                description="공개 페이지, 대시보드, 검증 화면을 즉시 확인합니다."
                links={[
                  { href: "/library", label: "프로젝트 목록" },
                  { href: "/dashboard", label: "대시보드 목록" },
                  { href: `/ops/${slug}/telemetry`, label: "텔레메트리" },
                ]}
              />
              <QuickActionCard
                title="문제 징후 우선 처리"
                description="신고와 차단, 숨김/만료 같은 즉시 조치를 한곳에서 처리합니다."
                links={[
                  { href: "#reports", label: "신고 탭 보기" },
                  { href: "#live", label: "라이브 탭 보기" },
                  { href: "#ip", label: "차단 탭 보기" },
                ]}
              />
              <QuickActionCard
                title="운영 설정 조정"
                description="라이브 기간, 익명 접두어, 스파이크/리플레이 기준값을 조정합니다."
                links={[
                  { href: "#settings", label: "설정 탭 보기" },
                  { href: `/ops/${slug}/telemetry`, label: "로그 비교" },
                  { href: "/upgrade", label: "플랜 확인" },
                ]}
              />
            </div>
          </article>

          <article className="rounded-[24px] border border-[#DDE4F3] bg-white p-5 shadow-[0_18px_48px_rgba(15,23,42,0.06)]">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Immediate Watch</div>
            <h2 className="mt-2 text-lg font-semibold text-slate-950">지금 바로 확인할 항목</h2>
            <div className="mt-4 space-y-3">
              {urgentReports.length > 0 ? (
                urgentReports.map((report) => (
                  <div key={report.id} className="rounded-2xl border border-amber-200 bg-amber-50/70 px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-medium text-slate-900">{report.page?.title ?? `신고 ${report.id.slice(0, 6)}`}</div>
                      <StatusBadge tone="amber">{report.status}</StatusBadge>
                    </div>
                    <div className="mt-1 text-[12px] text-slate-600">
                      {report.reason ?? "사유 미입력"} · {formatTime(report.created_at)}
                    </div>
                  </div>
                ))
              ) : watchPages.length > 0 ? (
                watchPages.map((page) => (
                  <div key={page.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-medium text-slate-900">{page.title ?? `익명 페이지 #${page.anon_number}`}</div>
                      <StatusBadge tone={page.report_count > 0 ? "rose" : "emerald"}>
                        신고 {page.report_count}
                      </StatusBadge>
                    </div>
                    <div className="mt-1 text-[12px] text-slate-600">
                      방문 {page.total_visits} · 클릭 {page.total_clicks} · 만료 {formatTime(page.live_expires_at)}
                    </div>
                  </div>
                ))
              ) : (
                <EmptyState
                  title="운영 요약을 준비하는 중입니다."
                  description="관리자 세션이 준비되면 신고, 라이브 노출, 차단 상태를 바로 요약해 드립니다."
                />
              )}
            </div>
          </article>
        </section>

        {notice ? (
          <NoticeBanner tone={noticeTone}>{notice}</NoticeBanner>
        ) : null}

        {accessMode === "missing" ? (
          <NoticeBanner tone="info">
            현재 브라우저에는 관리자 세션이 없습니다. 위 입력창에 관리자 키를 넣고 세션을 시작하면 이 콘솔과
            텔레메트리가 바로 활성화됩니다.
          </NoticeBanner>
        ) : null}

        <div id="reports" className="flex flex-wrap items-center gap-2 text-xs">
          {([
            { id: "reports", label: "신고 큐" },
            { id: "live", label: "라이브 감시" },
            { id: "ip", label: "차단 IP" },
            { id: "settings", label: "운영 설정" },
          ] as Array<{ id: TabId; label: string }>).map((item) => (
            <button
              key={item.id}
              type="button"
              className={`rounded-full border px-3 py-1.5 ${
                tab === item.id ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-700"
              }`}
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </button>
          ))}
          <div className="ml-auto text-[11px] text-slate-500">{loading ? "운영 데이터를 불러오는 중입니다." : "운영 준비 완료"}</div>
        </div>

        {tab === "reports" ? (
          <section className="space-y-4 rounded-[24px] border border-[#DDE4F3] bg-white p-5 shadow-[0_18px_48px_rgba(15,23,42,0.06)]">
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={reportStatus}
                onChange={(event) => setReportStatus(event.target.value)}
                className="rounded-xl border border-slate-200 px-3 py-2 text-xs"
              >
                <option value="open">열린 신고</option>
                <option value="resolved">해결 완료</option>
                <option value="dismissed">기각</option>
              </select>
              <select
                value={reportSort}
                onChange={(event) => setReportSort(event.target.value as "date" | "priority")}
                className="rounded-xl border border-slate-200 px-3 py-2 text-xs"
                aria-label="신고 정렬"
              >
                <option value="date">최신 순</option>
                <option value="priority">우선순위 순</option>
              </select>
              <button
                type="button"
                className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700"
                onClick={() => void refreshReports()}
              >
                신고 새로고침
              </button>
            </div>
            <div className="grid gap-4">
              {reports.length ? (
                reports.map((report) => {
                  const pageId = report.page?.id;
                  return (
                    <article key={report.id} className="rounded-[22px] border border-slate-200 bg-slate-50/70 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-base font-semibold text-slate-950">
                              {report.page?.title ?? `신고 ${report.id.slice(0, 8)}`}
                            </h3>
                            <StatusBadge tone={report.status === "open" ? "amber" : "slate"}>{report.status}</StatusBadge>
                            {report.page?.is_hidden ? <StatusBadge tone="rose">hidden</StatusBadge> : null}
                            {report.page?.report_count ? <StatusBadge tone="rose">신고 {report.page.report_count}</StatusBadge> : null}
                          </div>
                          <div className="mt-2 text-[12px] text-slate-500">
                            신고 시각 {formatTime(report.created_at)} · 페이지 {pageId ?? "-"} · 상태 {report.page?.status ?? "-"}
                          </div>
                          <div className="mt-3 text-sm text-slate-700">{report.reason ?? "신고 사유가 비어 있습니다."}</div>
                        </div>

                        {pageId ? (
                          <div className="flex flex-wrap gap-2">
                            <RouteLink href={`/p/${pageId}`}>공개</RouteLink>
                            <RouteLink href={`/live/${pageId}`}>라이브</RouteLink>
                            <RouteLink href={`/dashboard/${pageId}`}>대시보드</RouteLink>
                            <RouteLink href={`/validate/${pageId}`}>검증</RouteLink>
                          </div>
                        ) : null}
                      </div>

                      <textarea
                        value={reportNotes[report.id] ?? ""}
                        onChange={(event) =>
                          setReportNotes((current) => ({ ...current, [report.id]: event.target.value }))
                        }
                        placeholder="운영 메모를 남기면 신고 처리 기록과 함께 저장됩니다."
                        className="mt-4 min-h-24 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-slate-400"
                      />

                      <div className="mt-4 flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700"
                          onClick={() => void handleReportAction(report.id, "none", "resolved")}
                        >
                          메모만 저장 후 종료
                        </button>
                        <button
                          type="button"
                          className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800"
                          onClick={() => void handleReportAction(report.id, "hide_page")}
                        >
                          페이지 숨김
                        </button>
                        <button
                          type="button"
                          className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700"
                          onClick={() => void handleReportAction(report.id, "force_expire")}
                        >
                          즉시 만료
                        </button>
                        <button
                          type="button"
                          className="rounded-xl border border-slate-900 bg-slate-900 px-3 py-2 text-xs font-medium text-white"
                          onClick={() => void handleReportAction(report.id, "ban_ip")}
                        >
                          관련 IP 차단
                        </button>
                      </div>
                    </article>
                  );
                })
              ) : (
                <EmptyState
                  title="표시할 신고가 없습니다."
                  description="현재 필터 조건에서 처리할 신고가 없거나, 관리자 접근 정보가 아직 준비되지 않았습니다."
                />
              )}
            </div>
          </section>
        ) : null}

        {tab === "live" ? (
          <section id="live" className="space-y-4 rounded-[24px] border border-[#DDE4F3] bg-white p-5 shadow-[0_18px_48px_rgba(15,23,42,0.06)]">
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="search"
                value={liveSearch}
                onChange={(event) => setLiveSearch(event.target.value)}
                placeholder="페이지 ID 또는 owner anon_id 검색"
                className="w-full max-w-sm rounded-xl border border-slate-200 px-3 py-2 text-xs outline-none focus:border-slate-400"
              />
              <select
                value={liveSort}
                onChange={(event) => setLiveSort(event.target.value as "expires" | "viewers" | "clicks" | "reports")}
                className="rounded-xl border border-slate-200 px-3 py-2 text-xs"
              >
                <option value="expires">만료 임박 순</option>
                <option value="viewers">방문 순</option>
                <option value="clicks">클릭 순</option>
                <option value="reports">신고 순</option>
              </select>
              <button
                type="button"
                className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700"
                onClick={() => void refreshLivePages()}
              >
                라이브 새로고침
              </button>
            </div>
            <div className="grid gap-4">
              {pages.length ? (
                pages.map((page) => (
                  <article key={page.id} className="rounded-[22px] border border-slate-200 bg-slate-50/70 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-base font-semibold text-slate-950">
                            {page.title ?? `익명 페이지 #${page.anon_number}`}
                          </h3>
                          <StatusBadge tone={page.is_hidden ? "rose" : "emerald"}>
                            {page.is_hidden ? "hidden" : "live"}
                          </StatusBadge>
                          {page.report_count > 0 ? <StatusBadge tone="amber">신고 {page.report_count}</StatusBadge> : null}
                        </div>
                        <div className="mt-2 text-[12px] text-slate-500">
                          {page.id} · {page.owner?.anon_id ?? page.owner_id}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-3 text-[12px] text-slate-600">
                          <span>시작 {formatTime(page.live_started_at)}</span>
                          <span>만료 {formatTime(page.live_expires_at)}</span>
                          <span>체류 {formatDuration(page.avg_duration_ms)}</span>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <RouteLink href={`/p/${page.id}`}>공개</RouteLink>
                        <RouteLink href={`/live/${page.id}`}>라이브</RouteLink>
                        <RouteLink href={`/dashboard/${page.id}`}>대시보드</RouteLink>
                        <RouteLink href={`/validate/${page.id}`}>검증</RouteLink>
                        <RouteLink href={`/replay/${page.id}`}>리플레이</RouteLink>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                      <MetricTile label="방문" value={String(page.total_visits)} />
                      <MetricTile label="클릭" value={String(page.total_clicks)} />
                      <MetricTile label="추천" value={String(page.upvote_count)} />
                      <MetricTile label="신고" value={String(page.report_count)} />
                      <MetricTile label="마지막 수정" value={formatTime(page.updated_at)} />
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800"
                        onClick={() => setConfirmAction({ type: "hide", pageId: page.id, title: page.title ?? `익명 #${page.anon_number}` })}
                      >
                        페이지 숨김
                      </button>
                      <button
                        type="button"
                        className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700"
                        onClick={() => setConfirmAction({ type: "expire", pageId: page.id, title: page.title ?? `익명 #${page.anon_number}` })}
                      >
                        즉시 만료
                      </button>
                    </div>
                  </article>
                ))
              ) : (
                <EmptyState
                  title={liveSearch.trim() ? "검색 결과가 없습니다." : "현재 라이브 페이지가 없습니다."}
                  description="라이브 상태 페이지가 없거나, 현재 접근 정보로 아직 운영 데이터를 받지 못했습니다."
                />
              )}
            </div>
          </section>
        ) : null}

        {tab === "settings" ? (
          <section id="settings" className="space-y-4 rounded-[24px] border border-[#DDE4F3] bg-white p-5 shadow-[0_18px_48px_rgba(15,23,42,0.06)]">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Ops Settings</div>
              <h2 className="mt-2 text-lg font-semibold text-slate-950">운영 기준값</h2>
              <p className="mt-1 text-sm text-slate-500">
                공개 기간, 익명 접두어, 스파이크 및 리플레이 하이라이트 계산값을 조정합니다.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <SettingsField label="라이브 유지 시간 (시간)">
                <select
                  value={settingsDraft.live_hours ?? 24}
                  onChange={(event) =>
                    setSettingsDraft((current) => ({ ...current, live_hours: Number(event.target.value) }))
                  }
                  className="mt-2 rounded-xl border border-slate-200 px-3 py-2 text-sm"
                >
                  <option value={12}>12</option>
                  <option value={24}>24</option>
                  <option value={48}>48</option>
                </select>
              </SettingsField>

              <SettingsField label="익명 접두어">
                <input
                  type="text"
                  value={settingsDraft.anon_prefix ?? ""}
                  onChange={(event) => setSettingsDraft((current) => ({ ...current, anon_prefix: event.target.value }))}
                  placeholder="예: 팀 익명"
                  className="mt-2 rounded-xl border border-slate-200 px-3 py-2 text-sm"
                />
              </SettingsField>

              <SettingsField label="인기 피드 Top-K">
                <input
                  type="number"
                  min={1}
                  max={24}
                  value={settingsDraft.feed_popular_k ?? 8}
                  onChange={(event) =>
                    setSettingsDraft((current) => ({ ...current, feed_popular_k: Number(event.target.value) || 8 }))
                  }
                  className="mt-2 rounded-xl border border-slate-200 px-3 py-2 text-sm"
                />
              </SettingsField>

              <SettingsField label="IP 미확인 fallback 허용">
                <label className="mt-2 inline-flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={settingsDraft.allow_noip_fallback ?? true}
                    onChange={(event) =>
                      setSettingsDraft((current) => ({ ...current, allow_noip_fallback: event.target.checked }))
                    }
                  />
                  허용
                </label>
              </SettingsField>

              <SettingsField label="Witness cap (분)">
                <input
                  type="number"
                  min={1}
                  max={120}
                  value={settingsDraft.witness_cap_minutes ?? 20}
                  onChange={(event) =>
                    setSettingsDraft((current) => ({
                      ...current,
                      witness_cap_minutes: Number(event.target.value) || 20,
                    }))
                  }
                  className="mt-2 rounded-xl border border-slate-200 px-3 py-2 text-sm"
                />
              </SettingsField>

              <SettingsField label="스파이크 분석 창 (시간)">
                <input
                  type="number"
                  min={1}
                  max={168}
                  value={settingsDraft.spikes_window_hours ?? 24}
                  onChange={(event) =>
                    setSettingsDraft((current) => ({
                      ...current,
                      spikes_window_hours: Number(event.target.value) || 24,
                    }))
                  }
                  className="mt-2 rounded-xl border border-slate-200 px-3 py-2 text-sm"
                />
              </SettingsField>

              <SettingsField label="스파이크 버킷 (분)">
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={settingsDraft.spikes_bucket_minutes ?? 5}
                  onChange={(event) =>
                    setSettingsDraft((current) => ({
                      ...current,
                      spikes_bucket_minutes: Number(event.target.value) || 5,
                    }))
                  }
                  className="mt-2 rounded-xl border border-slate-200 px-3 py-2 text-sm"
                />
              </SettingsField>

              <SettingsField label="스파이크 하이라이트 (분)">
                <input
                  type="number"
                  min={5}
                  max={180}
                  value={settingsDraft.spikes_highlight_minutes ?? 30}
                  onChange={(event) =>
                    setSettingsDraft((current) => ({
                      ...current,
                      spikes_highlight_minutes: Number(event.target.value) || 30,
                    }))
                  }
                  className="mt-2 rounded-xl border border-slate-200 px-3 py-2 text-sm"
                />
              </SettingsField>

              <SettingsField label="스파이크 Top-K">
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={settingsDraft.spikes_top_k ?? 3}
                  onChange={(event) =>
                    setSettingsDraft((current) => ({
                      ...current,
                      spikes_top_k: Number(event.target.value) || 3,
                    }))
                  }
                  className="mt-2 rounded-xl border border-slate-200 px-3 py-2 text-sm"
                />
              </SettingsField>

              <SettingsField label="리플레이 하이라이트 창 (ms)">
                <input
                  type="number"
                  min={5000}
                  max={300000}
                  value={settingsDraft.replay_highlight_window_ms ?? 30000}
                  onChange={(event) =>
                    setSettingsDraft((current) => ({
                      ...current,
                      replay_highlight_window_ms: Number(event.target.value) || 30000,
                    }))
                  }
                  className="mt-2 rounded-xl border border-slate-200 px-3 py-2 text-sm"
                />
              </SettingsField>

              <SettingsField label="리플레이 클릭 집중 Top-N">
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={settingsDraft.replay_top_click_windows ?? 3}
                  onChange={(event) =>
                    setSettingsDraft((current) => ({
                      ...current,
                      replay_top_click_windows: Number(event.target.value) || 3,
                    }))
                  }
                  className="mt-2 rounded-xl border border-slate-200 px-3 py-2 text-sm"
                />
              </SettingsField>

              <SettingsField label="리플레이 이탈 집중 Top-N">
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={settingsDraft.replay_top_leave_windows ?? 2}
                  onChange={(event) =>
                    setSettingsDraft((current) => ({
                      ...current,
                      replay_top_leave_windows: Number(event.target.value) || 2,
                    }))
                  }
                  className="mt-2 rounded-xl border border-slate-200 px-3 py-2 text-sm"
                />
              </SettingsField>

              <SettingsField label="리플레이 버튼 집중 Top-N">
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={settingsDraft.replay_top_button_clicks ?? 1}
                  onChange={(event) =>
                    setSettingsDraft((current) => ({
                      ...current,
                      replay_top_button_clicks: Number(event.target.value) || 1,
                    }))
                  }
                  className="mt-2 rounded-xl border border-slate-200 px-3 py-2 text-sm"
                />
              </SettingsField>
            </div>
            <button
              type="button"
              className="rounded-2xl border border-slate-950 bg-slate-950 px-4 py-3 text-sm font-medium text-white"
              onClick={() => void handleSaveSettings()}
            >
              운영 설정 저장
            </button>
          </section>
        ) : null}

        {tab === "ip" ? (
          <section id="ip" className="space-y-4 rounded-[24px] border border-[#DDE4F3] bg-white p-5 shadow-[0_18px_48px_rgba(15,23,42,0.06)]">
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={ipDraft}
                onChange={(event) => setIpDraft(event.target.value)}
                placeholder="차단할 IP"
                className="w-44 rounded-xl border border-slate-200 px-3 py-2 text-xs"
              />
              <input
                type="text"
                value={ipReason}
                onChange={(event) => setIpReason(event.target.value)}
                placeholder="차단 사유"
                className="w-full max-w-md rounded-xl border border-slate-200 px-3 py-2 text-xs"
              />
              <button
                type="button"
                className="rounded-xl border border-slate-950 bg-slate-950 px-3 py-2 text-xs font-medium text-white"
                onClick={() => void handleAddIpBlock()}
              >
                IP 차단 등록
              </button>
              <button
                type="button"
                className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700"
                onClick={() => void refreshBlocks()}
              >
                차단 목록 새로고침
              </button>
            </div>
            <div className="grid gap-3">
              {blocks.length ? (
                blocks.map((block) => (
                  <div key={block.id} className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="font-medium text-slate-950">해시 {block.ip_hash.slice(0, 12)}...</div>
                        <div className="mt-1 text-[12px] text-slate-500">사유: {block.reason ?? "-"}</div>
                      </div>
                      <div className="text-right text-[12px] text-slate-500">
                        <div>등록 {formatTime(block.created_at)}</div>
                        <div className="mt-1">만료 {formatTime(block.expires_at)}</div>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <EmptyState title="등록된 차단 IP가 없습니다." description="필요 시 IP와 사유를 입력해 즉시 차단할 수 있습니다." />
              )}
            </div>
          </section>
        ) : null}

        {confirmAction ? (
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-confirm-title"
            onClick={(event) => event.target === event.currentTarget && setConfirmAction(null)}
          >
            <div
              className="max-w-sm rounded-[20px] border border-slate-200 bg-white p-6 shadow-[0_20px_80px_rgba(15,23,42,0.22)]"
              onClick={(event) => event.stopPropagation()}
            >
              <h2 id="admin-confirm-title" className="text-base font-semibold text-slate-950">
                {confirmAction.type === "hide" ? "페이지 숨김" : "페이지 즉시 만료"}
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {confirmAction.type === "hide"
                  ? `‘${confirmAction.title}’ 페이지를 공개 목록과 피드에서 숨기시겠습니까?`
                  : `‘${confirmAction.title}’ 페이지를 즉시 만료하시겠습니까?`}
              </p>
              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700"
                  onClick={() => setConfirmAction(null)}
                >
                  취소
                </button>
                <button
                  type="button"
                  className="rounded-xl border border-slate-950 bg-slate-950 px-3 py-2 text-xs font-medium text-white"
                  onClick={() =>
                    confirmAction.type === "hide"
                      ? void handleHidePage(confirmAction.pageId)
                      : void handleExpirePage(confirmAction.pageId)
                  }
                >
                  확인
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function OverviewCard({ label, value, description }: { label: string; value: string; description: string }) {
  return (
    <article className="rounded-[22px] border border-[#DDE4F3] bg-white p-4 shadow-[0_18px_48px_rgba(15,23,42,0.05)]">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">{value}</div>
      <div className="mt-2 text-[12px] leading-5 text-slate-500">{description}</div>
    </article>
  );
}

function QuickActionCard({
  title,
  description,
  links,
}: {
  title: string;
  description: string;
  links: Array<{ href: string; label: string }>;
}) {
  return (
    <div className="rounded-[20px] border border-slate-200 bg-slate-50/80 p-4">
      <div className="text-sm font-semibold text-slate-950">{title}</div>
      <p className="mt-2 text-[12px] leading-5 text-slate-600">{description}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {links.map((link) => (
          <Link
            key={`${link.href}_${link.label}`}
            href={link.href}
            className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-100"
          >
            {link.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

function NoticeBanner({ tone, children }: { tone: NoticeTone; children: ReactNode }) {
  const style =
    tone === "error"
      ? "border-rose-200 bg-rose-50 text-rose-700"
      : tone === "success"
        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
        : "border-blue-200 bg-blue-50 text-blue-700";

  return <div className={`rounded-2xl border px-4 py-3 text-sm ${style}`}>{children}</div>;
}

function StatusBadge({
  tone,
  children,
}: {
  tone: "slate" | "emerald" | "amber" | "rose" | "sky";
  children: ReactNode;
}) {
  const style =
    tone === "emerald"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : tone === "amber"
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : tone === "rose"
          ? "border-rose-200 bg-rose-50 text-rose-700"
          : tone === "sky"
            ? "border-sky-200 bg-sky-50 text-sky-700"
            : "border-slate-200 bg-slate-50 text-slate-700";

  return <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${style}`}>{children}</span>;
}

function RouteLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-100"
    >
      {children}
    </Link>
  );
}

function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-3 py-3">
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className="mt-1 text-sm font-semibold text-slate-950">{value}</div>
    </div>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-[22px] border border-dashed border-slate-300 bg-slate-50/60 px-4 py-8 text-center">
      <div className="text-sm font-semibold text-slate-900">{title}</div>
      <div className="mt-2 text-[12px] leading-5 text-slate-500">{description}</div>
    </div>
  );
}

function SettingsField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="rounded-[20px] border border-slate-200 bg-slate-50/80 p-4 text-sm text-slate-700">
      <div className="text-[12px] font-medium text-slate-500">{label}</div>
      {children}
    </label>
  );
}
