"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type Surface = "consumer" | "partner" | "ops";
type AsyncStatus = "idle" | "loading" | "success" | "error";

type Credential = {
  label: string;
  role: string;
  email: string;
  password: string;
  displayName: string;
};

type ValidationMeta = {
  ok: true;
  page: {
    id: string;
    title: string;
    status: string;
    deployedAt: string | null;
    updatedAt: string;
  };
  credentials: Credential[];
  editorUrl: string;
  dashboardUrl: string;
};

type AppUser = {
  id: string;
  email: string;
  display_name?: string | null;
  role?: string | null;
};

type ChatMessage = {
  id: string;
  content: string;
  senderAnonId?: string | null;
  senderUserId?: string | null;
  createdAt: string;
};

type NotificationItem = {
  id: string;
  type: string;
  title?: string | null;
  body?: string | null;
  createdAt: string;
  readAt?: string | null;
};

type TodoItem = {
  id: string;
  title: string;
  done: boolean;
  sortOrder?: number;
};

type NoteItem = {
  id: string;
  content: string;
  updatedAt: string;
};

type RecordItem = {
  id: string;
  createdAt?: string | null;
  updatedAt?: string | null;
  [key: string]: unknown;
};

type ValidationState = {
  ok: true;
  state: {
    consumer: {
      chatMessages: ChatMessage[];
      notifications: NotificationItem[];
      todos: TodoItem[];
      note: NoteItem | null;
    };
    partner: {
      resources: RecordItem[];
      reservations: RecordItem[];
      tickets: RecordItem[];
      ticketMessages: RecordItem[];
      leads: RecordItem[];
      stages: RecordItem[];
      documents: RecordItem[];
    };
    ops: {
      overview: {
        generatedAt: string;
        deployment?: {
          currentVersionId?: string | null;
          deployedAt?: string | null;
          prodUrl?: string | null;
        };
        metrics?: {
          events24h?: number;
          queuedJobs?: number;
          deadLetteredJobs?: number;
          releases30d?: number;
          backups30d?: number;
          appCollections?: number;
          appRecords?: number;
          mediaAssets?: number;
        };
      };
      runbook: {
        generatedAt: string;
        sections?: Record<string, string[]>;
      };
      billing: {
        accounts?: RecordItem[];
        plans?: RecordItem[];
        subscriptions?: RecordItem[];
        invoices?: RecordItem[];
        settlements?: RecordItem[];
      };
      policy: {
        rules?: RecordItem[];
        approvalRequests?: RecordItem[];
        overrides?: RecordItem[];
        incidents?: RecordItem[];
        sanctions?: RecordItem[];
      };
    };
  };
  evaluation?: unknown;
};

type ActionLog = {
  id: string;
  surface: Surface;
  title: string;
  detail: string;
  status: "success" | "error";
  createdAt: string;
};

const SURFACES: Array<{ key: Surface; label: string; subtitle: string }> = [
  { key: "consumer", label: "사용자 앱", subtitle: "로그인, 채팅, 알림, 개인 작업 흐름을 실제 서비스 화면처럼 검증합니다." },
  { key: "partner", label: "파트너 포털", subtitle: "예약, 고객 지원, CRM, 승인 흐름을 운영 포털처럼 검증합니다." },
  { key: "ops", label: "운영 콘솔", subtitle: "배포, 과금, 정책, 리스크와 운영 지표를 실제 콘솔처럼 검증합니다." },
];

function toErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  return "알 수 없는 오류";
}

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function asNumber(value: unknown, fallback = 0) {
  const number = typeof value === "number" ? value : Number(value ?? fallback);
  return Number.isFinite(number) ? number : fallback;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("ko-KR");
}

async function fetchJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    ...(init?.headers && !Array.isArray(init.headers) ? (init.headers as Record<string, string>) : {}),
  };
  if (init?.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
  const response = await fetch(input, { ...init, credentials: "include", headers });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const code =
      payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
        ? payload.error
        : `http_${response.status}`;
    throw new Error(code);
  }
  return payload as T;
}

function StatusBadge({ status, label }: { status: AsyncStatus | "success" | "error"; label: string }) {
  const classes =
    status === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : status === "error"
        ? "border-rose-200 bg-rose-50 text-rose-700"
        : status === "loading"
          ? "border-sky-200 bg-sky-50 text-sky-700"
          : "border-slate-200 bg-white text-slate-600";
  return <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${classes}`}>{label}</span>;
}

function SurfaceButton({ active, label, subtitle, onClick }: { active: boolean; label: string; subtitle: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-[24px] border px-5 py-4 text-left transition ${
        active ? "border-slate-950 bg-slate-950 text-white shadow-lg shadow-slate-950/20" : "border-slate-200 bg-white text-slate-900 hover:border-slate-300 hover:bg-slate-50"
      }`}
    >
      <div className="text-sm font-semibold">{label}</div>
      <div className={`mt-1 text-sm leading-6 ${active ? "text-slate-300" : "text-slate-500"}`}>{subtitle}</div>
    </button>
  );
}

function Panel({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_20px_60px_-40px_rgba(15,23,42,0.35)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-950">{title}</h3>
          {description ? <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p> : null}
        </div>
        {action}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function MetricCard({ label, value, help }: { label: string; value: string; help?: string }) {
  return (
    <div className="rounded-[24px] border border-slate-200 bg-white px-5 py-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">{label}</p>
      <p className="mt-3 text-3xl font-semibold text-slate-950">{value}</p>
      {help ? <p className="mt-2 text-sm text-slate-500">{help}</p> : null}
    </div>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-[20px] border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm leading-6 text-slate-600">
      <p className="font-semibold text-slate-900">{title}</p>
      <p className="mt-2">{description}</p>
    </div>
  );
}

const SURFACE_OPTIONS: Array<{ key: Surface; label: string; subtitle: string }> = [
  { key: "consumer", label: "사용자 앱", subtitle: "로그인, 채팅, 할 일, 노트 흐름을 실제 사용자 화면처럼 검증합니다." },
  { key: "partner", label: "파트너 포털", subtitle: "예약, 고객 지원, CRM, 문서 흐름을 운영 포털 관점에서 검증합니다." },
  { key: "ops", label: "운영 콘솔", subtitle: "배포, 청구, 정책, 리스크 지표를 실서비스 운영 관점으로 점검합니다." },
];

const SURFACE_GUIDES: Record<Surface, { title: string; steps: string[] }> = {
  consumer: {
    title: "사용자 앱 검증 순서",
    steps: [
      "데모 계정을 선택해 로그인하고 현재 세션 정보를 확인합니다.",
      "채팅 메시지를 보내 새 메시지가 즉시 반영되는지 확인합니다.",
      "예약 요청을 만들고 파트너 포털에 바로 표시되는지 확인합니다.",
      "지원 요청을 생성해 티켓과 답변 흐름이 이어지는지 확인합니다.",
      "할 일과 노트를 수정해 상태 전이가 즉시 보이는지 확인합니다.",
    ],
  },
  partner: {
    title: "파트너 포털 검증 순서",
    steps: [
      "예약 카드를 다음 상태로 넘겨 pending, confirmed, completed 전이를 확인합니다.",
      "티켓 답변을 등록하고 최신 메시지와 실행 로그가 함께 갱신되는지 확인합니다.",
      "CRM 리드를 다음 단계로 이동시키며 상태가 동시에 바뀌는지 확인합니다.",
      "승인 문서 목록에서 현재 상태와 본문이 정상 표시되는지 확인합니다.",
    ],
  },
  ops: {
    title: "운영 콘솔 검증 순서",
    steps: [
      "이벤트, 작업 큐, 백업, 릴리스 지표가 실제 값으로 요약되는지 확인합니다.",
      "청구/구독/인보이스 카드가 실제 운영 문서처럼 보이는지 확인합니다.",
      "정책 평가를 실행해 결과 JSON과 실행 상태가 즉시 바뀌는지 확인합니다.",
      "운영 런북 섹션이 비어 있지 않고 체크리스트처럼 읽히는지 확인합니다.",
    ],
  },
};

const DRAFT_DEFAULTS = {
  message: "오늘 예약 확인 부탁드립니다.",
  todo: "검증 결과 최종 메모 공유",
  reservationTitle: "주말 상담 예약 요청",
  reservationNotes: "사용자 화면에서 직접 만든 예약이 파트너 포털에 즉시 반영되는지 확인합니다.",
  supportTitle: "멤버십 결제 영수증 확인 요청",
  supportBody: "실제 서비스처럼 사용자 화면에서 문의를 생성하고 파트너 포털에서 답변 흐름을 확인합니다.",
} as const;

function looksBrokenText(value: string) {
  return /[?�]/.test(value);
}

function normalizeUiText(value: string | null | undefined, fallback: string) {
  if (!value) return fallback;
  return looksBrokenText(value) ? fallback : value;
}

function repairDraftText(value: string | null | undefined, fallback: string) {
  if (value == null) return fallback;
  return looksBrokenText(value) ? fallback : value;
}

function describeError(error: unknown) {
  return normalizeUiText(toErrorMessage(error), "알 수 없는 오류");
}

export default function IntegratedValidationConsole({ pageId }: { pageId: string }) {
  const [surface, setSurface] = useState<Surface>("consumer");
  const [meta, setMeta] = useState<ValidationMeta | null>(null);
  const [state, setState] = useState<ValidationState["state"] | null>(null);
  const [sessionUser, setSessionUser] = useState<AppUser | null>(null);
  const [evaluation, setEvaluation] = useState<unknown>(null);
  const [metaStatus, setMetaStatus] = useState<AsyncStatus>("loading");
  const [stateStatus, setStateStatus] = useState<AsyncStatus>("loading");
  const [actionStatus, setActionStatus] = useState<AsyncStatus>("idle");
  const [actionLabel, setActionLabel] = useState("");
  const [error, setError] = useState("");
  const [logs, setLogs] = useState<ActionLog[]>([]);
  const [selectedCredentialIndex, setSelectedCredentialIndex] = useState(0);
  const [messageDraft, setMessageDraft] = useState("오늘 예약 확인 부탁드립니다.");
  const [todoDraft, setTodoDraft] = useState("검증 후 최종 점검 공유");
  const [noteDraft, setNoteDraft] = useState("");
  const [reservationTitleDraft, setReservationTitleDraft] = useState("주말 팝업 예약 요청");
  const [reservationNotesDraft, setReservationNotesDraft] = useState("사용자 앱에서 직접 만든 예약이 파트너 포털에 즉시 보여야 합니다.");
  const [supportTitleDraft, setSupportTitleDraft] = useState("멤버십 결제 영수증 확인 요청");
  const [supportBodyDraft, setSupportBodyDraft] = useState("실제 서비스처럼 사용자 앱에서 문의를 생성하고 파트너 포털에서 답변 흐름을 확인합니다.");
  const [selectedResourceId, setSelectedResourceId] = useState("");
  const [ticketDrafts, setTicketDrafts] = useState<Record<string, string>>({});

  const selectedCredential = meta?.credentials[selectedCredentialIndex] ?? null;

  const appendLog = useCallback((surfaceKey: Surface, title: string, status: "success" | "error", detail: string) => {
    setLogs((current) => [
      {
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        surface: surfaceKey,
        title,
        status,
        detail,
        createdAt: new Date().toISOString(),
      },
      ...current,
    ].slice(0, 14));
  }, []);

  const reloadAll = useCallback(async () => {
    setMetaStatus("loading");
    setStateStatus("loading");
    setError("");
    try {
      const [metaResponse, stateResponse, sessionResponse] = await Promise.all([
        fetchJson<ValidationMeta>(`/api/pages/starters/integrated-service/${pageId}`),
        fetchJson<ValidationState>(`/api/pages/starters/integrated-service/${pageId}/validate`),
        fetchJson<{ user: AppUser | null }>(`/api/app/${pageId}/auth/me`).catch(() => ({ user: null })),
      ]);
      setMeta(metaResponse);
      setSelectedCredentialIndex((current) => (metaResponse.credentials[current] ? current : 0));
      setState(stateResponse.state);
      setEvaluation(stateResponse.evaluation ?? null);
      setNoteDraft(stateResponse.state.consumer.note?.content ?? "");
      setSessionUser(sessionResponse.user ?? null);
      setMetaStatus("success");
      setStateStatus("success");
    } catch (loadError) {
      const message = describeError(loadError);
      setMetaStatus("error");
      setStateStatus("error");
      setError(message);
    }
  }, [pageId]);

  const refreshSession = useCallback(async () => {
    try {
      const response = await fetchJson<{ user: AppUser | null }>(`/api/app/${pageId}/auth/me`);
      setSessionUser(response.user ?? null);
    } catch {
      setSessionUser(null);
    }
  }, [pageId]);

  useEffect(() => {
    let active = true;
    void (async () => {
      setMetaStatus("loading");
      setStateStatus("loading");
      setError("");
      try {
        const [metaResponse, stateResponse, sessionResponse] = await Promise.all([
          fetchJson<ValidationMeta>(`/api/pages/starters/integrated-service/${pageId}`),
          fetchJson<ValidationState>(`/api/pages/starters/integrated-service/${pageId}/validate`),
          fetchJson<{ user: AppUser | null }>(`/api/app/${pageId}/auth/me`).catch(() => ({ user: null })),
        ]);
        if (!active) return;
        setMeta(metaResponse);
        setSelectedCredentialIndex(0);
        setState(stateResponse.state);
        setEvaluation(stateResponse.evaluation ?? null);
        setNoteDraft(stateResponse.state.consumer.note?.content ?? "");
        setSessionUser(sessionResponse.user ?? null);
        setMetaStatus("success");
        setStateStatus("success");
      } catch (loadError) {
        if (!active) return;
        const message = describeError(loadError);
        setMetaStatus("error");
        setStateStatus("error");
        setError(message);
      }
    })();
    return () => {
      active = false;
    };
  }, [pageId]);

  const runAction = useCallback(
    async (surfaceKey: Surface, label: string, action: () => Promise<void>) => {
      setActionStatus("loading");
      setActionLabel(label);
      setError("");
      try {
        await action();
        setActionStatus("success");
        appendLog(surfaceKey, label, "success", "정상적으로 처리되었습니다.");
      } catch (actionError) {
        const message = describeError(actionError);
        setActionStatus("error");
        setError(message);
        appendLog(surfaceKey, label, "error", message);
      }
    },
    [appendLog],
  );

  const loginSelected = useCallback(async () => {
    if (!selectedCredential) return;
    await runAction("consumer", "데모 계정 로그인", async () => {
      await fetchJson(`/api/app/${pageId}/auth/login`, {
        method: "POST",
        body: JSON.stringify({
          email: selectedCredential.email,
          password: selectedCredential.password,
        }),
      });
      await refreshSession();
    });
  }, [pageId, refreshSession, runAction, selectedCredential]);

  const sendChat = useCallback(async () => {
    const content = messageDraft.trim();
    if (!content) return;
    await runAction("consumer", "채팅 메시지 전송", async () => {
      const response = await fetchJson<ValidationState>(`/api/pages/starters/integrated-service/${pageId}/validate`, {
        method: "POST",
        body: JSON.stringify({
          action: "consumer.chat.send",
          content,
          senderLabel: selectedCredential?.displayName ?? "검증 사용자",
        }),
      });
      setState(response.state);
      setMessageDraft("");
    });
  }, [messageDraft, pageId, runAction, selectedCredential]);

  const createTodo = useCallback(async () => {
    const title = todoDraft.trim();
    if (!title) return;
    await runAction("consumer", "할 일 추가", async () => {
      const response = await fetchJson<ValidationState>(`/api/pages/starters/integrated-service/${pageId}/validate`, {
        method: "POST",
        body: JSON.stringify({ action: "consumer.todo.create", title }),
      });
      setState(response.state);
      setTodoDraft("");
    });
  }, [pageId, runAction, todoDraft]);

  const toggleTodo = useCallback(
    async (todo: TodoItem) => {
      await runAction("consumer", "할 일 상태 변경", async () => {
        const response = await fetchJson<ValidationState>(`/api/pages/starters/integrated-service/${pageId}/validate`, {
          method: "POST",
          body: JSON.stringify({ action: "consumer.todo.toggle", todoId: todo.id, done: !todo.done }),
        });
        setState(response.state);
      });
    },
    [pageId, runAction],
  );

  const saveNote = useCallback(async () => {
    await runAction("consumer", "노트 저장", async () => {
      const response = await fetchJson<ValidationState>(`/api/pages/starters/integrated-service/${pageId}/validate`, {
        method: "POST",
        body: JSON.stringify({ action: "consumer.note.save", content: noteDraft }),
      });
      setState(response.state);
    });
  }, [noteDraft, pageId, runAction]);

  const effectiveSelectedResourceId = selectedResourceId || state?.partner.resources?.[0]?.id || "";

  const requestReservation = useCallback(async () => {
    const title = reservationTitleDraft.trim();
    if (!title || !effectiveSelectedResourceId) return;
    await runAction("consumer", "예약 요청 생성", async () => {
      const response = await fetchJson<ValidationState>(`/api/pages/starters/integrated-service/${pageId}/validate`, {
        method: "POST",
        body: JSON.stringify({
          action: "consumer.reservation.request",
          resourceId: effectiveSelectedResourceId,
          title,
          notes: reservationNotesDraft.trim(),
          customerKey: selectedCredential?.displayName ?? sessionUser?.display_name ?? "일반 사용자",
        }),
      });
      setState(response.state);
      setReservationTitleDraft("추가 예약 요청");
      setReservationNotesDraft("방금 생성한 예약이 파트너 포털의 예약 운영 보드에 바로 표시되어야 합니다.");
    });
  }, [effectiveSelectedResourceId, pageId, reservationNotesDraft, reservationTitleDraft, runAction, selectedCredential?.displayName, sessionUser?.display_name]);

  const createSupportTicket = useCallback(async () => {
    const title = supportTitleDraft.trim();
    const message = supportBodyDraft.trim();
    if (!title || !message) return;
    await runAction("consumer", "고객 지원 요청 생성", async () => {
      const response = await fetchJson<ValidationState>(`/api/pages/starters/integrated-service/${pageId}/validate`, {
        method: "POST",
        body: JSON.stringify({
          action: "consumer.ticket.create",
          title,
          message,
          requesterKey: selectedCredential?.displayName ?? sessionUser?.display_name ?? "일반 사용자",
        }),
      });
      setState(response.state);
      setSupportTitleDraft("다음 지원 요청");
      setSupportBodyDraft("생성 직후 파트너 포털의 고객 지원 응답 패널에 이 티켓이 바로 보여야 합니다.");
    });
  }, [pageId, runAction, selectedCredential?.displayName, sessionUser?.display_name, supportBodyDraft, supportTitleDraft]);

  const advanceReservation = useCallback(
    async (reservation: RecordItem) => {
      const currentState = asString(reservation.state);
      const eventType =
        currentState === "pending"
          ? "reservation.confirm"
          : currentState === "confirmed"
            ? "reservation.complete"
            : currentState === "completed"
              ? ""
              : "reservation.cancel";
      if (!eventType) return;
      await runAction("partner", "예약 상태 전이", async () => {
        const response = await fetchJson<ValidationState>(`/api/pages/starters/integrated-service/${pageId}/validate`, {
          method: "POST",
          body: JSON.stringify({ action: "partner.reservation.advance", reservationId: reservation.id, eventType }),
        });
        setState(response.state);
      });
    },
    [pageId, runAction],
  );

  const replyTicket = useCallback(
    async (ticketId: string) => {
      const message = (ticketDrafts[ticketId] ?? "").trim();
      if (!message) return;
      await runAction("partner", "지원 답변 등록", async () => {
        const response = await fetchJson<ValidationState>(`/api/pages/starters/integrated-service/${pageId}/validate`, {
          method: "POST",
          body: JSON.stringify({
            action: "partner.ticket.reply",
            ticketId,
            message,
            authorKey: selectedCredential?.displayName ?? "파트너 운영자",
          }),
        });
        setState(response.state);
        setTicketDrafts((current) => ({ ...current, [ticketId]: "" }));
      });
    },
    [pageId, runAction, selectedCredential, ticketDrafts],
  );

  const advanceLead = useCallback(
    async (leadId: string) => {
      await runAction("partner", "CRM 단계 이동", async () => {
        const response = await fetchJson<ValidationState>(`/api/pages/starters/integrated-service/${pageId}/validate`, {
          method: "POST",
          body: JSON.stringify({ action: "partner.crm.advance", leadId }),
        });
        setState(response.state);
      });
    },
    [pageId, runAction],
  );

  const evaluatePolicy = useCallback(async () => {
    await runAction("ops", "정책 평가 실행", async () => {
      const response = await fetchJson<ValidationState>(`/api/pages/starters/integrated-service/${pageId}/validate`, {
        method: "POST",
        body: JSON.stringify({
          action: "ops.policy.evaluate",
          subjectKey: selectedCredential?.email ?? "policy:ops",
          actionKey: "document.publish",
          resourceType: "document",
        }),
      });
      setState(response.state);
      setEvaluation(response.evaluation ?? null);
    });
  }, [pageId, runAction, selectedCredential]);

  const reservationsByResource = useMemo(
    () =>
      (state?.partner.resources ?? []).map((resource) => ({
        resource,
        reservations: (state?.partner.reservations ?? []).filter((reservation) => asString(reservation.resource_id) === resource.id),
      })),
    [state?.partner.reservations, state?.partner.resources],
  );

  const latestTicketMessageByTicket = useMemo(() => {
    const result = new Map<string, RecordItem>();
    const sorted = [...(state?.partner.ticketMessages ?? [])].sort(
      (a, b) => new Date(asString(b.createdAt)).getTime() - new Date(asString(a.createdAt)).getTime(),
    );
    for (const item of sorted) {
      const ticketId = asString(item.ticket_id);
      if (ticketId && !result.has(ticketId)) result.set(ticketId, item);
    }
    return result;
  }, [state?.partner.ticketMessages]);

  const leadsByStage = useMemo(() => {
    const grouped = new Map<string, RecordItem[]>();
    for (const stage of state?.partner.stages ?? []) grouped.set(stage.id, []);
    for (const lead of state?.partner.leads ?? []) {
      const stageId = asString(lead.stage_id);
      if (!grouped.has(stageId)) grouped.set(stageId, []);
      grouped.get(stageId)!.push(lead);
    }
    return grouped;
  }, [state?.partner.leads, state?.partner.stages]);

  const heroMetrics = useMemo(
    () => [
      { label: "시드 메시지", value: String(state?.consumer.chatMessages.length ?? 0) },
      { label: "활성 예약", value: String(state?.partner.reservations.length ?? 0) },
      { label: "청구 문서", value: String(state?.ops.billing.invoices?.length ?? 0) },
      { label: "정책 규칙", value: String(state?.ops.policy.rules?.length ?? 0) },
    ],
    [state],
  );

  const latestConsumerReservations = useMemo(
    () =>
      [...(state?.partner.reservations ?? [])]
        .sort((a, b) => new Date(asString(b.createdAt)).getTime() - new Date(asString(a.createdAt)).getTime())
        .slice(0, 3),
    [state?.partner.reservations],
  );

  const latestConsumerTickets = useMemo(
    () =>
      [...(state?.partner.tickets ?? [])]
        .sort((a, b) => new Date(asString(b.createdAt)).getTime() - new Date(asString(a.createdAt)).getTime())
        .slice(0, 3),
    [state?.partner.tickets],
  );

  const uiDrafts = useMemo(
    () => ({
      message: repairDraftText(messageDraft, DRAFT_DEFAULTS.message),
      todo: repairDraftText(todoDraft, DRAFT_DEFAULTS.todo),
      reservationTitle: repairDraftText(reservationTitleDraft, DRAFT_DEFAULTS.reservationTitle),
      reservationNotes: repairDraftText(reservationNotesDraft, DRAFT_DEFAULTS.reservationNotes),
      supportTitle: repairDraftText(supportTitleDraft, DRAFT_DEFAULTS.supportTitle),
      supportBody: repairDraftText(supportBodyDraft, DRAFT_DEFAULTS.supportBody),
    }),
    [messageDraft, reservationNotesDraft, reservationTitleDraft, supportBodyDraft, supportTitleDraft, todoDraft],
  );

  const heroMetricsCopy = useMemo(
    () => [
      { label: "채팅 메시지", value: String(state?.consumer.chatMessages.length ?? 0) },
      { label: "활성 예약", value: String(state?.partner.reservations.length ?? 0) },
      { label: "청구 문서", value: String(state?.ops.billing.invoices?.length ?? 0) },
      { label: "정책 규칙", value: String(state?.ops.policy.rules?.length ?? 0) },
    ],
    [state],
  );

  const activeGuideCopy = SURFACE_GUIDES[surface];
  const activeSurfaceCopy = SURFACE_OPTIONS.find((item) => item.key === surface) ?? SURFACE_OPTIONS[0];
  const surfaceCounts = {
    consumer: state?.consumer.chatMessages.length ?? 0,
    partner:
      (state?.partner.reservations.length ?? 0) +
      (state?.partner.tickets.length ?? 0) +
      (state?.partner.leads.length ?? 0) +
      (state?.partner.documents.length ?? 0),
    ops: (state?.ops.billing.invoices?.length ?? 0) + (state?.ops.policy.rules?.length ?? 0),
  } satisfies Record<Surface, number>;

  const visibleActionLabel = normalizeUiText(actionLabel, "아직 실행하지 않았습니다.");
  const visibleError = normalizeUiText(error, error || "알 수 없는 오류");
  const visibleLogs = useMemo(
    () =>
      logs.map((entry) => ({
        ...entry,
        title: normalizeUiText(entry.title, `${activeSurfaceCopy.label} 액션`),
        detail: normalizeUiText(entry.detail, entry.status === "success" ? "정상적으로 처리되었습니다." : "실행 중 오류가 발생했습니다."),
      })),
    [activeSurfaceCopy.label, logs],
  );

  const activeGuide =
    surface === "consumer"
      ? {
          title: "사용자 앱 테스트 순서",
          items: [
            "데모 계정을 선택하고 로그인합니다.",
            "채팅 전송 후 목록 마지막에 새 메시지가 추가되는지 확인합니다.",
            "예약 요청을 생성한 뒤 파트너 포털 예약 운영 보드에 즉시 보이는지 확인합니다.",
            "지원 요청을 생성한 뒤 파트너 포털 고객 지원 응답 패널에 새 티켓이 추가되는지 확인합니다.",
            "할 일을 추가하거나 완료 처리한 뒤 바로 상태가 바뀌는지 확인합니다.",
            "노트를 저장하고 최근 실행 로그와 상태 카드가 같이 갱신되는지 확인합니다.",
          ],
        }
      : surface === "partner"
        ? {
            title: "파트너 포털 테스트 순서",
            items: [
              "예약 카드에서 다음 상태로 진행을 눌러 pending, confirmed, completed 전이를 확인합니다.",
              "티켓 답변 등록 후 최신 메시지와 실행 로그가 같이 갱신되는지 확인합니다.",
              "CRM 리드를 다음 단계로 이동시켜 컬럼과 상태가 동시에 바뀌는지 확인합니다.",
              "승인 문서 카드에 실제 문서가 보이는지 먼저 확인하고 현재 상태를 점검합니다.",
            ],
          }
        : {
            title: "운영 콘솔 테스트 순서",
            items: [
              "배포, 큐, 백업, 릴리즈 수치가 실제 값으로 보이는지 확인합니다.",
              "과금 카드에서 인보이스가 실제 문서처럼 표시되는지 확인합니다.",
              "정책 평가 버튼을 눌러 평가 JSON과 최근 실행 로그가 함께 바뀌는지 확인합니다.",
              "운영 런북 섹션이 비어 있지 않고 체크리스트처럼 보이는지 확인합니다.",
            ],
          };

  const hasLoadError = metaStatus === "error" || stateStatus === "error";
  const isUnsupportedProject = error === "not_found" || error === "http_404";

  if (hasLoadError) {
    return (
      <div className="min-h-screen bg-[#f5f7fb] px-6 py-10">
        <div className="mx-auto max-w-3xl rounded-[28px] border border-rose-200 bg-white p-8 shadow-sm">
          <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-rose-500">Validation</div>
          <h1 className="mt-3 text-2xl font-semibold text-slate-950">
            {isUnsupportedProject ? "이 프로젝트는 검증 앱 대상이 아닙니다." : "검증 앱을 열 수 없습니다."}
          </h1>
          <p className="mt-3 text-sm leading-6 text-rose-600">
            {isUnsupportedProject
              ? "현재 페이지는 통합 검증 서비스 스타터로 생성된 프로젝트가 아니어서 전용 검증 콘솔을 열 수 없습니다. 일반 프로젝트라면 대시보드나 공개 화면에서 확인해 주세요."
              : visibleError || "검증 상태를 읽는 중 문제가 발생했습니다."}
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href={`/dashboard/${pageId}`}
              className="rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-black"
            >
              프로젝트 대시보드 열기
            </Link>
            <Link
              href="/library"
              className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              라이브러리로 이동
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (metaStatus === "loading" || stateStatus === "loading" || !meta || !state) {
    return <div className="min-h-screen bg-[#f5f7fb] p-8 text-sm text-slate-500">검증 앱을 불러오는 중...</div>;
  }

  return (
    <div className="min-h-screen bg-[#f5f7fb] text-slate-900">
      <div className="mx-auto max-w-[1600px] px-6 py-10">
        <header className="rounded-[32px] bg-[linear-gradient(135deg,#0f172a_0%,#1d4ed8_58%,#38bdf8_100%)] px-5 py-6 text-white shadow-[0_28px_80px_-42px_rgba(37,99,235,0.55)] sm:px-8 sm:py-8">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
            <div className="max-w-3xl">
              <span className="inline-flex rounded-full border border-white/15 bg-white/10 px-4 py-1 text-xs font-semibold uppercase tracking-[0.28em] text-white/80">
                Integrated Validation
              </span>
              <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">{meta.page.title}</h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-white/80 sm:text-base">
                사용자 앱, 파트너 포털, 운영 콘솔이 실제로 이어지는지 한 화면에서 검증하는 통합 콘솔입니다.
                채팅, 예약, 고객 지원, CRM, 청구, 정책 흐름을 같은 배포 결과물 위에서 바로 확인할 수 있습니다.
              </p>
              <div className="mt-5 flex flex-wrap gap-3 text-sm text-white/75">
                <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5">상태 {meta.page.status}</span>
                <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5">배포 {formatDateTime(meta.page.deployedAt)}</span>
                <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5">업데이트 {formatDateTime(meta.page.updatedAt)}</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href={meta.editorUrl} className="rounded-full bg-white px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-slate-100">
                에디터 열기
              </Link>
              <Link href={meta.dashboardUrl} className="rounded-full border border-white/25 bg-white/10 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/20">
                대시보드 열기
              </Link>
              <button
                type="button"
                onClick={() => void reloadAll()}
                className="rounded-full border border-white/25 bg-transparent px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                전체 새로고침
              </button>
            </div>
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {heroMetricsCopy.map((item) => (
              <div key={item.label} className="rounded-[24px] border border-white/15 bg-white/10 px-5 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/60">{item.label}</p>
                <p className="mt-3 text-3xl font-semibold text-white">{item.value}</p>
              </div>
            ))}
          </div>
        </header>

        <div className="mt-8 grid gap-4 lg:grid-cols-3">
          {SURFACE_OPTIONS.map((item) => (
            <SurfaceButton key={item.key} active={surface === item.key} label={item.label} subtitle={item.subtitle} onClick={() => setSurface(item.key)} />
          ))}
        </div>

        {error ? <div className="mt-6 rounded-[20px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{visibleError}</div> : null}

        <section className="mt-6 rounded-[28px] border border-slate-200 bg-white px-6 py-5 shadow-[0_16px_48px_-36px_rgba(15,23,42,0.35)]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">{activeGuideCopy.title}</h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">현재 화면에서 어떤 순서로 눌러야 하는지 바로 확인할 수 있도록 정리했습니다.</p>
            </div>
            <StatusBadge status="idle" label={`${surfaceCounts[surface]}개 항목`} />
          </div>
          <ol className="mt-4 grid gap-3 md:grid-cols-2">
            {activeGuideCopy.steps.map((item, index) => (
              <li key={`${surface}_${index}`} className="rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700">
                <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-950 text-xs font-semibold text-white">{index + 1}</span>
                {item}
              </li>
            ))}
          </ol>
        </section>

        <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-6">
            {surface === "consumer" ? (
              <>
                <Panel title="사용자 계정과 세션" description="데모 계정으로 로그인하고 현재 사용자 세션과 알림 상태를 확인합니다.">
                  <div className="grid gap-4 lg:grid-cols-[1.35fr_0.9fr]">
                    <div className="grid gap-3">
                      {meta.credentials.map((credential, index) => (
                        <button
                          key={credential.email}
                          type="button"
                          onClick={() => setSelectedCredentialIndex(index)}
                          className={`rounded-[22px] border px-4 py-4 text-left transition ${index === selectedCredentialIndex ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"}`}
                        >
                          <div className="text-sm font-semibold">{credential.label}</div>
                          <div className={`mt-1 text-sm ${index === selectedCredentialIndex ? "text-slate-300" : "text-slate-500"}`}>{credential.email}</div>
                          <div className={`mt-2 text-xs ${index === selectedCredentialIndex ? "text-slate-400" : "text-slate-400"}`}>비밀번호 {credential.password}</div>
                        </button>
                      ))}
                    </div>
                    <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-5">
                      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">현재 세션</p>
                      {sessionUser ? (
                        <div className="mt-4 space-y-2 text-sm text-slate-700">
                          <p className="font-semibold text-slate-950">{normalizeUiText(sessionUser.display_name, sessionUser.email)}</p>
                          <p>{sessionUser.email}</p>
                          <p>역할 {sessionUser.role || "user"}</p>
                        </div>
                      ) : (
                        <p className="mt-4 text-sm text-slate-500">아직 로그인하지 않았습니다.</p>
                      )}
                      <div className="mt-5 grid gap-3 sm:grid-cols-2">
                        <MetricCard label="알림" value={String(state.consumer.notifications.length)} />
                        <MetricCard label="할 일" value={String(state.consumer.todos.length)} />
                      </div>
                      <button type="button" onClick={() => void loginSelected()} className="mt-5 rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800">
                        선택한 계정으로 로그인
                      </button>
                    </div>
                  </div>
                </Panel>

                <Panel title="실시간 메시지 센터" description="채팅 메시지가 즉시 추가되고, 최신 메시지가 목록 상단에서 확인되는지 점검합니다.">
                  <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
                    <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
                      <div className="space-y-3">
                        {state.consumer.chatMessages.length ? (
                          state.consumer.chatMessages.map((message) => (
                            <div key={message.id} className="rounded-[20px] bg-white px-4 py-3 shadow-sm">
                              <div className="flex items-center justify-between gap-3">
                                <p className="text-sm font-semibold text-slate-950">{message.senderAnonId || message.senderUserId || "검증 사용자"}</p>
                                <p className="text-xs text-slate-400">{formatDateTime(message.createdAt)}</p>
                              </div>
                              <p className="mt-2 text-sm leading-6 text-slate-600">{message.content}</p>
                            </div>
                          ))
                        ) : (
                          <EmptyState title="메시지가 없습니다." description="새 메시지를 보내면 목록에 즉시 반영됩니다." />
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col gap-4">
                      <textarea
                        value={uiDrafts.message}
                        onChange={(event) => setMessageDraft(event.target.value)}
                        className="min-h-[180px] rounded-[24px] border border-slate-200 bg-white px-5 py-4 text-sm leading-7 text-slate-900 outline-none transition focus:border-indigo-400"
                        placeholder="사용자 화면에 보낼 메시지를 입력하세요."
                      />
                      <button type="button" onClick={() => void sendChat()} className="rounded-full bg-indigo-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-indigo-400">
                        메시지 전송
                      </button>
                    </div>
                  </div>
                </Panel>

                <div className="grid gap-6 xl:grid-cols-2">
                  <Panel title="예약 요청 생성" description="사용자 화면에서 직접 예약을 만들고 파트너 포털에 즉시 반영되는지 확인합니다.">
                    <div className="space-y-4">
                      <div className="flex flex-wrap gap-2">
                        {state.partner.resources.length ? (
                          state.partner.resources.map((resource) => (
                            <button
                              key={resource.id}
                              type="button"
                              onClick={() => setSelectedResourceId(resource.id)}
                              className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                                effectiveSelectedResourceId === resource.id
                                  ? "border-slate-950 bg-slate-950 text-white"
                                  : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                              }`}
                            >
                              {asString(resource.name)}
                            </button>
                          ))
                        ) : (
                          <EmptyState title="예약 리소스가 없습니다." description="시드 데이터가 없으면 starter를 다시 생성해 주세요." />
                        )}
                      </div>
                      <input
                        value={uiDrafts.reservationTitle}
                        onChange={(event) => setReservationTitleDraft(event.target.value)}
                        className="h-11 w-full rounded-full border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none transition focus:border-indigo-400"
                        placeholder="예약 제목"
                      />
                      <textarea
                        value={uiDrafts.reservationNotes}
                        onChange={(event) => setReservationNotesDraft(event.target.value)}
                        className="min-h-[120px] w-full rounded-[24px] border border-slate-200 bg-white px-5 py-4 text-sm leading-7 text-slate-900 outline-none transition focus:border-indigo-400"
                        placeholder="예약 메모"
                      />
                      <button type="button" onClick={() => void requestReservation()} className="rounded-full bg-indigo-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-indigo-400">
                        예약 요청 생성
                      </button>
                      <div className="space-y-3">
                        {latestConsumerReservations.length ? (
                          latestConsumerReservations.map((reservation) => (
                            <div key={reservation.id} className="rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-3">
                              <div className="flex items-center justify-between gap-3">
                                <p className="text-sm font-semibold text-slate-950">{asString(reservation.title)}</p>
                                <StatusBadge status={asString(reservation.state) === "completed" ? "success" : "idle"} label={asString(reservation.state) || "requested"} />
                              </div>
                              <p className="mt-1 text-sm text-slate-500">{`${asString(reservation.customer_key)} · ${formatDateTime(asString(reservation.starts_at))}`}</p>
                            </div>
                          ))
                        ) : (
                          <EmptyState title="최근 예약이 없습니다." description="새 예약을 만들면 여기에 최신 3건이 표시됩니다." />
                        )}
                      </div>
                    </div>
                  </Panel>

                  <Panel title="고객 지원 요청" description="사용자 문의를 생성하고 파트너 포털 응답 흐름과 자연스럽게 연결되는지 확인합니다.">
                    <div className="space-y-4">
                      <input
                        value={uiDrafts.supportTitle}
                        onChange={(event) => setSupportTitleDraft(event.target.value)}
                        className="h-11 w-full rounded-full border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none transition focus:border-indigo-400"
                        placeholder="문의 제목"
                      />
                      <textarea
                        value={uiDrafts.supportBody}
                        onChange={(event) => setSupportBodyDraft(event.target.value)}
                        className="min-h-[120px] w-full rounded-[24px] border border-slate-200 bg-white px-5 py-4 text-sm leading-7 text-slate-900 outline-none transition focus:border-indigo-400"
                        placeholder="문의 내용"
                      />
                      <button type="button" onClick={() => void createSupportTicket()} className="rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800">
                        지원 요청 생성
                      </button>
                      <div className="space-y-3">
                        {latestConsumerTickets.length ? (
                          latestConsumerTickets.map((ticket) => (
                            <div key={ticket.id} className="rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-3">
                              <div className="flex items-center justify-between gap-3">
                                <p className="text-sm font-semibold text-slate-950">{asString(ticket.title)}</p>
                                <StatusBadge status={asString(ticket.state) === "resolved" ? "success" : "idle"} label={asString(ticket.state) || "open"} />
                              </div>
                              <p className="mt-1 text-sm text-slate-500">{`${asString(ticket.requester_key)} · ${asString(ticket.priority) || "normal"}`}</p>
                            </div>
                          ))
                        ) : (
                          <EmptyState title="최근 티켓이 없습니다." description="문의 생성 후 최신 티켓 3건이 여기에 표시됩니다." />
                        )}
                      </div>
                    </div>
                  </Panel>
                </div>

                <div className="grid gap-6 lg:grid-cols-2">
                  <Panel title="작업 목록" description="할 일 추가와 상태 전이가 즉시 반영되는지 확인합니다.">
                    <div className="flex gap-3">
                      <input
                        value={uiDrafts.todo}
                        onChange={(event) => setTodoDraft(event.target.value)}
                        className="h-11 flex-1 rounded-full border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none transition focus:border-indigo-400"
                        placeholder="새 작업 제목"
                      />
                      <button type="button" onClick={() => void createTodo()} className="h-11 rounded-full bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800">
                        추가
                      </button>
                    </div>
                    <div className="mt-4 space-y-3">
                      {state.consumer.todos.length ? (
                        state.consumer.todos.map((todo) => (
                          <button
                            key={todo.id}
                            type="button"
                            onClick={() => void toggleTodo(todo)}
                            className={`flex w-full items-center justify-between rounded-[18px] border px-4 py-3 text-left transition ${todo.done ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-white hover:bg-slate-50"}`}
                          >
                            <span className={`text-sm font-medium ${todo.done ? "text-emerald-700 line-through" : "text-slate-900"}`}>{todo.title}</span>
                            <StatusBadge status={todo.done ? "success" : "idle"} label={todo.done ? "완료" : "진행 중"} />
                          </button>
                        ))
                      ) : (
                        <EmptyState title="등록된 할 일이 없습니다." description="새 작업을 추가하면 목록에 바로 표시됩니다." />
                      )}
                    </div>
                  </Panel>

                  <Panel title="운영 메모" description="메모를 저장하고 마지막 저장 시각이 즉시 갱신되는지 확인합니다.">
                    <textarea
                      value={noteDraft}
                      onChange={(event) => setNoteDraft(event.target.value)}
                      className="min-h-[220px] w-full rounded-[24px] border border-slate-200 bg-white px-5 py-4 text-sm leading-7 text-slate-900 outline-none transition focus:border-indigo-400"
                    />
                    <div className="mt-4 flex items-center justify-between gap-3">
                      <p className="text-sm text-slate-500">마지막 저장 {formatDateTime(state.consumer.note?.updatedAt)}</p>
                      <button type="button" onClick={() => void saveNote()} className="rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800">
                        저장
                      </button>
                    </div>
                  </Panel>
                </div>
              </>
            ) : null}

            {surface === "partner" ? (
              <>
                <Panel title="예약 운영 보드" description="대기 중인 예약을 확정하고 완료까지 넘기는 흐름이 자연스럽게 이어지는지 확인합니다.">
                  <div className="grid gap-4 xl:grid-cols-2">
                    {reservationsByResource.length ? (
                      reservationsByResource.map(({ resource, reservations }) => (
                        <div key={resource.id} className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <h4 className="text-base font-semibold text-slate-950">{asString(resource.name) || "리소스"}</h4>
                              <p className="text-sm text-slate-500">수용량 {asNumber(resource.capacity, 0)}</p>
                            </div>
                            <StatusBadge status="idle" label={`${reservations.length}건`} />
                          </div>
                          <div className="mt-4 space-y-3">
                            {reservations.length ? (
                              reservations.map((reservation) => (
                                <div key={reservation.id} className="rounded-[20px] bg-white p-4 shadow-sm">
                                  <div className="flex items-center justify-between gap-3">
                                    <div>
                                      <p className="text-sm font-semibold text-slate-950">{asString(reservation.title)}</p>
                                      <p className="mt-1 text-xs text-slate-500">{`${asString(reservation.customer_key)} · ${formatDateTime(asString(reservation.starts_at))}`}</p>
                                    </div>
                                    <StatusBadge status={asString(reservation.state) === "completed" ? "success" : "idle"} label={asString(reservation.state) || "unknown"} />
                                  </div>
                                  <button type="button" onClick={() => void advanceReservation(reservation)} className="mt-4 rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800">
                                    다음 상태로 진행
                                  </button>
                                </div>
                              ))
                            ) : (
                              <EmptyState title="예약이 없습니다." description="시드 예약이 비어 있으면 starter를 다시 생성해 보세요." />
                            )}
                          </div>
                        </div>
                      ))
                    ) : (
                      <EmptyState title="리소스가 없습니다." description="예약 엔진 데이터가 준비되면 이곳에서 운영 흐름을 검증할 수 있습니다." />
                    )}
                  </div>
                </Panel>

                <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
                  <Panel title="고객 지원 응답" description="실제 티켓과 답변 흐름을 운영 포털 관점으로 검증합니다.">
                    <div className="space-y-4">
                      {state.partner.tickets.length ? (
                        state.partner.tickets.map((ticket) => (
                          <div key={ticket.id} className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm">
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <p className="text-base font-semibold text-slate-950">{asString(ticket.title)}</p>
                                <p className="mt-1 text-sm text-slate-500">{`${asString(ticket.requester_key)} · ${asString(ticket.priority)} · ${asString(ticket.state)}`}</p>
                              </div>
                              <StatusBadge status={asString(ticket.state) === "resolved" ? "success" : "idle"} label={asString(ticket.state) || "open"} />
                            </div>
                            <div className="mt-3 rounded-[18px] bg-slate-50 p-3 text-sm leading-6 text-slate-600">
                              {asString(latestTicketMessageByTicket.get(ticket.id)?.body) || "아직 메시지가 없습니다."}
                            </div>
                            <div className="mt-3 flex gap-3">
                              <input
                                value={ticketDrafts[ticket.id] ?? ""}
                                onChange={(event) => setTicketDrafts((current) => ({ ...current, [ticket.id]: event.target.value }))}
                                className="h-11 flex-1 rounded-full border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none transition focus:border-indigo-400"
                                placeholder="답변 메시지를 입력하세요."
                              />
                              <button type="button" onClick={() => void replyTicket(ticket.id)} className="h-11 rounded-full bg-indigo-500 px-4 text-sm font-semibold text-white transition hover:bg-indigo-400">
                                답변 등록
                              </button>
                            </div>
                          </div>
                        ))
                      ) : (
                        <EmptyState title="티켓이 없습니다." description="시드 고객 지원 데이터가 준비되면 이곳에 바로 표시됩니다." />
                      )}
                    </div>
                  </Panel>

                  <div className="space-y-6">
                    <Panel title="CRM 파이프라인" description="리드를 다음 단계로 이동시키며 상태 전이가 정확히 반영되는지 확인합니다.">
                      <div className="grid gap-4">
                        {state.partner.stages.length ? (
                          state.partner.stages.map((stage) => (
                            <div key={stage.id} className="rounded-[20px] border border-slate-200 bg-slate-50 p-4">
                              <div className="flex items-center justify-between">
                                <h4 className="text-sm font-semibold text-slate-950">{asString(stage.name)}</h4>
                                <span className="text-xs text-slate-400">{leadsByStage.get(stage.id)?.length ?? 0}</span>
                              </div>
                              <div className="mt-3 space-y-3">
                                {(leadsByStage.get(stage.id) ?? []).map((lead) => (
                                  <div key={lead.id} className="rounded-[18px] bg-white p-3 shadow-sm">
                                    <p className="text-sm font-semibold text-slate-950">{asString(lead.name)}</p>
                                    <p className="mt-1 text-xs text-slate-500">{`${asString(lead.company)} · ${asNumber(lead.value, 0).toLocaleString("ko-KR")}원`}</p>
                                    <button type="button" onClick={() => void advanceLead(lead.id)} className="mt-3 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50">
                                      다음 단계 이동
                                    </button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))
                        ) : (
                          <EmptyState title="CRM 단계가 없습니다." description="시드 CRM 데이터가 준비되면 단계별 리드를 여기서 점검할 수 있습니다." />
                        )}
                      </div>
                    </Panel>

                    <Panel title="승인 문서" description="운영 문서와 현재 상태를 빠르게 훑어볼 수 있도록 정리했습니다.">
                      <div className="space-y-3">
                        {state.partner.documents.length ? (
                          state.partner.documents.map((document) => (
                            <div key={document.id} className="rounded-[18px] border border-slate-200 bg-white p-4 shadow-sm">
                              <div className="flex items-center justify-between gap-3">
                                <p className="text-sm font-semibold text-slate-950">{asString(document.title)}</p>
                                <StatusBadge status={asString(document.status) === "approved" ? "success" : "idle"} label={asString(document.status) || "draft"} />
                              </div>
                              <p className="mt-2 text-sm leading-6 text-slate-600">{asString(document.body)}</p>
                            </div>
                          ))
                        ) : (
                          <EmptyState title="문서가 없습니다." description="시드 승인 문서가 준비되면 이 영역에 목록이 채워집니다." />
                        )}
                      </div>
                    </Panel>
                  </div>
                </div>
              </>
            ) : null}

            {surface === "ops" ? (
              <>
                <Panel title="운영 개요" description="배포, 작업 큐, 백업, 미디어 자산 지표를 실제 운영 콘솔 기준으로 확인합니다.">
                  <div className="grid gap-4 md:grid-cols-4">
                    <MetricCard label="이벤트 24h" value={String(state.ops.overview.metrics?.events24h ?? 0)} />
                    <MetricCard label="큐 backlog" value={String(state.ops.overview.metrics?.queuedJobs ?? 0)} />
                    <MetricCard label="백업 30d" value={String(state.ops.overview.metrics?.backups30d ?? 0)} />
                    <MetricCard label="릴리스 30d" value={String(state.ops.overview.metrics?.releases30d ?? 0)} />
                  </div>
                  <div className="mt-5 grid gap-4 md:grid-cols-3">
                    <div className="rounded-[20px] border border-slate-200 bg-slate-50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">배포 버전</p>
                      <p className="mt-3 text-base font-semibold text-slate-950">{state.ops.overview.deployment?.currentVersionId || "-"}</p>
                      <p className="mt-2 text-sm text-slate-500">{formatDateTime(state.ops.overview.deployment?.deployedAt)}</p>
                    </div>
                    <div className="rounded-[20px] border border-slate-200 bg-slate-50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">앱 데이터</p>
                      <p className="mt-3 text-base font-semibold text-slate-950">{state.ops.overview.metrics?.appRecords ?? 0} 레코드</p>
                      <p className="mt-2 text-sm text-slate-500">{state.ops.overview.metrics?.appCollections ?? 0} 컬렉션</p>
                    </div>
                    <div className="rounded-[20px] border border-slate-200 bg-slate-50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">미디어 자산</p>
                      <p className="mt-3 text-base font-semibold text-slate-950">{state.ops.overview.metrics?.mediaAssets ?? 0} assets</p>
                      <p className="mt-2 text-sm text-slate-500">생성 시각 {formatDateTime(state.ops.overview.generatedAt)}</p>
                    </div>
                  </div>
                </Panel>

                <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
                  <Panel title="청구와 정산" description="청구/구독/정산 상태가 실제 운영 데이터처럼 요약되는지 확인합니다.">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <MetricCard label="계정" value={String(state.ops.billing.accounts?.length ?? 0)} />
                      <MetricCard label="플랜" value={String(state.ops.billing.plans?.length ?? 0)} />
                      <MetricCard label="구독" value={String(state.ops.billing.subscriptions?.length ?? 0)} />
                      <MetricCard label="인보이스" value={String(state.ops.billing.invoices?.length ?? 0)} />
                    </div>
                    <div className="mt-4 space-y-3">
                      {(state.ops.billing.invoices ?? []).slice(0, 3).map((invoice) => (
                        <div key={invoice.id} className="rounded-[18px] border border-slate-200 bg-white p-4">
                          <p className="text-sm font-semibold text-slate-950">{asString(invoice.invoice_number) || invoice.id}</p>
                          <p className="mt-1 text-sm text-slate-500">{`${asString(invoice.status)} · ${asNumber(invoice.total_amount_cents, 0).toLocaleString("ko-KR")} 센트`}</p>
                        </div>
                      ))}
                    </div>
                  </Panel>

                  <Panel
                    title="정책과 리스크"
                    description="현재 규칙, 요청, 사건 현황을 확인하고 즉시 정책 평가를 실행합니다."
                    action={
                      <button type="button" onClick={() => void evaluatePolicy()} className="rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800">
                        정책 평가
                      </button>
                    }
                  >
                    <div className="grid gap-4 md:grid-cols-4">
                      <MetricCard label="규칙" value={String(state.ops.policy.rules?.length ?? 0)} />
                      <MetricCard label="승인 요청" value={String(state.ops.policy.approvalRequests?.length ?? 0)} />
                      <MetricCard label="사건" value={String(state.ops.policy.incidents?.length ?? 0)} />
                      <MetricCard label="제재" value={String(state.ops.policy.sanctions?.length ?? 0)} />
                    </div>
                    <div className="mt-5 rounded-[22px] border border-slate-200 bg-slate-50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">마지막 평가</p>
                      <pre className="mt-3 overflow-auto rounded-[16px] bg-slate-950 p-4 text-xs leading-6 text-slate-100">{JSON.stringify(evaluation ?? { message: "아직 실행하지 않았습니다." }, null, 2)}</pre>
                    </div>
                  </Panel>
                </div>

                <Panel title="운영 런북" description="실제 runbook 섹션을 이 화면에서 바로 읽을 수 있게 정리했습니다.">
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                    {Object.entries(state.ops.runbook.sections ?? {}).length ? (
                      Object.entries(state.ops.runbook.sections ?? {}).map(([section, items]) => (
                        <div key={section} className="rounded-[20px] border border-slate-200 bg-slate-50 p-4">
                          <h4 className="text-sm font-semibold capitalize text-slate-950">{section}</h4>
                          <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
                            {items.map((item) => (
                              <li key={item}>{item}</li>
                            ))}
                          </ul>
                        </div>
                      ))
                    ) : (
                      <EmptyState title="런북 항목이 없습니다." description="운영 런북이 준비되면 이 영역에 체크리스트가 표시됩니다." />
                    )}
                  </div>
                </Panel>
              </>
            ) : null}
          </div>

          <aside className="space-y-6 xl:sticky xl:top-6 xl:self-start">
            <Panel
              title="현재 상태"
              description="검증 액션의 실행 상태와 최근 결과를 한눈에 확인합니다."
              action={
                <StatusBadge
                  status={actionStatus}
                  label={actionStatus === "loading" ? "실행 중" : actionStatus === "success" ? "최근 실행 성공" : actionStatus === "error" ? "최근 실행 실패" : "대기"}
                />
              }
            >
              <div className="space-y-4 text-sm text-slate-600">
                <div className="rounded-[20px] border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">마지막 액션</p>
                  <p className="mt-3 font-semibold text-slate-950">{visibleActionLabel}</p>
                  {error ? <p className="mt-2 text-rose-600">{visibleError}</p> : null}
                </div>
                <div className="rounded-[20px] border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">현재 세션</p>
                  <p className="mt-3 text-slate-950">{sessionUser ? sessionUser.email : "로그인되지 않음"}</p>
                  <p className="mt-1 text-slate-500">{sessionUser?.display_name || "데모 계정을 선택해 로그인해 보세요."}</p>
                </div>
              </div>
            </Panel>

            <Panel title="최근 실행 로그" description="서비스 화면에서 실제로 수행한 액션 기록입니다.">
              <div className="space-y-3">
                {visibleLogs.length ? (
                  visibleLogs.map((entry) => (
                    <div key={entry.id} className="rounded-[18px] border border-slate-200 bg-white p-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-slate-950">{entry.title}</p>
                        <StatusBadge status={entry.status} label={entry.status === "success" ? "성공" : "실패"} />
                      </div>
                      <p className="mt-2 text-sm leading-6 text-slate-600">{entry.detail}</p>
                      <p className="mt-2 text-xs text-slate-400">{formatDateTime(entry.createdAt)}</p>
                    </div>
                  ))
                ) : (
                  <EmptyState title="아직 실행 로그가 없습니다." description="각 화면에서 액션을 실행하면 결과가 여기에 쌓입니다." />
                )}
              </div>
            </Panel>
          </aside>
        </div>

        <div className="hidden">
        <header className="rounded-[36px] bg-[linear-gradient(135deg,#0f172a_0%,#1e3a8a_56%,#2563eb_100%)] px-8 py-9 text-white shadow-[0_30px_80px_-40px_rgba(37,99,235,0.55)]">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="max-w-3xl">
              <span className="inline-flex rounded-full bg-white/15 px-4 py-1 text-xs font-semibold uppercase tracking-[0.28em] text-white/85">Real Service Validation</span>
              <h1 className="mt-4 text-4xl font-semibold tracking-tight">{meta.page.title}</h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-white/80">
                기본 자산을 그대로 늘어놓지 않고, 실제 서비스처럼 변형된 화면에서 로그인, 실시간 메시지, 예약, 지원,
                CRM, 운영 상태를 검증하는 전용 앱입니다.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href={meta.editorUrl} className="rounded-full bg-white px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-slate-100">편집기 열기</Link>
              <Link href={meta.dashboardUrl} className="rounded-full border border-white/25 bg-white/10 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/20">대시보드 열기</Link>
              <button type="button" onClick={() => void reloadAll()} className="rounded-full border border-white/25 bg-transparent px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10">전체 새로고침</button>
            </div>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-4">
            {heroMetrics.map((item) => (
              <div key={item.label} className="rounded-[24px] border border-white/15 bg-white/10 px-5 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/60">{item.label}</p>
                <p className="mt-3 text-3xl font-semibold">{item.value}</p>
              </div>
            ))}
          </div>
        </header>

        <div className="mt-8 grid gap-4 lg:grid-cols-3">
          {SURFACES.map((item) => (
            <SurfaceButton key={item.key} active={surface === item.key} label={item.label} subtitle={item.subtitle} onClick={() => setSurface(item.key)} />
          ))}
        </div>

        {error ? <div className="mt-6 rounded-[20px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</div> : null}

        <section className="mt-6 rounded-[28px] border border-slate-200 bg-white px-6 py-5 shadow-[0_16px_48px_-36px_rgba(15,23,42,0.35)]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">{activeGuide.title}</h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">현재 탭에서 무엇을 어떤 순서로 눌러야 하는지 바로 보이게 적어뒀습니다.</p>
            </div>
            <StatusBadge
              status="idle"
              label={`${surface === "consumer" ? state.consumer.chatMessages.length : surface === "partner" ? state.partner.reservations.length + state.partner.tickets.length + state.partner.leads.length + state.partner.documents.length : (state.ops.billing.invoices?.length ?? 0) + (state.ops.policy.rules?.length ?? 0)}개 대상`}
            />
          </div>
          <ol className="mt-4 grid gap-3 md:grid-cols-2">
            {activeGuide.items.map((item, index) => (
              <li key={`${surface}_${index}`} className="rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700">
                <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-950 text-xs font-semibold text-white">{index + 1}</span>
                {item}
              </li>
            ))}
          </ol>
        </section>

        <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-6">
            {surface === "consumer" ? (
              <>
                <Panel title="사용자 인증과 개인 세션" description="실제 데모 계정으로 로그인하고 현재 앱 사용자 세션을 확인합니다.">
                  <div className="grid gap-4 lg:grid-cols-[1.4fr_0.9fr]">
                    <div className="grid gap-3">
                      {meta.credentials.map((credential, index) => (
                        <button
                          key={credential.email}
                          type="button"
                          onClick={() => setSelectedCredentialIndex(index)}
                          className={`rounded-[22px] border px-4 py-4 text-left transition ${index === selectedCredentialIndex ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"}`}
                        >
                          <div className="text-sm font-semibold">{credential.label}</div>
                          <div className={`mt-1 text-sm ${index === selectedCredentialIndex ? "text-slate-300" : "text-slate-500"}`}>{credential.email}</div>
                          <div className="mt-1 text-xs text-slate-400">비밀번호 {credential.password}</div>
                        </button>
                      ))}
                    </div>
                    <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-5">
                      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">현재 세션</p>
                      {sessionUser ? (
                        <div className="mt-4 space-y-2 text-sm text-slate-700">
                          <p className="font-semibold text-slate-950">{sessionUser.display_name || sessionUser.email}</p>
                          <p>{sessionUser.email}</p>
                          <p>역할 {sessionUser.role || "user"}</p>
                        </div>
                      ) : (
                        <p className="mt-4 text-sm text-slate-500">아직 로그인하지 않았습니다.</p>
                      )}
                      <button type="button" onClick={() => void loginSelected()} className="mt-5 rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800">선택한 계정으로 로그인</button>
                    </div>
                  </div>
                </Panel>

                <Panel title="실시간 메시지 센터" description="시드 메시지와 새 메시지가 같은 화면에서 누적되는지 확인합니다.">
                  <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
                    <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
                      <div className="space-y-3">
                        {state.consumer.chatMessages.length ? state.consumer.chatMessages.map((message) => (
                          <div key={message.id} className="rounded-[20px] bg-white px-4 py-3 shadow-sm">
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-sm font-semibold text-slate-950">{message.senderAnonId || message.senderUserId || "검증 사용자"}</p>
                              <p className="text-xs text-slate-400">{formatDateTime(message.createdAt)}</p>
                            </div>
                            <p className="mt-2 text-sm leading-6 text-slate-600">{message.content}</p>
                          </div>
                        )) : <EmptyState title="메시지가 없습니다." description="새 메시지를 보내면 여기에 즉시 쌓입니다." />}
                      </div>
                    </div>
                    <div className="flex flex-col gap-4">
                      <textarea
                        value={messageDraft}
                        onChange={(event) => setMessageDraft(event.target.value)}
                        className="min-h-[180px] rounded-[24px] border border-slate-200 bg-white px-5 py-4 text-sm leading-7 text-slate-900 outline-none transition focus:border-indigo-400"
                        placeholder="사용자 앱에서 보내는 메시지를 입력하세요."
                      />
                      <button type="button" onClick={() => void sendChat()} className="rounded-full bg-indigo-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-indigo-400">메시지 전송</button>
                    </div>
                  </div>
                </Panel>

                <div className="grid gap-6 xl:grid-cols-2">
                  <Panel title="예약 요청 생성" description="사용자 앱에서 직접 예약을 만들고 파트너 포털에 바로 반영되는지 확인합니다.">
                    <div className="space-y-4">
                      <div className="flex flex-wrap gap-2">
                        {state.partner.resources.map((resource) => (
                          <button
                            key={resource.id}
                            type="button"
                            onClick={() => setSelectedResourceId(resource.id)}
                            className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                              effectiveSelectedResourceId === resource.id
                                ? "border-slate-950 bg-slate-950 text-white"
                                : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                            }`}
                          >
                            {asString(resource.name)}
                          </button>
                        ))}
                      </div>
                      <input
                        value={reservationTitleDraft}
                        onChange={(event) => setReservationTitleDraft(event.target.value)}
                        className="h-11 w-full rounded-full border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none transition focus:border-indigo-400"
                        placeholder="예약 제목"
                      />
                      <textarea
                        value={reservationNotesDraft}
                        onChange={(event) => setReservationNotesDraft(event.target.value)}
                        className="min-h-[120px] w-full rounded-[24px] border border-slate-200 bg-white px-5 py-4 text-sm leading-7 text-slate-900 outline-none transition focus:border-indigo-400"
                        placeholder="예약 메모"
                      />
                      <button type="button" onClick={() => void requestReservation()} className="rounded-full bg-indigo-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-indigo-400">
                        예약 요청 생성
                      </button>
                      <div className="space-y-3">
                        {latestConsumerReservations.map((reservation) => (
                          <div key={reservation.id} className="rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-3">
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-sm font-semibold text-slate-950">{asString(reservation.title)}</p>
                              <StatusBadge status={asString(reservation.state) === "completed" ? "success" : "idle"} label={asString(reservation.state) || "requested"} />
                            </div>
                            <p className="mt-1 text-sm text-slate-500">{asString(reservation.customer_key)} · {formatDateTime(asString(reservation.starts_at))}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </Panel>

                  <Panel title="고객 지원 요청" description="사용자 앱에서 문의를 생성하고 파트너 포털 답변 흐름과 연결되는지 확인합니다.">
                    <div className="space-y-4">
                      <input
                        value={supportTitleDraft}
                        onChange={(event) => setSupportTitleDraft(event.target.value)}
                        className="h-11 w-full rounded-full border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none transition focus:border-indigo-400"
                        placeholder="문의 제목"
                      />
                      <textarea
                        value={supportBodyDraft}
                        onChange={(event) => setSupportBodyDraft(event.target.value)}
                        className="min-h-[120px] w-full rounded-[24px] border border-slate-200 bg-white px-5 py-4 text-sm leading-7 text-slate-900 outline-none transition focus:border-indigo-400"
                        placeholder="문의 내용"
                      />
                      <button type="button" onClick={() => void createSupportTicket()} className="rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800">
                        지원 요청 생성
                      </button>
                      <div className="space-y-3">
                        {latestConsumerTickets.map((ticket) => (
                          <div key={ticket.id} className="rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-3">
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-sm font-semibold text-slate-950">{asString(ticket.title)}</p>
                              <StatusBadge status={asString(ticket.state) === "resolved" ? "success" : "idle"} label={asString(ticket.state) || "open"} />
                            </div>
                            <p className="mt-1 text-sm text-slate-500">{asString(ticket.requester_key)} · {asString(ticket.priority) || "normal"}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </Panel>
                </div>

                <div className="grid gap-6 lg:grid-cols-2">
                  <Panel title="작업 목록" description="추가와 상태 전이를 바로 확인합니다.">
                    <div className="flex gap-3">
                      <input
                        value={todoDraft}
                        onChange={(event) => setTodoDraft(event.target.value)}
                        className="h-11 flex-1 rounded-full border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none transition focus:border-indigo-400"
                        placeholder="새 작업 제목"
                      />
                      <button type="button" onClick={() => void createTodo()} className="h-11 rounded-full bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800">추가</button>
                    </div>
                    <div className="mt-4 space-y-3">
                      {state.consumer.todos.map((todo) => (
                        <button
                          key={todo.id}
                          type="button"
                          onClick={() => void toggleTodo(todo)}
                          className={`flex w-full items-center justify-between rounded-[18px] border px-4 py-3 text-left transition ${todo.done ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-white hover:bg-slate-50"}`}
                        >
                          <span className={`text-sm font-medium ${todo.done ? "text-emerald-700 line-through" : "text-slate-900"}`}>{todo.title}</span>
                          <StatusBadge status={todo.done ? "success" : "idle"} label={todo.done ? "완료" : "진행 중"} />
                        </button>
                      ))}
                    </div>
                  </Panel>

                  <Panel title="운영 메모" description="텍스트를 저장하고 즉시 반영 여부를 확인합니다.">
                    <textarea
                      value={noteDraft}
                      onChange={(event) => setNoteDraft(event.target.value)}
                      className="min-h-[220px] w-full rounded-[24px] border border-slate-200 bg-white px-5 py-4 text-sm leading-7 text-slate-900 outline-none transition focus:border-indigo-400"
                    />
                    <div className="mt-4 flex items-center justify-between gap-3">
                      <p className="text-sm text-slate-500">마지막 저장 {formatDateTime(state.consumer.note?.updatedAt)}</p>
                      <button type="button" onClick={() => void saveNote()} className="rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800">저장</button>
                    </div>
                  </Panel>
                </div>
              </>
            ) : null}

            {surface === "partner" ? (
              <>
                <Panel title="예약 운영 보드" description="대기 중인 예약을 확정하고 완료로 넘기는 흐름을 검증합니다.">
                  <div className="grid gap-4 xl:grid-cols-2">
                    {reservationsByResource.map(({ resource, reservations }) => (
                      <div key={resource.id} className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <h4 className="text-base font-semibold text-slate-950">{asString(resource.name) || "리소스"}</h4>
                            <p className="text-sm text-slate-500">용량 {asNumber(resource.capacity, 0)}</p>
                          </div>
                          <StatusBadge status="idle" label={`${reservations.length}건`} />
                        </div>
                        <div className="mt-4 space-y-3">
                          {reservations.length ? reservations.map((reservation) => (
                            <div key={reservation.id} className="rounded-[20px] bg-white p-4 shadow-sm">
                              <div className="flex items-center justify-between gap-3">
                                <div>
                                  <p className="text-sm font-semibold text-slate-950">{asString(reservation.title)}</p>
                                  <p className="mt-1 text-xs text-slate-500">{asString(reservation.customer_key)} · {formatDateTime(asString(reservation.starts_at))}</p>
                                </div>
                                <StatusBadge status={asString(reservation.state) === "completed" ? "success" : "idle"} label={asString(reservation.state) || "unknown"} />
                              </div>
                              <button type="button" onClick={() => void advanceReservation(reservation)} className="mt-4 rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800">다음 상태로 진행</button>
                            </div>
                          )) : <EmptyState title="예약이 없습니다." description="시드 예약이 비어 있으면 starter를 다시 생성하십시오." />}
                        </div>
                      </div>
                    ))}
                  </div>
                </Panel>

                <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
                  <Panel title="고객 지원 응답" description="실제 티켓과 메시지 흐름을 운영 포털처럼 검증합니다.">
                    <div className="space-y-4">
                      {state.partner.tickets.length ? state.partner.tickets.map((ticket) => (
                        <div key={ticket.id} className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-base font-semibold text-slate-950">{asString(ticket.title)}</p>
                              <p className="mt-1 text-sm text-slate-500">{asString(ticket.requester_key)} · {asString(ticket.priority)} · {asString(ticket.state)}</p>
                            </div>
                            <StatusBadge status={asString(ticket.state) === "resolved" ? "success" : "idle"} label={asString(ticket.state) || "open"} />
                          </div>
                          <div className="mt-3 rounded-[18px] bg-slate-50 p-3 text-sm leading-6 text-slate-600">
                            {asString(latestTicketMessageByTicket.get(ticket.id)?.body) || "아직 메시지가 없습니다."}
                          </div>
                          <div className="mt-3 flex gap-3">
                            <input
                              value={ticketDrafts[ticket.id] ?? ""}
                              onChange={(event) => setTicketDrafts((current) => ({ ...current, [ticket.id]: event.target.value }))}
                              className="h-11 flex-1 rounded-full border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none transition focus:border-indigo-400"
                              placeholder="답변 메시지를 입력하세요."
                            />
                            <button type="button" onClick={() => void replyTicket(ticket.id)} className="h-11 rounded-full bg-indigo-500 px-4 text-sm font-semibold text-white transition hover:bg-indigo-400">답변 등록</button>
                          </div>
                        </div>
                      )) : <EmptyState title="티켓이 없습니다." description="시드된 고객 지원 데이터가 여기에 표시됩니다." />}
                    </div>
                  </Panel>

                  <div className="space-y-6">
                    <Panel title="CRM 파이프라인" description="리드를 다음 단계로 이동시켜 상태 전이를 확인합니다.">
                      <div className="grid gap-4">
                        {state.partner.stages.map((stage) => (
                          <div key={stage.id} className="rounded-[20px] border border-slate-200 bg-slate-50 p-4">
                            <div className="flex items-center justify-between">
                              <h4 className="text-sm font-semibold text-slate-950">{asString(stage.name)}</h4>
                              <span className="text-xs text-slate-400">{leadsByStage.get(stage.id)?.length ?? 0}</span>
                            </div>
                            <div className="mt-3 space-y-3">
                              {(leadsByStage.get(stage.id) ?? []).map((lead) => (
                                <div key={lead.id} className="rounded-[18px] bg-white p-3 shadow-sm">
                                  <p className="text-sm font-semibold text-slate-950">{asString(lead.name)}</p>
                                  <p className="mt-1 text-xs text-slate-500">{asString(lead.company)} · {asNumber(lead.value, 0).toLocaleString("ko-KR")}원</p>
                                  <button type="button" onClick={() => void advanceLead(lead.id)} className="mt-3 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50">다음 단계 이동</button>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </Panel>

                    <Panel title="승인 문서" description="운영 문서와 현재 상태를 함께 확인합니다.">
                      <div className="space-y-3">
                        {state.partner.documents.length ? state.partner.documents.map((document) => (
                          <div key={document.id} className="rounded-[18px] border border-slate-200 bg-white p-4 shadow-sm">
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-sm font-semibold text-slate-950">{asString(document.title)}</p>
                              <StatusBadge status={asString(document.status) === "approved" ? "success" : "idle"} label={asString(document.status) || "draft"} />
                            </div>
                            <p className="mt-2 text-sm leading-6 text-slate-600">{asString(document.body)}</p>
                          </div>
                        )) : <EmptyState title="문서가 없습니다." description="시드 승인 문서가 여기에 표시됩니다." />}
                      </div>
                    </Panel>
                  </div>
                </div>
              </>
            ) : null}

            {surface === "ops" ? (
              <>
                <Panel title="운영 개요" description="배포, 큐, 백업, 감사 로그 수치를 실제 운영 콘솔처럼 확인합니다.">
                  <div className="grid gap-4 md:grid-cols-4">
                    <MetricCard label="이벤트 24h" value={String(state.ops.overview.metrics?.events24h ?? 0)} />
                    <MetricCard label="큐 backlog" value={String(state.ops.overview.metrics?.queuedJobs ?? 0)} />
                    <MetricCard label="백업 30d" value={String(state.ops.overview.metrics?.backups30d ?? 0)} />
                    <MetricCard label="릴리즈 30d" value={String(state.ops.overview.metrics?.releases30d ?? 0)} />
                  </div>
                  <div className="mt-5 grid gap-4 md:grid-cols-3">
                    <div className="rounded-[20px] border border-slate-200 bg-slate-50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">배포 버전</p>
                      <p className="mt-3 text-base font-semibold text-slate-950">{state.ops.overview.deployment?.currentVersionId || "-"}</p>
                      <p className="mt-2 text-sm text-slate-500">{formatDateTime(state.ops.overview.deployment?.deployedAt)}</p>
                    </div>
                    <div className="rounded-[20px] border border-slate-200 bg-slate-50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">앱 데이터</p>
                      <p className="mt-3 text-base font-semibold text-slate-950">{state.ops.overview.metrics?.appRecords ?? 0} records</p>
                      <p className="mt-2 text-sm text-slate-500">{state.ops.overview.metrics?.appCollections ?? 0} collections</p>
                    </div>
                    <div className="rounded-[20px] border border-slate-200 bg-slate-50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">미디어 자산</p>
                      <p className="mt-3 text-base font-semibold text-slate-950">{state.ops.overview.metrics?.mediaAssets ?? 0} assets</p>
                      <p className="mt-2 text-sm text-slate-500">생성 시각 {formatDateTime(state.ops.overview.generatedAt)}</p>
                    </div>
                  </div>
                </Panel>

                <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
                  <Panel title="과금과 정산" description="청구/구독/정산 상태가 실제 데이터와 함께 보입니다.">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <MetricCard label="계정" value={String(state.ops.billing.accounts?.length ?? 0)} />
                      <MetricCard label="플랜" value={String(state.ops.billing.plans?.length ?? 0)} />
                      <MetricCard label="구독" value={String(state.ops.billing.subscriptions?.length ?? 0)} />
                      <MetricCard label="인보이스" value={String(state.ops.billing.invoices?.length ?? 0)} />
                    </div>
                    <div className="mt-4 space-y-3">
                      {(state.ops.billing.invoices ?? []).slice(0, 3).map((invoice) => (
                        <div key={invoice.id} className="rounded-[18px] border border-slate-200 bg-white p-4">
                          <p className="text-sm font-semibold text-slate-950">{asString(invoice.invoice_number) || invoice.id}</p>
                          <p className="mt-1 text-sm text-slate-500">{asString(invoice.status)} · {asNumber(invoice.total_amount_cents, 0).toLocaleString("ko-KR")} cents</p>
                        </div>
                      ))}
                    </div>
                  </Panel>

                  <Panel title="정책과 리스크" description="현재 규칙/요청/사건 수를 확인하고 즉시 정책 평가를 실행합니다." action={<button type="button" onClick={() => void evaluatePolicy()} className="rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800">정책 평가</button>}>
                    <div className="grid gap-4 md:grid-cols-4">
                      <MetricCard label="규칙" value={String(state.ops.policy.rules?.length ?? 0)} />
                      <MetricCard label="승인 요청" value={String(state.ops.policy.approvalRequests?.length ?? 0)} />
                      <MetricCard label="사건" value={String(state.ops.policy.incidents?.length ?? 0)} />
                      <MetricCard label="제재" value={String(state.ops.policy.sanctions?.length ?? 0)} />
                    </div>
                    <div className="mt-5 rounded-[22px] border border-slate-200 bg-slate-50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">마지막 평가</p>
                      <pre className="mt-3 overflow-auto rounded-[16px] bg-slate-950 p-4 text-xs leading-6 text-slate-100">{JSON.stringify(evaluation ?? { message: "아직 실행하지 않았습니다." }, null, 2)}</pre>
                    </div>
                  </Panel>
                </div>

                <Panel title="운영 런북" description="실제 runbook 섹션이 여기에 노출됩니다.">
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                    {Object.entries(state.ops.runbook.sections ?? {}).map(([section, items]) => (
                      <div key={section} className="rounded-[20px] border border-slate-200 bg-slate-50 p-4">
                        <h4 className="text-sm font-semibold capitalize text-slate-950">{section}</h4>
                        <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
                          {items.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </Panel>
              </>
            ) : null}
          </div>

          <aside className="space-y-6">
            <Panel title="현재 상태" description="검증 전용 액션 실행 상태와 최근 결과를 표시합니다." action={<StatusBadge status={actionStatus} label={actionStatus === "loading" ? "실행 중" : actionStatus === "success" ? "최근 실행 성공" : actionStatus === "error" ? "최근 실행 실패" : "대기"} />}>
              <div className="space-y-4 text-sm text-slate-600">
                <div className="rounded-[20px] border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">마지막 액션</p>
                  <p className="mt-3 font-semibold text-slate-950">{actionLabel || "아직 실행되지 않았습니다."}</p>
                  {error ? <p className="mt-2 text-rose-600">{error}</p> : null}
                </div>
                <div className="rounded-[20px] border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">현재 앱 세션</p>
                  <p className="mt-3 text-slate-950">{sessionUser ? sessionUser.email : "로그인 안 됨"}</p>
                  <p className="mt-1 text-slate-500">{sessionUser?.display_name || "데모 계정을 선택해 로그인하십시오."}</p>
                </div>
              </div>
            </Panel>

            <Panel title="최근 실행 로그" description="서비스 화면에서 실제로 눌러본 액션 기록입니다.">
              <div className="space-y-3">
                {logs.length ? logs.map((entry) => (
                  <div key={entry.id} className="rounded-[18px] border border-slate-200 bg-white p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-slate-950">{entry.title}</p>
                      <StatusBadge status={entry.status} label={entry.status === "success" ? "성공" : "실패"} />
                    </div>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{entry.detail}</p>
                    <p className="mt-2 text-xs text-slate-400">{formatDateTime(entry.createdAt)}</p>
                  </div>
                )) : <EmptyState title="아직 실행 로그가 없습니다." description="각 화면에서 액션을 실행하면 결과가 여기에 남습니다." />}
              </div>
            </Panel>
          </aside>
        </div>
        </div>
      </div>
    </div>
  );
}
