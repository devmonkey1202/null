"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ReportBuilderPanel } from "@/components/dashboard/report-builder-panel";
import { HeatmapGrid, MetricCard, ScrollDepthBars } from "@/components/dashboard/report-widgets";
import NullSpinner from "@/components/null-spinner";

type PageData = {
  page: {
    id: string;
    title: string | null;
    anon_number: number;
    status: string;
    live_expires_at: string | null;
    deployed_at: string | null;
    total_visits: number;
    total_clicks: number;
    avg_duration_ms: number;
    bounce_rate: number;
  };
};

type AnalyticsResponse = {
  period: string;
  summary: { visits: number; clicks: number; avg_duration_ms: number; bounce_rate: number };
  daily: { date: string; visits: number; clicks: number }[];
};

type FunnelResponse = {
  period: string;
  steps: { name: string; count: number }[];
};

type Spike = { start: string; end: string; clicks: number; leaves: number };

type SessionItem = { id: string; started_at: string; ended_at: string | null; duration_ms: number | null };

type MobileSettings = {
  appName?: string;
  appId?: string;
  serverUrl?: string;
  allowCleartext?: boolean;
  statusBarStyle?: "default" | "light" | "dark";
  statusBarColor?: string;
  notes?: string;
};

type HostingVerification = {
  method?: string;
  status?: string;
  token?: string;
  record_name?: string;
  record_value?: string;
  issued_at?: string | null;
  checked_at?: string | null;
  verified_at?: string | null;
  last_error?: string | null;
};

type HostingSettings = {
  customDomain?: string;
  forceHttps?: boolean;
  redirectWww?: boolean;
  notes?: string;
  verification?: HostingVerification | null;
};

type HostingStatus = {
  domain?: string;
  dns?: {
    verification?: { name?: string | null; matched?: boolean | null; records?: string[]; error?: string | null };
    a?: { records?: string[]; matched?: boolean | null; error?: string | null };
    aaaa?: { records?: string[]; matched?: boolean | null; error?: string | null };
    cname?: { records?: string[]; matched?: boolean | null; error?: string | null };
    expected?: { cname?: string[]; a?: string[]; aaaa?: string[] };
  };
  ssl?: { status?: string; valid_from?: string; valid_to?: string; days_remaining?: number; error?: string };
};

type AppUserItem = {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  role: string;
  created_at: string;
};

export default function DashboardWorkView({ pageId }: { pageId: string }) {
  const [data, setData] = useState<PageData | null>(null);
  const [stats, setStats] = useState<{
    clicks_10s: number;
    visits_60s: number;
    avg_dwell_s: number;
    replay_enabled: boolean;
  } | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsResponse | null>(null);
  const [funnel, setFunnel] = useState<FunnelResponse | null>(null);
  const [compare, setCompare] = useState<{
    period: string;
    current: { visits: number; clicks: number; avg_duration_ms: number; bounce_rate: number };
    previous: { visits: number; clicks: number; avg_duration_ms: number; bounce_rate: number };
    diff: { visits_pct: number; clicks_pct: number; avg_duration_pct: number; bounce_rate_pct: number };
  } | null>(null);
  const [byWeekday, setByWeekday] = useState<{ dow: number; day_name: string; visits: number }[] | null>(null);
  const [spikes, setSpikes] = useState<Spike[] | null>(null);
  const [period, setPeriod] = useState<"today" | "7d" | "30d">("7d");
  const [error, setError] = useState<"not_found" | "error" | null>(null);
  const [copied, setCopied] = useState(false);
  const [heatmap, setHeatmap] = useState<{
    grid?: number[][];
    scrollBuckets?: number[];
    size: number;
  } | null>(null);
  const [heatmapType, setHeatmapType] = useState<"click" | "scroll" | "move">("click");
  const [sessions, setSessions] = useState<SessionItem[] | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportingEvents, setExportingEvents] = useState(false);
  const [discordWebhookUrl, setDiscordWebhookUrl] = useState<string>("");
  const [discordSaving, setDiscordSaving] = useState(false);
  const [discordTestResult, setDiscordTestResult] = useState<string | null>(null);
  const [secrets, setSecrets] = useState<{ id: string; key: string; created_at: string }[] | null>(null);
  const [secretKey, setSecretKey] = useState("");
  const [secretValue, setSecretValue] = useState("");
  const [secretSaving, setSecretSaving] = useState(false);
  const [secretMessage, setSecretMessage] = useState<string | null>(null);
  const [appUsers, setAppUsers] = useState<AppUserItem[] | null>(null);
  const [appUsersLoading, setAppUsersLoading] = useState(false);
  const [appUsersMessage, setAppUsersMessage] = useState<string | null>(null);
  const [appUserRoles, setAppUserRoles] = useState<Record<string, string>>({});
  const [appUsersSaving, setAppUsersSaving] = useState<Record<string, boolean>>({});
  const [hostingSettings, setHostingSettings] = useState<HostingSettings>({
    customDomain: "",
    forceHttps: true,
    redirectWww: false,
    notes: "",
    verification: null,
  });
  const [hostingLoading, setHostingLoading] = useState(false);
  const [hostingSaving, setHostingSaving] = useState(false);
  const [hostingMessage, setHostingMessage] = useState<string | null>(null);
  const [hostingVerifyLoading, setHostingVerifyLoading] = useState(false);
  const [hostingVerifyMessage, setHostingVerifyMessage] = useState<string | null>(null);
  const [hostingStatus, setHostingStatus] = useState<HostingStatus | null>(null);
  const [hostingStatusLoading, setHostingStatusLoading] = useState(false);
  const [hostingStatusMessage, setHostingStatusMessage] = useState<string | null>(null);
  const [mobileSettings, setMobileSettings] = useState<MobileSettings>({
    appName: "",
    appId: "",
    serverUrl: "",
    allowCleartext: false,
    statusBarStyle: "default",
    statusBarColor: "",
    notes: "",
  });
  const [mobileLoading, setMobileLoading] = useState(false);
  const [mobileSaving, setMobileSaving] = useState(false);
  const [mobileMessage, setMobileMessage] = useState<string | null>(null);
  const [scheduledReportEnabled, setScheduledReportEnabled] = useState(false);
  const [autoDropAlert, setAutoDropAlert] = useState(false);
  const [health, setHealth] = useState<{
    last_event_at: string | null;
    visits_today: number;
    visits_yesterday: number;
    drop_warning: boolean;
    gaps?: string[];
  } | null>(null);
  const [healthNotifying, setHealthNotifying] = useState(false);
  const [spikeNotifyingId, setSpikeNotifyingId] = useState<string | null>(null);
  const [sessionFrom, setSessionFrom] = useState("");
  const [sessionTo, setSessionTo] = useState("");
  const [reportTemplate, setReportTemplate] = useState<"overview" | "conversion" | "churn">("overview");
  const [byViewport, setByViewport] = useState<{ name: string; visits: number }[] | null>(null);
  const [byElement, setByElement] = useState<{ element_id: string | null; clicks: number }[] | null>(null);
  const [byBrowser, setByBrowser] = useState<{ name: string; visits: number }[] | null>(null);
  const [byOS, setByOS] = useState<{ name: string; visits: number }[] | null>(null);
  const [segments, setSegments] = useState<{ id: string; name: string; conditions: { op: "and" | "or"; rules: { type: string; value: unknown; not?: boolean }[] } }[] | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [publishMessage, setPublishMessage] = useState<string | null>(null);
  const [deploying, setDeploying] = useState(false);
  const [deployMessage, setDeployMessage] = useState<string | null>(null);
  const [segmentName, setSegmentName] = useState("");
  const [segmentOp, setSegmentOp] = useState<"and" | "or">("and");
  const [segmentRules, setSegmentRules] = useState<{ type: string; value: string }[]>([{ type: "event_type", value: "click" }]);
  const [segmentSaving, setSegmentSaving] = useState(false);
  const REPORT_BLOCK_IDS = [
    "summary",
    "compare",
    "funnel",
    "daily",
    "viewport",
    "browser",
    "element",
    "weekday",
    "health",
    "heatmap",
    "sessions",
    "spikes",
    "segments",
    "discord",
  ] as const;
  const REPORT_BLOCK_LABELS: Record<(typeof REPORT_BLOCK_IDS)[number], string> = {
    summary: "요약 카드",
    compare: "기간 비교",
    funnel: "퍼널",
    daily: "일별 추이 차트",
    viewport: "뷰포트별 방문",
    browser: "브라우저·OS",
    element: "요소별 클릭",
    weekday: "요일별 방문",
    health: "데이터 상태",
    heatmap: "히트맵",
    sessions: "최근 방문(리플레이 링크)",
    spikes: "이상 구간",
    segments: "세그먼트",
    discord: "Discord 알림",
  };
  const [reportBuilderOpen, setReportBuilderOpen] = useState(false);
  const [reportBuilderSelected, setReportBuilderSelected] = useState<Set<string>>(new Set(REPORT_BLOCK_IDS));
  const [reportLayout, setReportLayout] = useState<string[] | null>(null);
  const verificationStatusLabel = (status?: string | null) => {
    switch (status) {
      case "verified":
        return "인증됨";
      case "error":
        return "오류";
      case "pending":
        return "대기";
      default:
        return "미발급";
    }
  };

  const matchLabel = (value?: boolean | null) => {
    if (value == null) return "미확인";
    return value ? "일치" : "불일치";
  };

  const sslStatusLabel = (status?: string | null) => {
    switch (status) {
      case "ok":
        return "정상";
      case "expired":
        return "만료";
      case "not_found":
        return "없음";
      case "error":
        return "오류";
      default:
        return "미확인";
    }
  };

  useEffect(() => {
    if (typeof window === "undefined" || !pageId) return;
    try {
      const raw = localStorage.getItem(`dashboard-report-layout-${pageId}`);
      if (raw) {
        const arr = JSON.parse(raw) as string[];
        if (Array.isArray(arr)) {
          Promise.resolve().then(() => {
            setReportLayout(arr);
            setReportBuilderSelected(new Set(arr));
          });
        }
      }
    } catch {
      /* ignore */
    }
  }, [pageId]);

  const showBlock = useCallback(
    (id: string) => {
      if (!reportLayout) return true;
      return reportLayout.includes(id);
    },
    [reportLayout]
  );

  const saveReportLayout = useCallback(() => {
    const arr = Array.from(reportBuilderSelected);
    setReportLayout(arr);
    if (typeof window !== "undefined" && pageId) localStorage.setItem(`dashboard-report-layout-${pageId}`, JSON.stringify(arr));
    setReportBuilderOpen(false);
  }, [reportBuilderSelected, pageId]);

  const fetchPage = useCallback(() => {
    setError(null);
    fetch(`/api/pages/${pageId}`, { credentials: "include" })
      .then((res) => {
        if (res.status === 401) {
          window.location.href = "/login?next=" + encodeURIComponent("/dashboard/" + pageId);
          return null;
        }
        if (!res.ok) {
          setError(res.status === 404 ? "not_found" : "error");
          return null;
        }
        return res.json();
      })
      .then((pageData: PageData | null) => {
        if (pageData) setData(pageData);
      })
      .catch(() => setError("error"));
  }, [pageId]);

  const publishLive = useCallback(() => {
    setPublishing(true);
    setPublishMessage(null);
    fetch(`/api/pages/${pageId}/publish`, { method: "POST", credentials: "include" })
      .then((res) => res.json())
      .then((body) => {
        if (body?.error) setPublishMessage(body.message ?? "라이브 시작 실패");
        else setPublishMessage("라이브가 시작되었습니다.");
      })
      .catch(() => setPublishMessage("라이브 시작 실패"))
      .finally(() => {
        setPublishing(false);
        fetchPage();
      });
  }, [pageId, fetchPage]);

  const toggleDeploy = useCallback(
    (nextDeploy: boolean) => {
      setDeploying(true);
      setDeployMessage(null);
      fetch(`/api/pages/${pageId}/deploy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ deploy: nextDeploy }),
      })
        .then((res) => res.json())
        .then((body) => {
          if (body?.error) setDeployMessage(body.message ?? "배포 처리 실패");
          else setDeployMessage(nextDeploy ? "배포되었습니다." : "배포가 해제되었습니다.");
        })
        .catch(() => setDeployMessage("배포 처리 실패"))
        .finally(() => {
          setDeploying(false);
          fetchPage();
        });
    },
    [pageId, fetchPage]
  );

  const fetchStats = useCallback(() => {
    fetch(`/api/pages/${pageId}/stats`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then(setStats)
      .catch(() => setStats(null));
  }, [pageId]);

  const fetchAnalytics = useCallback(() => {
    fetch(`/api/pages/${pageId}/analytics?period=${period}`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then(setAnalytics)
      .catch(() => setAnalytics(null));
  }, [pageId, period]);

  const fetchFunnel = useCallback(() => {
    fetch(`/api/pages/${pageId}/analytics/funnel?period=${period}`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then(setFunnel)
      .catch(() => setFunnel(null));
  }, [pageId, period]);

  useEffect(() => {
    fetchFunnel();
  }, [fetchFunnel]);

  const fetchCompare = useCallback(() => {
    const p = period === "today" ? "7d" : period;
    fetch(`/api/pages/${pageId}/analytics/compare?period=${p}`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then(setCompare)
      .catch(() => setCompare(null));
  }, [pageId, period]);

  useEffect(() => {
    if (period !== "today") fetchCompare();
    else Promise.resolve().then(() => setCompare(null));
  }, [period, fetchCompare]);

  const fetchByWeekday = useCallback(() => {
    const p = period === "today" ? "7d" : period;
    fetch(`/api/pages/${pageId}/analytics/by-weekday?period=${p}`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((d) => setByWeekday(d?.by_weekday ?? null))
      .catch(() => setByWeekday(null));
  }, [pageId, period]);

  useEffect(() => {
    fetchByWeekday();
  }, [fetchByWeekday]);

  const fetchByViewport = useCallback(() => {
    const p = period === "today" ? "7d" : period;
    fetch(`/api/pages/${pageId}/analytics/by-viewport?period=${p}`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((d) => setByViewport(d?.by_viewport ?? null))
      .catch(() => setByViewport(null));
  }, [pageId, period]);

  useEffect(() => {
    fetchByViewport();
  }, [fetchByViewport]);

  const fetchByElement = useCallback(() => {
    const p = period === "today" ? "7d" : period;
    fetch(`/api/pages/${pageId}/analytics/by-element?period=${p}`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((d) => setByElement(d?.by_element ?? null))
      .catch(() => setByElement(null));
  }, [pageId, period]);

  useEffect(() => {
    fetchByElement();
  }, [fetchByElement]);

  const fetchByBrowser = useCallback(() => {
    const p = period === "today" ? "7d" : period;
    fetch(`/api/pages/${pageId}/analytics/by-browser?period=${p}`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((d) => setByBrowser(d?.by_browser ?? null))
      .catch(() => setByBrowser(null));
  }, [pageId, period]);

  const fetchByOS = useCallback(() => {
    const p = period === "today" ? "7d" : period;
    fetch(`/api/pages/${pageId}/analytics/by-os?period=${p}`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((d) => setByOS(d?.by_os ?? null))
      .catch(() => setByOS(null));
  }, [pageId, period]);

  useEffect(() => {
    fetchByBrowser();
  }, [fetchByBrowser]);

  useEffect(() => {
    fetchByOS();
  }, [fetchByOS]);

  const fetchHealth = useCallback(() => {
    fetch(`/api/pages/${pageId}/analytics/health?period=7d`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then(setHealth)
      .catch(() => setHealth(null));
  }, [pageId]);

  useEffect(() => {
    fetchHealth();
  }, [fetchHealth]);

  const fetchSegments = useCallback(() => {
    fetch(`/api/pages/${pageId}/segments`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => setSegments(body?.segments ?? null))
      .catch(() => setSegments(null));
  }, [pageId]);

  useEffect(() => {
    if (data?.page) fetchSegments();
  }, [data?.page, fetchSegments]);

  const fetchSpikes = useCallback(() => {
    fetch(`/api/pages/${pageId}/spikes`, { credentials: "include" })
      .then((res) => {
        if (res.status === 402) return null;
        return res.ok ? res.json() : null;
      })
      .then((body) => (body?.ok && Array.isArray(body.highlights) ? body.highlights : null))
      .then(setSpikes)
      .catch(() => setSpikes(null));
  }, [pageId]);

  useEffect(() => {
    Promise.resolve().then(fetchPage);
  }, [fetchPage]);

  useEffect(() => {
    fetchStats();
    const t = setInterval(fetchStats, 5000);
    return () => clearInterval(t);
  }, [fetchStats]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  useEffect(() => {
    if (data?.page && stats?.replay_enabled) fetchSpikes();
  }, [data?.page, stats?.replay_enabled, fetchSpikes]);

  const fetchHeatmap = useCallback(() => {
    fetch(`/api/pages/${pageId}/heatmap?period=${period}&type=${heatmapType}`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setHeatmap((prev) => ({ ...(prev ?? {}), ...data }));
        else setHeatmap(null);
      })
      .catch(() => setHeatmap(null));
  }, [pageId, period, heatmapType]);

  const [appliedSessionFrom, setAppliedSessionFrom] = useState("");
  const [appliedSessionTo, setAppliedSessionTo] = useState("");

  const fetchSessions = useCallback(() => {
    const params = new URLSearchParams({ limit: "20" });
    if (appliedSessionFrom) params.set("from", appliedSessionFrom);
    if (appliedSessionTo) params.set("to", appliedSessionTo);
    if (!appliedSessionFrom && !appliedSessionTo) params.set("limit", "5");
    fetch(`/api/pages/${pageId}/sessions?${params}`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => (Array.isArray(body?.sessions) ? body.sessions : null))
      .then(setSessions)
      .catch(() => setSessions(null));
  }, [pageId, appliedSessionFrom, appliedSessionTo]);

  useEffect(() => {
    fetchHeatmap();
  }, [fetchHeatmap]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const fetchDiscordSettings = useCallback(() => {
    fetch(`/api/pages/${pageId}/alerts/settings`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => {
        setDiscordWebhookUrl(body?.discord_webhook_url ?? "");
        setScheduledReportEnabled(!!body?.scheduled_report_enabled);
        setAutoDropAlert(!!body?.auto_drop_alert);
      })
      .catch(() => setDiscordWebhookUrl(""));
  }, [pageId]);

  useEffect(() => {
    if (data?.page) fetchDiscordSettings();
  }, [data?.page, fetchDiscordSettings]);

  const fetchSecrets = useCallback(() => {
    if (!pageId) return;
    fetch(`/api/app/${pageId}/secrets`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => setSecrets(Array.isArray(body?.secrets) ? body.secrets : []))
      .catch(() => setSecrets([]));
  }, [pageId]);

  useEffect(() => {
    if (data?.page) fetchSecrets();
  }, [data?.page, fetchSecrets]);

  const fetchAppUsers = useCallback(() => {
    if (!pageId) return;
    setAppUsersLoading(true);
    setAppUsersMessage(null);
    fetch(`/api/app/${pageId}/auth/users?limit=100`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => {
        const list = Array.isArray(body?.users) ? (body.users as AppUserItem[]) : [];
        setAppUsers(list);
        const nextRoles: Record<string, string> = {};
        list.forEach((u) => {
          nextRoles[u.id] = u.role;
        });
        setAppUserRoles(nextRoles);
      })
      .catch(() => setAppUsersMessage("앱 사용자 목록을 불러오지 못했습니다."))
      .finally(() => setAppUsersLoading(false));
  }, [pageId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (data?.page) fetchAppUsers();
  }, [data?.page, fetchAppUsers]);

  const fetchHostingSettings = useCallback(() => {
    if (!pageId) return;
    setHostingLoading(true);
    setHostingMessage(null);
    fetch(`/api/app/${pageId}/hosting`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => {
        const settings = (body?.settings ?? {}) as HostingSettings;
        setHostingSettings({
          customDomain: settings.customDomain ?? "",
          forceHttps: typeof settings.forceHttps === "boolean" ? settings.forceHttps : true,
          redirectWww: typeof settings.redirectWww === "boolean" ? settings.redirectWww : false,
          notes: settings.notes ?? "",
          verification: (settings.verification ?? null) as HostingVerification | null,
        });
      })
      .catch(() => setHostingMessage("호스팅 설정을 불러오지 못했습니다."))
      .finally(() => setHostingLoading(false));
  }, [pageId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (data?.page) fetchHostingSettings();
  }, [data?.page, fetchHostingSettings]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHostingStatus(null);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHostingStatusMessage(null);
  }, [hostingSettings.customDomain]);

  const fetchMobileSettings = useCallback(() => {
    if (!pageId) return;
    setMobileLoading(true);
    setMobileMessage(null);
    fetch(`/api/app/${pageId}/mobile`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => {
        const settings = (body?.settings ?? {}) as MobileSettings;
        const allowCleartext =
          typeof settings.allowCleartext === "boolean"
            ? settings.allowCleartext
            : typeof settings.serverUrl === "string" && settings.serverUrl.startsWith("http://");
        setMobileSettings({
          appName: settings.appName ?? "",
          appId: settings.appId ?? "",
          serverUrl: settings.serverUrl ?? "",
          allowCleartext,
          statusBarStyle: settings.statusBarStyle ?? "default",
          statusBarColor: settings.statusBarColor ?? "",
          notes: settings.notes ?? "",
        });
      })
      .catch(() => setMobileMessage("모바일 설정을 불러오지 못했습니다."))
      .finally(() => setMobileLoading(false));
  }, [pageId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (data?.page) fetchMobileSettings();
  }, [data?.page, fetchMobileSettings]);

  const saveDiscordWebhook = useCallback(() => {
    setDiscordSaving(true);
    setDiscordTestResult(null);
    fetch(`/api/pages/${pageId}/alerts/settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        discord_webhook_url: discordWebhookUrl.trim() || null,
        scheduled_report_enabled: scheduledReportEnabled,
        auto_drop_alert: autoDropAlert,
      }),
    })
      .then((res) => res.json())
      .then((body) => {
        if (body?.error) setDiscordTestResult(body.message ?? "저장 실패");
        else setDiscordTestResult("저장되었습니다.");
      })
      .catch(() => setDiscordTestResult("저장 실패"))
      .finally(() => setDiscordSaving(false));
  }, [pageId, discordWebhookUrl, scheduledReportEnabled, autoDropAlert]);

  const sendDiscordTest = useCallback(() => {
    setDiscordTestResult(null);
    fetch(`/api/pages/${pageId}/alerts/test`, { method: "POST", credentials: "include" })
      .then((res) => res.json())
      .then((body) => {
        if (body?.ok) setDiscordTestResult("테스트 메시지가 전송되었습니다.");
        else setDiscordTestResult(body?.message ?? "전송 실패");
      })
      .catch(() => setDiscordTestResult("전송 실패"));
  }, [pageId]);

  const saveSecret = useCallback(() => {
    if (!secretKey.trim() || !secretValue) {
      setSecretMessage("키와 값을 입력해 주세요.");
      return;
    }
    setSecretSaving(true);
    setSecretMessage(null);
    fetch(`/api/app/${pageId}/secrets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ key: secretKey.trim(), value: secretValue }),
    })
      .then((res) => res.json())
      .then((body) => {
        if (body?.error) {
          setSecretMessage(body.error ?? "저장 실패");
          return;
        }
        setSecretKey("");
        setSecretValue("");
        setSecretMessage("저장되었습니다.");
        fetchSecrets();
      })
      .catch(() => setSecretMessage("저장 실패"))
      .finally(() => setSecretSaving(false));
  }, [pageId, secretKey, secretValue, fetchSecrets]);

  const deleteSecret = useCallback(
    (key: string) => {
      if (!key) return;
      fetch(`/api/app/${pageId}/secrets?key=${encodeURIComponent(key)}`, {
        method: "DELETE",
        credentials: "include",
      })
        .then(() => {
          setSecretMessage("삭제되었습니다.");
          fetchSecrets();
        })
        .catch(() => setSecretMessage("삭제 실패"));
    },
    [pageId, fetchSecrets]
  );

  const saveAppUserRole = useCallback(
    (userId: string) => {
      const role = appUserRoles[userId];
      if (!role) return;
      setAppUsersSaving((prev) => ({ ...prev, [userId]: true }));
      setAppUsersMessage(null);
      fetch(`/api/app/${pageId}/auth/users`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ user_id: userId, role }),
      })
        .then((res) => res.json())
        .then((body) => {
          if (body?.error) setAppUsersMessage(body.error ?? "권한 변경 실패");
          else {
            setAppUsersMessage("권한이 변경되었습니다.");
            fetchAppUsers();
          }
        })
        .catch(() => setAppUsersMessage("권한 변경 실패"))
        .finally(() => setAppUsersSaving((prev) => ({ ...prev, [userId]: false })));
    },
    [pageId, appUserRoles, fetchAppUsers]
  );

  const deleteAppUser = useCallback(
    (userId: string) => {
      if (!userId) return;
      setAppUsersMessage(null);
      fetch(`/api/app/${pageId}/auth/users?user_id=${encodeURIComponent(userId)}`, {
        method: "DELETE",
        credentials: "include",
      })
        .then((res) => res.json().catch(() => ({})))
        .then((body) => {
          if (body?.error) setAppUsersMessage(body.error ?? "사용자 삭제 실패");
          else {
            setAppUsersMessage("사용자가 삭제되었습니다.");
            fetchAppUsers();
          }
        })
        .catch(() => setAppUsersMessage("사용자 삭제 실패"));
    },
    [pageId, fetchAppUsers]
  );

  const saveHostingSettings = useCallback(() => {
    setHostingSaving(true);
    setHostingMessage(null);
    const payload = {
      customDomain: hostingSettings.customDomain?.trim() || null,
      forceHttps: Boolean(hostingSettings.forceHttps),
      redirectWww: Boolean(hostingSettings.redirectWww),
      notes: hostingSettings.notes?.trim() || null,
    };
    fetch(`/api/app/${pageId}/hosting`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload),
    })
      .then((res) => res.json())
      .then((body) => {
        if (body?.error) setHostingMessage(body.message ?? "저장 실패");
        else setHostingMessage("저장되었습니다.");
      })
      .catch(() => setHostingMessage("저장 실패"))
      .finally(() => setHostingSaving(false));
  }, [pageId, hostingSettings]);

  const issueHostingVerification = useCallback(() => {
    setHostingVerifyLoading(true);
    setHostingVerifyMessage(null);
    fetch(`/api/app/${pageId}/hosting/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ action: "issue" }),
    })
      .then((res) => res.json())
      .then((body) => {
        if (body?.error) {
          setHostingVerifyMessage(body.message ?? "도메인 인증 토큰 발급 실패");
          return;
        }
        setHostingSettings((prev) => ({ ...prev, verification: body?.verification ?? prev.verification }));
        setHostingVerifyMessage("도메인 인증 토큰이 발급되었습니다.");
      })
      .catch(() => setHostingVerifyMessage("도메인 인증 토큰 발급 실패"))
      .finally(() => setHostingVerifyLoading(false));
  }, [pageId]);

  const checkHostingVerification = useCallback(() => {
    setHostingVerifyLoading(true);
    setHostingVerifyMessage(null);
    fetch(`/api/app/${pageId}/hosting/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ action: "check" }),
    })
      .then((res) => res.json())
      .then((body) => {
        if (body?.error) {
          setHostingVerifyMessage(body.message ?? "도메인 인증 확인 실패");
          return;
        }
        setHostingSettings((prev) => ({ ...prev, verification: body?.verification ?? prev.verification }));
        setHostingVerifyMessage(body?.matched ? "도메인 인증이 완료되었습니다." : "도메인 인증 대기 상태입니다.");
      })
      .catch(() => setHostingVerifyMessage("도메인 인증 확인 실패"))
      .finally(() => setHostingVerifyLoading(false));
  }, [pageId]);

  const fetchHostingStatus = useCallback(() => {
    setHostingStatusLoading(true);
    setHostingStatusMessage(null);
    fetch(`/api/app/${pageId}/hosting/status`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : res.json().catch(() => null)))
      .then((body) => {
        if (!body || body?.error) {
          setHostingStatusMessage(body?.message ?? "도메인 상태를 불러오지 못했습니다.");
          setHostingStatus(null);
          return;
        }
        setHostingStatus(body as HostingStatus);
        setHostingStatusMessage("도메인 상태를 불러왔습니다.");
      })
      .catch(() => {
        setHostingStatusMessage("도메인 상태를 불러오지 못했습니다.");
        setHostingStatus(null);
      })
      .finally(() => setHostingStatusLoading(false));
  }, [pageId]);

  const saveMobileSettings = useCallback(() => {
    setMobileSaving(true);
    setMobileMessage(null);
    const payload = {
      appName: mobileSettings.appName?.trim() || null,
      appId: mobileSettings.appId?.trim() || null,
      serverUrl: mobileSettings.serverUrl?.trim() || null,
      allowCleartext: Boolean(mobileSettings.allowCleartext),
      statusBarStyle: mobileSettings.statusBarStyle ?? "default",
      statusBarColor: mobileSettings.statusBarColor?.trim() || null,
      notes: mobileSettings.notes?.trim() || null,
    };
    fetch(`/api/app/${pageId}/mobile`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload),
    })
      .then((res) => res.json())
      .then((body) => {
        if (body?.error) setMobileMessage(body.message ?? "저장 실패");
        else setMobileMessage("저장되었습니다.");
      })
      .catch(() => setMobileMessage("저장 실패"))
      .finally(() => setMobileSaving(false));
  }, [pageId, mobileSettings]);

  const downloadMobilePackage = useCallback(
    (type: "capacitor" | "react-native") => {
      const url = `/api/app/${pageId}/mobile/package?type=${type}`;
      window.location.href = url;
    },
    [pageId]
  );

  const downloadCsv = useCallback(() => {
    setExporting(true);
    fetch(`/api/pages/${pageId}/analytics/export?period=${period}`, { credentials: "include" })
      .then((res) => {
        if (!res.ok) throw new Error("export failed");
        return res.text();
      })
      .then((csv) => {
        const blob = new Blob([csv], { type: "text/csv; charset=utf-8" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `analytics-${period}.csv`;
        a.click();
        URL.revokeObjectURL(a.href);
      })
      .catch(() => {})
      .finally(() => setExporting(false));
  }, [pageId, period]);

  const downloadEventsCsv = useCallback(() => {
    setExportingEvents(true);
    fetch(`/api/pages/${pageId}/events/export?period=${period}`, { credentials: "include" })
      .then((res) => {
        if (!res.ok) throw new Error("export failed");
        return res.text();
      })
      .then((csv) => {
        const blob = new Blob([csv], { type: "text/csv; charset=utf-8" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `events-${period}.csv`;
        a.click();
        URL.revokeObjectURL(a.href);
      })
      .catch(() => {})
      .finally(() => setExportingEvents(false));
  }, [pageId, period]);

  const downloadSnapshot = useCallback(() => {
    const snapshot = {
      generated_at: new Date().toISOString(),
      page_id: pageId,
      period,
      title: data?.page?.title ?? null,
      summary: analytics?.summary ?? null,
      daily: analytics?.daily ?? [],
      funnel: funnel?.steps ?? null,
    };
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json; charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `snapshot-${pageId.slice(0, 8)}-${period}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, [pageId, period, analytics, funnel, data?.page?.title]);

  if (error) {
    return (
      <div className="min-h-screen bg-[#0a0a0a]">
        <div className="mx-auto max-w-lg px-6 py-24 text-center">
          <p className="text-[#a1a1a1]">
            {error === "not_found" ? "작품을 찾을 수 없습니다." : "일시적인 오류입니다."}
          </p>
          <Link
            href="/dashboard"
            className="mt-6 inline-block rounded-full border border-[#333] bg-transparent px-5 py-2.5 text-sm font-medium text-white hover:border-white/30 hover:bg-white/5"
          >
            대시보드로 돌아가기
          </Link>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0a0a]">
        <NullSpinner />
      </div>
    );
  }

  const p = data.page;
  const title = p.title || `익명 작품 #${p.anon_number}`;
  const isLive = p.status === "live" && p.live_expires_at && new Date(p.live_expires_at) > new Date();
  const isDeployed = p.deployed_at != null;
  const summary = analytics?.summary;
  const daily = analytics?.daily ?? [];
  const maxVisits = daily.length ? Math.max(1, ...daily.map((d) => d.visits)) : 1;

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <header className="mb-10">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[#737373] transition hover:text-white"
          >
            <span aria-hidden>←</span> 대시보드
          </Link>
          <div className="mt-4 flex flex-wrap items-start justify-between gap-6">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
              <div className="mt-3 flex flex-wrap gap-2">
                {isLive && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/15 px-2.5 py-1 text-xs font-medium text-red-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-red-500" /> 라이브
                  </span>
                )}
                {p.status === "draft" && (
                  <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-medium text-[#a3a3a3]">초안</span>
                )}
                {p.status === "expired" && (
                  <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-medium text-[#a3a3a3]">만료</span>
                )}
                {isDeployed && (
                  <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-400">
                    배포됨
                  </span>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {!isLive && (
                <button
                  type="button"
                  onClick={publishLive}
                  disabled={publishing}
                  className="rounded-full border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-300 hover:bg-red-500/20 disabled:opacity-60"
                >
                  {publishing ? "라이브 시작 중…" : "라이브 시작"}
                </button>
              )}
              {isLive && (
                <a
                  href={`/live/${pageId}`}
                  className="rounded-full bg-white px-4 py-2 text-sm font-medium hover:bg-[#e5e5e5]"
                  style={{ color: "#111111" }}
                >
                  라이브 보기
                </a>
              )}
              <button
                type="button"
                onClick={() => toggleDeploy(!isDeployed)}
                disabled={deploying}
                className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-60"
              >
                {deploying ? "배포 처리 중…" : isDeployed ? "배포 해제" : "배포"}
              </button>
              {isDeployed && (
                <a
                  href={`/p/${pageId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-sm font-medium hover:bg-emerald-500/20"
                  style={{ color: "rgb(52 211 153)" }}
                >
                  배포 URL
                </a>
              )}
              <a
                href={`/editor/advanced?pageId=${pageId}`}
                className="rounded-full border border-white/20 bg-white/5 px-4 py-2 text-sm font-medium text-white hover:bg-white/10"
              >
                수정
              </a>
              {stats?.replay_enabled && (
                <a
                  href={`/replay/${pageId}`}
                  className="rounded-full border border-white/20 bg-white/5 px-4 py-2 text-sm font-medium text-white hover:bg-white/10"
                >
                  리플레이
                </a>
              )}
            </div>
            {(publishMessage || deployMessage) && (
              <div className="w-full text-xs text-[#a3a3a3]">
                {publishMessage && <p>{publishMessage}</p>}
                {deployMessage && <p>{deployMessage}</p>}
              </div>
            )}
          </div>
        </header>

        {/* Report template §31.7 + Period + Export */}
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex gap-1 rounded-full bg-white/5 p-1">
              {(["overview", "conversion", "churn"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setReportTemplate(t)}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                    reportTemplate === t ? "bg-white text-black" : "text-white/90 hover:text-white"
                  }`}
                >
                  {t === "overview" ? "종합" : t === "conversion" ? "전환" : "이탈"}
                </button>
              ))}
            </div>
            <div className="flex gap-1 rounded-full bg-white/5 p-1">
            {(["today", "7d", "30d"] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPeriod(p)}
                className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                  period === p ? "bg-white text-black" : "text-white/90 hover:text-white"
                }`}
              >
                {p === "today" ? "오늘" : p === "7d" ? "7일" : "30일"}
              </button>
            ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={downloadCsv}
              disabled={exporting}
              className="rounded-full border border-white/20 bg-white/5 px-4 py-2 text-sm font-medium text-white hover:bg-white/10 disabled:opacity-50"
            >
              {exporting ? "내보내는 중…" : "CSV 내보내기"}
            </button>
            <button
              type="button"
              onClick={downloadEventsCsv}
              disabled={exportingEvents}
              className="rounded-full border border-white/20 bg-white/5 px-4 py-2 text-sm font-medium text-white hover:bg-white/10 disabled:opacity-50"
            >
              {exportingEvents ? "내보내는 중…" : "이벤트 로그 내보내기"}
            </button>
            <button
              type="button"
              onClick={downloadSnapshot}
              className="rounded-full border border-white/20 bg-white/5 px-4 py-2 text-sm font-medium text-white hover:bg-white/10"
            >
              스냅샷 다운로드
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="rounded-full border border-white/20 bg-white/5 px-4 py-2 text-sm font-medium text-white hover:bg-white/10"
            >
              인쇄/PDF
            </button>
            <button
              type="button"
              onClick={async () => {
                const url = typeof window !== "undefined" ? window.location.href : "";
                if (url && navigator.clipboard?.writeText) {
                  try {
                    await navigator.clipboard.writeText(url);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  } catch {
                    /* ignore */
                  }
                }
              }}
              className="rounded-full border border-white/20 bg-white/5 px-4 py-2 text-sm font-medium text-white hover:bg-white/10"
            >
              {copied ? "복사됨" : "공유 링크 복사"}
            </button>
          </div>
        </div>

        {/* §31.7 리포트 빌더: 카드/차트/표/퍼널/히트맵/리플레이 링크 등 구성 */}
        <ReportBuilderPanel
          open={reportBuilderOpen}
          blockIds={REPORT_BLOCK_IDS}
          labels={REPORT_BLOCK_LABELS}
          selected={reportBuilderSelected}
          onToggle={() => setReportBuilderOpen((o) => !o)}
          onSelectedChange={(next) => setReportBuilderSelected(next)}
          onApply={saveReportLayout}
          onReset={() => {
            setReportBuilderSelected(new Set(REPORT_BLOCK_IDS));
            setReportLayout(null);
            if (typeof window !== "undefined" && pageId) {
              localStorage.removeItem(`dashboard-report-layout-${pageId}`);
            }
          }}
        />

        {/* Summary cards (템플릿에 따라 강조) */}
        {showBlock("summary") && (
        <section className="mb-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            label="방문"
            value={summary?.visits ?? p.total_visits}
            sub={period === "7d" ? "최근 7일" : period === "30d" ? "최근 30일" : undefined}
          />
          <MetricCard
            label="클릭"
            value={summary?.clicks ?? p.total_clicks}
            sub={period === "7d" ? "최근 7일" : period === "30d" ? "최근 30일" : undefined}
          />
          <MetricCard
            label="평균 체류"
            value={`${Math.round((summary?.avg_duration_ms ?? p.avg_duration_ms) / 1000)}초`}
          />
          <MetricCard
            label="이탈률"
            value={`${Math.round((summary?.bounce_rate ?? p.bounce_rate ?? 0) * 100)}%`}
          />
        </section>
        )}

        {/* 기간 비교 §31.5 A/B Diff */}
        {showBlock("compare") && compare && period !== "today" && (
          <section className="mb-10 rounded-2xl border border-white/10 bg-white/[0.02] p-6 print:break-inside-avoid">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-[#737373]">기간 비교</h2>
            <p className="mt-1 text-[11px] text-[#525252]">
              이번 {compare.period === "7d" ? "7일" : "30일"} vs 이전 {compare.period === "7d" ? "7일" : "30일"}
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
                <p className="text-[10px] text-[#737373]">방문</p>
                <p className="mt-1 text-lg font-semibold tabular-nums">{compare.current.visits}</p>
                <p className={`text-xs ${compare.diff.visits_pct >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  전 기간 대비 {compare.diff.visits_pct >= 0 ? "+" : ""}{compare.diff.visits_pct}%
                </p>
              </div>
              <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
                <p className="text-[10px] text-[#737373]">클릭</p>
                <p className="mt-1 text-lg font-semibold tabular-nums">{compare.current.clicks}</p>
                <p className={`text-xs ${compare.diff.clicks_pct >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  전 기간 대비 {compare.diff.clicks_pct >= 0 ? "+" : ""}{compare.diff.clicks_pct}%
                </p>
              </div>
              <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
                <p className="text-[10px] text-[#737373]">평균 체류</p>
                <p className="mt-1 text-lg font-semibold tabular-nums">{Math.round(compare.current.avg_duration_ms / 1000)}초</p>
                <p className={`text-xs ${compare.diff.avg_duration_pct >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  전 기간 대비 {compare.diff.avg_duration_pct >= 0 ? "+" : ""}{compare.diff.avg_duration_pct}%
                </p>
              </div>
              <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
                <p className="text-[10px] text-[#737373]">이탈률</p>
                <p className="mt-1 text-lg font-semibold tabular-nums">{Math.round(compare.current.bounce_rate * 100)}%</p>
                <p className={`text-xs ${compare.diff.bounce_rate_pct <= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  전 기간 대비 {compare.diff.bounce_rate_pct >= 0 ? "+" : ""}{compare.diff.bounce_rate_pct}% (낮을수록 좋음)
                </p>
              </div>
            </div>
          </section>
        )}

        {/* Funnel §31.5 */}
        {showBlock("funnel") && funnel && funnel.steps.some((s) => s.count > 0) && (
          <section className="mb-10 rounded-2xl border border-white/10 bg-white/[0.02] p-6">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-[#737373]">퍼널</h2>
            <p className="mt-1 text-[11px] text-[#525252]">진입 → 스크롤 → 클릭 단계별 세션 수·전환률</p>
            <div className="mt-4 flex flex-wrap items-end gap-3 sm:gap-4">
              {funnel.steps.map((step, i) => {
                const maxStep = Math.max(1, ...funnel.steps.map((s) => s.count));
                const pct = (step.count / maxStep) * 100;
                const prevCount = i > 0 ? funnel.steps[i - 1].count : step.count;
                const conversion = prevCount > 0 ? Math.round((step.count / prevCount) * 100) : 100;
                return (
                  <div key={step.name} className="flex items-end gap-2 sm:gap-3">
                    {i > 0 && <span className="hidden text-[#525252] sm:inline">→</span>}
                    <div className="flex flex-col items-center gap-1">
                      <div className="flex h-16 w-12 flex-col justify-end rounded-lg border border-white/10 bg-white/5 p-1 sm:h-20 sm:w-16">
                        <div
                          className="w-full rounded bg-emerald-500/60 transition hover:bg-emerald-500/80"
                          style={{ height: `${Math.max(4, pct)}%` }}
                        />
                      </div>
                      <span className="text-xs font-medium text-white/90">{step.name}</span>
                      <span className="text-base font-semibold tabular-nums text-white sm:text-lg">{step.count}</span>
                      {i > 0 && (
                        <span className="text-[10px] text-[#737373]" title="전 단계 대비 전환률">
                          {conversion}%
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Daily trend */}
        {showBlock("daily") && daily.length > 0 && (
          <section className="mb-10 rounded-2xl border border-white/10 bg-white/[0.02] p-6">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-[#737373]">
              방문 추이
            </h2>
            <div className="mt-6 flex items-end gap-1 sm:gap-2">
              {daily.map((d) => (
                <div
                  key={d.date}
                  className="flex flex-1 flex-col items-center gap-1"
                  title={`${d.date}: 방문 ${d.visits}, 클릭 ${d.clicks}`}
                >
                  <div
                    className="w-full min-w-[4px] rounded-t bg-white/20 transition hover:bg-white/30"
                    style={{ height: `${Math.max(4, (d.visits / maxVisits) * 80)}px` }}
                  />
                  <span className="hidden text-[10px] text-[#525252] sm:block">
                    {d.date.slice(5).replace("-", "/")}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Realtime */}
        {stats && (
          <section className="mb-10 rounded-2xl border border-white/10 bg-white/[0.02] p-6">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-[#737373]">
              실시간
            </h2>
            <div className="mt-4 grid gap-6 sm:grid-cols-3">
              <div>
                <p className="text-[11px] text-[#525252]">최근 10초 클릭</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">{stats.clicks_10s}</p>
              </div>
              <div>
                <p className="text-[11px] text-[#525252]">최근 60초 방문</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">{stats.visits_60s}</p>
              </div>
              <div>
                <p className="text-[11px] text-[#525252]">평균 체류(초)</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">{stats.avg_dwell_s}</p>
              </div>
            </div>
          </section>
        )}

        {/* 뷰포트별 방문 §31.6 */}
        {showBlock("viewport") && byViewport && byViewport.some((d) => d.visits > 0) && (
          <section className="mb-10 rounded-2xl border border-white/10 bg-white/[0.02] p-6 print:break-inside-avoid">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-[#737373]">뷰포트별 방문</h2>
            <p className="mt-1 text-[11px] text-[#525252]">enter 이벤트 기준 (모바일/태블릿/데스크톱)</p>
            <div className="mt-4 flex flex-wrap gap-4">
              {byViewport.map((d) => (
                <div key={d.name} className="rounded-xl border border-white/10 bg-white/5 px-4 py-2">
                  <span className="text-xs text-[#a3a3a3]">{d.name}</span>
                  <span className="ml-2 text-lg font-semibold tabular-nums text-white">{d.visits}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 브라우저/OS §31.6 */}
        {showBlock("browser") && (byBrowser?.length || byOS?.length) ? (
          <section className="mb-10 rounded-2xl border border-white/10 bg-white/[0.02] p-6 print:break-inside-avoid">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-[#737373]">브라우저 · OS</h2>
            <p className="mt-1 text-[11px] text-[#525252]">enter 이벤트 UA 기준</p>
            <div className="mt-4 flex flex-wrap gap-6">
              {byBrowser && byBrowser.length > 0 && (
                <div>
                  <p className="mb-2 text-[11px] text-[#737373]">브라우저</p>
                  <div className="flex flex-wrap gap-2">
                    {byBrowser.map((d) => (
                      <span key={d.name} className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs">
                        <span className="text-[#a3a3a3]">{d.name}</span>
                        <span className="ml-1 font-semibold text-white">{d.visits}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {byOS && byOS.length > 0 && (
                <div>
                  <p className="mb-2 text-[11px] text-[#737373]">운영체제</p>
                  <div className="flex flex-wrap gap-2">
                    {byOS.map((d) => (
                      <span key={d.name} className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs">
                        <span className="text-[#a3a3a3]">{d.name}</span>
                        <span className="ml-1 font-semibold text-white">{d.visits}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>
        ) : null}

        {/* 영역/요소 단위 집계 §31.4 */}
        {showBlock("element") && byElement && byElement.some((d) => d.clicks > 0) && (
          <section className="mb-10 rounded-2xl border border-white/10 bg-white/[0.02] p-6 print:break-inside-avoid">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-[#737373]">요소별 클릭</h2>
            <p className="mt-1 text-[11px] text-[#525252]">element_id 기준 (최대 20개)</p>
            <ul className="mt-4 flex flex-col gap-2">
              {byElement.slice(0, 20).map((d, i) => (
                <li key={d.element_id ?? "none-" + i} className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                  <code className="max-w-[70%] truncate text-xs text-[#a3a3a3]">{d.element_id ?? "(영역 없음)"}</code>
                  <span className="tabular-nums font-semibold text-white">{d.clicks}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* 요일별 방문 §31.6 */}
        {showBlock("weekday") && byWeekday && byWeekday.some((d) => d.visits > 0) && (
          <section className="mb-10 rounded-2xl border border-white/10 bg-white/[0.02] p-6 print:break-inside-avoid">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-[#737373]">요일별 방문</h2>
            <div className="mt-4 flex items-end gap-1 sm:gap-2">
              {byWeekday.map((d) => {
                const maxV = Math.max(1, ...byWeekday.map((x) => x.visits));
                return (
                  <div key={d.dow} className="flex flex-1 flex-col items-center gap-1" title={`${d.day_name}요일: ${d.visits}회`}>
                    <div
                      className="w-full min-w-[8px] rounded-t bg-white/20"
                      style={{ height: `${Math.max(4, (d.visits / maxV) * 60)}px` }}
                    />
                    <span className="text-[10px] text-[#525252]">{d.day_name}</span>
                    <span className="text-xs font-medium tabular-nums text-white/80">{d.visits}</span>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Data health §31.10 */}
        {showBlock("health") && health && (
          <section className="mb-10 rounded-2xl border border-white/10 bg-white/[0.02] p-6">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-[#737373]">
              데이터 상태
            </h2>
            <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
              <span className="text-[#a3a3a3]">
                마지막 이벤트:{" "}
                {health.last_event_at
                  ? new Date(health.last_event_at).toLocaleString("ko-KR", {
                      month: "numeric",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "없음"}
              </span>
              <span className="text-[#a3a3a3]">
                오늘 방문 {health.visits_today} · 어제 {health.visits_yesterday}
              </span>
              {health.gaps && health.gaps.length > 0 && (
                <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-[#a3a3a3]">
                  수집 공백 {health.gaps.length}일
                </span>
              )}
              {health.drop_warning && (
                <>
                  <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-400">
                    전일 대비 급감
                  </span>
                  <button
                    type="button"
                    disabled={healthNotifying || !discordWebhookUrl.trim()}
                    onClick={() => {
                      setHealthNotifying(true);
                      fetch(`/api/pages/${pageId}/alerts/notify`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        credentials: "include",
                        body: JSON.stringify({ type: "drop_warning" }),
                      })
                        .then((r) => r.json())
                        .then(() => setHealthNotifying(false))
                        .catch(() => setHealthNotifying(false));
                    }}
                    className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-xs font-medium text-amber-400 hover:bg-amber-500/20 disabled:opacity-50"
                  >
                    {healthNotifying ? "전송 중…" : "Discord로 알림"}
                  </button>
                </>
              )}
            </div>
          </section>
        )}

        {/* Heatmap: click / scroll depth */}
        {showBlock("heatmap") && heatmap && (heatmapType === "scroll" ? (heatmap.scrollBuckets?.some((c) => c > 0)) : heatmap.grid?.some((row) => row.some((c) => c > 0))) && (
          <section className="mb-10 rounded-2xl border border-white/10 bg-white/[0.02] p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-[#737373]">
                히트맵
              </h2>
              <div className="flex gap-1 rounded-full bg-white/5 p-1">
                <button
                  type="button"
                  onClick={() => setHeatmapType("click")}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${heatmapType === "click" ? "bg-white text-black" : "text-white/90 hover:text-white"}`}
                >
                  클릭
                </button>
                <button
                  type="button"
                  onClick={() => setHeatmapType("scroll")}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${heatmapType === "scroll" ? "bg-white text-black" : "text-white/90 hover:text-white"}`}
                >
                  스크롤
                </button>
                <button
                  type="button"
                  onClick={() => setHeatmapType("move")}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${heatmapType === "move" ? "bg-white text-black" : "text-white/90 hover:text-white"}`}
                >
                  무브
                </button>
              </div>
            </div>
            <p className="mt-1 text-[11px] text-[#525252]">
              {heatmapType === "click"
                ? "클릭 위치 분포 (정규화 좌표)"
                : heatmapType === "scroll"
                  ? "스크롤 깊이(0~100%) 구간별 이벤트 수"
                  : "커서 이동 위치 분포"}
            </p>
            {/* §31.4 실제 화면 위 오버레이: 페이지 비율 박스 위에 히트맵 그리드 오버레이 */}
            <div className="mt-4 flex justify-center">
              {heatmapType === "scroll" && heatmap.scrollBuckets ? (
                <ScrollDepthBars buckets={heatmap.scrollBuckets} size={heatmap.size} />
              ) : (heatmapType === "click" || heatmapType === "move") && heatmap.grid ? (
                <div className="relative w-full max-w-md" style={{ aspectRatio: "16/10" }}>
                  <div className="absolute inset-0 rounded-lg border border-white/10 bg-white/[0.03]" aria-hidden />
                  <div className="absolute inset-0 flex items-center justify-center p-2">
                    <HeatmapGrid grid={heatmap.grid} size={heatmap.size} />
                  </div>
                </div>
              ) : null}
            </div>
          </section>
        )}

        {/* Recent sessions §31.2 기간 필터 */}
        {showBlock("sessions") && sessions !== null && (
          <section className="mb-10 rounded-2xl border border-white/10 bg-white/[0.02] p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-[#737373]">
                최근 방문
              </h2>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="date"
                  value={sessionFrom}
                  onChange={(e) => setSessionFrom(e.target.value)}
                  className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-white"
                />
                <span className="text-[#525252]">~</span>
                <input
                  type="date"
                  value={sessionTo}
                  onChange={(e) => setSessionTo(e.target.value)}
                  className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-white"
                />
                <button
                  type="button"
                  onClick={() => {
                    setAppliedSessionFrom(sessionFrom);
                    setAppliedSessionTo(sessionTo);
                  }}
                  className="rounded-full border border-white/20 bg-white/5 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/10"
                >
                  조회
                </button>
              </div>
            </div>
            {stats?.replay_enabled && (
              <a
                href={`/replay/${pageId}`}
                className="mt-2 inline-block text-xs font-medium text-white/80 hover:text-white"
              >
                리플레이 보기 →
              </a>
            )}
            <ul className="mt-4 space-y-2">
              {sessions.length === 0 ? (
                <li className="rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3 text-center text-sm text-[#737373]">
                  해당 기간 방문 없음
                </li>
              ) : (
                sessions.map((s) => (
                  <li
                    key={s.id}
                    className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3"
                  >
                    <span className="text-sm text-white/90">
                      {new Date(s.started_at).toLocaleString("ko-KR", {
                        month: "numeric",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    <span className="text-xs text-[#737373]">
                      {s.duration_ms != null ? `${Math.round(s.duration_ms / 1000)}초` : "진행 중"}
                    </span>
                  </li>
                ))
              )}
            </ul>
          </section>
        )}

        {/* Spikes (Pro) §31.7·31.8 이상 징후·Discord 알림 */}
        {showBlock("spikes") && spikes && spikes.length > 0 && (
          <section className="mb-10 rounded-2xl border border-white/10 bg-white/[0.02] p-6">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-[#737373]">
              이상 구간 (급등락 Top N)
            </h2>
            <p className="mt-1 text-[11px] text-[#525252]">클릭·이탈 급증 구간. Discord 알림 보내기 가능.</p>
            <ul className="mt-4 space-y-2">
              {spikes.slice(0, 5).map((s, i) => {
                const spikeId = `${s.start}-${i}`;
                return (
                  <li
                    key={spikeId}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3"
                  >
                    <span className="text-sm text-white/90">
                      {new Date(s.start).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}
                      {" – "}
                      {new Date(s.end).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                    <span className="text-xs text-[#737373]">
                      클릭 {s.clicks} · 이탈 {s.leaves}
                    </span>
                    <button
                      type="button"
                      disabled={!!spikeNotifyingId || !discordWebhookUrl.trim()}
                      onClick={() => {
                        setSpikeNotifyingId(spikeId);
                        fetch(`/api/pages/${pageId}/alerts/notify`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          credentials: "include",
                          body: JSON.stringify({
                            type: "spike",
                            start: s.start,
                            end: s.end,
                            clicks: s.clicks,
                            leaves: s.leaves,
                          }),
                        })
                          .then(() => setSpikeNotifyingId(null))
                          .catch(() => setSpikeNotifyingId(null));
                      }}
                      className="rounded-full border border-white/20 bg-white/5 px-2 py-1 text-xs font-medium text-white hover:bg-white/10 disabled:opacity-50"
                    >
                      {spikeNotifyingId === spikeId ? "전송 중…" : "Discord 알림"}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {/* §31.6 세그먼트: 생성/저장/공유·조건 빌더(AND/OR/NOT) */}
        {showBlock("segments") && (
        <section className="mb-10 rounded-2xl border border-white/10 bg-white/[0.02] p-6 dashboard-dark-select">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-[#737373]">세그먼트</h2>
          <p className="mt-1 text-[11px] text-[#525252]">조건(AND/OR)으로 세그먼트를 만들고 저장·공유할 수 있습니다.</p>
          <div className="mt-4 flex flex-col gap-3 rounded-xl border border-white/10 bg-white/5 p-4">
            <input
              type="text"
              value={segmentName}
              onChange={(e) => setSegmentName(e.target.value)}
              placeholder="세그먼트 이름"
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-[#525252]"
            />
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-[#737373]">조건 결합:</span>
              <select
                value={segmentOp}
                onChange={(e) => setSegmentOp(e.target.value as "and" | "or")}
                className="rounded border border-white/20 bg-white/10 px-2 py-1 text-xs text-white"
                style={{ colorScheme: "light" }}
              >
                <option value="and">AND</option>
                <option value="or">OR</option>
              </select>
            </div>
            <div className="flex flex-col gap-2">
              {segmentRules.map((r, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2">
                  <select
                    value={r.type}
                    onChange={(e) =>
                      setSegmentRules((prev) => prev.map((x, j) => (j === i ? { ...x, type: e.target.value } : x)))
                    }
                    className="rounded border border-white/20 bg-white/10 px-2 py-1 text-xs text-white"
                    style={{ colorScheme: "light" }}
                  >
                    <option value="event_type">이벤트 타입</option>
                    <option value="duration_gte_ms">체류 시간 이상(ms)</option>
                  </select>
                  <input
                    type="text"
                    value={r.value}
                    onChange={(e) => setSegmentRules((prev) => prev.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))}
                    placeholder={r.type === "event_type" ? "click, scroll, enter..." : "30000"}
                    className="w-32 rounded border border-white/10 bg-white/5 px-2 py-1 text-xs text-white"
                  />
                  <button
                    type="button"
                    onClick={() => setSegmentRules((prev) => prev.filter((_, j) => j !== i))}
                    className="text-[11px] text-[#737373] hover:text-white"
                  >
                    삭제
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setSegmentRules((prev) => [...prev, { type: "event_type", value: "click" }])}
                className="self-start rounded border border-white/20 px-2 py-1 text-[11px] text-white/80 hover:bg-white/10"
              >
                + 조건 추가
              </button>
            </div>
            <button
              type="button"
              disabled={segmentSaving || !segmentName.trim()}
              onClick={() => {
                setSegmentSaving(true);
                const rules = segmentRules.map((r) => ({
                  type: r.type,
                  value: r.type === "duration_gte_ms" ? parseInt(r.value, 10) || 0 : r.value,
                }));
                fetch(`/api/pages/${pageId}/segments`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  credentials: "include",
                  body: JSON.stringify({ name: segmentName.trim(), conditions: { op: segmentOp, rules } }),
                })
                  .then((res) => res.json())
                  .then((body) => {
                    if (body?.segment) {
                      setSegmentName("");
                      setSegmentRules([{ type: "event_type", value: "click" }]);
                      fetchSegments();
                    }
                  })
                  .finally(() => setSegmentSaving(false));
              }}
              className="rounded-lg border border-white/20 bg-white/5 px-4 py-2 text-sm font-medium text-white hover:bg-white/10 disabled:opacity-50"
            >
              {segmentSaving ? "저장 중…" : "세그먼트 저장"}
            </button>
          </div>
          {segments && segments.length > 0 && (
            <ul className="mt-4 space-y-2">
              {segments.map((seg) => (
                <li
                  key={seg.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2"
                >
                  <span className="font-medium text-white">{seg.name}</span>
                  <span className="text-[11px] text-[#737373]">
                    {seg.conditions?.op?.toUpperCase()} · {Array.isArray(seg.conditions?.rules) ? seg.conditions.rules.length : 0}개 조건
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const def = JSON.stringify({ name: seg.name, conditions: seg.conditions });
                        navigator.clipboard?.writeText(def).then(() => setCopied(true));
                        setTimeout(() => setCopied(false), 2000);
                      }}
                      className="rounded border border-white/20 px-2 py-1 text-[11px] text-white/90 hover:bg-white/10"
                    >
                      공유(복사)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!confirm(`"${seg.name}" 세그먼트를 삭제할까요?`)) return;
                        fetch(`/api/pages/${pageId}/segments/${seg.id}`, { method: "DELETE", credentials: "include" }).then(() =>
                          fetchSegments()
                        );
                      }}
                      className="rounded border border-red-500/30 px-2 py-1 text-[11px] text-red-400 hover:bg-red-500/10"
                    >
                      삭제
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
        )}

        {/* Discord 알림 (§31.8) */}
        {showBlock("discord") && (
        <section className="mb-10 rounded-2xl border border-white/10 bg-white/[0.02] p-6">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-[#737373]">
            Discord 알림
          </h2>
          <p className="mt-1 text-[11px] text-[#525252]">
            웹훅 URL을 설정하면 알림을 Discord 채널로 받을 수 있습니다.
          </p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
            <input
              type="url"
              value={discordWebhookUrl}
              onChange={(e) => setDiscordWebhookUrl(e.target.value)}
              placeholder="https://discord.com/api/webhooks/... 또는 discordapp.com"
              className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder:text-[#525252] focus:border-white/20 focus:outline-none"
              aria-label="Discord 웹훅 URL"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={saveDiscordWebhook}
                disabled={discordSaving}
                className="rounded-xl border border-white/20 bg-white/5 px-4 py-2.5 text-sm font-medium text-white hover:bg-white/10 disabled:opacity-50"
              >
                {discordSaving ? "저장 중…" : "저장"}
              </button>
              <button
                type="button"
                onClick={sendDiscordTest}
                disabled={!discordWebhookUrl.trim()}
                className="rounded-xl border border-white/20 bg-white/5 px-4 py-2.5 text-sm font-medium text-white hover:bg-white/10 disabled:opacity-50"
              >
                테스트 전송
              </button>
            </div>
          </div>
          <div className="mt-4 flex flex-col gap-2 border-t border-white/10 pt-4">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={scheduledReportEnabled}
                onChange={(e) => setScheduledReportEnabled(e.target.checked)}
                className="rounded border-white/20"
              />
              <span>매일 일일 요약 리포트 전송 (Cron 호출 시 Discord로 전송)</span>
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={autoDropAlert}
                onChange={(e) => setAutoDropAlert(e.target.checked)}
                className="rounded border-white/20"
              />
              <span>전일 대비 급감 시 자동 알림 (Cron 호출 시 검사 후 Discord 전송)</span>
            </label>
          </div>
          {discordTestResult && (
            <p className="mt-2 text-xs text-[#a3a3a3]">{discordTestResult}</p>
          )}
        </section>
        )}

        {/* App secrets */}
        <section className="mb-10 rounded-2xl border border-white/10 bg-white/[0.02] p-6">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-[#737373]">앱 시크릿</h2>
          <p className="mt-1 text-[11px] text-[#525252]">
            외부 API 키/시크릿을 저장합니다. 값은 저장 후 다시 표시되지 않습니다.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs text-[#a3a3a3]">
              키
              <input
                type="text"
                value={secretKey}
                onChange={(e) => setSecretKey(e.target.value.toUpperCase())}
                placeholder="API_KEY"
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder:text-[#525252] focus:border-white/20 focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-[#a3a3a3]">
              값
              <input
                type="password"
                value={secretValue}
                onChange={(e) => setSecretValue(e.target.value)}
                placeholder="••••••••"
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder:text-[#525252] focus:border-white/20 focus:outline-none"
              />
            </label>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={saveSecret}
              disabled={secretSaving}
              className="rounded-xl border border-white/20 bg-white/5 px-4 py-2.5 text-sm font-medium text-white hover:bg-white/10 disabled:opacity-50"
            >
              {secretSaving ? "저장 중…" : "시크릿 저장"}
            </button>
          </div>
          {secretMessage && (
            <p className="mt-2 text-xs text-[#a3a3a3]">{secretMessage}</p>
          )}
          <div className="mt-4 border-t border-white/10 pt-4">
            <p className="text-xs text-[#737373]">저장된 키</p>
            <ul className="mt-2 space-y-2">
              {(secrets ?? []).length === 0 ? (
                <li className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-[#737373]">
                  저장된 시크릿이 없습니다.
                </li>
              ) : (
                (secrets ?? []).map((s) => (
                  <li
                    key={s.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2"
                  >
                    <span className="text-sm text-white/90">{s.key}</span>
                    <button
                      type="button"
                      onClick={() => deleteSecret(s.key)}
                      className="rounded border border-red-500/30 px-2 py-1 text-[11px] text-red-400 hover:bg-red-500/10"
                    >
                      삭제
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>
        </section>

        {/* App users */}
        <section className="mb-10 rounded-2xl border border-white/10 bg-white/[0.02] p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-widest text-[#737373]">앱 사용자</h2>
              <p className="mt-1 text-[11px] text-[#525252]">
                앱 사용자 목록과 권한(role)을 관리합니다.
              </p>
            </div>
            <button
              type="button"
              onClick={fetchAppUsers}
              className="rounded-full border border-white/20 bg-white/5 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/10"
            >
              새로고침
            </button>
          </div>
          {appUsersLoading && (
            <p className="mt-3 text-xs text-[#a3a3a3]">앱 사용자 목록을 불러오는 중입니다.</p>
          )}
          {appUsersMessage && (
            <p className="mt-3 text-xs text-[#a3a3a3]">{appUsersMessage}</p>
          )}
          <div className="mt-4 space-y-2">
            {(appUsers ?? []).length === 0 ? (
              <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-[#737373]">
                앱 사용자 목록이 없습니다.
              </div>
            ) : (
              (appUsers ?? []).map((u) => (
                <div
                  key={u.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2"
                >
                  <div className="min-w-[180px]">
                    <p className="text-sm text-white/90">{u.display_name || u.email || u.id.slice(0, 8)}</p>
                    <p className="text-[11px] text-[#737373]">{u.email || "이메일 없음"}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={appUserRoles[u.id] ?? u.role}
                      onChange={(e) => setAppUserRoles((prev) => ({ ...prev, [u.id]: e.target.value }))}
                      className="w-28 rounded border border-white/20 bg-white/10 px-2 py-1 text-xs text-white"
                    />
                    <button
                      type="button"
                      onClick={() => saveAppUserRole(u.id)}
                      disabled={appUsersSaving[u.id]}
                      className="rounded border border-white/20 px-2 py-1 text-[11px] text-white/90 hover:bg-white/10 disabled:opacity-50"
                    >
                      {appUsersSaving[u.id] ? "저장 중…" : "권한 저장"}
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteAppUser(u.id)}
                      className="rounded border border-red-500/30 px-2 py-1 text-[11px] text-red-400 hover:bg-red-500/10"
                    >
                      삭제
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Hosting settings */}
        <section className="mb-10 rounded-2xl border border-white/10 bg-white/[0.02] p-6">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-[#737373]">호스팅 설정</h2>
          <p className="mt-1 text-[11px] text-[#525252]">
            커스텀 도메인과 HTTPS/WWW 리디렉션 정책을 저장합니다. DNS TXT 인증은 지원하며, SSL 자동 발급/배포 자동화는 별도 구현이 필요합니다.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs text-[#a3a3a3] sm:col-span-2">
              커스텀 도메인
              <input
                type="text"
                value={hostingSettings.customDomain ?? ""}
                onChange={(e) => setHostingSettings((prev) => ({ ...prev, customDomain: e.target.value }))}
                placeholder="example.com"
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder:text-[#525252] focus:border-white/20 focus:outline-none"
              />
            </label>
            <label className="flex items-center gap-2 text-xs text-[#a3a3a3]">
              <input
                type="checkbox"
                checked={Boolean(hostingSettings.forceHttps)}
                onChange={(e) => setHostingSettings((prev) => ({ ...prev, forceHttps: e.target.checked }))}
                className="rounded border-white/20"
              />
              HTTPS 강제
            </label>
            <label className="flex items-center gap-2 text-xs text-[#a3a3a3]">
              <input
                type="checkbox"
                checked={Boolean(hostingSettings.redirectWww)}
                onChange={(e) => setHostingSettings((prev) => ({ ...prev, redirectWww: e.target.checked }))}
                className="rounded border-white/20"
              />
              WWW 리디렉션
            </label>
            <label className="flex flex-col gap-1 text-xs text-[#a3a3a3] sm:col-span-2">
              메모
              <textarea
                rows={2}
                value={hostingSettings.notes ?? ""}
                onChange={(e) => setHostingSettings((prev) => ({ ...prev, notes: e.target.value }))}
                placeholder="도메인 연결 메모"
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder:text-[#525252] focus:border-white/20 focus:outline-none"
              />
            </label>
          </div>
          <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold text-[#a3a3a3]">도메인 인증 (DNS TXT)</p>
              <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-[#a3a3a3]">
                {verificationStatusLabel(hostingSettings.verification?.status)}
              </span>
            </div>
            <p className="mt-1 text-[11px] text-[#525252]">
              커스텀 도메인에 TXT 레코드를 추가한 뒤 인증을 확인합니다.
            </p>
            {hostingSettings.customDomain ? (
              <>
                {hostingSettings.verification?.record_name && hostingSettings.verification?.record_value ? (
                  <div className="mt-3 grid gap-2 text-[11px] text-[#a3a3a3]">
                    <div className="flex flex-wrap items-center gap-2">
                      <span>TXT 이름</span>
                      <code className="rounded-lg bg-white/5 px-2 py-1 text-[11px] text-[#a3a3a3]">
                        {hostingSettings.verification.record_name}
                      </code>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span>TXT 값</span>
                      <code className="rounded-lg bg-white/5 px-2 py-1 text-[11px] text-[#a3a3a3]">
                        {hostingSettings.verification.record_value}
                      </code>
                    </div>
                  </div>
                ) : (
                  <p className="mt-3 text-[11px] text-[#737373]">인증 토큰을 발급해 주세요.</p>
                )}
              </>
            ) : (
              <p className="mt-3 text-[11px] text-[#737373]">커스텀 도메인을 먼저 입력해 주세요.</p>
            )}
            {hostingSettings.verification?.last_error ? (
              <p className="mt-2 text-[11px] text-[#fca5a5]">
                마지막 오류: {hostingSettings.verification.last_error}
              </p>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={issueHostingVerification}
                disabled={hostingVerifyLoading}
                className="rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-xs font-medium text-white hover:bg-white/10 disabled:opacity-50"
              >
                {hostingVerifyLoading ? "처리 중…" : "인증 토큰 발급"}
              </button>
              <button
                type="button"
                onClick={checkHostingVerification}
                disabled={hostingVerifyLoading || !hostingSettings.verification?.record_name}
                className="rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-xs font-medium text-white hover:bg-white/10 disabled:opacity-50"
              >
                인증 확인
              </button>
            </div>
            {hostingVerifyMessage ? (
              <p className="mt-2 text-[11px] text-[#a3a3a3]">{hostingVerifyMessage}</p>
            ) : null}
          </div>
          <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold text-[#a3a3a3]">도메인 상태 점검</p>
              <button
                type="button"
                onClick={fetchHostingStatus}
                disabled={hostingStatusLoading}
                className="rounded-xl border border-white/20 bg-white/5 px-3 py-1.5 text-[11px] font-medium text-white hover:bg-white/10 disabled:opacity-50"
              >
                {hostingStatusLoading ? "확인 중…" : "상태 확인"}
              </button>
            </div>
            <p className="mt-1 text-[11px] text-[#525252]">
              DNS A/AAAA/CNAME과 SSL 인증서 상태를 점검합니다. 기대 대상이 설정돼 있다면 일치 여부가 표시됩니다.
            </p>
            {hostingStatus ? (
              <div className="mt-3 grid gap-2 text-[11px] text-[#a3a3a3]">
                <div className="flex flex-wrap items-center gap-2">
                  <span>TXT 인증</span>
                  <span>{matchLabel(hostingStatus.dns?.verification?.matched)}</span>
                  {hostingStatus.dns?.verification?.records?.length ? (
                    <code className="rounded-lg bg-white/5 px-2 py-1 text-[11px] text-[#a3a3a3]">
                      {(hostingStatus.dns?.verification?.records ?? []).join(", ").slice(0, 200)}
                    </code>
                  ) : (
                    <span>레코드 없음</span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span>A 레코드</span>
                  <span>{matchLabel(hostingStatus.dns?.a?.matched)}</span>
                  <code className="rounded-lg bg-white/5 px-2 py-1 text-[11px] text-[#a3a3a3]">
                    {(hostingStatus.dns?.a?.records ?? []).join(", ") || "없음"}
                  </code>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span>AAAA 레코드</span>
                  <span>{matchLabel(hostingStatus.dns?.aaaa?.matched)}</span>
                  <code className="rounded-lg bg-white/5 px-2 py-1 text-[11px] text-[#a3a3a3]">
                    {(hostingStatus.dns?.aaaa?.records ?? []).join(", ") || "없음"}
                  </code>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span>CNAME</span>
                  <span>{matchLabel(hostingStatus.dns?.cname?.matched)}</span>
                  <code className="rounded-lg bg-white/5 px-2 py-1 text-[11px] text-[#a3a3a3]">
                    {(hostingStatus.dns?.cname?.records ?? []).join(", ") || "없음"}
                  </code>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span>SSL</span>
                  <span>{sslStatusLabel(hostingStatus.ssl?.status)}</span>
                  {hostingStatus.ssl?.valid_to ? (
                    <span>만료 {hostingStatus.ssl.valid_to}</span>
                  ) : null}
                  {typeof hostingStatus.ssl?.days_remaining === "number" ? (
                    <span>D-{hostingStatus.ssl.days_remaining}</span>
                  ) : null}
                </div>
                {hostingStatus.ssl?.error ? (
                  <div className="text-[#fca5a5]">SSL 오류: {hostingStatus.ssl.error}</div>
                ) : null}
              </div>
            ) : null}
            {hostingStatusMessage ? (
              <p className="mt-2 text-[11px] text-[#a3a3a3]">{hostingStatusMessage}</p>
            ) : null}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={saveHostingSettings}
              disabled={hostingSaving || hostingLoading}
              className="rounded-xl border border-white/20 bg-white/5 px-4 py-2.5 text-sm font-medium text-white hover:bg-white/10 disabled:opacity-50"
            >
              {hostingSaving ? "저장 중…" : "저장"}
            </button>
            <div className="flex items-center gap-2 text-xs text-[#a3a3a3]">
              <span>현재 배포 URL</span>
              <code className="rounded-lg bg-white/5 px-2 py-1 text-[11px] text-[#a3a3a3]">
                {typeof window !== "undefined" ? window.location.origin : ""}/p/{pageId}
              </code>
            </div>
          </div>
          {hostingLoading && (
            <p className="mt-2 text-xs text-[#a3a3a3]">호스팅 설정을 불러오는 중입니다.</p>
          )}
          {hostingMessage && (
            <p className="mt-2 text-xs text-[#a3a3a3]">{hostingMessage}</p>
          )}
        </section>

        {/* Mobile host packaging */}
        <section className="mb-10 rounded-2xl border border-white/10 bg-white/[0.02] p-6">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-[#737373]">모바일 호스트</h2>
          <p className="mt-1 text-[11px] text-[#525252]">
            웹으로 제작한 서비스를 네이티브 앱 셸로 패키징합니다. 서버 URL이 비어 있으면 현재 호스트를 사용합니다.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs text-[#a3a3a3]">
              앱 이름
              <input
                type="text"
                value={mobileSettings.appName ?? ""}
                onChange={(e) => setMobileSettings((prev) => ({ ...prev, appName: e.target.value }))}
                placeholder="NULL Host"
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder:text-[#525252] focus:border-white/20 focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-[#a3a3a3]">
              앱 ID
              <input
                type="text"
                value={mobileSettings.appId ?? ""}
                onChange={(e) => setMobileSettings((prev) => ({ ...prev, appId: e.target.value }))}
                placeholder="com.example.null"
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder:text-[#525252] focus:border-white/20 focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-[#a3a3a3] sm:col-span-2">
              서버 URL
              <input
                type="url"
                value={mobileSettings.serverUrl ?? ""}
                onChange={(e) => setMobileSettings((prev) => ({ ...prev, serverUrl: e.target.value }))}
                placeholder={typeof window !== "undefined" ? window.location.origin : "https://your-null-host.example"}
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder:text-[#525252] focus:border-white/20 focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-[#a3a3a3]">
              상태바 스타일
              <select
                value={mobileSettings.statusBarStyle ?? "default"}
                onChange={(e) => setMobileSettings((prev) => ({ ...prev, statusBarStyle: e.target.value as MobileSettings["statusBarStyle"] }))}
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
                style={{ colorScheme: "dark" }}
              >
                <option value="default">기본</option>
                <option value="light">라이트</option>
                <option value="dark">다크</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-[#a3a3a3]">
              상태바 색상
              <input
                type="text"
                value={mobileSettings.statusBarColor ?? ""}
                onChange={(e) => setMobileSettings((prev) => ({ ...prev, statusBarColor: e.target.value }))}
                placeholder="#000000"
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder:text-[#525252] focus:border-white/20 focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-[#a3a3a3] sm:col-span-2">
              메모
              <textarea
                rows={2}
                value={mobileSettings.notes ?? ""}
                onChange={(e) => setMobileSettings((prev) => ({ ...prev, notes: e.target.value }))}
                placeholder="빌드/배포 메모"
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder:text-[#525252] focus:border-white/20 focus:outline-none"
              />
            </label>
            <label className="flex items-center gap-2 text-xs text-[#a3a3a3] sm:col-span-2">
              <input
                type="checkbox"
                checked={Boolean(mobileSettings.allowCleartext)}
                onChange={(e) => setMobileSettings((prev) => ({ ...prev, allowCleartext: e.target.checked }))}
                className="rounded border-white/20"
              />
              HTTP(클리어텍스트) 허용
            </label>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={saveMobileSettings}
              disabled={mobileSaving || mobileLoading}
              className="rounded-xl border border-white/20 bg-white/5 px-4 py-2.5 text-sm font-medium text-white hover:bg-white/10 disabled:opacity-50"
            >
              {mobileSaving ? "저장 중…" : "저장"}
            </button>
            <button
              type="button"
              onClick={() => downloadMobilePackage("capacitor")}
              disabled={mobileLoading}
              className="rounded-xl border border-white/20 bg-white/5 px-4 py-2.5 text-sm font-medium text-white hover:bg-white/10 disabled:opacity-50"
            >
              Capacitor 호스트 다운로드
            </button>
            <button
              type="button"
              onClick={() => downloadMobilePackage("react-native")}
              disabled={mobileLoading}
              className="rounded-xl border border-white/20 bg-white/5 px-4 py-2.5 text-sm font-medium text-white hover:bg-white/10 disabled:opacity-50"
            >
              React Native 호스트 다운로드
            </button>
          </div>
          {mobileLoading && (
            <p className="mt-2 text-xs text-[#a3a3a3]">모바일 설정을 불러오는 중입니다.</p>
          )}
          {mobileMessage && (
            <p className="mt-2 text-xs text-[#a3a3a3]">{mobileMessage}</p>
          )}
        </section>

        {/* Quick copy URL */}
        {isDeployed && (
          <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
            <p className="text-[11px] text-[#525252]">배포 URL</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <code className="rounded-lg bg-white/5 px-3 py-2 text-sm text-[#a3a3a3]">
                {typeof window !== "undefined" ? window.location.origin : ""}/p/{pageId}
              </code>
              <button
                type="button"
                onClick={() => {
                  const url = `${typeof window !== "undefined" ? window.location.origin : ""}/p/${pageId}`;
                  navigator.clipboard?.writeText(url).then(() => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  });
                }}
                className="rounded-lg border border-white/20 px-3 py-2 text-xs font-medium text-white hover:bg-white/10"
              >
                {copied ? "복사됨" : "복사"}
              </button>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
