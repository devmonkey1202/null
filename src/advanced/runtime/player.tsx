"use client";



import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

import RuntimeRenderer, { buildControlRoles, type NavigateEvent, type ControlRole } from "./renderer";

import type { Doc, Node, PrototypeAction, PrototypeCondition, PrototypeInteraction, PrototypeTransitionType, SerializableDoc, GlobalStateItem } from "../doc/scene";
import { cloneDoc, hydrateDoc } from "../doc/scene";
import { buildServiceActionRequest, resolveServiceFieldMeta } from "./serviceActionRuntime";

import { applyConstraintsOnResize, layoutDoc } from "../layout/engine";
import {
  buildOverlayBackdropStyle,
  buildOverlayCardStyle,
  buildOverlayShellStyle,
  buildOverlayTransitionAnimationStyle,
  buildPageTransitionAnimationStyle,
  deriveSmartAnimatePlan,
  normalizeOverlayPresentation,
  type OverlayPresentation,
  type SmartAnimatePlan,
} from "../prototype/prototypeMotion";

import { subscribeStorageKey } from "@/lib/synced-storage";

import type { Variable } from "../doc/scene";



type CollectionCache = Record<string, Array<Record<string, unknown>>>;
type GlobalStateValue = string | number | boolean | Record<string, unknown> | unknown[] | null;


function evaluateFormula(formula: string, vars: Record<string, string | number | boolean>, allVars: Variable[], collectionCache?: CollectionCache): string | number | boolean {

  const ctx: Record<string, unknown> = {};

  for (const v of allVars) {

    const val = vars[v.id] ?? vars[v.name] ?? v.value;

    ctx[v.name] = val;

    ctx[v.id] = val;

  }

  for (const [k, v] of Object.entries(vars)) {

    ctx[k] = v;

  }



  const fnMap: Record<string, (...args: unknown[]) => unknown> = {

    IF: (cond: unknown, a: unknown, b: unknown) => (cond ? a : b),

    AND: (...args: unknown[]) => args.every(Boolean),

    OR: (...args: unknown[]) => args.some(Boolean),

    NOT: (a: unknown) => !a,

    ABS: (a: unknown) => Math.abs(Number(a)),

    ROUND: (a: unknown, d?: unknown) => {

      const factor = Math.pow(10, Number(d ?? 0));

      return Math.round(Number(a) * factor) / factor;

    },

    FLOOR: (a: unknown) => Math.floor(Number(a)),

    CEIL: (a: unknown) => Math.ceil(Number(a)),

    MIN: (...args: unknown[]) => Math.min(...args.map(Number)),

    MAX: (...args: unknown[]) => Math.max(...args.map(Number)),

    SUM: (...args: unknown[]) => args.reduce((s: number, v) => s + Number(v), 0),

    CONCAT: (...args: unknown[]) => args.map(String).join(""),

    UPPER: (a: unknown) => String(a).toUpperCase(),

    LOWER: (a: unknown) => String(a).toLowerCase(),

    TRIM: (a: unknown) => String(a).trim(),

    LEN: (a: unknown) => String(a).length,

    SUBSTR: (a: unknown, start: unknown, len?: unknown) => String(a).substring(Number(start), len !== undefined ? Number(start) + Number(len) : undefined),

    REPLACE: (a: unknown, b: unknown, c: unknown) => String(a).replaceAll(String(b), String(c)),

    NOW: () => new Date().toISOString(),

    TODAY: () => new Date().toISOString().slice(0, 10),

    NUMBER: (a: unknown) => Number(a),

    STRING: (a: unknown) => String(a),

    BOOL: (a: unknown) => Boolean(a),

    COLLECTION: (slug: unknown) => {

      const records = collectionCache?.[String(slug)] ?? [];

      return {

        count: () => records.length,

        sum: (field: unknown) => records.reduce((s, r) => s + Number((r.data as Record<string, unknown>)?.[String(field)] ?? r[String(field)] ?? 0), 0),

        avg: (field: unknown) => {

          if (records.length === 0) return 0;

          const total = records.reduce((s, r) => s + Number((r.data as Record<string, unknown>)?.[String(field)] ?? r[String(field)] ?? 0), 0);

          return total / records.length;

        },

        min: (field: unknown) => records.length === 0 ? 0 : Math.min(...records.map((r) => Number((r.data as Record<string, unknown>)?.[String(field)] ?? r[String(field)] ?? 0))),

        max: (field: unknown) => records.length === 0 ? 0 : Math.max(...records.map((r) => Number((r.data as Record<string, unknown>)?.[String(field)] ?? r[String(field)] ?? 0))),

        where: (field: unknown, op: unknown, value: unknown) => {

          const f = String(field);

          const filtered = records.filter((r) => {

            const v = (r.data as Record<string, unknown>)?.[f] ?? r[f];

            switch (String(op)) {

              case "==": case "eq": return v == value;

              case "!=": case "neq": return v != value;

              case ">": return Number(v) > Number(value);

              case "<": return Number(v) < Number(value);

              default: return false;

            }

          });

          return {

            count: () => filtered.length,

            sum: (sf: unknown) => filtered.reduce((s, r) => s + Number((r.data as Record<string, unknown>)?.[String(sf)] ?? r[String(sf)] ?? 0), 0),

            avg: (sf: unknown) => filtered.length === 0 ? 0 : filtered.reduce((s, r) => s + Number((r.data as Record<string, unknown>)?.[String(sf)] ?? r[String(sf)] ?? 0), 0) / filtered.length,

            records: filtered,

          };

        },

        records,

        pluck: (field: unknown) => records.map((r) => (r.data as Record<string, unknown>)?.[String(field)] ?? r[String(field)]),

      };

    },

    COUNT: (arr: unknown) => Array.isArray(arr) ? arr.length : 0,

    AVG: (...args: unknown[]) => { const nums = args.map(Number); return nums.length === 0 ? 0 : nums.reduce((a, b) => a + b, 0) / nums.length; },

  };



  const paramNames = Object.keys(ctx);

  const paramValues = Object.values(ctx);

  const fnNames = Object.keys(fnMap);

  const fnValues = Object.values(fnMap);



  try {

    const fn = new Function(...fnNames, ...paramNames, `"use strict"; return (${formula});`);

    const result = fn(...fnValues, ...paramValues);

    if (typeof result === "string" || typeof result === "number" || typeof result === "boolean") return result;

    return String(result ?? "");

  } catch {

    return "";

  }

}



function computeAllFormulas(variables: Variable[], overrides: Record<string, string | number | boolean>, collectionCache?: CollectionCache): Record<string, string | number | boolean> {

  const computed = variables.filter((v) => v.computed?.formula);

  if (computed.length === 0) return overrides;



  const current = { ...overrides };

  const MAX_PASSES = 5;

  for (let pass = 0; pass < MAX_PASSES; pass++) {

    let changed = false;

    for (const v of computed) {

      const result = evaluateFormula(v.computed!.formula, current, variables, collectionCache);

      const key = v.id;

      if (current[key] !== result) {

        current[key] = result;

        current[v.name] = result;

        changed = true;

      }

    }

    if (!changed) break;

  }

  return current;

}



type Props = {

  doc: Doc | SerializableDoc;

  initialPageId?: string | null;

  /** NOTE: comment removed (encoding issue). */

  initialQueryParams?: Record<string, string>;

  /** NOTE: comment removed (encoding issue). */

  appPageId?: string;

  className?: string;

  onPageChange?: (pageId: string) => void;

  fitToContent?: boolean;

  previewMode?: boolean;

  chatRefetchSignal?: number;

  onChatSent?: () => void;

};



type PageTransitionState = {

  type: PrototypeTransitionType;

  fromId: string;

  toId: string;

  phase: "start" | "active";

  duration?: number;

  easing?: string;

  smartPlan?: SmartAnimatePlan | null;

};



type OverlayTransitionState = {

  type: PrototypeTransitionType;

  overlayId: string;

  presentation: OverlayPresentation;

  mode: "enter" | "exit";

  phase: "start" | "active";

  duration?: number;

  easing?: string;

  smartPlan?: SmartAnimatePlan | null;

};

type OverlayEntry = {
  id: string;
  pageId: string;
  presentation: OverlayPresentation;
  smartPlan?: SmartAnimatePlan | null;
};



const TRANSITION_DURATION: Record<PrototypeTransitionType, number> = {

  instant: 0,

  fade: 220,

  "slide-left": 260,

  "slide-right": 260,

  smart: 300,

};

const DEFAULT_OVERLAY_CLOSE: PrototypeTransitionType = "fade";

const ACTIVE_CHOICE_FILL = "#DBEAFE";

const ACTIVE_CHOICE_TEXT = "#2563EB";



const deferStateUpdate = (fn: () => void) => {

  if (typeof queueMicrotask === "function") {

    queueMicrotask(fn);

  } else {

    Promise.resolve().then(fn);

  }

};



type FieldMeta = {

  label: string;

  key: string;

  valueHint?: string;

  valueType?: "string" | "number" | "boolean" | "json" | "email" | "password" | "message" | "id";

  required?: boolean;

  fallbackValue?: string | number | boolean | Record<string, unknown> | unknown[] | null;

};

function coerceControlFieldValue(raw: string, meta?: FieldMeta) {
  const trimmed = raw.trim();
  if (trimmed === "") return "";
  if (meta?.valueType === "number") {
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : raw;
  }
  if (meta?.valueType === "boolean") {
    const lower = trimmed.toLowerCase();
    if (lower === "true") return true;
    if (lower === "false") return false;
  }
  if (meta?.valueType === "json") {
    try {
      return JSON.parse(raw) as Record<string, unknown> | unknown[] | null;
    } catch {
      return raw;
    }
  }
  return raw;
}



function normalizeFieldLabel(label: string) {

  return label

    .trim()

    .toLowerCase()

    .replace(/\[.*?\]/g, "")

    .replace(/[:?\-]/g, "")

    .replace(/\s+/g, "");

}



function stripFieldKey(label: string) {

  return label

    .replace(/^\s*(?:\[[^\]]+\]|\([^\)]+\)\s*)+/u, "")

    .replace(/^[\s:\-]+/g, "")

    .replace(/\s+/g, " ")

    .trim();

}

type ServiceRecord = Record<string, unknown>;

function asServiceItems(payload: unknown): ServiceRecord[] {
  if (!payload || typeof payload !== "object") return [];
  const items = (payload as { items?: unknown }).items;
  return Array.isArray(items) ? (items as ServiceRecord[]) : [];
}

function readServiceRecordValue(record: ServiceRecord | null | undefined, ...keys: string[]) {
  if (!record) return undefined;
  const data =
    record.data && typeof record.data === "object" && !Array.isArray(record.data)
      ? (record.data as Record<string, unknown>)
      : null;
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) return record[key];
    if (data && data[key] !== undefined && data[key] !== null) return data[key];
  }
  return undefined;
}

function joinServiceValues(values: Array<unknown>, sep: string) {
  return values
    .map((value) => (value == null ? "" : String(value).trim()))
    .filter(Boolean)
    .join(sep);
}

function buildPartnerPortalVariableUpdates(
  input: {
    reservationResources?: ServiceRecord[];
    reservations?: ServiceRecord[];
    ticketQueues?: ServiceRecord[];
    tickets?: ServiceRecord[];
    ticketMessages?: ServiceRecord[];
    crmStages?: ServiceRecord[];
    crmLeads?: ServiceRecord[];
    documents?: ServiceRecord[];
  },
  sep: string,
): Record<string, string | number | boolean> {
  const reservationResources = input.reservationResources ?? [];
  const reservations = input.reservations ?? [];
  const ticketQueues = input.ticketQueues ?? [];
  const tickets = input.tickets ?? [];
  const ticketMessages = input.ticketMessages ?? [];
  const crmStages = [...(input.crmStages ?? [])].sort((left, right) => {
    const leftOrder = Number(readServiceRecordValue(left, "order", "sort_order") ?? 0);
    const rightOrder = Number(readServiceRecordValue(right, "order", "sort_order") ?? 0);
    return leftOrder - rightOrder;
  });
  const crmLeads = input.crmLeads ?? [];
  const documents = input.documents ?? [];

  const activeReservation = reservations[0];
  const activeTicket = tickets[0];
  const primaryReservationResource = reservationResources[0];
  const primaryTicketQueue = ticketQueues[0];
  const activeLead = crmLeads[0];
  const activeLeadStageId = String(readServiceRecordValue(activeLead, "stageId", "stage_id") ?? "");
  const activeLeadPipelineId = String(readServiceRecordValue(activeLead, "pipelineId", "pipeline_id") ?? "");
  const pipelineStages = crmStages.filter((stage) => {
    const stagePipelineId = String(readServiceRecordValue(stage, "pipelineId", "pipeline_id") ?? "");
    return !activeLeadPipelineId || stagePipelineId === activeLeadPipelineId;
  });
  const activeStage =
    pipelineStages.find((stage) => String(stage.id ?? "") === activeLeadStageId) ??
    crmStages.find((stage) => String(stage.id ?? "") === activeLeadStageId) ??
    pipelineStages[0] ??
    crmStages[0];
  const activeStageIndex = pipelineStages.findIndex((stage) => String(stage.id ?? "") === String(activeStage?.id ?? ""));
  const nextStage =
    (activeStageIndex >= 0 ? pipelineStages[activeStageIndex + 1] : null) ??
    pipelineStages.find((stage) => !Boolean(readServiceRecordValue(stage, "terminal"))) ??
    activeStage;
  const activeDocument =
    documents.find((record) => String(readServiceRecordValue(record, "status", "state") ?? "") === "submitted") ??
    documents[0];

  return {
    reservation_titles: joinServiceValues(
      reservations.map((record) => readServiceRecordValue(record, "title", "name")),
      sep,
    ),
    reservation_states: joinServiceValues(
      reservations.map((record) => readServiceRecordValue(record, "status", "state")),
      sep,
    ),
    reservation_active_id: String(activeReservation?.id ?? ""),
    reservation_active_title: String(readServiceRecordValue(activeReservation, "title", "name") ?? ""),
    reservation_active_state: String(readServiceRecordValue(activeReservation, "status", "state") ?? ""),
    reservation_resource_id: String(
      primaryReservationResource?.id ??
        readServiceRecordValue(activeReservation, "resourceId", "resource_id") ??
        "",
    ),
    reservation_customer_key: String(
      readServiceRecordValue(activeReservation, "customerKey", "customer_key") ?? "",
    ),
    ticket_titles: joinServiceValues(
      tickets.map((record) => readServiceRecordValue(record, "title", "name")),
      sep,
    ),
    ticket_states: joinServiceValues(
      tickets.map((record) => readServiceRecordValue(record, "status", "state")),
      sep,
    ),
    ticket_messages: joinServiceValues(
      ticketMessages.map((record) => readServiceRecordValue(record, "body", "content", "message")),
      sep,
    ),
    ticket_active_id: String(activeTicket?.id ?? ""),
    ticket_active_title: String(readServiceRecordValue(activeTicket, "title", "name") ?? ""),
    ticket_active_state: String(readServiceRecordValue(activeTicket, "status", "state") ?? ""),
    ticket_queue_id: String(
      primaryTicketQueue?.id ??
        readServiceRecordValue(activeTicket, "queueId", "queue_id") ??
        "",
    ),
    ticket_requester_key: String(
      readServiceRecordValue(activeTicket, "requesterKey", "requester_key") ?? "",
    ),
    ticket_author_key: String(
      readServiceRecordValue(activeTicket, "assigneeKey", "assignee_key", "requesterKey", "requester_key") ?? "",
    ),
    crm_lead_titles: joinServiceValues(
      crmLeads.map((record) => readServiceRecordValue(record, "name", "title")),
      sep,
    ),
    crm_lead_stages: joinServiceValues(
      crmLeads.map((record) => {
        const stageId = String(readServiceRecordValue(record, "stageId", "stage_id") ?? "");
        const stage = crmStages.find((candidate) => String(candidate.id ?? "") === stageId);
        return readServiceRecordValue(stage, "name", "title", "key") ?? readServiceRecordValue(record, "status", "stage");
      }),
      sep,
    ),
    crm_active_lead_id: String(activeLead?.id ?? ""),
    crm_active_lead_title: String(readServiceRecordValue(activeLead, "name", "title") ?? ""),
    crm_active_stage_id: String(activeStage?.id ?? ""),
    crm_active_stage_name: String(readServiceRecordValue(activeStage, "name", "title", "key") ?? ""),
    crm_pipeline_id: activeLeadPipelineId,
    crm_next_stage_id: String(nextStage?.id ?? ""),
    crm_next_stage_name: String(readServiceRecordValue(nextStage, "name", "title", "key") ?? ""),
    crm_next_stage_key: String(readServiceRecordValue(nextStage, "key", "status") ?? ""),
    document_titles: joinServiceValues(
      documents.map((record) => readServiceRecordValue(record, "title", "name")),
      sep,
    ),
    document_states: joinServiceValues(
      documents.map((record) => readServiceRecordValue(record, "status", "state")),
      sep,
    ),
    document_active_id: String(activeDocument?.id ?? ""),
    document_active_title: String(readServiceRecordValue(activeDocument, "title", "name") ?? ""),
    document_active_status: String(readServiceRecordValue(activeDocument, "status", "state") ?? ""),
    document_request_id: String(readServiceRecordValue(activeDocument, "approvalRequestId", "approval_request_id") ?? ""),
    approval_status: String(readServiceRecordValue(activeDocument, "status", "state") ?? ""),
  };
}

async function fetchPartnerPortalVariableUpdatesForPage(pageId: string, sep: string) {
  if (!pageId || typeof window === "undefined") return {};
  const origin = window.location.origin;
  const anonId = localStorage.getItem("anon_user_id") ?? undefined;
  const headers: Record<string, string> = anonId ? { "x-anon-user-id": anonId } : {};
  const [reservationResourcesRes, reservationsRes, ticketQueuesRes, ticketsRes, ticketMessagesRes, crmStagesRes, crmLeadsRes, documentsRes] =
    await Promise.all([
      fetch(`${origin}/api/app/${pageId}/reservation_resources?limit=5`, { credentials: "include", headers }),
      fetch(`${origin}/api/app/${pageId}/reservations?limit=5`, { credentials: "include", headers }),
      fetch(`${origin}/api/app/${pageId}/ticket_queues?limit=5`, { credentials: "include", headers }),
      fetch(`${origin}/api/app/${pageId}/tickets?limit=5`, { credentials: "include", headers }),
      fetch(`${origin}/api/app/${pageId}/ticket_messages?limit=5`, { credentials: "include", headers }),
      fetch(`${origin}/api/app/${pageId}/crm_stages?limit=20`, { credentials: "include", headers }),
      fetch(`${origin}/api/app/${pageId}/crm_leads?limit=10`, { credentials: "include", headers }),
      fetch(`${origin}/api/app/${pageId}/documents?limit=10`, { credentials: "include", headers }),
    ]);
  const [reservationResourcesData, reservationsData, ticketQueuesData, ticketsData, ticketMessagesData, crmStagesData, crmLeadsData, documentsData] =
    await Promise.all([
      reservationResourcesRes.json().catch(() => null),
      reservationsRes.json().catch(() => null),
      ticketQueuesRes.json().catch(() => null),
      ticketsRes.json().catch(() => null),
      ticketMessagesRes.json().catch(() => null),
      crmStagesRes.json().catch(() => null),
      crmLeadsRes.json().catch(() => null),
      documentsRes.json().catch(() => null),
    ]);
  return buildPartnerPortalVariableUpdates(
    {
      reservationResources: asServiceItems(reservationResourcesData),
      reservations: asServiceItems(reservationsData),
      ticketQueues: asServiceItems(ticketQueuesData),
      tickets: asServiceItems(ticketsData),
      ticketMessages: asServiceItems(ticketMessagesData),
      crmStages: asServiceItems(crmStagesData),
      crmLeads: asServiceItems(crmLeadsData),
      documents: asServiceItems(documentsData),
    },
    sep,
  );
}

function buildPolicyEvaluationVariableUpdates(
  payload: unknown,
  sep: string,
): Record<string, string | number | boolean> {
  if (!payload || typeof payload !== "object") return {};
  const evaluation =
    "evaluation" in (payload as Record<string, unknown>)
      ? ((payload as Record<string, unknown>).evaluation as Record<string, unknown> | null | undefined)
      : (payload as Record<string, unknown>);
  if (!evaluation || typeof evaluation !== "object") return {};
  const reasons = Array.isArray(evaluation.reasons) ? evaluation.reasons.map((value) => String(value ?? "")).filter(Boolean) : [];
  return {
    policy_eval_decision: String(evaluation.decision ?? ""),
    policy_eval_allowed: Boolean(evaluation.allowed),
    policy_eval_requires_approval: Boolean(evaluation.requiresApproval),
    policy_eval_blocked: Boolean(evaluation.blocked),
    policy_eval_risk_score: Number(evaluation.riskScore ?? 0),
    policy_eval_reasons: reasons.join(sep),
    policy_eval_request_id: String(evaluation.approvalRequestId ?? ""),
  };
}

async function fetchOpsConsoleVariableUpdatesForPage(
  pageId: string,
  sep: string,
): Promise<Record<string, string | number | boolean>> {
  if (!pageId || typeof window === "undefined") return {};
  const origin = window.location.origin;
  const anonId = localStorage.getItem("anon_user_id") ?? undefined;
  const headers: Record<string, string> = anonId ? { "x-anon-user-id": anonId } : {};
  const [operationsRes, policyRes, billingRes, appAuditRes, pageAuditRes] = await Promise.all([
    fetch(`${origin}/api/app/${pageId}/operations`, { credentials: "include", headers }),
    fetch(`${origin}/api/app/${pageId}/policy`, { credentials: "include", headers }),
    fetch(`${origin}/api/app/${pageId}/billing`, { credentials: "include", headers }),
    fetch(`${origin}/api/app/${pageId}/audit-logs?limit=5`, { credentials: "include", headers }),
    fetch(`${origin}/api/pages/${pageId}/audit-logs?limit=5`, { credentials: "include", headers }),
  ]);
  const [operationsData, policyData, billingData, appAuditData, pageAuditData] = await Promise.all([
    operationsRes.json().catch(() => null),
    policyRes.json().catch(() => null),
    billingRes.json().catch(() => null),
    appAuditRes.json().catch(() => null),
    pageAuditRes.json().catch(() => null),
  ]);
  if (!operationsRes.ok && !policyRes.ok && !billingRes.ok) return {};

  const profile = operationsData?.profile ?? {};
  const overview = operationsData?.overview ?? {};
  const metrics = overview?.metrics ?? {};
  const deployment = overview?.deployment ?? {};
  const runbook = operationsData?.runbook?.sections ?? {};
  const releases = Array.isArray(profile?.releases) ? profile.releases : [];
  const backups = Array.isArray(profile?.backups) ? profile.backups : [];
  const latestRelease = releases[0] ?? null;
  const latestBackup = backups[0] ?? null;
  const rules = Array.isArray(policyData?.rules) ? policyData.rules : [];
  const incidents = Array.isArray(policyData?.incidents) ? policyData.incidents : [];
  const sanctions = Array.isArray(policyData?.sanctions) ? policyData.sanctions : [];
  const approvalRequests = Array.isArray(policyData?.approvalRequests) ? policyData.approvalRequests : [];
  const accounts = Array.isArray(billingData?.accounts) ? billingData.accounts : [];
  const invoices = Array.isArray(billingData?.invoices) ? billingData.invoices : [];
  const settlements = Array.isArray(billingData?.settlements) ? billingData.settlements : [];
  const latestAccount = accounts[0] ?? null;
  const latestInvoice = invoices[0] ?? null;
  const latestSettlement = settlements[0] ?? null;
  const appAuditLogs = Array.isArray(appAuditData?.logs) ? appAuditData.logs : [];
  const pageAuditLogs = Array.isArray(pageAuditData?.logs) ? pageAuditData.logs : [];
  const latestAppAudit = appAuditLogs[0] ?? null;
  const latestPageAudit = pageAuditLogs[0] ?? null;

  return {
    ops_release_count: String(releases.length),
    ops_latest_release_note: String(latestRelease?.note ?? ""),
    ops_latest_release_env: String(latestRelease?.environmentKey ?? ""),
    ops_latest_release_url: String(latestRelease?.deployUrl ?? deployment?.prodUrl ?? ""),
    ops_latest_release_at: String(latestRelease?.createdAt ?? ""),
    ops_deployed_at: String(deployment?.deployedAt ?? ""),
    ops_current_version_id: String(deployment?.currentVersionId ?? ""),
    ops_prod_url: String(deployment?.prodUrl ?? ""),
    ops_last_backup_kind: String(latestBackup?.kind ?? ""),
    ops_runbook_release: Array.isArray(runbook?.release) ? runbook.release.join(sep) : "",
    ops_runbook_rollback: Array.isArray(runbook?.rollback) ? runbook.rollback.join(sep) : "",
    ops_runbook_backup: Array.isArray(runbook?.backup) ? runbook.backup.join(sep) : "",
    ops_policy_rule_count: String(rules.length),
    ops_risk_incident_count: String(incidents.length),
    ops_sanction_count: String(sanctions.length),
    ops_approval_request_count: String(approvalRequests.length),
    ops_events_24h: String(metrics?.events24h ?? 0),
    ops_app_collections: String(metrics?.appCollections ?? 0),
    ops_app_records: String(metrics?.appRecords ?? 0),
    ops_media_assets: String(metrics?.mediaAssets ?? 0),
    ops_queued_jobs: String(metrics?.queuedJobs ?? 0),
    ops_dead_lettered_jobs: String(metrics?.deadLetteredJobs ?? 0),
    ops_page_audit_24h: String(metrics?.pageAudit24h ?? 0),
    ops_app_audit_24h: String(metrics?.appAudit24h ?? 0),
    ops_latest_app_audit_action: String(latestAppAudit?.action ?? ""),
    ops_latest_app_audit_at: String(latestAppAudit?.createdAt ?? ""),
    ops_latest_page_audit_action: String(latestPageAudit?.action ?? ""),
    ops_latest_page_audit_at: String(latestPageAudit?.createdAt ?? ""),
    billing_account_count: String(accounts.length),
    billing_invoice_count: String(invoices.length),
    billing_latest_account_id: String(latestAccount?.id ?? ""),
    billing_latest_invoice_id: String(latestInvoice?.id ?? ""),
    billing_latest_invoice_status: String(latestInvoice?.status ?? ""),
    billing_latest_invoice_total_cents: String(latestInvoice?.total_cents ?? 0),
    billing_latest_settlement_id: String(latestSettlement?.id ?? ""),
    billing_latest_settlement_status: String(latestSettlement?.status ?? ""),
    billing_latest_settlement_net_cents: String(latestSettlement?.net_cents ?? 0),
  };
}



const COOKIE_CONSENT_STORAGE_KEY = "null.runtime.cookieConsent";

const COOKIE_CONSENT_TTL_MS = 1000 * 60 * 60 * 24 * 30;

const LOCALE_STORAGE_KEY = "null.runtime.locale";

const THEME_STORAGE_KEY = "null.runtime.theme";

const ACCESSIBILITY_STORAGE_KEY = "null.runtime.accessibility";

const NOTIFICATION_MATRIX_STORAGE_KEY = "null.runtime.notificationMatrix";

const RESEND_COOLDOWN_MS = 1000 * 60;

const DELETE_COOLDOWN_MS = 1000 * 6;

const RESEND_LABEL_PATTERN = /재전송|다시\s*보내기|resend|send\s*again/i;

const SEARCH_INPUT_PATTERN = /검색|search/i;

const SEARCH_SECTION_PATTERN = /최근|추천|recent|recommend/i;

const SEARCH_CONTEXT_PATTERN = /검색|search/i;

const SEARCH_RESULT_PATTERN = /검색\s*결과|search\s*result|결과/i;

const PERMISSION_SECTION_PATTERN = /권한|permission/i;

const PERMISSION_ALLOW_PATTERN = /허용|allow|accept|동의|승인/i;

const PERMISSION_DENY_PATTERN = /거부|deny|reject|나중에|later|skip/i;

const NOTIFICATION_SECTION_PATTERN = /알림|notification/i;

const ONBOARDING_SECTION_PATTERN = /온보딩|onboarding|스와이프|swipe|slide/i;

const SETTINGS_SECTION_PATTERN = /설정|settings/i;

const FAQ_SECTION_PATTERN = /도움말|faq|help|support|문의/i;

const FAQ_SEARCH_PATTERN = /검색|search|find/i;

const BREADCRUMB_SECTION_PATTERN = /경로|breadcrumb/i;

const STICKY_CTA_PATTERN = /스티키|sticky.*cta|sticky/i;

const MODAL_SECTION_PATTERN = /모달|modal|시트|sheet/i;

const MODAL_OVERLAY_PATTERN = /오버레이|overlay/i;

const MODAL_OPEN_PATTERN = /열기|open|sheet|modal|모달/i;

const MODAL_CLOSE_PATTERN = /닫기|close|취소|cancel/i;

const MORE_ACTION_PATTERN = /더보기|more|see\s*all|see\s*more/i;

const SORT_PATTERN = /정렬|sort/i;

const FILTER_PATTERN = /필터|filter/i;

const SKIP_PATTERN = /바로가기|skip|스킵/i;

const CONTENT_SECTION_PATTERN = /콘텐츠|content|main/i;

const SELECT_TABS_PATTERN = /선택\s*탭|select\s*tabs|tab\s*filter/i;

const DATE_SLIDER_PATTERN = /날짜|date/i;

const PAGINATION_PATTERN = /페이지|pagination|pager/i;

const LOCALE_SECTION_PATTERN = /언어|로케일|language|locale/i;

const THEME_SECTION_PATTERN = /테마|theme|appearance/i;

const ACCESSIBILITY_SECTION_PATTERN = /접근성|accessibility|a11y/i;

const NOTIFICATION_MATRIX_PATTERN = /알림.*매트릭스|notification.*matrix|알림\s*설정|notification\s*setting/i;

const NOTIFICATION_SAVE_PATTERN = /저장|save|apply|확인/i;

const THEME_DARK_PATTERN = /dark|다크|야간/i;

const THEME_LIGHT_PATTERN = /light|라이트|밝은/i;

const THEME_SYSTEM_PATTERN = /system|auto|default|기본|자동/i;

const HIGH_CONTRAST_PATTERN = /고대비|high\s*contrast/i;

const LARGE_TEXT_PATTERN = /큰\s*글자|글자\s*크게|large\s*text|text\s*size|big\s*text/i;

const COOKIE_SETTINGS_PATTERN = /설정|manage|settings|preferences?/i;

const LIST_CONTAINER_PATTERN = /목록|리스트|list/i;

const LIST_ITEM_PATTERN = /리스트\s*아이템|list\s*item/i;

const RECOVERY_SECTION_PATTERN = /복구|recovery|reset|password/i;

const OTP_SECTION_PATTERN = /otp|2fa|인증|코드/i;

const OTP_LABEL_PATTERN = /otp|2fa|코드/i;

const DELETE_SECTION_PATTERN = /삭제|탈퇴|delete/i;

const SECURITY_SECTION_PATTERN = /보안|security/i;

const SECURITY_DETAIL_PATTERN = /보안.*(상세|내용|보기)|security.*(detail|view)/i;

const FAQ_DETAIL_PATTERN = /\bfaq\b.*(detail|view)|도움말.*(상세|보기)|help.*(detail|view)/i;

const HEADER_SECTION_PATTERN = /헤더|header/i;

const NAV_SECTION_PATTERN = /네비|nav|menu|메뉴/i;

const TABBAR_SECTION_PATTERN = /탭바|tabbar|tab\s*bar|탭/i;

const SIDEBAR_SECTION_PATTERN = /사이드바|sidebar/i;

const SIDEBAR_TOGGLE_PATTERN = /접기|collapse|expand|펼치|toggle/i;

const SIDEBAR_BRAND_PATTERN = /브랜드|brand|logo/i;

const PLAN_CARD_PATTERN = /플랜\s*카드|plan\s*card/i;

const PLAN_LABEL_PATTERN = /\bpro\b|프로|\bstandard\b|스탠다드|\bbasic\b|베이직|\benterprise\b|엔터프라이즈/i;

const PLAN_SECTION_PATTERN = /플랜|구독|upgrade|subscription/i;

const NOTIFICATION_FILTER_ALL_PATTERN = /전체|모두|all/i;

const NOTIFICATION_FILTER_UNREAD_PATTERN = /미읽음|안읽|읽지|아직|unread/i;

const NOTIFICATION_FILTER_READ_PATTERN = /읽음|read|done|complete/i;

const NOTIFICATION_SORT_NEWEST_PATTERN = /최신|최근|recent|newest|latest|desc/i;

const NOTIFICATION_SORT_OLDEST_PATTERN = /오래된|더오래|오래|oldest|asc/i;

const NOTIFICATION_DETAIL_PATTERN = /알림.*(상세|내용|보기)|notification.*(detail|item|view)/i;

const NOTIFICATION_LIST_PATTERN = /알림.*(센터|목록|list)/i;

const CONTENT_FEED_PATTERN = /콘텐츠\s*피드|content\s*feed|feed/i;

const CONTENT_DETAIL_PATTERN = /콘텐츠\s*상세|content\s*detail|detail/i;

const CONTENT_SORT_NEWEST_PATTERN = /최신|최근|recent|newest|latest|desc/i;

const CONTENT_SORT_OLDEST_PATTERN = /오래된|더오래|오래|oldest|asc/i;

const CONTENT_SORT_POPULAR_PATTERN = /인기|popular|top|trending/i;

const CONTENT_CARD_PATTERN = /콘텐츠\s*카드|content\s*card/i;

const COMMENT_SECTION_PATTERN = /댓글|comment|thread|reply/i;

const USER_CARD_SECTION_PATTERN = /사용자\s*카드|user\s*card/i;

const PROFILE_PAGE_PATTERN = /프로필|profile/i;

const TAG_SECTION_PATTERN = /태그|tag/i;

const BOOKMARK_SECTION_PATTERN = /북마크|bookmark|saved/i;

const RANKING_SECTION_PATTERN = /랭킹|ranking|leader/i;

const CHAT_LIST_SECTION_PATTERN = /채팅\s*목록|chat\s*list|inbox|dm\s*list|대화\s*목록/i;

const CHAT_ROOM_SECTION_PATTERN = /채팅\s*룸|chat\s*room|conversation|채팅\s*방/i;

const SHARE_ACTION_PATTERN = /공유|share/i;

const SAVE_ACTION_PATTERN = /저장|save|북마크|bookmark|좋아요|favorite|like/i;

const FOLLOW_ACTION_PATTERN = /팔로우|follow/i;

const LOAD_MORE_PATTERN = /더보기|load\s*more|more/i;

const PERIOD_FILTER_PATTERN = /이번\s*주|주간|이번\s*달|월간|이번\s*년|연간|week|month|year/i;


const ATTACHMENT_SECTION_PATTERN = /첨부|attachment|file|upload/i;

const EMOJI_PATTERN = /이모지|emoji/i;

const MENTION_SECTION_PATTERN = /멘션|mention/i;

const MENTION_FILTER_UNREAD_PATTERN = /안읽|미읽|unread|읽지\s*않/i;

const GROUP_CHANNEL_SECTION_PATTERN = /그룹\s*채널|group\s*channel/i;

const CHANNEL_LIST_PATTERN = /채널|channel/i;

const MEMBER_LIST_PATTERN = /멤버|member/i;

const CALL_SECTION_PATTERN = /콜|통화|call/i;

const CALL_STATUS_PATTERN = /연결|연결\s*중|통화\s*중|종료|ended|connected/i;

const CALL_MUTE_PATTERN = /음소거|mute/i;

const CALL_VIDEO_PATTERN = /비디오|video|camera/i;

const CALL_END_PATTERN = /종료|end|hang\s*up|leave/i;

const TODO_SECTION_PATTERN = /할\s*일|todo|task/i;

const TODO_ADD_PATTERN = /추가|add|새\s*할\s*일|새\s*작업/i;

const TODO_DELETE_PATTERN = /삭제|remove|delete/i;

const TODO_FILTER_DONE_PATTERN = /완료|done|completed/i;

const TODO_FILTER_PENDING_PATTERN = /미완료|진행|todo|pending|open/i;

const CALENDAR_SECTION_PATTERN = /캘린더|calendar/i;

const CALENDAR_VIEW_PATTERN = /월간|주간|일간|month|week|day/i;

const CALENDAR_PREV_PATTERN = /이전|prev|back/i;

const CALENDAR_NEXT_PATTERN = /다음|next|forward/i;

const CALENDAR_DATE_PATTERN = /날짜|date|\d{1,2}[\\./-]\d{1,2}/i;

const NOTE_SECTION_PATTERN = /노트|메모|note|editor/i;

const NOTE_TOOLBAR_PATTERN = /툴바|toolbar/i;

const NOTE_BOLD_PATTERN = /굵게|강조|bold/i;

const NOTE_ITALIC_PATTERN = /기울임|italic/i;

const NOTE_UNDERLINE_PATTERN = /밑줄|underline/i;

const NOTE_VERSION_PATTERN = /버전|version|history/i;

const NOTE_SYNC_PATTERN = /동기화|sync/i;

const MEMBER_ROLE_SECTION_PATTERN = /멤버.*(역할|권한)|member.*(role|permission)|role\s*table/i;

const MEMBER_ROLE_SAVE_PATTERN = /저장|save|apply/i;

const MEMBER_ROLE_AUDIT_PATTERN = /감사|audit|log|history/i;

const APPROVAL_SECTION_PATTERN = /승인|approval|review/i;

const APPROVAL_STEP_PATTERN = /단계|step|stage|progress/i;

const APPROVE_ACTION_PATTERN = /승인|approve|confirm/i;

const REJECT_ACTION_PATTERN = /반려|reject|decline|deny/i;

const APPROVAL_NOTIFY_PATTERN = /알림|notify|notification/i;

const KANBAN_SECTION_PATTERN = /칸반|kanban|board/i;

const KANBAN_COLUMN_PATTERN = /컬럼|column|list/i;

const KANBAN_MOVE_PATTERN = /이동|move|drag/i;

const GANTT_SECTION_PATTERN = /간트|gantt|timeline/i;

const GANTT_ZOOM_IN_PATTERN = /확대|zoom\s*in|줌\s*in/i;

const GANTT_ZOOM_OUT_PATTERN = /축소|zoom\s*out|줌\s*out/i;

const GANTT_SCROLL_PATTERN = /스크롤|scroll|pan/i;

const MEDIA_GALLERY_SECTION_PATTERN = /갤러리|gallery|media\s*grid|media\s*gallery/i;

const MEDIA_DETAIL_PATTERN = /상세|detail|view/i;

const LIGHTBOX_SECTION_PATTERN = /라이트박스|lightbox|viewer/i;

const LIGHTBOX_CLOSE_PATTERN = /닫기|close|dismiss|x/i;

const LIGHTBOX_NEXT_PATTERN = /다음|next|forward|>/i;

const LIGHTBOX_PREV_PATTERN = /이전|prev|back|</i;

const MEDIA_PLAYER_SECTION_PATTERN = /미디어\s*플레이어|media\s*player|video\s*player|player/i;

const MEDIA_PLAY_PATTERN = /재생|play/i;

const MEDIA_PAUSE_PATTERN = /일시정지|pause|stop/i;

const MEDIA_SEEK_FORWARD_PATTERN = /앞으로|forward|skip|>>/i;

const MEDIA_SEEK_BACK_PATTERN = /뒤로|back|rewind|<</i;

const MEDIA_VOLUME_UP_PATTERN = /볼륨.*올|크게|volume.*up|louder/i;

const MEDIA_VOLUME_DOWN_PATTERN = /볼륨.*내|작게|volume.*down|quieter/i;

const MEDIA_MUTE_PATTERN = /음소거|mute/i;

const MEDIA_STATUS_PATTERN = /상태|status|재생|pause|play|time|progress/i;

const STORY_SECTION_PATTERN = /스토리|story/i;

const STORY_NEXT_PATTERN = /다음|next|forward|>/i;

const STORY_PREV_PATTERN = /이전|prev|back|</i;

const STORY_PLAY_PATTERN = /재생|play/i;

const STORY_PAUSE_PATTERN = /일시정지|pause|stop/i;

const STORY_PROGRESS_PATTERN = /진행|progress|story/i;

const LIVE_SECTION_PATTERN = /라이브|live|stream/i;

const LIVE_STATUS_PATTERN = /상태|status|방송|stream/i;

const LIVE_VIEWER_PATTERN = /시청자|viewer|viewers|watching/i;

const KPI_SECTION_PATTERN = /kpi|지표|metric/i;

const CHART_SECTION_PATTERN = /차트|chart|graph/i;

const DATA_TABLE_SECTION_PATTERN = /테이블|table|data\s*table/i;

const TABLE_HEADER_PATTERN = /헤더|header|column/i;

const LOADING_PATTERN = /로딩|loading|skeleton|spinner/i;

const EMPTY_STATE_PATTERN = /빈\s*상태|없음|empty|no\s*data/i;

const USER_ADMIN_SECTION_PATTERN = /사용자\s*관리|user\s*manager|user\s*admin|users?/i;

const USER_STATUS_ACTIVE_PATTERN = /활성|active|enabled/i;

const USER_STATUS_INACTIVE_PATTERN = /비활성|inactive|disabled/i;

const USER_STATUS_SUSPENDED_PATTERN = /정지|suspended|blocked|banned/i;

const AUDIT_LOG_SECTION_PATTERN = /감사\s*로그|audit\s*log|activity\s*log/i;

const AUDIT_EXPORT_PATTERN = /내보내기|export|download/i;

const BILLING_SECTION_PATTERN = /빌링|billing|invoice|payment/i;

const INVOICE_ACTION_PATTERN = /인보이스|invoice|receipt/i;

const PAYMENT_STATUS_PATTERN = /결제|payment|paid|unpaid|overdue|failed/i;

const SYSTEM_CONSOLE_SECTION_PATTERN = /시스템\s*콘솔|system\s*console|console/i;

const CONSOLE_LEVEL_PATTERN = /debug|info|warn|error|fatal|trace/i;

const AUTO_SCROLL_PATTERN = /자동\s*스크롤|auto\s*scroll/i;

const DATA_TRANSFER_SECTION_PATTERN = /데이터\s*가져오기|데이터\s*내보내기|import|export|data\s*transfer/i;

const DATA_MAPPING_PATTERN = /매핑|map|mapping/i;

const DATA_VALIDATE_PATTERN = /검증|validate|validation|check/i;

const DATA_PROGRESS_PATTERN = /진행|progress|uploading|processing/i;

const MONITORING_SECTION_PATTERN = /모니터링|monitor|status|uptime|health/i;

const MONITORING_ALARM_PATTERN = /알람|alarm|alert/i;

const SKELETON_SECTION_PATTERN = /skeleton|loading/i;

const CONFIRM_MODAL_PATTERN = /확인|confirm|are\s*you\s*sure/i;

const ERROR_PAGE_PATTERN = /에러|error|404|500|not\s*found/i;

const ERROR_CODE_PATTERN = /코드|code|error\s*code/i;

const ERROR_LOG_PATTERN = /로그|log|report|detail/i;

const FORM_WIZARD_SECTION_PATTERN = /폼\s*위저드|wizard|step\s*form/i;

const FORM_NEXT_PATTERN = /다음|next|continue/i;

const FORM_PREV_PATTERN = /이전|prev|back/i;

const INPUT_PHONE_PATTERN = /전화|phone|mobile/i;

const INPUT_CARD_PATTERN = /카드|card/i;

const INPUT_DATE_PATTERN = /날짜|date|birthday|dob/i;

const INPUT_ZIP_PATTERN = /우편|zip|postal/i;

const ADDRESS_SECTION_PATTERN = /주소|address|zip\s*search/i;

const ADDRESS_SEARCH_PATTERN = /검색|search|find/i;


const ADDRESS_DETAIL_PATTERN = /상세|detail|apartment|suite/i;

const CART_SECTION_PATTERN = /장바구니|cart|basket/i;

const CART_QTY_PLUS_PATTERN = /추가|플러스|plus|\+/i;

const CART_QTY_MINUS_PATTERN = /감소|마이너스|minus|\-/i;

const CART_TOTAL_PATTERN = /합계|total|amount|sum/i;

const PAYMENT_METHOD_SECTION_PATTERN = /결제\s*수단|payment\s*method|card\s*list|billing/i;

const PAYMENT_ADD_PATTERN = /추가|add|new/i;

const PAYMENT_DELETE_PATTERN = /삭제|remove|delete/i;

const PAYMENT_DEFAULT_PATTERN = /기본|default|primary/i;

const PAYMENT_SELECT_PATTERN = /선택|select|use/i;

const PRICE_COMPARE_PATTERN = /비교|compare|highlight/i;

const PAYMENT_RESULT_PATTERN = /결제\s*결과|payment\s*result|result/i;


const PAYMENT_RETRY_PATTERN = /재시도|retry|try\s*again/i;

const PAYMENT_RECEIPT_PATTERN = /영수증|receipt|invoice/i;

const PAYMENT_HISTORY_PATTERN = /내역|history|transactions?/i;

const COUPON_SECTION_PATTERN = /쿠폰|coupon|promo/i;

const COUPON_APPLY_PATTERN = /적용|apply|redeem/i;

const COUPON_ERROR_PATTERN = /오류|error|invalid|failed/i;

const BLANK_TEMPLATE_PATTERN = /빈\s*템플릿|blank\s*template/i;

const GRID_GUIDE_PATTERN = /그리드|grid|guide|guideline/i;

const BLANK_INIT_PATTERN = /생성|create|start|add/i;

const LANDING_SECTION_PATTERN = /랜딩|landing|hero/i;

const ANCHOR_PATTERN = /섹션|anchor|jump|scroll/i;

const DASHBOARD_SECTION_PATTERN = /대시보드|dashboard|overview/i;


const LAYOUT_SAVE_PATTERN = /레이아웃|layout|save/i;

const COMMUNITY_SECTION_PATTERN = /커뮤니티|community|forum/i;

const RECOMMEND_PATTERN = /추천|recommend|suggest/i;

const WRITE_ACTION_PATTERN = /작성|write|compose|post/i;

const SERVICE_SECTION_PATTERN = /서비스|service|support|help/i;

const CONTACT_FORM_PATTERN = /문의|contact|inquiry|support/i;

const STEP_PROGRESS_PATTERN = /단계|step|progress/i;

const SECTION_HEADER_PATTERN = /섹션|section\s*header|section/i;

const ALL_FILTER_PATTERN = /전체|모두|all/i;

const BREADCRUMB_SEPARATOR_PATTERN = /^[\s>\/\u203A\u00BB\u2192\u2794|\u00B7\u2022\u2026]+$/;

const BREADCRUMB_SPLIT_PATTERN = /[>\/\u203A\u00BB\u2192\u2794|]+/;

const STICKY_CTA_DISMISS_MS = 1000 * 60 * 10;

const STICKY_CTA_SCROLL_THRESHOLD = 120;

const STICKY_CTA_STORAGE_PREFIX = "null.runtime.stickyCtaDismissed";

const APP_UPDATE_PATTERN = /업데이트|update|버전|version/i;

const APP_UPDATE_LATER_PATTERN = /나중에|later|dismiss|hide|다시\s*안\s*보기|숨기기/i;

const APP_UPDATE_STORAGE_KEY = "null.runtime.appUpdateDismissed";

const APP_UPDATE_DISMISS_MS = 1000 * 60 * 60 * 24;



type CookieConsentState = { status: "accepted" | "rejected"; timestamp: number };



function readCookieConsent(): CookieConsentState | null {

  if (typeof localStorage === "undefined") return null;

  try {

    const raw = localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY);

    if (!raw) return null;

    const parsed = JSON.parse(raw) as CookieConsentState;

    if (!parsed || typeof parsed !== "object") return null;

    if (parsed.status !== "accepted" && parsed.status !== "rejected") return null;

    if (typeof parsed.timestamp !== "number") return null;

    return parsed;

  } catch {

    return null;

  }

}



function isCookieConsentValid(state: CookieConsentState | null) {

  if (!state) return false;

  return Date.now() - state.timestamp < COOKIE_CONSENT_TTL_MS;

}



function normalizeChoiceLabel(label: string) {

  return label.trim().toLowerCase();

}



function isResendLabel(label: string) {

  return RESEND_LABEL_PATTERN.test(label);

}



function isPaginationGroupName(raw: string) {
  const name = raw.trim().toLowerCase();
  return (
    name.includes("pagination") ||
    name.includes("pager") ||
    name.includes("page") ||
    name.includes("페이지") ||
    name.includes("페이징")
  );
}



function isPrevLabel(raw: string) {
  const label = normalizeChoiceLabel(raw);
  return (
    label === "<" ||
    label.includes("prev") ||
    label.includes("previous") ||
    label.includes("back") ||
    label.includes("이전") ||
    label.includes("뒤로")
  );
}



function isNextLabel(raw: string) {
  const label = normalizeChoiceLabel(raw);
  return (
    label === ">" ||
    label.includes("next") ||
    label.includes("forward") ||
    label.includes("다음") ||
    label.includes("다음으로")
  );
}



function parseNumericLabel(raw: string) {

  const label = raw.trim();

  if (!/^\d+$/.test(label)) return null;

  const num = Number.parseInt(label, 10);

  return Number.isFinite(num) ? num : null;

}



function resolveTargetPlan(normalized: string) {

  if (normalized.includes("pro") || normalized.includes("프로")) return "pro";

  if (

    normalized.includes("standard") ||

    normalized.includes("스탠다드") ||

    normalized.includes("basic") ||

    normalized.includes("베이직")

  )

    return "standard";

  if (normalized.includes("enterprise") || normalized.includes("엔터프라이즈")) return "enterprise";

  return null;

}



const OPTIONAL_LABEL_PATTERN = /\[(?:선택|optional)\]|\((?:선택|optional)\)/i;

const REQUIRED_LABEL_PATTERN = /\[(?:필수|required)\]|\((?:필수|required)\)|필수|required/i;

const CONSENT_LABEL_PATTERN = /동의|약관|방침|consent|privacy/i;

const ALL_CONSENT_LABEL_PATTERN = /전체\s*동의|all\s*consent/i;



function isOptionalLabel(label: string) {

  return OPTIONAL_LABEL_PATTERN.test(label);

}



function isRequiredCheckboxLabel(label: string, key?: string) {

  if (isOptionalLabel(label)) return false;

  if (key === "terms") return true;

  return REQUIRED_LABEL_PATTERN.test(label) || CONSENT_LABEL_PATTERN.test(label);

}



function isAllConsentLabel(label: string) {

  return ALL_CONSENT_LABEL_PATTERN.test(label);

}



function matchesPattern(value: string, pattern: RegExp) {

  return pattern.test((value ?? "").trim().toLowerCase());

}



function findAncestorIdMatching(doc: Doc | SerializableDoc, nodeId: string, pattern: RegExp) {

  let current: Node | undefined | null = doc.nodes[nodeId];

  while (current) {

    const name = current.name ?? "";

    if (matchesPattern(name, pattern)) return current.id;

    current = current.parentId ? doc.nodes[current.parentId] : null;

  }

  return null;

}



function findAncestorIdInSet(doc: Doc | SerializableDoc, nodeId: string, idSet: Set<string>) {

  let current: Node | undefined | null = doc.nodes[nodeId];

  while (current) {

    if (idSet.has(current.id)) return current.id;

    current = current.parentId ? doc.nodes[current.parentId] : null;

  }

  return null;

}



function hasAncestorMatching(doc: Doc | SerializableDoc, nodeId: string, pattern: RegExp) {

  return Boolean(findAncestorIdMatching(doc, nodeId, pattern));

}



function collectTextContent(doc: Doc | SerializableDoc, rootId: string) {

  const parts: string[] = [];

  const stack = [rootId];

  const visited = new Set<string>();

  while (stack.length) {

    const id = stack.pop();

    if (!id || visited.has(id)) continue;

    visited.add(id);

    const node = doc.nodes[id];

    if (!node) continue;

    if (node.type === "text" && node.text?.value) parts.push(node.text.value);

    if (node.children?.length) stack.push(...node.children);

  }

  return parts.join(" ").trim();

}



function parseStringList(raw: string, splitter: RegExp) {

  return raw

    .split(splitter)

    .map((item) => item.trim())

    .filter(Boolean);

}



function coerceBoolean(value: unknown) {

  if (typeof value === "boolean") return value;

  if (typeof value === "number" && Number.isFinite(value)) return value > 0;

  if (typeof value === "string") {

    const normalized = value.trim().toLowerCase();

    if (!normalized) return null;

    if (["true", "1", "yes", "y", "on", "allow", "allowed"].includes(normalized)) return true;

    if (["false", "0", "no", "n", "off", "deny", "denied"].includes(normalized)) return false;

  }

  return null;

}



function parseVersionSegments(value: unknown) {

  if (value === null || value === undefined) return null;

  const raw = String(value).trim();

  if (!raw) return null;

  const match = raw.match(/\d+(?:\.\d+)*/);

  if (!match) return null;

  const parts = match[0]

    .split(".")

    .map((segment) => Number.parseInt(segment, 10))

    .filter((num) => Number.isFinite(num));

  return parts.length ? parts : null;

}



function resolveVersionForKeys(overrides: Record<string, string | number | boolean>, keys: string[]) {

  for (const key of keys) {

    if (!(key in overrides)) continue;

    const parsed = parseVersionSegments(overrides[key]);

    if (parsed) return parsed;

  }

  return null;

}



function compareVersionSegments(left: number[], right: number[]) {

  const length = Math.max(left.length, right.length);

  for (let idx = 0; idx < length; idx += 1) {

    const a = left[idx] ?? 0;

    const b = right[idx] ?? 0;

    if (a !== b) return a - b;

  }

  return 0;

}



function isBreadcrumbSeparator(value: string) {

  return BREADCRUMB_SEPARATOR_PATTERN.test(value.trim());

}



function resolveBreadcrumbItems(

  variableOverrides: Record<string, string | number | boolean>,

  fallbackLabel?: string | null,

) {

  const raw =

    (typeof variableOverrides.breadcrumb === "string" && variableOverrides.breadcrumb) ||

    (typeof variableOverrides.breadcrumbs === "string" && variableOverrides.breadcrumbs) ||

    (typeof variableOverrides.crumbs === "string" && variableOverrides.crumbs) ||

    (typeof variableOverrides.path === "string" && variableOverrides.path) ||

    "";

  if (raw && typeof raw === "string") {

    const parsed = parseStringList(raw, BREADCRUMB_SPLIT_PATTERN);

    if (parsed.length) return parsed;

  }

  const indexed = Object.entries(variableOverrides)

    .filter(([key]) => /^crumbs?[_-]\d+$/i.test(key) || /^breadcrumb[_-]\d+$/i.test(key))

    .map(([key, value]) => ({ key, value }))

    .sort((a, b) => {

      const aNum = Number(a.key.match(/\d+/)?.[0] ?? 0);

      const bNum = Number(b.key.match(/\d+/)?.[0] ?? 0);

      return aNum - bNum;

    })

    .map(({ value }) => String(value ?? "").trim())

    .filter(Boolean);

  if (indexed.length) return indexed;

  if (fallbackLabel) return [fallbackLabel];

  return [];

}



function resolveThemeKey(label: string) {

  const value = label.trim();

  if (!value) return null;

  if (THEME_DARK_PATTERN.test(value)) return "dark";

  if (THEME_LIGHT_PATTERN.test(value)) return "light";

  if (THEME_SYSTEM_PATTERN.test(value)) return "system";

  return normalizeLooseLabel(value) || null;

}



function resolveLocaleMode(label: string, modes: string[]) {

  const normalized = normalizeLooseLabel(label);

  if (!normalized) return null;

  const normalizedModes = modes.map((mode) => ({ mode, key: normalizeLooseLabel(mode) }));

  const direct = normalizedModes.find((entry) => entry.key && (entry.key === normalized || entry.key.includes(normalized) || normalized.includes(entry.key)));

  if (direct) return direct.mode;

  const map: Array<{ pattern: RegExp; code: string }> = [

    { pattern: /ko|kr|한국|한글|korean/i, code: "ko" },

    { pattern: /en|영어|english/i, code: "en" },

    { pattern: /ja|jp|일본|日本|japanese/i, code: "ja" },

    { pattern: /zh|cn|중국|中文|chinese/i, code: "zh" },

  ];

  const match = map.find((entry) => entry.pattern.test(label));

  if (match) {

    const candidate = normalizedModes.find((entry) => entry.key.includes(match.code));

    if (candidate) return candidate.mode;

  }

  return null;

}



function resolveLocaleCode(label: string) {

  const value = label.trim();

  if (!value) return null;

  if (/ko|kr|한국|한글|korean/i.test(value)) return "ko";

  if (/en|영어|english/i.test(value)) return "en";

  if (/ja|jp|일본|日本|japanese/i.test(value)) return "ja";

  if (/zh|cn|중국|中文|chinese/i.test(value)) return "zh";

  const normalized = normalizeLooseLabel(value);

  if (normalized.length >= 2) return normalized.slice(0, 2);

  return null;

}



function findSearchResultPageId(doc: Doc | SerializableDoc) {

  return doc.pages.find((page) => matchesPattern(page.name ?? "", SEARCH_RESULT_PATTERN))?.id ?? null;

}



function normalizeLooseLabel(label: string) {

  return (label ?? "")

    .trim()

    .toLowerCase()

    .replace(/\s+/g, "")

    .replace(/[^\p{L}\p{N}]+/gu, "");

}



function isListItemName(label: string) {

  return matchesPattern(label, LIST_ITEM_PATTERN);

}



function isContentCardName(label: string) {

  return matchesPattern(label, CONTENT_CARD_PATTERN);

}



function findNextPageId(doc: Doc | SerializableDoc, currentPageId: string | null | undefined) {

  if (!currentPageId) return null;

  const pages = Array.isArray(doc.pages) ? doc.pages : [];

  const index = pages.findIndex((page) => page.id === currentPageId);

  if (index < 0) return null;

  return pages[index + 1]?.id ?? null;

}



function findNotificationDetailPageId(doc: Doc | SerializableDoc, currentPageId: string | null | undefined) {

  const pages = Array.isArray(doc.pages) ? doc.pages : [];

  const detail = pages.find((page) => page.id !== currentPageId && matchesPattern(page.name ?? "", NOTIFICATION_DETAIL_PATTERN));

  if (detail) return detail.id;

  const fallback = pages.find(

    (page) =>

      page.id !== currentPageId &&

      matchesPattern(page.name ?? "", NOTIFICATION_SECTION_PATTERN) &&

      !matchesPattern(page.name ?? "", NOTIFICATION_LIST_PATTERN),

  );

  return fallback?.id ?? null;

}



function findFaqDetailPageId(doc: Doc | SerializableDoc, currentPageId: string | null | undefined) {

  const pages = Array.isArray(doc.pages) ? doc.pages : [];

  const detail = pages.find((page) => page.id !== currentPageId && matchesPattern(page.name ?? "", FAQ_DETAIL_PATTERN));

  if (detail) return detail.id;

  const fallback = pages.find(

    (page) =>

      page.id !== currentPageId &&

      matchesPattern(page.name ?? "", FAQ_SECTION_PATTERN) &&

      !matchesPattern(page.name ?? "", FAQ_DETAIL_PATTERN),

  );

  return fallback?.id ?? null;

}



function findSecurityDetailPageId(doc: Doc | SerializableDoc, currentPageId: string | null | undefined) {

  const pages = Array.isArray(doc.pages) ? doc.pages : [];

  const detail = pages.find((page) => page.id !== currentPageId && matchesPattern(page.name ?? "", SECURITY_DETAIL_PATTERN));

  if (detail) return detail.id;

  const fallback = pages.find(

    (page) =>

      page.id !== currentPageId &&

      matchesPattern(page.name ?? "", SECURITY_SECTION_PATTERN) &&

      !matchesPattern(page.name ?? "", SECURITY_DETAIL_PATTERN),

  );

  return fallback?.id ?? null;

}



function findContentDetailPageId(doc: Doc | SerializableDoc, currentPageId: string | null | undefined) {

  const pages = Array.isArray(doc.pages) ? doc.pages : [];

  const detail = pages.find((page) => page.id !== currentPageId && matchesPattern(page.name ?? "", CONTENT_DETAIL_PATTERN));

  if (detail) return detail.id;

  const fallback = pages.find(

    (page) =>

      page.id !== currentPageId &&

      matchesPattern(page.name ?? "", CONTENT_SECTION_PATTERN) &&

      !matchesPattern(page.name ?? "", CONTENT_FEED_PATTERN),

  );

  return fallback?.id ?? null;

}



function findChatRoomPageId(doc: Doc | SerializableDoc, currentPageId: string | null | undefined) {

  const pages = Array.isArray(doc.pages) ? doc.pages : [];

  const detail = pages.find((page) => page.id !== currentPageId && matchesPattern(page.name ?? "", CHAT_ROOM_SECTION_PATTERN));

  if (detail) return detail.id;

  const fallback = pages.find((page) => page.id !== currentPageId && matchesPattern(page.name ?? "", CHAT_LIST_SECTION_PATTERN));

  return fallback?.id ?? null;

}



function findUserProfilePageId(doc: Doc | SerializableDoc, currentPageId: string | null | undefined, label?: string | null) {

  if (label) {

    const byLabel = findPageIdByLabel(doc, label, currentPageId);

    if (byLabel) return byLabel;

  }

  const pages = Array.isArray(doc.pages) ? doc.pages : [];

  const detail = pages.find((page) => page.id !== currentPageId && matchesPattern(page.name ?? "", PROFILE_PAGE_PATTERN));

  if (detail) return detail.id;

  const fallback = pages.find((page) => page.id !== currentPageId && matchesPattern(page.name ?? "", USER_CARD_SECTION_PATTERN));

  return fallback?.id ?? null;

}



function findPageIdByLabel(doc: Doc | SerializableDoc, label: string, currentPageId?: string | null) {

  const target = normalizeLooseLabel(label);

  if (!target) return null;

  const pages = Array.isArray(doc.pages) ? doc.pages : [];

  const direct = pages.find((page) => {

    if (page.id === currentPageId) return false;

    const name = normalizeLooseLabel(page.name ?? "");

    return name === target || name.includes(target) || target.includes(name);

  });

  return direct?.id ?? null;

}



function findPrimaryTextNodeId(doc: Doc | SerializableDoc, rootId: string) {

  const root = doc.nodes[rootId];

  if (!root) return null;

  if (root.type === "text") return rootId;

  const stack = [...(root.children ?? [])];

  while (stack.length) {

    const id = stack.shift();

    if (!id) continue;

    const node = doc.nodes[id];

    if (!node) continue;

    if (node.type === "text") return id;

    if (node.children?.length) stack.push(...node.children);

  }

  return null;

}



function resolvePlanKey(label: string) {

  const normalized = normalizeLooseLabel(label);

  if (!normalized) return null;

  if (normalized.includes("pro") || normalized.includes("프로")) return "pro";

  if (normalized.includes("enterprise") || normalized.includes("엔터프라이즈")) return "enterprise";

  if (normalized.includes("standard") || normalized.includes("스탠다드")) return "standard";

  if (normalized.includes("basic") || normalized.includes("베이직")) return "basic";

  return null;

}



function isRecoveryContext(doc: Doc | SerializableDoc, pageId?: string | null, nodeId?: string | null) {

  if (pageId) {

    const page = doc.pages.find((item) => item.id === pageId);

    if (page && matchesPattern(page.name ?? "", RECOVERY_SECTION_PATTERN)) return true;

  }

  if (nodeId) return hasAncestorMatching(doc, nodeId, RECOVERY_SECTION_PATTERN);

  return false;

}



function isOtpContext(doc: Doc | SerializableDoc, pageId?: string | null, nodeId?: string | null) {

  if (pageId) {

    const page = doc.pages.find((item) => item.id === pageId);

    if (page && matchesPattern(page.name ?? "", OTP_SECTION_PATTERN)) return true;

  }

  if (nodeId) return hasAncestorMatching(doc, nodeId, OTP_SECTION_PATTERN);

  return false;

}



function isDeleteContext(doc: Doc | SerializableDoc, pageId?: string | null, nodeId?: string | null) {

  if (pageId) {

    const page = doc.pages.find((item) => item.id === pageId);

    if (page && matchesPattern(page.name ?? "", DELETE_SECTION_PATTERN)) return true;

  }

  if (nodeId) return hasAncestorMatching(doc, nodeId, DELETE_SECTION_PATTERN);

  return false;

}



function isSecurityContext(doc: Doc | SerializableDoc, pageId?: string | null, nodeId?: string | null) {

  if (pageId) {

    const page = doc.pages.find((item) => item.id === pageId);

    if (page && matchesPattern(page.name ?? "", SECURITY_SECTION_PATTERN)) return true;

  }

  if (nodeId) return hasAncestorMatching(doc, nodeId, SECURITY_SECTION_PATTERN);

  return false;

}



function isContentDetailContext(doc: Doc | SerializableDoc, pageId?: string | null, nodeId?: string | null) {

  if (pageId) {

    const page = doc.pages.find((item) => item.id === pageId);

    if (page && matchesPattern(page.name ?? "", CONTENT_DETAIL_PATTERN)) return true;

  }

  if (nodeId) return hasAncestorMatching(doc, nodeId, CONTENT_DETAIL_PATTERN);

  return false;

}



function isCommentContext(doc: Doc | SerializableDoc, pageId?: string | null, nodeId?: string | null) {

  if (pageId) {

    const page = doc.pages.find((item) => item.id === pageId);

    if (page && matchesPattern(page.name ?? "", COMMENT_SECTION_PATTERN)) return true;

  }

  if (nodeId) return hasAncestorMatching(doc, nodeId, COMMENT_SECTION_PATTERN);

  return false;

}



function isUserCardContext(doc: Doc | SerializableDoc, pageId?: string | null, nodeId?: string | null) {

  if (pageId) {

    const page = doc.pages.find((item) => item.id === pageId);

    if (page && matchesPattern(page.name ?? "", USER_CARD_SECTION_PATTERN)) return true;

  }

  if (nodeId) return hasAncestorMatching(doc, nodeId, USER_CARD_SECTION_PATTERN);

  return false;

}



function isTagContext(doc: Doc | SerializableDoc, pageId?: string | null, nodeId?: string | null) {

  if (pageId) {

    const page = doc.pages.find((item) => item.id === pageId);

    if (page && matchesPattern(page.name ?? "", TAG_SECTION_PATTERN)) return true;

  }

  if (nodeId) return hasAncestorMatching(doc, nodeId, TAG_SECTION_PATTERN);

  return false;

}



function isBookmarkContext(doc: Doc | SerializableDoc, pageId?: string | null, nodeId?: string | null) {

  if (pageId) {

    const page = doc.pages.find((item) => item.id === pageId);

    if (page && matchesPattern(page.name ?? "", BOOKMARK_SECTION_PATTERN)) return true;

  }

  if (nodeId) return hasAncestorMatching(doc, nodeId, BOOKMARK_SECTION_PATTERN);

  return false;

}



function isRankingContext(doc: Doc | SerializableDoc, pageId?: string | null, nodeId?: string | null) {

  if (pageId) {

    const page = doc.pages.find((item) => item.id === pageId);

    if (page && matchesPattern(page.name ?? "", RANKING_SECTION_PATTERN)) return true;

  }

  if (nodeId) return hasAncestorMatching(doc, nodeId, RANKING_SECTION_PATTERN);

  return false;

}



function isChatListContext(doc: Doc | SerializableDoc, pageId?: string | null, nodeId?: string | null) {

  if (pageId) {

    const page = doc.pages.find((item) => item.id === pageId);

    if (page && matchesPattern(page.name ?? "", CHAT_LIST_SECTION_PATTERN)) return true;

  }

  if (nodeId) return hasAncestorMatching(doc, nodeId, CHAT_LIST_SECTION_PATTERN);

  return false;

}



function isChatRoomContext(doc: Doc | SerializableDoc, pageId?: string | null, nodeId?: string | null) {

  if (pageId) {

    const page = doc.pages.find((item) => item.id === pageId);

    if (page && matchesPattern(page.name ?? "", CHAT_ROOM_SECTION_PATTERN)) return true;

  }

  if (nodeId) return hasAncestorMatching(doc, nodeId, CHAT_ROOM_SECTION_PATTERN);

  return false;

}



function isAttachmentContext(doc: Doc | SerializableDoc, pageId?: string | null, nodeId?: string | null) {

  if (pageId) {

    const page = doc.pages.find((item) => item.id === pageId);

    if (page && matchesPattern(page.name ?? "", ATTACHMENT_SECTION_PATTERN)) return true;

  }

  if (nodeId) return hasAncestorMatching(doc, nodeId, ATTACHMENT_SECTION_PATTERN);

  return false;

}



function isMentionContext(doc: Doc | SerializableDoc, pageId?: string | null, nodeId?: string | null) {

  if (pageId) {

    const page = doc.pages.find((item) => item.id === pageId);

    if (page && matchesPattern(page.name ?? "", MENTION_SECTION_PATTERN)) return true;

  }

  if (nodeId) return hasAncestorMatching(doc, nodeId, MENTION_SECTION_PATTERN);

  return false;

}



function isGroupChannelContext(doc: Doc | SerializableDoc, pageId?: string | null, nodeId?: string | null) {

  if (pageId) {

    const page = doc.pages.find((item) => item.id === pageId);

    if (page && matchesPattern(page.name ?? "", GROUP_CHANNEL_SECTION_PATTERN)) return true;

  }

  if (nodeId) return hasAncestorMatching(doc, nodeId, GROUP_CHANNEL_SECTION_PATTERN);

  return false;

}



function isCallContext(doc: Doc | SerializableDoc, pageId?: string | null, nodeId?: string | null) {

  if (pageId) {

    const page = doc.pages.find((item) => item.id === pageId);

    if (page && matchesPattern(page.name ?? "", CALL_SECTION_PATTERN)) return true;

  }

  if (nodeId) return hasAncestorMatching(doc, nodeId, CALL_SECTION_PATTERN);

  return false;

}



function isTodoContext(doc: Doc | SerializableDoc, pageId?: string | null, nodeId?: string | null) {

  if (pageId) {

    const page = doc.pages.find((item) => item.id === pageId);

    if (page && matchesPattern(page.name ?? "", TODO_SECTION_PATTERN)) return true;

  }

  if (nodeId) return hasAncestorMatching(doc, nodeId, TODO_SECTION_PATTERN);

  return false;

}



function isCalendarContext(doc: Doc | SerializableDoc, pageId?: string | null, nodeId?: string | null) {

  if (pageId) {

    const page = doc.pages.find((item) => item.id === pageId);

    if (page && matchesPattern(page.name ?? "", CALENDAR_SECTION_PATTERN)) return true;

  }

  if (nodeId) return hasAncestorMatching(doc, nodeId, CALENDAR_SECTION_PATTERN);

  return false;

}



function isNoteContext(doc: Doc | SerializableDoc, pageId?: string | null, nodeId?: string | null) {

  if (pageId) {

    const page = doc.pages.find((item) => item.id === pageId);

    if (page && matchesPattern(page.name ?? "", NOTE_SECTION_PATTERN)) return true;

  }

  if (nodeId) return hasAncestorMatching(doc, nodeId, NOTE_SECTION_PATTERN);

  return false;

}



function isMemberRoleContext(doc: Doc | SerializableDoc, pageId?: string | null, nodeId?: string | null) {

  if (pageId) {

    const page = doc.pages.find((item) => item.id === pageId);

    if (page && matchesPattern(page.name ?? "", MEMBER_ROLE_SECTION_PATTERN)) return true;

  }

  if (nodeId) return hasAncestorMatching(doc, nodeId, MEMBER_ROLE_SECTION_PATTERN);

  return false;

}



function isApprovalContext(doc: Doc | SerializableDoc, pageId?: string | null, nodeId?: string | null) {

  if (pageId) {

    const page = doc.pages.find((item) => item.id === pageId);

    if (page && matchesPattern(page.name ?? "", APPROVAL_SECTION_PATTERN)) return true;

  }

  if (nodeId) return hasAncestorMatching(doc, nodeId, APPROVAL_SECTION_PATTERN);

  return false;

}



function isKanbanContext(doc: Doc | SerializableDoc, pageId?: string | null, nodeId?: string | null) {

  if (pageId) {

    const page = doc.pages.find((item) => item.id === pageId);

    if (page && matchesPattern(page.name ?? "", KANBAN_SECTION_PATTERN)) return true;

  }

  if (nodeId) return hasAncestorMatching(doc, nodeId, KANBAN_SECTION_PATTERN);

  return false;

}



function isGanttContext(doc: Doc | SerializableDoc, pageId?: string | null, nodeId?: string | null) {

  if (pageId) {

    const page = doc.pages.find((item) => item.id === pageId);

    if (page && matchesPattern(page.name ?? "", GANTT_SECTION_PATTERN)) return true;

  }

  if (nodeId) return hasAncestorMatching(doc, nodeId, GANTT_SECTION_PATTERN);

  return false;

}



function isMediaGalleryContext(doc: Doc | SerializableDoc, pageId?: string | null, nodeId?: string | null) {

  if (pageId) {

    const page = doc.pages.find((item) => item.id === pageId);

    if (page && matchesPattern(page.name ?? "", MEDIA_GALLERY_SECTION_PATTERN)) return true;

  }

  if (nodeId) return hasAncestorMatching(doc, nodeId, MEDIA_GALLERY_SECTION_PATTERN);

  return false;

}



function isLightboxContext(doc: Doc | SerializableDoc, pageId?: string | null, nodeId?: string | null) {

  if (pageId) {

    const page = doc.pages.find((item) => item.id === pageId);

    if (page && matchesPattern(page.name ?? "", LIGHTBOX_SECTION_PATTERN)) return true;

  }

  if (nodeId) return hasAncestorMatching(doc, nodeId, LIGHTBOX_SECTION_PATTERN);

  return false;

}



function isMediaPlayerContext(doc: Doc | SerializableDoc, pageId?: string | null, nodeId?: string | null) {

  if (pageId) {

    const page = doc.pages.find((item) => item.id === pageId);

    if (page && matchesPattern(page.name ?? "", MEDIA_PLAYER_SECTION_PATTERN)) return true;

  }

  if (nodeId) return hasAncestorMatching(doc, nodeId, MEDIA_PLAYER_SECTION_PATTERN);

  return false;

}



function isStoryContext(doc: Doc | SerializableDoc, pageId?: string | null, nodeId?: string | null) {

  if (pageId) {

    const page = doc.pages.find((item) => item.id === pageId);

    if (page && matchesPattern(page.name ?? "", STORY_SECTION_PATTERN)) return true;

  }

  if (nodeId) return hasAncestorMatching(doc, nodeId, STORY_SECTION_PATTERN);

  return false;

}



function isLiveContext(doc: Doc | SerializableDoc, pageId?: string | null, nodeId?: string | null) {

  if (pageId) {

    const page = doc.pages.find((item) => item.id === pageId);

    if (page && matchesPattern(page.name ?? "", LIVE_SECTION_PATTERN)) return true;

  }

  if (nodeId) return hasAncestorMatching(doc, nodeId, LIVE_SECTION_PATTERN);

  return false;

}



function isKpiContext(doc: Doc | SerializableDoc, pageId?: string | null, nodeId?: string | null) {

  if (pageId) {

    const page = doc.pages.find((item) => item.id === pageId);

    if (page && matchesPattern(page.name ?? "", KPI_SECTION_PATTERN)) return true;

  }

  if (nodeId) return hasAncestorMatching(doc, nodeId, KPI_SECTION_PATTERN);

  return false;

}



function isChartContext(doc: Doc | SerializableDoc, pageId?: string | null, nodeId?: string | null) {

  if (pageId) {

    const page = doc.pages.find((item) => item.id === pageId);

    if (page && matchesPattern(page.name ?? "", CHART_SECTION_PATTERN)) return true;

  }

  if (nodeId) return hasAncestorMatching(doc, nodeId, CHART_SECTION_PATTERN);

  return false;

}



function isDataTableContext(doc: Doc | SerializableDoc, pageId?: string | null, nodeId?: string | null) {

  if (pageId) {

    const page = doc.pages.find((item) => item.id === pageId);

    if (page && matchesPattern(page.name ?? "", DATA_TABLE_SECTION_PATTERN)) return true;

  }

  if (nodeId) return hasAncestorMatching(doc, nodeId, DATA_TABLE_SECTION_PATTERN);

  return false;

}



function isUserAdminContext(doc: Doc | SerializableDoc, pageId?: string | null, nodeId?: string | null) {

  if (pageId) {

    const page = doc.pages.find((item) => item.id === pageId);

    if (page && matchesPattern(page.name ?? "", USER_ADMIN_SECTION_PATTERN)) return true;

  }

  if (nodeId) return hasAncestorMatching(doc, nodeId, USER_ADMIN_SECTION_PATTERN);

  return false;

}



function isAuditLogContext(doc: Doc | SerializableDoc, pageId?: string | null, nodeId?: string | null) {

  if (pageId) {

    const page = doc.pages.find((item) => item.id === pageId);

    if (page && matchesPattern(page.name ?? "", AUDIT_LOG_SECTION_PATTERN)) return true;

  }

  if (nodeId) return hasAncestorMatching(doc, nodeId, AUDIT_LOG_SECTION_PATTERN);

  return false;

}



function isBillingContext(doc: Doc | SerializableDoc, pageId?: string | null, nodeId?: string | null) {

  if (pageId) {

    const page = doc.pages.find((item) => item.id === pageId);

    if (page && matchesPattern(page.name ?? "", BILLING_SECTION_PATTERN)) return true;

  }

  if (nodeId) return hasAncestorMatching(doc, nodeId, BILLING_SECTION_PATTERN);

  return false;

}



function isSystemConsoleContext(doc: Doc | SerializableDoc, pageId?: string | null, nodeId?: string | null) {

  if (pageId) {

    const page = doc.pages.find((item) => item.id === pageId);

    if (page && matchesPattern(page.name ?? "", SYSTEM_CONSOLE_SECTION_PATTERN)) return true;

  }

  if (nodeId) return hasAncestorMatching(doc, nodeId, SYSTEM_CONSOLE_SECTION_PATTERN);

  return false;

}



function isDataTransferContext(doc: Doc | SerializableDoc, pageId?: string | null, nodeId?: string | null) {

  if (pageId) {

    const page = doc.pages.find((item) => item.id === pageId);

    if (page && matchesPattern(page.name ?? "", DATA_TRANSFER_SECTION_PATTERN)) return true;

  }

  if (nodeId) return hasAncestorMatching(doc, nodeId, DATA_TRANSFER_SECTION_PATTERN);

  return false;

}



function isMonitoringContext(doc: Doc | SerializableDoc, pageId?: string | null, nodeId?: string | null) {

  if (pageId) {

    const page = doc.pages.find((item) => item.id === pageId);

    if (page && matchesPattern(page.name ?? "", MONITORING_SECTION_PATTERN)) return true;

  }

  if (nodeId) return hasAncestorMatching(doc, nodeId, MONITORING_SECTION_PATTERN);

  return false;

}



function isFormWizardContext(doc: Doc | SerializableDoc, pageId?: string | null, nodeId?: string | null) {

  if (pageId) {

    const page = doc.pages.find((item) => item.id === pageId);

    if (page && matchesPattern(page.name ?? "", FORM_WIZARD_SECTION_PATTERN)) return true;

  }

  if (nodeId) return hasAncestorMatching(doc, nodeId, FORM_WIZARD_SECTION_PATTERN);

  return false;

}



function isAddressContext(doc: Doc | SerializableDoc, pageId?: string | null, nodeId?: string | null) {

  if (pageId) {

    const page = doc.pages.find((item) => item.id === pageId);

    if (page && matchesPattern(page.name ?? "", ADDRESS_SECTION_PATTERN)) return true;

  }

  if (nodeId) return hasAncestorMatching(doc, nodeId, ADDRESS_SECTION_PATTERN);

  return false;

}



function isCartContext(doc: Doc | SerializableDoc, pageId?: string | null, nodeId?: string | null) {

  if (pageId) {

    const page = doc.pages.find((item) => item.id === pageId);

    if (page && matchesPattern(page.name ?? "", CART_SECTION_PATTERN)) return true;

  }

  if (nodeId) return hasAncestorMatching(doc, nodeId, CART_SECTION_PATTERN);

  return false;

}



function isPaymentMethodContext(doc: Doc | SerializableDoc, pageId?: string | null, nodeId?: string | null) {

  if (pageId) {

    const page = doc.pages.find((item) => item.id === pageId);

    if (page && matchesPattern(page.name ?? "", PAYMENT_METHOD_SECTION_PATTERN)) return true;

  }

  if (nodeId) return hasAncestorMatching(doc, nodeId, PAYMENT_METHOD_SECTION_PATTERN);

  return false;

}



function isErrorPageContext(doc: Doc | SerializableDoc, pageId?: string | null, nodeId?: string | null) {

  if (pageId) {

    const page = doc.pages.find((item) => item.id === pageId);

    if (page && matchesPattern(page.name ?? "", ERROR_PAGE_PATTERN)) return true;

  }

  if (nodeId) return hasAncestorMatching(doc, nodeId, ERROR_PAGE_PATTERN);

  return false;

}



function isPaymentResultContext(doc: Doc | SerializableDoc, pageId?: string | null, nodeId?: string | null) {

  if (pageId) {

    const page = doc.pages.find((item) => item.id === pageId);

    if (page && matchesPattern(page.name ?? "", PAYMENT_RESULT_PATTERN)) return true;

  }

  if (nodeId) return hasAncestorMatching(doc, nodeId, PAYMENT_RESULT_PATTERN);

  return false;

}



function isCouponContext(doc: Doc | SerializableDoc, pageId?: string | null, nodeId?: string | null) {

  if (pageId) {

    const page = doc.pages.find((item) => item.id === pageId);

    if (page && matchesPattern(page.name ?? "", COUPON_SECTION_PATTERN)) return true;

  }

  if (nodeId) return hasAncestorMatching(doc, nodeId, COUPON_SECTION_PATTERN);

  return false;

}



function isBlankTemplateContext(doc: Doc | SerializableDoc, pageId?: string | null, nodeId?: string | null) {

  if (pageId) {

    const page = doc.pages.find((item) => item.id === pageId);

    if (page && matchesPattern(page.name ?? "", BLANK_TEMPLATE_PATTERN)) return true;

  }

  if (nodeId) return hasAncestorMatching(doc, nodeId, BLANK_TEMPLATE_PATTERN);

  return false;

}



function isLandingContext(doc: Doc | SerializableDoc, pageId?: string | null, nodeId?: string | null) {

  if (pageId) {

    const page = doc.pages.find((item) => item.id === pageId);

    if (page && matchesPattern(page.name ?? "", LANDING_SECTION_PATTERN)) return true;

  }

  if (nodeId) return hasAncestorMatching(doc, nodeId, LANDING_SECTION_PATTERN);

  return false;

}



function isDashboardContext(doc: Doc | SerializableDoc, pageId?: string | null, nodeId?: string | null) {

  if (pageId) {

    const page = doc.pages.find((item) => item.id === pageId);

    if (page && matchesPattern(page.name ?? "", DASHBOARD_SECTION_PATTERN)) return true;

  }

  if (nodeId) return hasAncestorMatching(doc, nodeId, DASHBOARD_SECTION_PATTERN);

  return false;

}



function isCommunityContext(doc: Doc | SerializableDoc, pageId?: string | null, nodeId?: string | null) {

  if (pageId) {

    const page = doc.pages.find((item) => item.id === pageId);

    if (page && matchesPattern(page.name ?? "", COMMUNITY_SECTION_PATTERN)) return true;

  }

  if (nodeId) return hasAncestorMatching(doc, nodeId, COMMUNITY_SECTION_PATTERN);

  return false;

}



function isServiceContext(doc: Doc | SerializableDoc, pageId?: string | null, nodeId?: string | null) {

  if (pageId) {

    const page = doc.pages.find((item) => item.id === pageId);

    if (page && matchesPattern(page.name ?? "", SERVICE_SECTION_PATTERN)) return true;

  }

  if (nodeId) return hasAncestorMatching(doc, nodeId, SERVICE_SECTION_PATTERN);

  return false;

}



function isHeaderNavContext(doc: Doc | SerializableDoc, nodeId: string) {

  return hasAncestorMatching(doc, nodeId, HEADER_SECTION_PATTERN) && hasAncestorMatching(doc, nodeId, NAV_SECTION_PATTERN);

}



function isTabbarContext(doc: Doc | SerializableDoc, nodeId: string) {

  return hasAncestorMatching(doc, nodeId, TABBAR_SECTION_PATTERN);

}



function isSidebarContext(doc: Doc | SerializableDoc, nodeId: string) {

  return hasAncestorMatching(doc, nodeId, SIDEBAR_SECTION_PATTERN);

}



function collectTextNodeIds(doc: Doc | SerializableDoc, rootId: string) {

  const ids: string[] = [];

  const stack = [rootId];

  const visited = new Set<string>();

  while (stack.length) {

    const id = stack.pop();

    if (!id || visited.has(id)) continue;

    visited.add(id);

    const node = doc.nodes[id];

    if (!node) continue;

    if (node.type === "text") ids.push(id);

    if (node.children?.length) stack.push(...node.children);

  }

  return ids;

}



function findSectionNodeId(

  doc: Doc | SerializableDoc,

  pageId: string | null | undefined,

  label: string,

  excludeIds?: Set<string>,

) {

  const target = normalizeLooseLabel(label);

  if (!target) return null;

  const page = pageId ? doc.pages.find((p) => p.id === pageId) ?? doc.pages[0] : doc.pages[0];

  if (!page) return null;

  const scopeIds = collectDescendants(doc, page.rootId);

  let textMatch: string | null = null;

  let nameMatch: string | null = null;

  scopeIds.forEach((id) => {

    if (excludeIds?.has(id)) return;

    const node = doc.nodes[id];

    if (!node) return;

    if (node.type === "text" && node.text?.value) {

      const normalized = normalizeLooseLabel(node.text.value);

      if (normalized && (normalized === target || normalized.includes(target) || target.includes(normalized))) {

        if (!textMatch) textMatch = id;

      }

      return;

    }

    if (!nameMatch && node.name) {

      const normalized = normalizeLooseLabel(node.name);

      if (normalized && (normalized === target || normalized.includes(target) || target.includes(normalized))) {

        nameMatch = id;

      }

    }

  });

  return textMatch ?? nameMatch;

}



function isOnboardingContext(doc: Doc | SerializableDoc, pageId?: string | null, nodeId?: string | null) {

  if (pageId) {

    const page = doc.pages.find((item) => item.id === pageId);

    if (page && matchesPattern(page.name ?? "", ONBOARDING_SECTION_PATTERN)) return true;

  }

  if (nodeId) return hasAncestorMatching(doc, nodeId, ONBOARDING_SECTION_PATTERN);

  return false;

}





function mapFieldLabel(label: string): FieldMeta | null {

  const normalizeExplicitKey = (raw: string) => {

    const lower = raw.toLowerCase();

    if (lower === "parentid") return "parentId";

    if (lower === "commentid") return "commentId";

    if (lower === "nextpageid") return "nextPageId";

    if (lower === "targetplan") return "targetPlan";

    return lower;

  };

  const explicitKeyMatch = label.match(/^\s*\[?([\p{L}\p{N}_-]+)\]?\s*[:\-]/u);

  if (explicitKeyMatch) {

    return { label, key: normalizeExplicitKey(explicitKeyMatch[1]) };

  }

  const bracketMatch = label.match(/\[([\p{L}\p{N}_-]+)\]/u);

  if (bracketMatch) {

    return { label, key: normalizeExplicitKey(bracketMatch[1]) };

  }



  const normalized = normalizeFieldLabel(label);

  if (!normalized) return null;



  if (label.includes("@")) {

    return { label, key: "email" };

  }



  if (normalized.includes("email") || normalized.includes("이메일")) {

    return { label, key: "email" };

  }

  if (normalized.includes("username") || normalized.includes("아이디") || normalized === "id" || normalized.endsWith("id")) {

    return { label, key: "email" };

  }

  if (

    normalized.includes("passwordconfirm") ||

    (normalized.includes("password") && normalized.includes("confirm")) ||

    (normalized.includes("비밀번호") && normalized.includes("확인"))

  ) {

    return { label, key: "passwordConfirm" };

  }

  if (normalized.includes("password") || normalized.includes("비밀번호")) {

    return { label, key: "password" };

  }

  if (normalized.includes("name") || normalized.includes("이름")) {

    return { label, key: "name" };

  }

  if (normalized.includes("phone") || normalized.includes("전화") || normalized.includes("연락")) {

    return { label, key: "phone" };

  }

  if (normalized.includes("delete") || normalized.includes("삭제") || normalized.includes("탈퇴")) {

    return { label, key: "deleteConfirm" };

  }

  if (

    normalized.includes("file") ||

    normalized.includes("upload") ||

    normalized.includes("파일") ||

    normalized.includes("업로드") ||

    normalized.includes("드롭")

  ) {

    return { label, key: "file" };

  }

  if (normalized.includes("message") || normalized.includes("메시지") || normalized.includes("문의")) {

    return { label, key: "message" };

  }

  if (normalized.includes("reason") || normalized.includes("사유")) {

    return { label, key: "reason" };

  }

  if (normalized.includes("cardnumber") || normalized.includes("카드") || normalized.includes("번호")) {

    return { label, key: "cardNumber" };

  }

  if (normalized.includes("cardname") || normalized.includes("명의")) {

    return { label, key: "cardName" };

  }

  if (normalized.includes("expiry") || normalized.includes("exp") || normalized.includes("만료")) {

    return { label, key: "cardExpiry" };

  }

  if (normalized.includes("cvc") || normalized.includes("cvv")) {

    return { label, key: "cardCvc" };

  }

  if (

    normalized.includes("terms") ||

    normalized.includes("약관") ||

    normalized.includes("동의") ||

    normalized.includes("방침") ||

    normalized.includes("privacy")

  ) {

    return { label, key: "terms" };

  }



  const planHint = resolveTargetPlan(normalized);

  if (planHint) {

    return { label, key: "targetPlan", valueHint: planHint };

  }

  if (

    normalized.includes("plan") ||

    normalized.includes("플랜") ||

    normalized.includes("요금제")

  ) {

    return { label, key: "targetPlan" };

  }



  return null;

}



function isGenericControlLabel(label: string) {

  const normalized = normalizeFieldLabel(label);

  if (!normalized) return true;

  return (

    normalized === "input" ||

    normalized === "textfield" ||

    normalized.includes("배지") ||

    normalized.includes("입력") ||

    normalized.includes("checkbox") ||

    normalized.includes("체크") ||

    normalized.includes("toggle") ||

    normalized.includes("선택") ||

    normalized.includes("switch") ||

    normalized.includes("버튼") ||

    normalized.includes("button")

  );

}



function findControlTextLabel(doc: Doc | SerializableDoc, rootId: string) {

  const root = doc.nodes[rootId];

  if (!root) return "";

  const stack = [...(root.children ?? [])];

  while (stack.length) {

    const id = stack.shift();

    if (!id) continue;

    const node = doc.nodes[id];

    if (!node) continue;

    if (node.type === "text" && node.text?.value) {

      return node.text.value;

    }

    if (node.children?.length) {

      stack.push(...node.children);

    }

  }

  return "";

}



function resolveControlLabel(doc: Doc | SerializableDoc, role: ControlRole, rootId: string) {

  const node = doc.nodes[rootId];

  const nodeText = node?.type === "text" ? node.text?.value?.trim() ?? "" : "";

  const nameLabel = node?.name?.trim() ?? "";

  const placeholder = role.type === "input" ? role.placeholder?.trim() ?? "" : "";

  const textLabel = findControlTextLabel(doc, rootId);

  const base = nodeText || nameLabel || placeholder || textLabel;

  if (!base) return rootId;

  if (isGenericControlLabel(base)) {

    return nodeText || placeholder || textLabel || nameLabel || rootId;

  }

  return base;

}



function resolveActionRootId(doc: Doc | SerializableDoc, nodeId: string, controlRootRoles: Map<string, ControlRole>) {

  if (controlRootRoles.has(nodeId)) return nodeId;

  let current = doc.nodes[nodeId];

  while (current?.parentId) {

    if (controlRootRoles.has(current.parentId)) return current.parentId;

    current = doc.nodes[current.parentId];

  }

  return nodeId;

}



function resolveActionLabel(doc: Doc | SerializableDoc, nodeId: string, controlRootRoles: Map<string, ControlRole>) {

  const rootId = resolveActionRootId(doc, nodeId, controlRootRoles);

  const rootRole = controlRootRoles.get(rootId);

  if (rootRole) return resolveControlLabel(doc as Doc, rootRole, rootId);

  const node = doc.nodes[nodeId];

  if (!node) return "";

  if (node.type === "text" && node.text?.value) return node.text.value;

  const textLabel = findControlTextLabel(doc as Doc, nodeId);

  return (node.name ?? "").trim() || textLabel;

}



function collectDescendants(doc: Doc | SerializableDoc, rootId: string) {

  const ids = new Set<string>();

  const stack = [rootId];

  while (stack.length) {

    const id = stack.pop();

    if (!id || ids.has(id)) continue;

    ids.add(id);

    const node = doc.nodes[id];

    if (node?.children?.length) {

      node.children.forEach((childId) => stack.push(childId));

    }

  }

  return ids;

}



function findScrollableAncestor(doc: Doc | SerializableDoc, nodeId: string) {

  let current: Node | undefined | null = doc.nodes[nodeId];

  while (current) {

    if (current.overflowScrolling) return current.id;

    current = current.parentId ? doc.nodes[current.parentId] : null;

  }

  return null;

}



function resolveSubmitScopeIds(doc: Doc | SerializableDoc, pageId: string | null, nodeId?: string | null) {

  const page = pageId ? doc.pages.find((p) => p.id === pageId) ?? doc.pages[0] : doc.pages[0];

  const pageRootId = page?.rootId ?? doc.root;

  if (!nodeId) return collectDescendants(doc, pageRootId);



  let current: Node | undefined | null = doc.nodes[nodeId];

  while (current) {

    const name = current.name?.toLowerCase() ?? "";

    const isFormish =

      (current.type === "frame" ||

        current.type === "section" ||

        current.type === "component" ||

        current.type === "instance" ||

        current.type === "group" ||

        current.type === "slice") &&

      (name.includes("폼") || name.includes("form") || name.includes("패널") || name.includes("panel"));

    if (isFormish) return collectDescendants(doc, current.id);

    if (current.id === pageRootId) break;

    current = current.parentId ? doc.nodes[current.parentId] : null;

  }



  return collectDescendants(doc, pageRootId);

}



function resolveFormScopeIds(doc: Doc | SerializableDoc, pageId: string | null, nodeId?: string | null) {

  if (!nodeId) return null;

  const page = pageId ? doc.pages.find((p) => p.id === pageId) ?? doc.pages[0] : doc.pages[0];

  const pageRootId = page?.rootId ?? doc.root;

  let current: Node | undefined | null = doc.nodes[nodeId];

  while (current) {

    const name = current.name?.toLowerCase() ?? "";

    const isFormish =

      (current.type === "frame" ||

        current.type === "section" ||

        current.type === "component" ||

        current.type === "instance" ||

        current.type === "group" ||

        current.type === "slice") &&

      (name.includes("폼") || name.includes("form") || name.includes("패널") || name.includes("panel"));

    if (isFormish) return collectDescendants(doc, current.id);

    if (current.id === pageRootId) break;

    current = current.parentId ? doc.nodes[current.parentId] : null;

  }

  return null;

}



function isSameOriginUrl(href: string) {

  try {

    const target = new URL(href, window.location.origin);

    return target.origin === window.location.origin;

  } catch {

    return false;

  }

}



const SUBMIT_ERROR_MESSAGES: Record<string, string> = {

  email_password_required: "이메일과 비밀번호를 입력해 주세요.",

  password_too_short: "비밀번호는 8자 이상이며 대/소문자, 숫자, 특수문자를 포함해야 합니다.",

  password_mismatch: "비밀번호 확인과 일치하지 않습니다.",

  anon_required: "세션이 필요합니다. 페이지를 다시 열어 잔요해 주세요.",

  anon_user_id_required: "세션이 필요합니다.",

  not_found: "존재하지 않는 페이지입니다.",

  invalid_body: "오류 입력이나 내용을 확인해 주세요.",

  bad_page_id: "페이지 오류입니다.",

  user_not_found: "사용자를 찾을 수 없습니다.",

  email_in_use: "이미 가입된 이메일입니다. 로그인을 진행해 주세요.",

  already_registered: "이미 가입된 이메일입니다. 로그인을 진행해 주세요.",

  invalid_credentials: "이메일 또는 비밀번호가 올바르지 않습니다.",

  invalid_plan: "올바른 플랜을 선택해 주세요.",

  upgrade_failed: "결제 승인에 실패했습니다.",

  invalid_entry: "입력값을 확인해 주세요.",

  forbidden: "권한이 없습니다.",

  stripe_not_configured: "결제 시스템이 설정되지 않았습니다.",

  stripe_price_missing: "요금제 정보를 찾을 수 없습니다.",

  billing_unavailable: "결제 서비스를 현재 사용할 수 없습니다.",

  file_required: "업로드할 파일을 선택해 주세요.",

  upload_failed: "파일 업로드에 실패했습니다.",

};



const SUBMIT_SUCCESS_MESSAGE = "요청이 완료되었습니다.";

const SUBMIT_SENT_MESSAGE = "요청을 전송했습니다.";

const SUBMIT_FAILED_MESSAGE = "요청에 실패했습니다.";



function resolveSubmitError(error: unknown, fallback: string) {

  if (typeof error !== "string") return fallback;

  return SUBMIT_ERROR_MESSAGES[error] ?? fallback;

}



function getTransitionType(action: PrototypeAction): PrototypeTransitionType {

  return "transition" in action && action.transition?.type ? action.transition.type : "instant";

}



function getRuntimeVariableValue(

  doc: Doc | SerializableDoc,

  variableId: string,

  variableMode: string,

  variableOverrides: Record<string, string | number | boolean>,

): string | number | boolean | undefined {

  const variable = doc.variables?.find((v) => v.id === variableId);

  if (!variable) return undefined;

  if (variableId in variableOverrides) return variableOverrides[variableId];

  if (variable.modes && variableMode in variable.modes) return variable.modes[variableMode];

  return variable.value;

}



function evaluateCondition(

  doc: Doc | SerializableDoc,

  condition: PrototypeCondition,

  variableMode: string,

  variableOverrides: Record<string, string | number | boolean>,

): boolean {

  const current = getRuntimeVariableValue(doc, condition.variableId, variableMode, variableOverrides);

  const target = condition.value;

  if (current === undefined) return false;

  switch (condition.op) {

    case "eq":

      return current === target;

    case "neq":

      return current !== target;

    case "gt":

      return typeof current === "number" && typeof target === "number" && current > target;

    case "lt":

      return typeof current === "number" && typeof target === "number" && current < target;

    case "gte":

      return typeof current === "number" && typeof target === "number" && current >= target;

    case "lte":

      return typeof current === "number" && typeof target === "number" && current <= target;

    default:

      return false;

  }

}



function getDelayMs(action: PrototypeAction) {

  const delay = "delayMs" in action ? action.delayMs ?? 0 : 0;

  return Math.max(0, Math.min(delay, 10000));

}



type NativeBridgeResult = { ok: boolean; data?: unknown; error?: string };



async function invokeWebNativeBridge(name: string, args: unknown): Promise<NativeBridgeResult> {

  if (typeof navigator === "undefined") {

    return { ok: false, error: "navigator_unavailable" };

  }

  const argsObj =

    args && typeof args === "object" && !Array.isArray(args)

      ? (args as Record<string, unknown>)

      : {};

  const hasStorage = () => {

    try {

      return typeof localStorage !== "undefined";

    } catch {

      return false;

    }

  };

  const fsKey = (path: string) => `null.fs.${path}`;

  const requestImageFiles = async (options: {

    capture?: boolean;

    multiple?: boolean;

    resultType?: string;

    limit?: number;

    captureMode?: string;

  }): Promise<NativeBridgeResult> => {

    if (typeof document === "undefined") return { ok: false, error: "document_unavailable" };

    const accept = "image/*";

    const multiple = options.multiple === true;

    const resultType = typeof options.resultType === "string" ? options.resultType : "uri";

    const captureMode = typeof options.captureMode === "string" ? options.captureMode : "environment";

    const limit = typeof options.limit === "number" ? Math.max(1, options.limit) : undefined;

    return await new Promise<NativeBridgeResult>((resolve) => {

      const input = document.createElement("input");

      input.type = "file";

      input.accept = accept;

      input.multiple = multiple;

      if (options.capture) input.setAttribute("capture", captureMode);

      input.onchange = () => {

        let files = Array.from(input.files ?? []);

        if (limit != null) files = files.slice(0, limit);

        if (!files.length) {

          resolve({ ok: false, error: "no_file_selected" });

          return;

        }

        const buildPayload = async () => {

          if (resultType === "base64" || resultType === "dataUrl") {

            const filePayloads = await Promise.all(

              files.map(

                (file) =>

                  new Promise<{

                    name: string;

                    type: string;

                    size: number;

                    lastModified: number;

                    webPath: string;

                    dataUrl?: string;

                    base64?: string;

                  }>((resolveFile) => {

                    const reader = new FileReader();

                    reader.onload = () => {

                      const dataUrl = String(reader.result ?? "");

                      const base64 = dataUrl.includes(",") ? dataUrl.split(",")[1] ?? "" : "";

                      resolveFile({

                        name: file.name,

                        type: file.type,

                        size: file.size,

                        lastModified: file.lastModified,

                        webPath: URL.createObjectURL(file),

                        dataUrl: resultType === "dataUrl" ? dataUrl : undefined,

                        base64: resultType === "base64" ? base64 : undefined,

                      });

                    };

                    reader.onerror = () => {

                      resolveFile({

                        name: file.name,

                        type: file.type,

                        size: file.size,

                        lastModified: file.lastModified,

                        webPath: URL.createObjectURL(file),

                      });

                    };

                    reader.readAsDataURL(file);

                  })

              ),

            );

            return { file: filePayloads[0], files: filePayloads };

          }

          const payload = files.map((file) => ({

            name: file.name,

            type: file.type,

            size: file.size,

            lastModified: file.lastModified,

            webPath: URL.createObjectURL(file),

          }));

          return { file: payload[0], files: payload };

        };

        buildPayload().then((payload) => resolve({ ok: true, data: payload }));

      };

      input.click();

    });

  };



  switch (name) {

    case "device.info":

      return {

        ok: true,

        data: {

          userAgent: navigator.userAgent,

          platform: navigator.platform,

          language: navigator.language,

          languages: navigator.languages,

          online: navigator.onLine,

        },

      };

    case "network.status":

      return { ok: true, data: { online: navigator.onLine } };

    case "geolocation.current": {

      if (!("geolocation" in navigator)) return { ok: false, error: "geolocation_unavailable" };

      const options: PositionOptions = {};

      if (typeof argsObj.enableHighAccuracy === "boolean") options.enableHighAccuracy = argsObj.enableHighAccuracy;

      if (typeof argsObj.timeout === "number") options.timeout = argsObj.timeout;

      if (typeof argsObj.maximumAge === "number") options.maximumAge = argsObj.maximumAge;

      return await new Promise<NativeBridgeResult>((resolve) => {

        navigator.geolocation.getCurrentPosition(

          (pos) =>

            resolve({

              ok: true,

              data: {

                lat: pos.coords.latitude,

                lng: pos.coords.longitude,

                accuracy: pos.coords.accuracy,

                altitude: pos.coords.altitude,

                altitudeAccuracy: pos.coords.altitudeAccuracy,

                heading: pos.coords.heading,

                speed: pos.coords.speed,

                timestamp: pos.timestamp,

              },

            }),

          (err) => resolve({ ok: false, error: err?.message || "geolocation_failed" }),

          options,

        );

      });

    }

    case "clipboard.readText": {

      if (!navigator.clipboard?.readText) return { ok: false, error: "clipboard_unavailable" };

      try {

        const text = await navigator.clipboard.readText();

        return { ok: true, data: { text } };

      } catch (err) {

        return { ok: false, error: err instanceof Error ? err.message : "clipboard_failed" };

      }

    }

    case "clipboard.writeText": {

      const text = typeof args === "string" ? args : typeof argsObj.text === "string" ? argsObj.text : "";

      if (!text) return { ok: false, error: "text_required" };

      if (!navigator.clipboard?.writeText) return { ok: false, error: "clipboard_unavailable" };

      try {

        await navigator.clipboard.writeText(text);

        return { ok: true, data: { text } };

      } catch (err) {

        return { ok: false, error: err instanceof Error ? err.message : "clipboard_failed" };

      }

    }

    case "share": {

      if (!navigator.share) return { ok: false, error: "share_unavailable" };

      const payload: ShareData = {};

      if (typeof argsObj.title === "string") payload.title = argsObj.title;

      if (typeof argsObj.text === "string") payload.text = argsObj.text;

      if (typeof argsObj.url === "string") payload.url = argsObj.url;

      if (!payload.title && !payload.text && !payload.url) return { ok: false, error: "share_data_required" };

      try {

        await navigator.share(payload);

        return { ok: true, data: { shared: true } };

      } catch (err) {

        return { ok: false, error: err instanceof Error ? err.message : "share_failed" };

      }

    }

    case "camera.capture":

      return await requestImageFiles({

        capture: true,

        multiple: false,

        resultType: typeof argsObj.resultType === "string" ? argsObj.resultType : "uri",

        captureMode: typeof argsObj.captureMode === "string" ? argsObj.captureMode : "environment",

      });

    case "camera.pick":

      return await requestImageFiles({

        multiple: true,

        resultType: typeof argsObj.resultType === "string" ? argsObj.resultType : "uri",

        limit: typeof argsObj.limit === "number" ? argsObj.limit : undefined,

      });

    case "app.openUrl":

    case "browser.open": {

      const url = typeof argsObj.url === "string" ? argsObj.url : "";

      if (!url) return { ok: false, error: "url_required" };

      if (typeof window !== "undefined") {

        window.open(url, "_blank", "noopener,noreferrer");

        return { ok: true, data: { opened: true } };

      }

      return { ok: false, error: "window_unavailable" };

    }

    case "preferences.get": {

      const key = typeof argsObj.key === "string" ? argsObj.key : "";

      if (!key) return { ok: false, error: "key_required" };

      if (!hasStorage()) return { ok: false, error: "storage_unavailable" };

      const value = localStorage.getItem(`null.pref.${key}`);

      return { ok: true, data: { key, value } };

    }

    case "preferences.set": {

      const key = typeof argsObj.key === "string" ? argsObj.key : "";

      if (!key) return { ok: false, error: "key_required" };

      if (!hasStorage()) return { ok: false, error: "storage_unavailable" };

      const value = typeof argsObj.value === "string" ? argsObj.value : "";

      localStorage.setItem(`null.pref.${key}`, value);

      return { ok: true, data: { key, value } };

    }

    case "preferences.remove": {

      const key = typeof argsObj.key === "string" ? argsObj.key : "";

      if (!key) return { ok: false, error: "key_required" };

      if (!hasStorage()) return { ok: false, error: "storage_unavailable" };

      localStorage.removeItem(`null.pref.${key}`);

      return { ok: true, data: { key, removed: true } };

    }

    case "filesystem.readFile": {

      const path = typeof argsObj.path === "string" ? argsObj.path : "";

      if (!path) return { ok: false, error: "path_required" };

      if (!hasStorage()) return { ok: false, error: "storage_unavailable" };

      const raw = localStorage.getItem(fsKey(path));

      if (raw == null) return { ok: false, error: "file_not_found" };

      return { ok: true, data: { path, data: raw } };

    }

    case "filesystem.writeFile": {

      const path = typeof argsObj.path === "string" ? argsObj.path : "";

      if (!path) return { ok: false, error: "path_required" };

      if (!hasStorage()) return { ok: false, error: "storage_unavailable" };

      const data = typeof argsObj.data === "string" ? argsObj.data : typeof argsObj.text === "string" ? argsObj.text : "";

      if (!data) return { ok: false, error: "data_required" };

      localStorage.setItem(fsKey(path), data);

      return { ok: true, data: { path, bytes: data.length } };

    }

    case "filesystem.deleteFile": {

      const path = typeof argsObj.path === "string" ? argsObj.path : "";

      if (!path) return { ok: false, error: "path_required" };

      if (!hasStorage()) return { ok: false, error: "storage_unavailable" };

      localStorage.removeItem(fsKey(path));

      return { ok: true, data: { path, deleted: true } };

    }

    case "push.register": {

      if (typeof Notification === "undefined") return { ok: false, error: "notification_unavailable" };

      if (!("requestPermission" in Notification)) return { ok: false, error: "notification_unavailable" };

      const perm = await Notification.requestPermission();

      if (perm !== "granted") return { ok: false, error: "permission_denied" };

      return { ok: true, data: { granted: true } };

    }

    case "push.getDelivered":

      return { ok: false, error: "not_supported" };

    case "push.removeAllDelivered":

      return { ok: false, error: "not_supported" };

    case "localNotifications.schedule": {

      if (typeof Notification === "undefined") return { ok: false, error: "notification_unavailable" };

      const notifications = Array.isArray(argsObj.notifications) ? argsObj.notifications : [];

      if (!notifications.length) return { ok: false, error: "notifications_required" };

      if (Notification.permission !== "granted") {

        const perm = await Notification.requestPermission();

        if (perm !== "granted") return { ok: false, error: "permission_denied" };

      }

      notifications.forEach((n) => {

        const schedule = n && typeof n === "object" ? (n as { schedule?: { at?: string; in?: number } }).schedule : undefined;

        let delay = 0;

        if (schedule?.at) {

          const at = new Date(schedule.at).getTime();

          if (!Number.isNaN(at)) delay = Math.max(0, at - Date.now());

        } else if (typeof schedule?.in === "number") {

          delay = Math.max(0, schedule.in);

        }

        setTimeout(() => {

          try {

            new Notification(String((n as { title?: string }).title ?? "Notification"), {

              body: String((n as { body?: string }).body ?? ""),

              data: (n as { data?: unknown }).data,

            });

          } catch {

            // ignore

          }

        }, delay);

      });

      return { ok: true, data: { scheduled: notifications.length } };

    }

    case "vibrate": {

      if (typeof navigator.vibrate !== "function") return { ok: false, error: "vibrate_unavailable" };

      const pattern =

        typeof args === "number"

          ? args

          : Array.isArray(args)

            ? args

            : typeof argsObj.pattern === "number" || Array.isArray(argsObj.pattern)

              ? (argsObj.pattern as number | number[])

              : 200;

      const ok = navigator.vibrate(pattern);

      return { ok: true, data: { ok } };

    }

    default:

      return { ok: false, error: "not_supported" };

  }

}



function transitionStyles(state: PageTransitionState, role: "from" | "to"): CSSProperties {

  const isActive = state.phase === "active";

  const duration = state.duration ?? TRANSITION_DURATION[state.type];

  const easing = state.easing ?? "ease";
  return buildPageTransitionAnimationStyle(state.type, role, isActive, duration, easing, state.smartPlan);

}



function overlayStyles(state: OverlayTransitionState): CSSProperties {

  const isActive = state.phase === "active";

  const duration = state.duration ?? TRANSITION_DURATION[state.type];

  const easing = state.easing ?? "ease";
  return buildOverlayTransitionAnimationStyle({
    type: state.type,
    mode: state.mode,
    isActive,
    duration,
    easing,
    presentation: state.presentation,
    smartPlan: state.smartPlan,
  });

}



function buildVariableOverridesFromQuery(
  doc: Doc | SerializableDoc,
  query: Record<string, string> | undefined
): Record<string, string | number | boolean> {
  if (!query || !Object.keys(query).length || !doc.variables?.length) return {};

  const out: Record<string, string | number | boolean> = {};

  for (const [key, val] of Object.entries(query)) {

    const v = doc.variables.find((x) => x.id === key || x.name === key);

    if (!v) continue;

    if (v.type === "number") {

      const n = Number(val);

      if (!Number.isNaN(n)) out[v.id] = n;

    } else if (v.type === "boolean") out[v.id] = val === "true" || val === "1" || val === "yes";

    else out[v.id] = val;

  }

  return out;
}

function resolveGlobalStateDefault(type: GlobalStateItem["type"]) {
  if (type === "number") return 0;
  if (type === "boolean") return false;
  if (type === "json") return null;
  return "";
}

function coerceGlobalStateValue(def: GlobalStateItem | undefined, raw: unknown): GlobalStateValue | undefined {
  if (raw === undefined) return undefined;
  const type = def?.type ?? "string";
  if (type === "number") {
    const n = typeof raw === "number" ? raw : Number(raw);
    return Number.isFinite(n) ? n : 0;
  }
  if (type === "boolean") {
    if (typeof raw === "boolean") return raw;
    if (typeof raw === "number") return raw > 0;
    if (typeof raw === "string") {
      const normalized = raw.trim().toLowerCase();
      return ["true", "1", "yes", "y", "on"].includes(normalized);
    }
    return Boolean(raw);
  }
  if (type === "json") {
    if (typeof raw === "string") {
      const trimmed = raw.trim();
      if (!trimmed) return null;
      try {
        return JSON.parse(trimmed) as Record<string, unknown> | unknown[] | null;
      } catch {
        return raw;
      }
    }
    if (raw && typeof raw === "object") return raw as Record<string, unknown> | unknown[] | null;
    return raw == null ? null : String(raw);
  }
  return typeof raw === "string" ? raw : raw == null ? "" : String(raw);
}

function buildGlobalStateSnapshot(defs: GlobalStateItem[], existing?: Record<string, GlobalStateValue>) {
  const next: Record<string, GlobalStateValue> = { ...(existing ?? {}) };
  defs.forEach((def) => {
    const key = def.key.trim();
    if (!key) return;
    if (key in next) return;
    const seeded = coerceGlobalStateValue(def, def.defaultValue);
    next[key] = seeded === undefined ? resolveGlobalStateDefault(def.type) : seeded;
  });
  return next;
}


function normalizeColor(value?: string | null) {

  return (value ?? "").trim().toLowerCase();

}



function deriveInitialChoiceState(doc: Doc | SerializableDoc, controlRoles: Record<string, ControlRole>) {

  const next: Record<string, boolean> = {};

  Object.values(controlRoles).forEach((role) => {

    if (role.role !== "root" || role.type !== "choice") return;

    const node = doc.nodes[role.rootId];

    const fill = node?.style?.fills?.[0];

    const fillActive = fill?.type === "solid" && normalizeColor(fill.color) === ACTIVE_CHOICE_FILL.toLowerCase();

    const stroke = node?.style?.strokes?.[0];

    const strokeActive = stroke?.color && normalizeColor(stroke.color) === ACTIVE_CHOICE_TEXT.toLowerCase();

    let textActive = false;

    if (role.labelId) {

      const labelNode = doc.nodes[role.labelId];

      const labelFill = labelNode?.style?.fills?.[0];

      const labelColor = labelFill?.type === "solid" ? normalizeColor(labelFill.color) : "";

      textActive = labelColor === ACTIVE_CHOICE_TEXT.toLowerCase();

    }

    if (fillActive || strokeActive || textActive) {

      next[role.rootId] = true;

    }

  });

  return next;

}



function isExclusiveChoiceGroupName(raw: string) {
  const name = raw.toLowerCase();
  return (
    name.includes("tab") ||
    name.includes("pagination") ||
    name.includes("pager") ||
    name.includes("page") ||
    name.includes("date") ||
    name.includes("step") ||
    name.includes("wizard") ||
    name.includes("menu") ||
    name.includes("nav") ||
    name.includes("탭") ||
    name.includes("탭바") ||
    name.includes("페이지") ||
    name.includes("페이징") ||
    name.includes("날짜") ||
    name.includes("단계") ||
    name.includes("마법사") ||
    name.includes("메뉴") ||
    name.includes("네비") ||
    name.includes("네비게이션")
  );
}



export default function AdvancedRuntimePlayer({ doc, initialPageId, initialQueryParams, appPageId, className, onPageChange, fitToContent, previewMode, chatRefetchSignal, onChatSent }: Props) {

  const docRef = useRef(doc);

  useEffect(() => {

    docRef.current = doc;

  }, [doc]);



  const pageIds = useMemo(() => (Array.isArray(doc.pages) ? doc.pages.map((page) => page.id) : []), [doc.pages]);

  const startPageId = doc.prototype?.startPageId ?? pageIds[0] ?? null;



  const [basePageId, setBasePageId] = useState<string | null>(initialPageId ?? startPageId);

  const [history, setHistory] = useState<string[]>([]);

  const [overlayStack, setOverlayStack] = useState<OverlayEntry[]>([]);

  const [pageTransition, setPageTransition] = useState<PageTransitionState | null>(null);

  const [overlayTransition, setOverlayTransition] = useState<OverlayTransitionState | null>(null);

  const [controlState, setControlState] = useState<Record<string, boolean>>({});

  const [controlTextState, setControlTextState] = useState<Record<string, string>>({});

  const [controlFileState, setControlFileState] = useState<Record<string, File[]>>({});

  const [cooldownMap, setCooldownMap] = useState<Record<string, number>>({});

  const [cooldownTick, setCooldownTick] = useState<number>(() => Date.now());

  const [hiddenNodeIds, setHiddenNodeIds] = useState<Set<string>>(new Set());

  const [searchHiddenNodeIds, setSearchHiddenNodeIds] = useState<Set<string>>(new Set());

  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState<string>("");

  const [faqSearchHiddenNodeIds, setFaqSearchHiddenNodeIds] = useState<Set<string>>(new Set());

  const [debouncedFaqQuery, setDebouncedFaqQuery] = useState<string>("");

  const [submitNotices, setSubmitNotices] = useState<Array<{ id: string; type: "success" | "error" | "info"; message: string }>>([]);

  const [isOnline, setIsOnline] = useState(() => (typeof navigator !== "undefined" ? navigator.onLine : true));

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const [headerCompact, setHeaderCompact] = useState(false);

  const [modalStack, setModalStack] = useState<string[]>([]);

  const [stickyVisible, setStickyVisible] = useState(false);

  const [stickyDismissedUntil, setStickyDismissedUntil] = useState(0);

  const [updateDismissedUntil, setUpdateDismissedUntil] = useState(0);

  const [chatLiveTick, setChatLiveTick] = useState(0);

  const [skeletonHold, setSkeletonHold] = useState(false);
  const modes = doc.variableModes?.length ? doc.variableModes : ["default"];
  const [variableMode, setVariableMode] = useState<string>(doc.variableMode ?? modes[0] ?? "default");
  const [variableOverrides, setVariableOverrides] = useState<Record<string, string | number | boolean>>(() =>
    buildVariableOverridesFromQuery(doc, initialQueryParams)
  );
  const globalStateDefs = useMemo(
    () => (Array.isArray((doc as Doc).globalState) ? ((doc as Doc).globalState as GlobalStateItem[]) : []),
    [doc],
  );
  const [globalState, setGlobalState] = useState<Record<string, GlobalStateValue>>(() =>
    buildGlobalStateSnapshot(globalStateDefs),
  );
  useEffect(() => {
    setGlobalState((prev) => buildGlobalStateSnapshot(globalStateDefs, prev));
  }, [globalStateDefs]);
  const [instanceVariantOverrides, setInstanceVariantOverrides] = useState<Record<string, string>>({});
  const [collectionCache, setCollectionCache] = useState<CollectionCache>({});

  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });

  const containerRef = useRef<HTMLDivElement | null>(null);

  const bodyOverflowRef = useRef<string | null>(null);

  const noticeTimersRef = useRef<Map<string, number>>(new Map());

  const cooldownTimersRef = useRef<Record<string, number>>({});

  const cooldownMapRef = useRef<Record<string, number>>({});

  const searchDebounceRef = useRef<number | null>(null);

  const faqSearchDebounceRef = useRef<number | null>(null);

  const choiceFocusRef = useRef<{ parentId: string | null; rootId: string | null }>({ parentId: null, rootId: null });

  const onboardingCompleteRef = useRef<Set<string>>(new Set());

  const storyProgressRef = useRef<number>(0);

  const themeSyncRef = useRef<string | null>(null);

  const localeSyncRef = useRef<string | null>(null);

  const accessibilitySyncRef = useRef<string | null>(null);

  const pushNotice = useCallback((notice: { type: "success" | "error" | "info"; message: unknown }) => {

    const safeMessage = typeof notice.message === "string" ? notice.message : (typeof notice.message === "object" && notice.message !== null ? "" : String(notice.message ?? ""));

    const id = `notice-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    setSubmitNotices((prev) => {

      const next = [...prev, { type: notice.type, message: safeMessage, id }];

      return next.length > 3 ? next.slice(next.length - 3) : next;

    });

    if (typeof window !== "undefined") {

      const timeout = window.setTimeout(() => {

        setSubmitNotices((prev) => prev.filter((item) => item.id !== id));

        noticeTimersRef.current.delete(id);

      }, notice.type === "info" ? 4500 : 3200);

      noticeTimersRef.current.set(id, timeout);

    }

  }, []);



  const applyVariableOverrides = useCallback((updates: Record<string, string | number | boolean>) => {
    const currentDoc = docRef.current;
    setVariableOverrides((prev) => {
      let changed = false;

      const next = { ...prev };

      Object.entries(updates).forEach(([key, value]) => {

        const safe =

          typeof value === "string" || typeof value === "number" || typeof value === "boolean"

            ? value

            : value != null && typeof value === "object"

              ? ""

              : undefined;

        if (safe === undefined) return;

        const variable = currentDoc.variables?.find((item) => item.id === key || item.name === key);

        const resolvedKey = variable?.id ?? key;

        if (next[resolvedKey] !== safe) {

          next[resolvedKey] = safe;

          changed = true;

        }

        if (resolvedKey !== key && next[key] !== safe) {

          next[key] = safe;

          changed = true;

        }

      });

      return changed ? next : prev;
    });
  }, []);

  const globalStateDefsByKey = useMemo(() => new Map(globalStateDefs.map((def) => [def.key, def])), [globalStateDefs]);
  const applyGlobalStateValue = useCallback(
    (key: string, value: unknown) => {
      const trimmed = key.trim();
      if (!trimmed) return;
      const def = globalStateDefsByKey.get(trimmed);
      const nextValue = coerceGlobalStateValue(def, value);
      if (nextValue === undefined) return;
      setGlobalState((prev) => ({ ...prev, [trimmed]: nextValue }));
    },
    [globalStateDefsByKey],
  );


  useEffect(() => {

    if (!appPageId) return;

    let active = true;

    (async () => {

      try {

        const res = await fetch(`/api/app/${appPageId}/auth/me`, { credentials: "include" });

        if (!res.ok || !active) return;

        const data = await res.json().catch(() => null);

        if (data?.user && active) {

          applyVariableOverrides({

            "$app_user.id": data.user.id,

            "$app_user.email": data.user.email,

            "$app_user.display_name": data.user.display_name ?? "",

            "$app_user.role": data.user.role ?? "user",

            "$app_user.logged_in": true,

          });

        }

      } catch { /* silently ignore */ }

    })();

    return () => { active = false; };

  }, [appPageId, applyVariableOverrides]);



  useEffect(() => {

    if (!appPageId) return;

    let cancelled = false;

    let lastHash = "";

    let hasChat = false;

    const refetchChat = async () => {

      if (cancelled) return;

      try {

        const storedAnonId = typeof localStorage !== "undefined" ? localStorage.getItem("anon_user_id") : null;

        const headers: Record<string, string> = storedAnonId ? { "x-anon-user-id": storedAnonId } : {};

        const res = await fetch(`/api/pages/${appPageId}/chat?limit=50`, { credentials: "include", headers });

        if (!res.ok) return;

        const data = await res.json().catch(() => null);

        if (cancelled) return;

        const messages = Array.isArray(data?.messages) ? data.messages : [];

        if (!hasChat && messages.length === 0) return;

        hasChat = true;

        const sep = "|";

        const previews = messages.map((m: { content?: string }) => (m.content ?? "").slice(0, 100)).join(sep);

        const times = messages.map((m: { createdAt?: string }) => m.createdAt ?? "").join(sep);

        const titles = messages

          .map((m: { senderAnonId?: string; senderUserId?: string }) => m.senderAnonId ?? m.senderUserId ?? "User")

          .join(sep);

        const hash = `${previews}::${times}::${titles}`;

        if (hash === lastHash) return;

        lastHash = hash;

        if (previews || times || titles) {

          applyVariableOverrides({

            chat_previews: previews,

            chat_messages: previews,

            chat_times: times,

            chatTimes: times,

            chat_titles: titles,

            chat_titles_list: titles,

          });

        }

      } catch {

        // ignore

      }

    };

    void refetchChat();

    const interval = setInterval(refetchChat, 1000);

    return () => { cancelled = true; clearInterval(interval); };

  }, [appPageId, applyVariableOverrides, chatRefetchSignal]);

  const refetchAppMessages = useCallback(async () => {
    if (!appPageId) return false;

    try {
      const res = await fetch(`/api/app/${appPageId}/messages?limit=50&orderBy=created_at&orderDir=asc`, {
        credentials: "include",
      });

      if (!res.ok) return false;

      const data = await res.json().catch(() => null);
      const items = Array.isArray(data?.items) ? data.items : [];

      if (!items.length) return false;

      const sep = "|";
      const cleanListValue = (value: string | undefined) => (value ?? "").replace(/[|,;]+/g, " ").replace(/\s+/g, " ").trim();
      const titles = items
        .map((item: { sender?: string; display_name?: string; email?: string }) => cleanListValue(item.sender ?? item.display_name ?? item.email ?? "User"))
        .join(sep);
      const messages = items
        .map((item: { message?: string; body?: string; content?: string }) => cleanListValue(item.message ?? item.body ?? item.content ?? ""))
        .join(sep);
      const times = items.map((item: { created_at?: string; createdAt?: string }) => item.created_at ?? item.createdAt ?? "").join(sep);

      applyVariableOverrides({
        chat_titles: titles,
        chat_titles_list: titles,
        chat_previews: messages,
        chat_messages: messages,
        chat_times: times,
        chatTimes: times,
      });

      return true;
    } catch {
      return false;
    }
  }, [appPageId, applyVariableOverrides]);

  useEffect(() => {
    if (!appPageId) return;

    let cancelled = false;
    const tick = async () => {
      if (!cancelled) await refetchAppMessages();
    };

    void tick();
    const interval = setInterval(tick, 1500);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [appPageId, refetchAppMessages]);



  useEffect(() => {

    cooldownMapRef.current = cooldownMap;

  }, [cooldownMap]);



  useEffect(() => {

    const now = Date.now();

    const hasCooldown = Object.values(cooldownMap).some((expiresAt) => expiresAt > now);

    const hasSticky = stickyDismissedUntil > now;

    const hasUpdate = updateDismissedUntil > now;

    if ((!hasCooldown && !hasSticky && !hasUpdate) || typeof window === "undefined") return;

    const timer = window.setInterval(() => setCooldownTick(Date.now()), 1000);

    return () => window.clearInterval(timer);

  }, [cooldownMap, stickyDismissedUntil, updateDismissedUntil]);



  useEffect(() => {

    const cooldownTimers = cooldownTimersRef.current;
    const searchDebounce = searchDebounceRef.current;
    const faqSearchDebounce = faqSearchDebounceRef.current;

    return () => {

      Object.values(cooldownTimers).forEach((timerId) => {

        if (typeof window !== "undefined") window.clearTimeout(timerId);

      });

      if (searchDebounce && typeof window !== "undefined") {

        window.clearTimeout(searchDebounce);

      }

      if (faqSearchDebounce && typeof window !== "undefined") {

        window.clearTimeout(faqSearchDebounce);

      }

    };

  }, []);



  const startCooldown = useCallback((id: string, durationMs = RESEND_COOLDOWN_MS) => {

    const expiresAt = Date.now() + durationMs;

    setCooldownMap((prev) => ({ ...prev, [id]: expiresAt }));

    if (typeof window === "undefined") return;

    const timers = cooldownTimersRef.current;

    if (timers[id]) window.clearTimeout(timers[id]);

    timers[id] = window.setTimeout(() => {

      setCooldownMap((prev) => {

        if (!(id in prev)) return prev;

        const next = { ...prev };

        delete next[id];

        return next;

      });

      delete timers[id];

    }, durationMs);

  }, []);



  useEffect(() => {

    const update = () => setIsOnline(typeof navigator === "undefined" ? true : navigator.onLine);

    update();

    window.addEventListener("online", update);

    window.addEventListener("offline", update);

    return () => {

      window.removeEventListener("online", update);

      window.removeEventListener("offline", update);

    };

  }, []);



  const baseLaidOut = useMemo(() => layoutDoc(hydrateDoc(doc)), [doc]);

  const laidOut = useMemo(() => {

    if (containerSize.w <= 0 || containerSize.h <= 0) return baseLaidOut;

    const pageId = basePageId ?? baseLaidOut.prototype?.startPageId ?? baseLaidOut.pages[0]?.id ?? null;

    const page = pageId ? baseLaidOut.pages.find((p) => p.id === pageId) ?? baseLaidOut.pages[0] : baseLaidOut.pages[0];

    if (!page) return baseLaidOut;

    const rootId = page.rootId;

    const root = baseLaidOut.nodes[rootId];

    if (!root) return baseLaidOut;

    const prevFrame = root.frame;

    const nextDoc = cloneDoc(baseLaidOut);

    const nextRoot = nextDoc.nodes[rootId];

    if (!nextRoot) return baseLaidOut;

    nextRoot.frame = { ...prevFrame, w: containerSize.w, h: containerSize.h };

    const constrained = applyConstraintsOnResize(nextDoc, rootId, prevFrame, nextRoot.frame);

    return layoutDoc(constrained);

  }, [baseLaidOut, basePageId, containerSize.w, containerSize.h]);



  const activeBreakpointId = useMemo(() => {

    const pageId = basePageId ?? baseLaidOut.pages[0]?.id;

    const page = pageId ? baseLaidOut.pages.find((p) => p.id === pageId) : baseLaidOut.pages[0];

    const breakpoints = page?.breakpoints;

    if (!breakpoints?.length) return null;

    const viewW = containerSize.w > 0 ? containerSize.w : (typeof window !== "undefined" ? window.innerWidth : 1024);

    for (const bp of [...breakpoints].sort((a, b) => (b.minWidth ?? 0) - (a.minWidth ?? 0))) {

      const min = bp.minWidth ?? 0;

      const max = bp.maxWidth ?? Infinity;

      if (viewW >= min && viewW <= max) return bp.id;

    }

    return null;

  }, [baseLaidOut, basePageId, containerSize.w]);



  const laidOutResponsive = useMemo(() => {

    if (!activeBreakpointId) return laidOut;

    const rDoc = cloneDoc(laidOut);

    for (const [nodeId, node] of Object.entries(rDoc.nodes)) {

      const bpOverride = node.breakpointOverrides?.[activeBreakpointId];

      if (!bpOverride) continue;

      if (bpOverride.hidden !== undefined) rDoc.nodes[nodeId].hidden = bpOverride.hidden;

      if (bpOverride.frame) rDoc.nodes[nodeId].frame = { ...node.frame, ...bpOverride.frame };

      if (bpOverride.style) rDoc.nodes[nodeId].style = { ...node.style, ...bpOverride.style };

      if (bpOverride.layout) rDoc.nodes[nodeId].layout = node.layout ? { ...node.layout, ...bpOverride.layout } as typeof node.layout : node.layout;

      if (bpOverride.layoutSizing) rDoc.nodes[nodeId].layoutSizing = bpOverride.layoutSizing;

    }

    return layoutDoc(rDoc);

  }, [laidOut, activeBreakpointId]);



  const modalRootIds = useMemo(() => {

    const ids = new Set<string>();

    if (!basePageId) return ids;

    const page = laidOut.pages.find((p) => p.id === basePageId) ?? laidOut.pages[0];

    if (!page) return ids;

    const scopeIds = collectDescendants(laidOut, page.rootId);

    scopeIds.forEach((id) => {

      const node = laidOut.nodes[id];

      if (!node) return;

      if (!matchesPattern(node.name ?? "", MODAL_SECTION_PATTERN)) return;

      const parentId = node.parentId;

      if (parentId && matchesPattern(laidOut.nodes[parentId]?.name ?? "", MODAL_SECTION_PATTERN)) return;

      ids.add(id);

    });

    return ids;

  }, [basePageId, laidOut]);



  const appUpdateModalIds = useMemo(() => {

    const ids = new Set<string>();

    if (!modalRootIds.size) return ids;

    modalRootIds.forEach((id) => {

      const name = laidOut.nodes[id]?.name ?? "";

      if (matchesPattern(name, APP_UPDATE_PATTERN)) ids.add(id);

    });

    return ids;

  }, [modalRootIds, laidOut]);



  const lightboxModalIds = useMemo(() => {

    const ids = new Set<string>();

    if (!modalRootIds.size) return ids;

    modalRootIds.forEach((id) => {

      const name = laidOut.nodes[id]?.name ?? "";

      if (matchesPattern(name, LIGHTBOX_SECTION_PATTERN)) ids.add(id);

    });

    return ids;

  }, [modalRootIds, laidOut]);



  const confirmModalIds = useMemo(() => {

    const ids = new Set<string>();

    if (!modalRootIds.size) return ids;

    modalRootIds.forEach((id) => {

      const name = laidOut.nodes[id]?.name ?? "";

      if (matchesPattern(name, CONFIRM_MODAL_PATTERN)) ids.add(id);

    });

    return ids;

  }, [modalRootIds, laidOut]);



  const resolveModalTargetId = useCallback(

    (label?: string | null) => {

      if (!modalRootIds.size) return null;

      if (modalRootIds.size === 1) return Array.from(modalRootIds)[0];

      const normalized = normalizeLooseLabel(label ?? "");

      if (!normalized) return null;

      const currentDoc = docRef.current;

      for (const id of modalRootIds) {

        const name = normalizeLooseLabel(currentDoc.nodes[id]?.name ?? "");

        if (!name) continue;

        if (name.includes(normalized) || normalized.includes(name)) return id;

      }

      return null;

    },

    [modalRootIds],

  );



  const openModal = useCallback((modalId: string) => {

    if (!modalId) return;

    setModalStack((prev) => (prev.includes(modalId) ? prev : [...prev, modalId]));

  }, []);



  const closeModal = useCallback((modalId?: string | null) => {

    setModalStack((prev) => {

      if (!prev.length) return prev;

      if (!modalId) return prev.slice(0, -1);

      const index = prev.lastIndexOf(modalId);

      if (index === -1) return prev;

      return prev.filter((_, idx) => idx !== index);

    });

  }, []);



  const stickyCtaRootIds = useMemo(() => {

    const ids = new Set<string>();

    if (!basePageId) return ids;

    const page = laidOut.pages.find((p) => p.id === basePageId) ?? laidOut.pages[0];

    if (!page) return ids;

    const scopeIds = collectDescendants(laidOut, page.rootId);

    scopeIds.forEach((id) => {

      const node = laidOut.nodes[id];

      if (!node) return;

      if (!matchesPattern(node.name ?? "", STICKY_CTA_PATTERN)) return;

      const parentId = node.parentId;

      if (parentId && matchesPattern(laidOut.nodes[parentId]?.name ?? "", STICKY_CTA_PATTERN)) return;

      ids.add(id);

    });

    return ids;

  }, [basePageId, laidOut]);



  const cookieBannerIds = useMemo(() => {

    const ids = new Set<string>();

    const isCookieAncestor = (startId: string) => {

      let current: Node | undefined | null = laidOut.nodes[startId];

      while (current) {

        const name = current.name?.toLowerCase() ?? "";

        if (

          name.includes("cookie") ||

          name.includes("privacy") ||

          name.includes("쿠키") ||

          name.includes("개인정보")

        )

          return true;

        current = current.parentId ? laidOut.nodes[current.parentId] : null;

      }

      return false;

    };

    Object.values(laidOut.nodes).forEach((node) => {

      const name = node.name?.toLowerCase() ?? "";

      if (!name.includes("banner") && !name.includes("쿠키") && !name.includes("cookie")) return;

      if (isCookieAncestor(node.id)) ids.add(node.id);

    });

    return ids;

  }, [laidOut]);



  useEffect(() => {

    if (!cookieBannerIds.size) return;

    const stored = readCookieConsent();

    if (stored && !isCookieConsentValid(stored) && typeof localStorage !== "undefined") {

      try {

        localStorage.removeItem(COOKIE_CONSENT_STORAGE_KEY);

      } catch {

        // ignore

      }

      return;

    }

    if (isCookieConsentValid(stored)) {

      deferStateUpdate(() => {

        setHiddenNodeIds((prev) => {

          const next = new Set(prev);

          cookieBannerIds.forEach((id) => next.add(id));

          return next;

        });

      });

    }

  }, [cookieBannerIds]);



  useEffect(() => {

    if (!basePageId || typeof localStorage === "undefined") {

      deferStateUpdate(() => setStickyDismissedUntil(0));

      return;

    }

    const key = `${STICKY_CTA_STORAGE_PREFIX}:${basePageId}`;

    const raw = localStorage.getItem(key);

    const value = raw ? Number(raw) : 0;

    const next = Number.isFinite(value) ? value : 0;

    deferStateUpdate(() => setStickyDismissedUntil(next));

  }, [basePageId]);



  useEffect(() => {

    if (typeof localStorage === "undefined") {

      deferStateUpdate(() => setUpdateDismissedUntil(0));

      return;

    }

    const raw = localStorage.getItem(APP_UPDATE_STORAGE_KEY);

    const value = raw ? Number(raw) : 0;

    const next = Number.isFinite(value) ? value : 0;

    deferStateUpdate(() => setUpdateDismissedUntil(next));

  }, [appPageId, doc.root]);



  useEffect(() => {

    if (typeof window === "undefined") return;

    const liveFlag =

      variableOverrides.chatLive ??

      variableOverrides.chat_live ??

      variableOverrides.realtime ??

      variableOverrides.chatTimes ??

      variableOverrides.chat_times;

    if (!liveFlag) return;

    const interval = window.setInterval(() => setChatLiveTick(Date.now()), 15000);

    return () => window.clearInterval(interval);

  }, [variableOverrides]);



  useEffect(() => {

    const loading =

      coerceBoolean(variableOverrides.loading ?? variableOverrides.isLoading ?? variableOverrides.skeletonLoading ?? variableOverrides.skeleton_loading) === true;

    if (loading) {

      deferStateUpdate(() => setSkeletonHold(false));

      return;

    }

    if (typeof window === "undefined") return;

    deferStateUpdate(() => setSkeletonHold(true));

    const timer = window.setTimeout(() => setSkeletonHold(false), 250);

    return () => window.clearTimeout(timer);

  }, [variableOverrides]);



  useEffect(() => {

    if (!basePageId) return;

    const currentDoc = docRef.current;

    if (!isStoryContext(currentDoc, basePageId, null)) return;

    const autoFlag = coerceBoolean(

      variableOverrides.storyAuto ?? variableOverrides.story_auto ?? variableOverrides.storyPlaying ?? variableOverrides.story_playing ?? true,

    );

    if (autoFlag === false) return;

    const listRaw =

      (typeof variableOverrides.story_titles === "string" && variableOverrides.story_titles) ||

      (typeof variableOverrides.storyTitles === "string" && variableOverrides.storyTitles) ||

      "";

    const list = listRaw ? parseStringList(listRaw, /[,|;]/) : [];

    const total =

      (typeof variableOverrides.storyTotal === "number" && variableOverrides.storyTotal) ||

      Number(variableOverrides.story_total ?? variableOverrides.storyTotal) ||

      list.length ||

      0;

    const initialProgress =

      typeof variableOverrides.storyProgress === "number"

        ? variableOverrides.storyProgress

        : Number(variableOverrides.story_progress ?? variableOverrides.storyProgress) || 0;

    storyProgressRef.current = initialProgress;

    const interval = window.setInterval(() => {

      let progress = storyProgressRef.current + 0.08;

      let nextIndex: number | null = null;

      if (progress >= 1) {

        progress = 0;

        const currentIndex =

          typeof variableOverrides.storyIndex === "number"

            ? variableOverrides.storyIndex

            : Number(variableOverrides.story_index ?? variableOverrides.storyIndex) || 0;

        if (total > 0) nextIndex = (currentIndex + 1) % total;

        else nextIndex = currentIndex + 1;

      }

      storyProgressRef.current = progress;

      const updates: Record<string, string | number | boolean> = {

        storyProgress: Number(progress.toFixed(2)),

        story_progress: Number(progress.toFixed(2)),

      };

      if (nextIndex !== null) {

        updates.storyIndex = nextIndex;

        updates.story_index = nextIndex;

      }

      applyVariableOverrides(updates);

    }, 400);

    return () => window.clearInterval(interval);

  }, [applyVariableOverrides, basePageId, variableOverrides]);



  useEffect(() => {

    if (!basePageId) return;

    if (typeof document === "undefined") return;

    const currentDoc = docRef.current;

    if (!isSystemConsoleContext(currentDoc, basePageId, null)) return;

    const auto = coerceBoolean(variableOverrides.consoleAutoScroll ?? variableOverrides.console_auto_scroll);

    if (auto !== true) return;

    const page = laidOut.pages.find((p) => p.id === basePageId) ?? laidOut.pages[0];

    if (!page) return;

    const scopeIds = collectDescendants(laidOut, page.rootId);

    const scrollableId = Array.from(scopeIds).find(

      (id) =>

        Boolean(laidOut.nodes[id]?.overflowScrolling) && hasAncestorMatching(laidOut, id, SYSTEM_CONSOLE_SECTION_PATTERN),

    );

    if (!scrollableId) return;

    const el = document.querySelector(`[data-node-id="${scrollableId}"]`);

    if (el instanceof HTMLElement) {

      el.scrollTop = el.scrollHeight;

    }

  }, [basePageId, laidOut, variableOverrides]);



  useEffect(() => {

    if (!basePageId) return;

    const currentDoc = docRef.current;

    if (!isChatRoomContext(currentDoc, basePageId, null)) return;

    if (variableOverrides.chatRead || variableOverrides.chat_read) return;

    const markRead = () => {

      applyVariableOverrides({ chatRead: true, chat_read: true, chat_unread: 0, unread_count: 0 });

    };

    const el = containerRef.current;

    if (!el) {

      markRead();

      return;

    }

    const onScroll = () => {

      const remaining = el.scrollHeight - el.scrollTop - el.clientHeight;

      if (remaining < 24) markRead();

    };

    onScroll();

    el.addEventListener("scroll", onScroll, { passive: true });

    return () => el.removeEventListener("scroll", onScroll);

  }, [applyVariableOverrides, basePageId, variableOverrides]);



  useEffect(() => {

    if (!appPageId || typeof window === "undefined") return;

    const origin = window.location.origin;

    const anonId = localStorage.getItem("anon_user_id") ?? undefined;

    const headers: Record<string, string> = { ...(anonId ? { "x-anon-user-id": anonId } : {}) };

    const sep = "|";

    const fetchJsonSafe = async (url: string) => {

      try {

        const response = await fetch(url, { credentials: "include", headers });

        return await response.json().catch(() => null);

      } catch {

        return null;

      }

    };

    const run = async () => {

      try {

        const [
          todoData,
          calData,
          noteData,
          setData,
          notifData,
          rankData,
          kanbanData,
          partnerPortalUpdates,
          opsConsoleUpdates,
        ] = await Promise.all([

          fetchJsonSafe(`${origin}/api/pages/${appPageId}/todos`),

          fetchJsonSafe(`${origin}/api/pages/${appPageId}/calendar?from=1970-01-01&to=2100-12-31`),

          fetchJsonSafe(`${origin}/api/pages/${appPageId}/note`),

          fetchJsonSafe(`${origin}/api/pages/${appPageId}/settings`),

          anonId ? fetchJsonSafe(`${origin}/api/pages/${appPageId}/notifications?limit=20`) : Promise.resolve(null),

          fetchJsonSafe(`${origin}/api/ranking?limit=20`),

          fetchJsonSafe(`${origin}/api/pages/${appPageId}/kanban/columns`),

          fetchPartnerPortalVariableUpdatesForPage(appPageId, sep).catch(() => ({})),

          fetchOpsConsoleVariableUpdatesForPage(appPageId, " | ").catch(() => ({})),

        ]);

        const updates: Record<string, string | number | boolean> = {};

        if (Array.isArray(todoData?.todos)) {

          updates.todo_items = todoData.todos.map((t: { title?: string }) => t.title ?? "").join(sep);

          updates.todo_list = updates.todo_items;

          updates.todo_meta = todoData.todos.map((t: { done?: boolean }) => (t.done ? "완료" : "미완료")).join(sep);

        }

        if (Array.isArray(calData?.events)) {

          updates.calendar_events = calData.events.map((e: { title?: string }) => e.title ?? "").join(sep);

          updates.calendar_event_titles = updates.calendar_events;

          updates.calendar_event_metas = calData.events.map((e: { startAt?: string }) => (e.startAt ?? "").slice(0, 16)).join(sep);

        }

        const noteContent = noteData?.note?.content ?? noteData?.content ?? "";

        if (typeof noteContent === "string") {

          updates.note_content = noteContent;

          updates.noteContent = noteContent;

        }

        if (setData?.settings && typeof setData.settings === "object") {

          Object.entries(setData.settings).forEach(([k, v]) => {

            const val = (v as { value?: unknown })?.value;

            if (val !== undefined && val !== null) updates[`setting_${k}`] = String(val);

          });

        }

        if (Array.isArray(notifData?.notifications)) {

            updates.notification_titles = notifData.notifications.map((n: { title?: string; type?: string }) => n.title ?? n.type ?? "").join(sep);

            updates.notification_metas = notifData.notifications.map((n: { readAt?: string | null }) => (n.readAt ? "읽음" : "아직 알림")).join(sep);

        }

        /*
        if (Array.isArray(rankData?.ranking)) {

          updates.ranking_titles = rankData.ranking.map((r: { title?: string }) => r.title ?? "").join(sep);

          updates.ranking_metas = rankData.ranking.map((r: { rank?: number }) => `${r.rank ?? 0}위`).join(sep);

        }

        */

        if (Array.isArray(rankData?.ranking)) {

          updates.ranking_titles = rankData.ranking.map((r: { title?: string }) => r.title ?? "").join(sep);

          updates.ranking_metas = rankData.ranking.map((r: { rank?: number }) => String(r.rank ?? 0)).join(sep);

        }

        if (Array.isArray(kanbanData?.columns)) {

          updates.kanban_columns = kanbanData.columns.map((c: { title?: string }) => c.title ?? "").join(sep);

          updates.kanbanColumns = updates.kanban_columns;

          const cards: string[] = [];

          kanbanData.columns.forEach((c: { cards?: { title?: string }[] }) => {

            (c.cards ?? []).forEach((card: { title?: string }) => cards.push(card.title ?? ""));

          });

          if (cards.length) {

            updates.kanban_cards = cards.join(sep);

            updates.kanbanCards = updates.kanban_cards;

          }

        }

        Object.assign(updates, partnerPortalUpdates);
        Object.assign(updates, opsConsoleUpdates);

        if (Object.keys(updates).length) applyVariableOverrides(updates);

      } catch {

        // ignore

      }

    };

    void run();

  }, [appPageId, applyVariableOverrides]);



  useEffect(() => {

    const el = containerRef.current;

    if (!el) return;

    const ro = new ResizeObserver((entries) => {

      const entry = entries[0];

      if (!entry) return;

      const { width, height } = entry.contentRect;

      setContainerSize({ w: Math.max(0, width), h: Math.max(0, height) });

    });

    ro.observe(el);

    setContainerSize({ w: el.clientWidth, h: el.clientHeight });

    return () => ro.disconnect();

  }, []);



  const controlRoles = useMemo(

    () => buildControlRoles(laidOut, { mode: variableMode, variableOverrides }),

    [laidOut, variableMode, variableOverrides],

  );

  const controlRootRoles = useMemo(() => {

    const roots = new Map<string, ControlRole>();

    Object.values(controlRoles).forEach((role) => {

      if (role.role !== "root") return;

      roots.set(role.rootId, role);

    });

    return roots;

  }, [controlRoles]);



  const controlFields = useMemo(() => {

    const map = new Map<string, FieldMeta>();

    Object.values(controlRoles).forEach((role) => {

      if (role.role !== "root") return;

      const label = resolveControlLabel(laidOut, role, role.rootId);
      const node = laidOut.nodes[role.rootId];
      const fallback = mapFieldLabel(label);
      const meta = resolveServiceFieldMeta(node?.overrides?.service ?? node?.service, label, fallback);

      map.set(role.rootId, meta);

    });

    return map;

  }, [controlRoles, laidOut]);



  const controlStorageKey = useMemo(() => `null.runtime.controls:${appPageId ?? doc.root ?? "local"}`, [appPageId, doc.root]);

  const controlStateLoadedRef = useRef(false);



  const searchInputValue = useMemo(() => {

    const fromVar =

      (typeof variableOverrides.searchInputValue === "string" && variableOverrides.searchInputValue) ||

      (typeof variableOverrides.search_input === "string" && variableOverrides.search_input) ||

      (typeof variableOverrides.searchQuery === "string" && variableOverrides.searchQuery) ||

      (typeof variableOverrides.search_query === "string" && variableOverrides.search_query);

    if (fromVar) return fromVar;

    for (const [rootId, role] of controlRootRoles) {

      if (role.type !== "input") continue;

      const name = laidOut.nodes[rootId]?.name ?? "";

      if (SEARCH_INPUT_PATTERN.test(name)) {

        const v = controlTextState[rootId];

        return typeof v === "string" ? v : "";

      }

    }

    return "";

  }, [variableOverrides, controlRootRoles, controlTextState, laidOut.nodes]);



  const faqSearchInputValue = useMemo(() => {

    const fromVar =

      (typeof variableOverrides.faqSearchInputValue === "string" && variableOverrides.faqSearchInputValue) ||

      (typeof variableOverrides.faq_search_input === "string" && variableOverrides.faq_search_input) ||

      (typeof variableOverrides.faqQuery === "string" && variableOverrides.faqQuery) ||

      (typeof variableOverrides.faq_query === "string" && variableOverrides.faq_query);

    if (fromVar) return fromVar;

    if (!basePageId) return "";

    const page = laidOut.pages.find((p) => p.id === basePageId) ?? laidOut.pages[0];

    if (!page) return "";

    const scopeIds = collectDescendants(laidOut, page.rootId);

    for (const id of scopeIds) {

      const role = controlRootRoles.get(id);

      if (!role || role.type !== "input") continue;

      const nodeName = laidOut.nodes[id]?.name ?? "";

      if (!FAQ_SEARCH_PATTERN.test(nodeName)) continue;

      const v = controlTextState[id];

      return typeof v === "string" ? v : "";

    }

    return "";

  }, [basePageId, variableOverrides, controlRootRoles, controlTextState, laidOut]);



  useEffect(() => {

    if (previewMode) return;

    const initialRoles = buildControlRoles(baseLaidOut);

    const initialChoices = deriveInitialChoiceState(baseLaidOut, initialRoles);

    let nextChoices = initialChoices;

    if (typeof localStorage !== "undefined") {

      try {

        const raw = localStorage.getItem(controlStorageKey);

        if (raw) {

          const parsed = JSON.parse(raw) as { controlState?: Record<string, boolean> } | null;

          if (parsed?.controlState && typeof parsed.controlState === "object") {

            const merged: Record<string, boolean> = { ...initialChoices };

            Object.entries(parsed.controlState).forEach(([id, value]) => {

              if (initialRoles[id]) merged[id] = Boolean(value);

            });

            nextChoices = merged;

          }

        }

      } catch {

        // ignore

      }

    }

    deferStateUpdate(() => {

      setControlState(nextChoices);

      setControlTextState({});

      setControlFileState({});

      setSubmitNotices([]);

    });

    controlStateLoadedRef.current = true;

    noticeTimersRef.current.forEach((id) => window.clearTimeout(id));

    noticeTimersRef.current.clear();

    choiceFocusRef.current = { parentId: null, rootId: null };

    const nextModes = doc.variableModes?.length ? doc.variableModes : ["Default"];

    deferStateUpdate(() => {

      setVariableMode(doc.variableMode ?? nextModes[0] ?? "Default");

      setVariableOverrides({});

    });

  }, [baseLaidOut, controlStorageKey, doc, previewMode]);



  useEffect(() => {

    if (searchDebounceRef.current && typeof window !== "undefined") {

      window.clearTimeout(searchDebounceRef.current);

      searchDebounceRef.current = null;

    }

    const nextQuery = (searchInputValue ?? "").trim();

    if (!nextQuery) {

      deferStateUpdate(() => setDebouncedSearchQuery(""));

      return;

    }

    if (typeof window === "undefined") {

      deferStateUpdate(() => setDebouncedSearchQuery(nextQuery));

      return;

    }

    searchDebounceRef.current = window.setTimeout(() => {

      setDebouncedSearchQuery(nextQuery);

      searchDebounceRef.current = null;

    }, 300);

  }, [searchInputValue]);



  useEffect(() => {

    if (faqSearchDebounceRef.current && typeof window !== "undefined") {

      window.clearTimeout(faqSearchDebounceRef.current);

      faqSearchDebounceRef.current = null;

    }

    const nextQuery = (faqSearchInputValue ?? "").trim();

    if (!nextQuery) {

      deferStateUpdate(() => setDebouncedFaqQuery(""));

      return;

    }

    if (typeof window === "undefined") {

      deferStateUpdate(() => setDebouncedFaqQuery(nextQuery));

      return;

    }

    faqSearchDebounceRef.current = window.setTimeout(() => {

      setDebouncedFaqQuery(nextQuery);

      faqSearchDebounceRef.current = null;

    }, 300);

  }, [faqSearchInputValue]);



  const invalidInputIds = useMemo(() => {

    const invalid = new Set<string>();

    let passwordValue = "";

    controlRootRoles.forEach((role, rootId) => {

      if (role.type !== "input") return;

      const key = controlFields.get(rootId)?.key;

      if (key === "password") passwordValue = controlTextState[rootId] ?? "";

    });

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    controlRootRoles.forEach((role, rootId) => {

      if (role.type !== "input") return;

      const key = controlFields.get(rootId)?.key;

      const value = (controlTextState[rootId] ?? "").trim();

      if (!value) return;

      if (key === "email" && !emailRegex.test(value)) invalid.add(rootId);

      if (key === "password" && value.length < 8) invalid.add(rootId);

      if (key === "passwordConfirm" && passwordValue && value !== passwordValue) invalid.add(rootId);

      if (key === "phone") {

        const digits = value.replace(/\D/g, "");

        if (digits.length < 9) invalid.add(rootId);

      }

      if (key === "date" || role.inputType === "date") {

        if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) invalid.add(rootId);

      }

      if (key === "deleteConfirm" && value.toUpperCase() !== "DELETE") invalid.add(rootId);

    });

    return invalid;

  }, [controlRootRoles, controlFields, controlTextState]);



  const disabledChoiceIds = useMemo(() => {

    const disabled = new Set<string>();

    const now = cooldownTick;

    const groups = new Map<string, { prevId?: string; nextId?: string; pages: Array<{ id: string; num: number }> }>();

    controlRootRoles.forEach((role, rootId) => {

      if (role.type !== "choice") return;

      const parentId = laidOut.nodes[rootId]?.parentId;

      if (!parentId) return;

      const parentName = laidOut.nodes[parentId]?.name ?? "";

      if (!isPaginationGroupName(parentName)) return;

      const label = resolveControlLabel(laidOut, role, rootId);

      const group = groups.get(parentId) ?? { pages: [] };

      if (isPrevLabel(label)) group.prevId = rootId;

      else if (isNextLabel(label)) group.nextId = rootId;

      else {

        const num = parseNumericLabel(label);

        if (num != null) group.pages.push({ id: rootId, num });

      }

      groups.set(parentId, group);

    });

    groups.forEach((group) => {

      if (!group.pages.length) return;

      group.pages.sort((a, b) => a.num - b.num);

      const activeIndex = group.pages.findIndex((page) => Boolean(controlState[page.id]));

      const index = activeIndex >= 0 ? activeIndex : 0;

      if (index <= 0 && group.prevId) disabled.add(group.prevId);

      if (index >= group.pages.length - 1 && group.nextId) disabled.add(group.nextId);

    });

    controlRootRoles.forEach((role, rootId) => {

      if (role.type !== "choice" && role.type !== "toggle" && role.type !== "checkbox") return;

      if (!hasAncestorMatching(laidOut, rootId, NOTIFICATION_MATRIX_PATTERN)) return;

      const label = controlFields.get(rootId)?.label ?? resolveControlLabel(laidOut as Doc, role, rootId);

      const normalized = normalizeLooseLabel(label);

      if (!normalized) return;

      const keys = [

        `matrix_${normalized}_enabled`,

        `notification_${normalized}_enabled`,

        `notify_${normalized}_enabled`,

        `perm_${normalized}`,

        `permission_${normalized}`,

      ];

      let allowed: boolean | null = null;

      for (const key of keys) {

        if (!(key in variableOverrides)) continue;

        allowed = coerceBoolean(variableOverrides[key]);

        if (allowed !== null) break;

      }

      if (allowed === false) disabled.add(rootId);

    });

    Object.entries(cooldownMap).forEach(([id, until]) => {

      if (until > now) disabled.add(id);

    });

    return disabled;

  }, [controlRootRoles, controlState, laidOut, cooldownMap, controlFields, variableOverrides, cooldownTick]);



  useEffect(() => {

    if (!basePageId) {

      deferStateUpdate(() => setSearchHiddenNodeIds(new Set()));

      return;

    }

    const query = debouncedSearchQuery.trim().toLowerCase();

    if (!query) {

      deferStateUpdate(() => setSearchHiddenNodeIds(new Set()));

      return;

    }

    const page = laidOut.pages.find((p) => p.id === basePageId) ?? laidOut.pages[0];

    if (!page) {

      deferStateUpdate(() => setSearchHiddenNodeIds(new Set()));

      return;

    }

    const scopeIds = collectDescendants(laidOut, page.rootId);

    const hidden = new Set<string>();

    scopeIds.forEach((id) => {

      if (!hasAncestorMatching(laidOut, id, SEARCH_CONTEXT_PATTERN)) return;

      if (!hasAncestorMatching(laidOut, id, SEARCH_SECTION_PATTERN)) return;

      const role = controlRootRoles.get(id);

      if (!role || role.type !== "choice") return;

      const text = collectTextContent(laidOut, id).toLowerCase();

      if (!text.includes(query)) hidden.add(id);

    });

    deferStateUpdate(() => setSearchHiddenNodeIds(hidden));

  }, [basePageId, controlRootRoles, debouncedSearchQuery, laidOut]);



  useEffect(() => {

    if (!basePageId) {

      deferStateUpdate(() => setFaqSearchHiddenNodeIds(new Set()));

      return;

    }

    const query = debouncedFaqQuery.trim().toLowerCase();

    if (!query) {

      deferStateUpdate(() => setFaqSearchHiddenNodeIds(new Set()));

      return;

    }

    const page = laidOut.pages.find((p) => p.id === basePageId) ?? laidOut.pages[0];

    if (!page) {

      deferStateUpdate(() => setFaqSearchHiddenNodeIds(new Set()));

      return;

    }

    const scopeIds = collectDescendants(laidOut, page.rootId);

    const hidden = new Set<string>();

    scopeIds.forEach((id) => {

      const role = controlRootRoles.get(id);

      if (!role || role.type !== "choice") return;

      if (!hasAncestorMatching(laidOut, id, FAQ_SECTION_PATTERN)) return;

      const nodeName = laidOut.nodes[id]?.name ?? "";

      if (!isListItemName(nodeName)) return;

      const text = collectTextContent(laidOut, id).toLowerCase();

      if (!text.includes(query)) hidden.add(id);

    });

    deferStateUpdate(() => setFaqSearchHiddenNodeIds(hidden));

  }, [basePageId, controlRootRoles, debouncedFaqQuery, laidOut]);



  const { hidden: notificationHiddenNodeIds, orderOverrides: notificationOrderOverrides } = useMemo(() => {

    const hidden = new Set<string>();

    const orderOverrides: Record<string, string[]> = {};

    if (!basePageId) return { hidden, orderOverrides };

    const page = laidOut.pages.find((p) => p.id === basePageId) ?? laidOut.pages[0];

    if (!page) return { hidden, orderOverrides };

    const scopeIds = collectDescendants(laidOut, page.rootId);

    const itemIds: string[] = [];

    const filterChoiceIds: string[] = [];

    const sortChoiceIds: string[] = [];

    const listContainerIds = new Set<string>();



    scopeIds.forEach((id) => {

      const role = controlRootRoles.get(id);

      if (!role || role.type !== "choice") return;

      if (!hasAncestorMatching(laidOut, id, NOTIFICATION_SECTION_PATTERN)) return;

      const node = laidOut.nodes[id];

      const nodeName = node?.name ?? "";

      const label = controlFields.get(id)?.label ?? resolveControlLabel(laidOut, role, id);

      if (isListItemName(nodeName)) {

        itemIds.push(id);

        const listContainerId = findAncestorIdMatching(laidOut, id, LIST_CONTAINER_PATTERN) ?? node?.parentId ?? null;

        if (listContainerId) listContainerIds.add(listContainerId);

        return;

      }

      if (

        matchesPattern(label, NOTIFICATION_FILTER_ALL_PATTERN) ||

        matchesPattern(label, NOTIFICATION_FILTER_UNREAD_PATTERN) ||

        matchesPattern(label, NOTIFICATION_FILTER_READ_PATTERN)

      ) {

        filterChoiceIds.push(id);

        return;

      }

      if (matchesPattern(label, NOTIFICATION_SORT_NEWEST_PATTERN) || matchesPattern(label, NOTIFICATION_SORT_OLDEST_PATTERN)) {

        sortChoiceIds.push(id);

      }

    });

    const itemIdSet = new Set(itemIds);



    const activeFilterId = filterChoiceIds.find((id) => Boolean(controlState[id])) ?? null;

    let filterMode: "all" | "unread" | "read" = "all";

    if (activeFilterId) {

      const role = controlRootRoles.get(activeFilterId);

      const label = role ? controlFields.get(activeFilterId)?.label ?? resolveControlLabel(laidOut, role, activeFilterId) : "";

      if (matchesPattern(label, NOTIFICATION_FILTER_UNREAD_PATTERN)) filterMode = "unread";

      else if (matchesPattern(label, NOTIFICATION_FILTER_READ_PATTERN)) filterMode = "read";

    }



    if (filterMode !== "all") {

      itemIds.forEach((id) => {

        const isRead = Boolean(controlState[id]);

        if (filterMode === "unread" && isRead) hidden.add(id);

        if (filterMode === "read" && !isRead) hidden.add(id);

      });

    }



    const activeSortId = sortChoiceIds.find((id) => Boolean(controlState[id])) ?? null;

    if (activeSortId) {

      const role = controlRootRoles.get(activeSortId);

      const label = role ? controlFields.get(activeSortId)?.label ?? resolveControlLabel(laidOut, role, activeSortId) : "";

      const sortOldest = matchesPattern(label, NOTIFICATION_SORT_OLDEST_PATTERN);

      const sortNewest = matchesPattern(label, NOTIFICATION_SORT_NEWEST_PATTERN);

      if (sortOldest || sortNewest) {

        listContainerIds.forEach((containerId) => {

          const container = laidOut.nodes[containerId];

          const children = container?.children ?? [];

          const ordered = children.filter((id) => itemIdSet.has(id));

          if (ordered.length < 2) return;

          orderOverrides[containerId] = sortOldest ? [...ordered].reverse() : ordered;

        });

      }

    }



    return { hidden, orderOverrides };

  }, [basePageId, controlFields, controlRootRoles, controlState, laidOut]);



  const { hidden: contentFeedHiddenNodeIds, orderOverrides: contentFeedOrderOverrides } = useMemo(() => {

    const hidden = new Set<string>();

    const orderOverrides: Record<string, string[]> = {};

    if (!basePageId) return { hidden, orderOverrides };

    const page = laidOut.pages.find((p) => p.id === basePageId) ?? laidOut.pages[0];

    if (!page) return { hidden, orderOverrides };

    const scopeIds = collectDescendants(laidOut, page.rootId);

    const itemIds: string[] = [];

    const listContainerIds = new Set<string>();

    const filterChoiceIds: string[] = [];

    const sortChoiceIds: string[] = [];



    scopeIds.forEach((id) => {

      const role = controlRootRoles.get(id);

      if (!role || role.type !== "choice") return;

      if (!hasAncestorMatching(laidOut, id, CONTENT_FEED_PATTERN)) return;

      const node = laidOut.nodes[id];

      const nodeName = node?.name ?? "";

      const label = controlFields.get(id)?.label ?? resolveControlLabel(laidOut, role, id);

      if (isListItemName(nodeName)) {

        itemIds.push(id);

        const listContainerId = findAncestorIdMatching(laidOut, id, LIST_CONTAINER_PATTERN) ?? node?.parentId ?? null;

        if (listContainerId) listContainerIds.add(listContainerId);

        return;

      }

      if (matchesPattern(label, FILTER_PATTERN) || matchesPattern(label, ALL_FILTER_PATTERN)) {

        filterChoiceIds.push(id);

        return;

      }

      if (

        matchesPattern(label, CONTENT_SORT_NEWEST_PATTERN) ||

        matchesPattern(label, CONTENT_SORT_OLDEST_PATTERN) ||

        matchesPattern(label, CONTENT_SORT_POPULAR_PATTERN)

      ) {

        sortChoiceIds.push(id);

      }

    });



    const itemIdSet = new Set(itemIds);

    const activeFilterId = filterChoiceIds.find((id) => Boolean(controlState[id])) ?? null;

    if (activeFilterId) {

      const role = controlRootRoles.get(activeFilterId);

      const label = role ? controlFields.get(activeFilterId)?.label ?? resolveControlLabel(laidOut, role, activeFilterId) : "";

      if (label && !matchesPattern(label, ALL_FILTER_PATTERN)) {

        const key = normalizeLooseLabel(label);

        if (key) {

          itemIds.forEach((id) => {

            const text = collectTextContent(laidOut, id);

            const normalized = normalizeLooseLabel(text);

            if (!normalized.includes(key)) hidden.add(id);

          });

        }

      }

    }



    const resolveNumber = (value: unknown) => {

      if (typeof value === "number" && Number.isFinite(value)) return value;

      if (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value))) return Number(value);

      return null;

    };

    const limit =

      resolveNumber(variableOverrides.limit) ??

      resolveNumber(variableOverrides.pageSize) ??

      resolveNumber(variableOverrides.perPage) ??

      resolveNumber(variableOverrides.page_size) ??

      resolveNumber(variableOverrides.per_page) ??

      6;

    const pageNum = resolveNumber(variableOverrides.page) ?? 1;

    const start = Math.max(0, (pageNum - 1) * limit);

    const end = start + Math.max(1, limit);



    const activeSortId = sortChoiceIds.find((id) => Boolean(controlState[id])) ?? null;

    let sortMode: "default" | "oldest" | "newest" | "popular" = "default";

    if (activeSortId) {

      const role = controlRootRoles.get(activeSortId);

      const label = role ? controlFields.get(activeSortId)?.label ?? resolveControlLabel(laidOut, role, activeSortId) : "";

      if (matchesPattern(label, CONTENT_SORT_OLDEST_PATTERN)) sortMode = "oldest";

      else if (matchesPattern(label, CONTENT_SORT_NEWEST_PATTERN)) sortMode = "newest";

      else if (matchesPattern(label, CONTENT_SORT_POPULAR_PATTERN)) sortMode = "popular";

    }



    listContainerIds.forEach((containerId) => {

      const container = laidOut.nodes[containerId];

      const children = container?.children ?? [];

      const ordered = children

        .filter((id) => itemIdSet.has(id))

        .sort((a, b) => (laidOut.nodes[a]?.frame.y ?? 0) - (laidOut.nodes[b]?.frame.y ?? 0));

      if (!ordered.length) return;

      const sorted = sortMode === "oldest" ? [...ordered].reverse() : ordered;

      orderOverrides[containerId] = sorted;

      sorted.forEach((id, index) => {

        if (index < start || index >= end) hidden.add(id);

      });

    });



    return { hidden, orderOverrides };

  }, [basePageId, controlFields, controlRootRoles, controlState, laidOut, variableOverrides]);



  const { hidden: commentHiddenNodeIds, orderOverrides: commentOrderOverrides } = useMemo(() => {

    const hidden = new Set<string>();

    const orderOverrides: Record<string, string[]> = {};

    if (!basePageId) return { hidden, orderOverrides };

    const page = laidOut.pages.find((p) => p.id === basePageId) ?? laidOut.pages[0];

    if (!page) return { hidden, orderOverrides };

    const scopeIds = collectDescendants(laidOut, page.rootId);

    const itemIds: string[] = [];

    const listContainerIds = new Set<string>();



    scopeIds.forEach((id) => {

      const node = laidOut.nodes[id];

      if (!node) return;

      if (!hasAncestorMatching(laidOut, id, COMMENT_SECTION_PATTERN)) return;

      const nodeName = node.name ?? "";

      if (!isListItemName(nodeName) && !isContentCardName(nodeName)) return;

      itemIds.push(id);

      const listContainerId = findAncestorIdMatching(laidOut, id, LIST_CONTAINER_PATTERN) ?? node.parentId ?? null;

      if (listContainerId) listContainerIds.add(listContainerId);

    });



    if (!itemIds.length) return { hidden, orderOverrides };

    const resolveNumber = (value: unknown) => {

      if (typeof value === "number" && Number.isFinite(value)) return value;

      if (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value))) return Number(value);

      return null;

    };

    const limit =

      resolveNumber(variableOverrides.commentLimit) ??

      resolveNumber(variableOverrides.comment_limit) ??

      resolveNumber(variableOverrides.commentPageSize) ??

      resolveNumber(variableOverrides.comment_page_size) ??

      resolveNumber(variableOverrides.commentPerPage) ??

      resolveNumber(variableOverrides.comment_per_page) ??

      resolveNumber(variableOverrides.limit) ??

      6;

    const pageNum = resolveNumber(variableOverrides.commentPage) ?? resolveNumber(variableOverrides.comment_page) ?? 1;

    const start = Math.max(0, (pageNum - 1) * Math.max(1, limit));

    const end = start + Math.max(1, limit);

    const itemIdSet = new Set(itemIds);

    listContainerIds.forEach((containerId) => {

      const container = laidOut.nodes[containerId];

      const children = container?.children ?? [];

      const ordered = children

        .filter((id) => itemIdSet.has(id))

        .sort((a, b) => (laidOut.nodes[a]?.frame.y ?? 0) - (laidOut.nodes[b]?.frame.y ?? 0));

      if (!ordered.length) return;

      orderOverrides[containerId] = ordered;

      ordered.forEach((id, index) => {

        if (index < start || index >= end) hidden.add(id);

      });

    });

    return { hidden, orderOverrides };

  }, [basePageId, laidOut, variableOverrides]);



  const tagFilterHiddenNodeIds = useMemo(() => {

    const hidden = new Set<string>();

    if (!basePageId) return hidden;

    const page = laidOut.pages.find((p) => p.id === basePageId) ?? laidOut.pages[0];

    if (!page) return hidden;

    const scopeIds = collectDescendants(laidOut, page.rootId);

    let activeTag: string | null = null;

    const tagValue = variableOverrides.tag ?? variableOverrides.selectedTag ?? variableOverrides.tagFilter ?? variableOverrides.tag_filter;

    if (typeof tagValue === "string" && tagValue.trim()) activeTag = tagValue.trim();

    if (!activeTag) {

      controlRootRoles.forEach((role, rootId) => {

        if (activeTag) return;

        if (role.type !== "choice") return;

        if (!scopeIds.has(rootId)) return;

        if (!hasAncestorMatching(laidOut, rootId, TAG_SECTION_PATTERN)) return;

        if (!controlState[rootId]) return;

        const label = controlFields.get(rootId)?.label ?? resolveControlLabel(laidOut as Doc, role, rootId);

        if (!label || matchesPattern(label, ALL_FILTER_PATTERN)) return;

        activeTag = label;

      });

    }

    if (!activeTag) return hidden;

    const tagKey = normalizeLooseLabel(activeTag);

    if (!tagKey) return hidden;

    scopeIds.forEach((id) => {

      const node = laidOut.nodes[id];

      if (!node) return;

      const nodeName = node.name ?? "";

      if (!isContentCardName(nodeName) && !isListItemName(nodeName)) return;

      if (!hasAncestorMatching(laidOut, id, TAG_SECTION_PATTERN)) return;

      const text = collectTextContent(laidOut, id);

      const normalized = normalizeLooseLabel(text);

      if (!normalized.includes(tagKey)) hidden.add(id);

    });

    return hidden;

  }, [basePageId, controlFields, controlRootRoles, controlState, laidOut, variableOverrides]);



  const tagOrderOverrides = useMemo(() => {

    const orderOverrides: Record<string, string[]> = {};

    if (!basePageId) return orderOverrides;

    const page = laidOut.pages.find((p) => p.id === basePageId) ?? laidOut.pages[0];

    if (!page) return orderOverrides;

    const scopeIds = collectDescendants(laidOut, page.rootId);

    const sortValue =

      (typeof variableOverrides.tagSort === "string" && variableOverrides.tagSort) ||

      (typeof variableOverrides.tag_sort === "string" && variableOverrides.tag_sort) ||

      (typeof variableOverrides.sort === "string" && variableOverrides.sort) ||

      "";

    if (!sortValue) return orderOverrides;

    const sortMode = matchesPattern(sortValue, CONTENT_SORT_OLDEST_PATTERN)

      ? "oldest"

      : matchesPattern(sortValue, CONTENT_SORT_NEWEST_PATTERN)

        ? "newest"

        : matchesPattern(sortValue, CONTENT_SORT_POPULAR_PATTERN)

          ? "popular"

          : "default";

    if (sortMode === "default") return orderOverrides;

    const itemIds: string[] = [];

    const listContainerIds = new Set<string>();

    scopeIds.forEach((id) => {

      const node = laidOut.nodes[id];

      if (!node) return;

      if (!hasAncestorMatching(laidOut, id, TAG_SECTION_PATTERN)) return;

      const nodeName = node.name ?? "";

      if (!isContentCardName(nodeName) && !isListItemName(nodeName)) return;

      itemIds.push(id);

      const listContainerId = findAncestorIdMatching(laidOut, id, LIST_CONTAINER_PATTERN) ?? node.parentId ?? null;

      if (listContainerId) listContainerIds.add(listContainerId);

    });

    const itemIdSet = new Set(itemIds);

    listContainerIds.forEach((containerId) => {

      const container = laidOut.nodes[containerId];

      const children = container?.children ?? [];

      const ordered = children

        .filter((id) => itemIdSet.has(id))

        .sort((a, b) => (laidOut.nodes[a]?.frame.y ?? 0) - (laidOut.nodes[b]?.frame.y ?? 0));

      if (ordered.length < 2) return;

      orderOverrides[containerId] = sortMode === "oldest" ? [...ordered].reverse() : ordered;

    });

    return orderOverrides;

  }, [basePageId, laidOut, variableOverrides]);



  const bookmarkFilterHiddenNodeIds = useMemo(() => {

    const hidden = new Set<string>();

    if (!basePageId) return hidden;

    const page = laidOut.pages.find((p) => p.id === basePageId) ?? laidOut.pages[0];

    if (!page) return hidden;

    const scopeIds = collectDescendants(laidOut, page.rootId);

    let activeFilter: string | null = null;

    const filterValue =

      variableOverrides.bookmarkFilter ??

      variableOverrides.bookmark_filter ??

      variableOverrides.bookmarkFolder ??

      variableOverrides.bookmark_folder ??

      variableOverrides.filter;

    if (typeof filterValue === "string" && filterValue.trim()) activeFilter = filterValue.trim();

    if (!activeFilter) {

      controlRootRoles.forEach((role, rootId) => {

        if (activeFilter) return;

        if (role.type !== "choice") return;

        if (!scopeIds.has(rootId)) return;

        if (!hasAncestorMatching(laidOut, rootId, BOOKMARK_SECTION_PATTERN)) return;

        if (!controlState[rootId]) return;

        const label = controlFields.get(rootId)?.label ?? resolveControlLabel(laidOut as Doc, role, rootId);

        if (!label || matchesPattern(label, ALL_FILTER_PATTERN)) return;

        activeFilter = label;

      });

    }

    if (!activeFilter) return hidden;

    const filterKey = normalizeLooseLabel(activeFilter);

    if (!filterKey) return hidden;

    scopeIds.forEach((id) => {

      const node = laidOut.nodes[id];

      if (!node) return;

      const nodeName = node.name ?? "";

      if (!isListItemName(nodeName) && !isContentCardName(nodeName)) return;

      if (!hasAncestorMatching(laidOut, id, BOOKMARK_SECTION_PATTERN)) return;

      const text = collectTextContent(laidOut, id);

      const normalized = normalizeLooseLabel(text);

      if (!normalized.includes(filterKey)) hidden.add(id);

    });

    return hidden;

  }, [basePageId, controlFields, controlRootRoles, controlState, laidOut, variableOverrides]);



  const kanbanFilterHiddenNodeIds = useMemo(() => {

    const hidden = new Set<string>();

    if (!basePageId) return hidden;

    const page = laidOut.pages.find((p) => p.id === basePageId) ?? laidOut.pages[0];

    if (!page) return hidden;

    const scopeIds = collectDescendants(laidOut, page.rootId);

    let activeFilter: string | null = null;

    const filterValue =

      variableOverrides.kanbanFilter ??

      variableOverrides.kanban_filter ??

      variableOverrides.kanbanStatus ??

      variableOverrides.kanban_status ??

      variableOverrides.filter;

    if (typeof filterValue === "string" && filterValue.trim()) activeFilter = filterValue.trim();

    if (!activeFilter) {

      controlRootRoles.forEach((role, rootId) => {

        if (activeFilter) return;

        if (role.type !== "choice") return;

        if (!scopeIds.has(rootId)) return;

        if (!hasAncestorMatching(laidOut, rootId, KANBAN_SECTION_PATTERN)) return;

        if (!controlState[rootId]) return;

        const label = controlFields.get(rootId)?.label ?? resolveControlLabel(laidOut as Doc, role, rootId);

        if (!label || matchesPattern(label, ALL_FILTER_PATTERN)) return;

        activeFilter = label;

      });

    }

    if (!activeFilter) return hidden;

    const filterKey = normalizeLooseLabel(activeFilter);

    if (!filterKey) return hidden;

    scopeIds.forEach((id) => {

      const node = laidOut.nodes[id];

      if (!node) return;

      const nodeName = node.name ?? "";

      if (!isListItemName(nodeName) && !isContentCardName(nodeName)) return;

      if (!hasAncestorMatching(laidOut, id, KANBAN_SECTION_PATTERN)) return;

      const text = collectTextContent(laidOut, id);

      const normalized = normalizeLooseLabel(text);

      if (!normalized.includes(filterKey)) hidden.add(id);

    });

    return hidden;

  }, [basePageId, controlFields, controlRootRoles, controlState, laidOut, variableOverrides]);



  const mediaFilterHiddenNodeIds = useMemo(() => {

    const hidden = new Set<string>();

    if (!basePageId) return hidden;

    const page = laidOut.pages.find((p) => p.id === basePageId) ?? laidOut.pages[0];

    if (!page) return hidden;

    const scopeIds = collectDescendants(laidOut, page.rootId);

    let activeFilter: string | null = null;

    const filterValue =

      variableOverrides.mediaFilter ??

      variableOverrides.media_filter ??

      variableOverrides.galleryFilter ??

      variableOverrides.gallery_filter ??

      variableOverrides.filter;

    if (typeof filterValue === "string" && filterValue.trim()) activeFilter = filterValue.trim();

    if (!activeFilter) {

      controlRootRoles.forEach((role, rootId) => {

        if (activeFilter) return;

        if (role.type !== "choice") return;

        if (!scopeIds.has(rootId)) return;

        if (!hasAncestorMatching(laidOut, rootId, MEDIA_GALLERY_SECTION_PATTERN)) return;

        if (!controlState[rootId]) return;

        const label = controlFields.get(rootId)?.label ?? resolveControlLabel(laidOut as Doc, role, rootId);

        if (!label || matchesPattern(label, ALL_FILTER_PATTERN)) return;

        activeFilter = label;

      });

    }

    if (!activeFilter) return hidden;

    const filterKey = normalizeLooseLabel(activeFilter);

    if (!filterKey) return hidden;

    scopeIds.forEach((id) => {

      const node = laidOut.nodes[id];

      if (!node) return;

      const nodeName = node.name ?? "";

      if (!isListItemName(nodeName) && !isContentCardName(nodeName)) return;

      if (!hasAncestorMatching(laidOut, id, MEDIA_GALLERY_SECTION_PATTERN)) return;

      const text = collectTextContent(laidOut, id);

      const normalized = normalizeLooseLabel(text);

      if (!normalized.includes(filterKey)) hidden.add(id);

    });

    return hidden;

  }, [basePageId, controlFields, controlRootRoles, controlState, laidOut, variableOverrides]);



  const userManagerHiddenNodeIds = useMemo(() => {

    const hidden = new Set<string>();

    if (!basePageId) return hidden;

    const page = laidOut.pages.find((p) => p.id === basePageId) ?? laidOut.pages[0];

    if (!page) return hidden;

    const scopeIds = collectDescendants(laidOut, page.rootId);

    let query =

      (typeof variableOverrides.userQuery === "string" && variableOverrides.userQuery) ||

      (typeof variableOverrides.user_query === "string" && variableOverrides.user_query) ||

      "";

    if (!query) {

      controlRootRoles.forEach((role, rootId) => {

        if (query) return;

        if (role.type !== "input") return;

        if (!scopeIds.has(rootId)) return;

        if (!hasAncestorMatching(laidOut, rootId, USER_ADMIN_SECTION_PATTERN)) return;

        const value = (controlTextState[rootId] ?? "").trim();

        if (value) query = value;

      });

    }

    let filter =

      (typeof variableOverrides.userFilter === "string" && variableOverrides.userFilter) ||

      (typeof variableOverrides.user_filter === "string" && variableOverrides.user_filter) ||

      (typeof variableOverrides.userStatus === "string" && variableOverrides.userStatus) ||

      (typeof variableOverrides.user_status === "string" && variableOverrides.user_status) ||

      "";

    if (!filter) {

      controlRootRoles.forEach((role, rootId) => {

        if (filter) return;

        if (role.type !== "choice") return;

        if (!scopeIds.has(rootId)) return;

        if (!hasAncestorMatching(laidOut, rootId, USER_ADMIN_SECTION_PATTERN)) return;

        if (!controlState[rootId]) return;

        const label = controlFields.get(rootId)?.label ?? resolveControlLabel(laidOut as Doc, role, rootId);

        if (!label || matchesPattern(label, ALL_FILTER_PATTERN)) return;

        filter = label;

      });

    }

    const queryKey = normalizeLooseLabel(query);

    const filterKey = normalizeLooseLabel(filter);

    scopeIds.forEach((id) => {

      const node = laidOut.nodes[id];

      if (!node) return;

      if (!isListItemName(node.name ?? "")) return;

      if (!hasAncestorMatching(laidOut, id, USER_ADMIN_SECTION_PATTERN)) return;

      const text = collectTextContent(laidOut, id);

      const normalized = normalizeLooseLabel(text);

      if (queryKey && !normalized.includes(queryKey)) hidden.add(id);

      if (filterKey && !normalized.includes(filterKey)) hidden.add(id);

    });

    return hidden;

  }, [basePageId, controlFields, controlRootRoles, controlState, controlTextState, laidOut, variableOverrides]);



  const auditLogHiddenNodeIds = useMemo(() => {

    const hidden = new Set<string>();

    if (!basePageId) return hidden;

    const page = laidOut.pages.find((p) => p.id === basePageId) ?? laidOut.pages[0];

    if (!page) return hidden;

    const scopeIds = collectDescendants(laidOut, page.rootId);

    let query =

      (typeof variableOverrides.auditQuery === "string" && variableOverrides.auditQuery) ||

      (typeof variableOverrides.audit_query === "string" && variableOverrides.audit_query) ||

      "";

    if (!query) {

      controlRootRoles.forEach((role, rootId) => {

        if (query) return;

        if (role.type !== "input") return;

        if (!scopeIds.has(rootId)) return;

        if (!hasAncestorMatching(laidOut, rootId, AUDIT_LOG_SECTION_PATTERN)) return;

        const value = (controlTextState[rootId] ?? "").trim();

        if (value) query = value;

      });

    }

    let filter =

      (typeof variableOverrides.auditFilter === "string" && variableOverrides.auditFilter) ||

      (typeof variableOverrides.audit_filter === "string" && variableOverrides.audit_filter) ||

      "";

    if (!filter) {

      controlRootRoles.forEach((role, rootId) => {

        if (filter) return;

        if (role.type !== "choice") return;

        if (!scopeIds.has(rootId)) return;

        if (!hasAncestorMatching(laidOut, rootId, AUDIT_LOG_SECTION_PATTERN)) return;

        if (!controlState[rootId]) return;

        const label = controlFields.get(rootId)?.label ?? resolveControlLabel(laidOut as Doc, role, rootId);

        if (!label || matchesPattern(label, ALL_FILTER_PATTERN)) return;

        filter = label;

      });

    }

    const queryKey = normalizeLooseLabel(query);

    const filterKey = normalizeLooseLabel(filter);

    scopeIds.forEach((id) => {

      const node = laidOut.nodes[id];

      if (!node) return;

      if (!isListItemName(node.name ?? "")) return;

      if (!hasAncestorMatching(laidOut, id, AUDIT_LOG_SECTION_PATTERN)) return;

      const text = collectTextContent(laidOut, id);

      const normalized = normalizeLooseLabel(text);

      if (queryKey && !normalized.includes(queryKey)) hidden.add(id);

      if (filterKey && !normalized.includes(filterKey)) hidden.add(id);

    });

    return hidden;

  }, [basePageId, controlFields, controlRootRoles, controlState, controlTextState, laidOut, variableOverrides]);



  const consoleHiddenNodeIds = useMemo(() => {

    const hidden = new Set<string>();

    if (!basePageId) return hidden;

    const page = laidOut.pages.find((p) => p.id === basePageId) ?? laidOut.pages[0];

    if (!page) return hidden;

    const scopeIds = collectDescendants(laidOut, page.rootId);

    let level =

      (typeof variableOverrides.consoleLevel === "string" && variableOverrides.consoleLevel) ||

      (typeof variableOverrides.console_level === "string" && variableOverrides.console_level) ||

      "";

    if (!level) {

      controlRootRoles.forEach((role, rootId) => {

        if (level) return;

        if (role.type !== "choice") return;

        if (!scopeIds.has(rootId)) return;

        if (!hasAncestorMatching(laidOut, rootId, SYSTEM_CONSOLE_SECTION_PATTERN)) return;

        if (!controlState[rootId]) return;

        const label = controlFields.get(rootId)?.label ?? resolveControlLabel(laidOut as Doc, role, rootId);

        if (!label || !matchesPattern(label, CONSOLE_LEVEL_PATTERN)) return;

        level = label;

      });

    }

    const levelKey = normalizeLooseLabel(level);

    if (!levelKey) return hidden;

    scopeIds.forEach((id) => {

      const node = laidOut.nodes[id];

      if (!node) return;

      if (!isListItemName(node.name ?? "")) return;

      if (!hasAncestorMatching(laidOut, id, SYSTEM_CONSOLE_SECTION_PATTERN)) return;

      const text = collectTextContent(laidOut, id);

      const normalized = normalizeLooseLabel(text);

      if (levelKey && !normalized.includes(levelKey)) hidden.add(id);

    });

    return hidden;

  }, [basePageId, controlFields, controlRootRoles, controlState, laidOut, variableOverrides]);



  const skeletonHiddenNodeIds = useMemo(() => {

    const hidden = new Set<string>();

    if (!basePageId) return hidden;

    const page = laidOut.pages.find((p) => p.id === basePageId) ?? laidOut.pages[0];

    if (!page) return hidden;

    const scopeIds = collectDescendants(laidOut, page.rootId);

    const loading =

      coerceBoolean(variableOverrides.loading ?? variableOverrides.isLoading ?? variableOverrides.skeletonLoading ?? variableOverrides.skeleton_loading) === true ||

      skeletonHold;

    const skeletonRoots: string[] = [];

    scopeIds.forEach((id) => {

      const node = laidOut.nodes[id];

      if (!node) return;

      const label = `${node.name ?? ""} ${node.type === "text" ? node.text?.value ?? "" : ""}`;

      if (matchesPattern(label, LOADING_PATTERN)) skeletonRoots.push(id);

    });

    if (!skeletonRoots.length) return hidden;

    const resolveNumber = (value: unknown) => {

      if (typeof value === "number" && Number.isFinite(value)) return value;

      if (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value))) return Number(value);

      return null;

    };

    const skeletonCount =

      resolveNumber(variableOverrides.skeletonCount) ??

      resolveNumber(variableOverrides.skeleton_count) ??

      resolveNumber(variableOverrides.loadingCount) ??

      null;



    if (!loading) {

      skeletonRoots.forEach((id) => {

        collectDescendants(laidOut, id).forEach((childId) => hidden.add(childId));

      });

      return hidden;

    }

    skeletonRoots.forEach((id) => {

      const parentId = laidOut.nodes[id]?.parentId ?? null;

      if (!parentId) return;

      const parent = laidOut.nodes[parentId];

      parent?.children?.forEach((childId) => {

        if (childId === id) return;

        collectDescendants(laidOut, childId).forEach((desc) => hidden.add(desc));

      });

    });



    if (skeletonCount !== null) {

      const skeletonItemIds = Array.from(scopeIds).filter((id) => {

        const node = laidOut.nodes[id];

        if (!node) return false;

        if (!isListItemName(node.name ?? "")) return false;

        if (!hasAncestorMatching(laidOut, id, SKELETON_SECTION_PATTERN) && !matchesPattern(node.name ?? "", LOADING_PATTERN)) return false;

        return true;

      });

      const ordered = skeletonItemIds

        .map((id) => ({ id, y: laidOut.nodes[id]?.frame.y ?? 0, x: laidOut.nodes[id]?.frame.x ?? 0 }))

        .sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y))

        .map((entry) => entry.id);

      ordered.forEach((id, index) => {

        if (index >= skeletonCount) {

          collectDescendants(laidOut, id).forEach((childId) => hidden.add(childId));

        }

      });

    }

    return hidden;

  }, [basePageId, laidOut, skeletonHold, variableOverrides]);



  const emptyStateHiddenNodeIds = useMemo(() => {

    const hidden = new Set<string>();

    if (!basePageId) return hidden;

    const page = laidOut.pages.find((p) => p.id === basePageId) ?? laidOut.pages[0];

    if (!page) return hidden;

    const scopeIds = collectDescendants(laidOut, page.rootId);

    const explicitEmpty = coerceBoolean(

      variableOverrides.empty ?? variableOverrides.isEmpty ?? variableOverrides.empty_state ?? variableOverrides.noData ?? variableOverrides.no_data,

    );

    let emptyFlag: boolean | null = explicitEmpty;

    if (emptyFlag === null) {

      const countValues = Object.entries(variableOverrides)

        .filter(([key, value]) => /count/i.test(key) && typeof value === "number")

        .map(([, value]) => value as number);

      if (countValues.length) {

        emptyFlag = countValues.every((value) => value === 0);

      }

    }

    const emptyRoots = Array.from(scopeIds).filter((id) => {

      const node = laidOut.nodes[id];

      if (!node) return false;

      const label = `${node.name ?? ""} ${node.type === "text" ? node.text?.value ?? "" : ""}`;

      return matchesPattern(label, EMPTY_STATE_PATTERN);

    });

    if (!emptyRoots.length) return hidden;

    if (emptyFlag === true) {

      emptyRoots.forEach((rootId) => {

        const parentId = laidOut.nodes[rootId]?.parentId ?? null;

        if (!parentId) return;

        const parent = laidOut.nodes[parentId];

        parent?.children?.forEach((childId) => {

          if (childId === rootId) return;

          collectDescendants(laidOut, childId).forEach((desc) => hidden.add(desc));

        });

      });

      return hidden;

    }

    emptyRoots.forEach((rootId) => {

      collectDescendants(laidOut, rootId).forEach((id) => hidden.add(id));

    });

    return hidden;

  }, [basePageId, laidOut, variableOverrides]);



  const chartHiddenNodeIds = useMemo(() => {

    const hidden = new Set<string>();

    if (!basePageId) return hidden;

    const page = laidOut.pages.find((p) => p.id === basePageId) ?? laidOut.pages[0];

    if (!page) return hidden;

    const scopeIds = collectDescendants(laidOut, page.rootId);

    const showLoading = coerceBoolean(variableOverrides.chartLoading ?? variableOverrides.chart_loading) === true;

    const showEmpty = coerceBoolean(variableOverrides.chartEmpty ?? variableOverrides.chart_empty) === true;

    if (!showLoading && !showEmpty) {

      scopeIds.forEach((id) => {

        const node = laidOut.nodes[id];

        if (!node) return;

        if (!hasAncestorMatching(laidOut, id, CHART_SECTION_PATTERN)) return;

        const name = node.name ?? "";

        const text = node.type === "text" ? node.text?.value ?? "" : "";

        if (matchesPattern(name + text, EMPTY_STATE_PATTERN)) hidden.add(id);

        if (matchesPattern(name + text, LOADING_PATTERN)) hidden.add(id);

      });

      return hidden;

    }

    scopeIds.forEach((id) => {

      const node = laidOut.nodes[id];

      if (!node) return;

      if (!hasAncestorMatching(laidOut, id, CHART_SECTION_PATTERN)) return;

      const name = node.name ?? "";

      const text = node.type === "text" ? node.text?.value ?? "" : "";

      const isLoadingNode = matchesPattern(name + text, LOADING_PATTERN);

      const isEmptyNode = matchesPattern(name + text, EMPTY_STATE_PATTERN);

      if (showLoading && !isLoadingNode) hidden.add(id);

      if (showEmpty && !isEmptyNode) hidden.add(id);

    });

    return hidden;

  }, [basePageId, laidOut, variableOverrides]);



  const { hidden: tableHiddenNodeIds, orderOverrides: tableOrderOverrides } = useMemo(() => {

    const hidden = new Set<string>();

    const orderOverrides: Record<string, string[]> = {};

    if (!basePageId) return { hidden, orderOverrides };

    const page = laidOut.pages.find((p) => p.id === basePageId) ?? laidOut.pages[0];

    if (!page) return { hidden, orderOverrides };

    const scopeIds = collectDescendants(laidOut, page.rootId);

    const itemIds: string[] = [];

    const listContainerIds = new Set<string>();

    scopeIds.forEach((id) => {

      const node = laidOut.nodes[id];

      if (!node) return;

      if (!isListItemName(node.name ?? "")) return;

      if (!hasAncestorMatching(laidOut, id, DATA_TABLE_SECTION_PATTERN)) return;

      itemIds.push(id);

      const listContainerId = findAncestorIdMatching(laidOut, id, LIST_CONTAINER_PATTERN) ?? node.parentId ?? null;

      if (listContainerId) listContainerIds.add(listContainerId);

    });

    if (!itemIds.length) return { hidden, orderOverrides };

    const resolveNumber = (value: unknown) => {

      if (typeof value === "number" && Number.isFinite(value)) return value;

      if (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value))) return Number(value);

      return null;

    };

    const limit =

      resolveNumber(variableOverrides.tableLimit) ??

      resolveNumber(variableOverrides.table_limit) ??

      resolveNumber(variableOverrides.tablePageSize) ??

      resolveNumber(variableOverrides.table_page_size) ??

      resolveNumber(variableOverrides.limit) ??

      10;

    const pageNum = resolveNumber(variableOverrides.tablePage) ?? resolveNumber(variableOverrides.table_page) ?? 1;

    const start = Math.max(0, (pageNum - 1) * Math.max(1, limit));

    const end = start + Math.max(1, limit);

    const itemIdSet = new Set(itemIds);

    listContainerIds.forEach((containerId) => {

      const container = laidOut.nodes[containerId];

      const children = container?.children ?? [];

      const ordered = children

        .filter((id) => itemIdSet.has(id))

        .sort((a, b) => (laidOut.nodes[a]?.frame.y ?? 0) - (laidOut.nodes[b]?.frame.y ?? 0));

      if (!ordered.length) return;

      orderOverrides[containerId] = ordered;

      ordered.forEach((id, index) => {

        if (index < start || index >= end) hidden.add(id);

      });

    });

    return { hidden, orderOverrides };

  }, [basePageId, laidOut, variableOverrides]);



  const { hidden: chatListHiddenNodeIds, orderOverrides: chatListOrderOverrides } = useMemo(() => {

    const hidden = new Set<string>();

    const orderOverrides: Record<string, string[]> = {};

    if (!basePageId) return { hidden, orderOverrides };

    const page = laidOut.pages.find((p) => p.id === basePageId) ?? laidOut.pages[0];

    if (!page) return { hidden, orderOverrides };

    const scopeIds = collectDescendants(laidOut, page.rootId);

    const itemIds: string[] = [];

    const listContainerIds = new Set<string>();

    scopeIds.forEach((id) => {

      const node = laidOut.nodes[id];

      if (!node) return;

      if (!hasAncestorMatching(laidOut, id, CHAT_LIST_SECTION_PATTERN)) return;

      const nodeName = node.name ?? "";

      if (!isListItemName(nodeName)) return;

      itemIds.push(id);

      const listContainerId = findAncestorIdMatching(laidOut, id, LIST_CONTAINER_PATTERN) ?? node.parentId ?? null;

      if (listContainerId) listContainerIds.add(listContainerId);

    });

    if (!itemIds.length) return { hidden, orderOverrides };

    const resolveNumber = (value: unknown) => {

      if (typeof value === "number" && Number.isFinite(value)) return value;

      if (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value))) return Number(value);

      return null;

    };

    const limit =

      resolveNumber(variableOverrides.chatLimit) ??

      resolveNumber(variableOverrides.chat_limit) ??

      resolveNumber(variableOverrides.chatPageSize) ??

      resolveNumber(variableOverrides.chat_page_size) ??

      resolveNumber(variableOverrides.chatPerPage) ??

      resolveNumber(variableOverrides.chat_per_page) ??

      resolveNumber(variableOverrides.limit) ??

      8;

    const pageNum = resolveNumber(variableOverrides.chatPage) ?? resolveNumber(variableOverrides.chat_page) ?? 1;

    const start = Math.max(0, (pageNum - 1) * Math.max(1, limit));

    const end = start + Math.max(1, limit);

    const itemIdSet = new Set(itemIds);

    listContainerIds.forEach((containerId) => {

      const container = laidOut.nodes[containerId];

      const children = container?.children ?? [];

      const ordered = children

        .filter((id) => itemIdSet.has(id))

        .sort((a, b) => (laidOut.nodes[a]?.frame.y ?? 0) - (laidOut.nodes[b]?.frame.y ?? 0));

      if (!ordered.length) return;

      orderOverrides[containerId] = ordered;

      ordered.forEach((id, index) => {

        if (index < start || index >= end) hidden.add(id);

      });

    });

    return { hidden, orderOverrides };

  }, [basePageId, laidOut, variableOverrides]);



  const { hidden: mentionHiddenNodeIds, orderOverrides: mentionOrderOverrides } = useMemo(() => {

    const hidden = new Set<string>();

    const orderOverrides: Record<string, string[]> = {};

    if (!basePageId) return { hidden, orderOverrides };

    const page = laidOut.pages.find((p) => p.id === basePageId) ?? laidOut.pages[0];

    if (!page) return { hidden, orderOverrides };

    const scopeIds = collectDescendants(laidOut, page.rootId);

    const itemIds: string[] = [];

    const filterChoiceIds: string[] = [];

    const listContainerIds = new Set<string>();



    scopeIds.forEach((id) => {

      const role = controlRootRoles.get(id);

      if (!role || role.type !== "choice") return;

      if (!hasAncestorMatching(laidOut, id, MENTION_SECTION_PATTERN)) return;

      const node = laidOut.nodes[id];

      const nodeName = node?.name ?? "";

      const label = controlFields.get(id)?.label ?? resolveControlLabel(laidOut, role, id);

      if (isListItemName(nodeName)) {

        itemIds.push(id);

        const listContainerId = findAncestorIdMatching(laidOut, id, LIST_CONTAINER_PATTERN) ?? node?.parentId ?? null;

        if (listContainerId) listContainerIds.add(listContainerId);

        return;

      }

      if (matchesPattern(label, ALL_FILTER_PATTERN) || matchesPattern(label, MENTION_FILTER_UNREAD_PATTERN) || matchesPattern(label, NOTIFICATION_FILTER_READ_PATTERN)) {

        filterChoiceIds.push(id);

      }

    });



    let filterMode: "all" | "unread" | "read" = "all";

    const rawFilter =

      (typeof variableOverrides.mentionFilter === "string" && variableOverrides.mentionFilter) ||

      (typeof variableOverrides.mention_filter === "string" && variableOverrides.mention_filter) ||

      "";

    if (rawFilter) {

      if (matchesPattern(rawFilter, MENTION_FILTER_UNREAD_PATTERN)) filterMode = "unread";

      else if (matchesPattern(rawFilter, NOTIFICATION_FILTER_READ_PATTERN)) filterMode = "read";

    } else {

      const activeFilterId = filterChoiceIds.find((id) => Boolean(controlState[id])) ?? null;

      if (activeFilterId) {

        const role = controlRootRoles.get(activeFilterId);

        const label = role ? controlFields.get(activeFilterId)?.label ?? resolveControlLabel(laidOut, role, activeFilterId) : "";

        if (matchesPattern(label, MENTION_FILTER_UNREAD_PATTERN)) filterMode = "unread";

        else if (matchesPattern(label, NOTIFICATION_FILTER_READ_PATTERN)) filterMode = "read";

      }

    }



    if (filterMode !== "all") {

      itemIds.forEach((id) => {

        const isRead = Boolean(controlState[id]);

        if (filterMode === "unread" && isRead) hidden.add(id);

        if (filterMode === "read" && !isRead) hidden.add(id);

      });

    }



    listContainerIds.forEach((containerId) => {

      const container = laidOut.nodes[containerId];

      const children = container?.children ?? [];

      const ordered = children.filter((id) => itemIds.includes(id));

      if (ordered.length > 1) orderOverrides[containerId] = ordered;

    });



    return { hidden, orderOverrides };

  }, [basePageId, controlFields, controlRootRoles, controlState, laidOut, variableOverrides]);



  const attachmentHiddenNodeIds = useMemo(() => {

    const hidden = new Set<string>();

    if (!basePageId) return hidden;

    const page = laidOut.pages.find((p) => p.id === basePageId) ?? laidOut.pages[0];

    if (!page) return hidden;

    const scopeIds = collectDescendants(laidOut, page.rootId);

    const removedRaw =

      (typeof variableOverrides.attachmentRemoved === "string" && variableOverrides.attachmentRemoved) ||

      (typeof variableOverrides.attachment_removed === "string" && variableOverrides.attachment_removed) ||

      (typeof variableOverrides.attachmentRemovedItems === "string" && variableOverrides.attachmentRemovedItems) ||

      "";

    const removedSet = removedRaw

      ? new Set(parseStringList(removedRaw, /[,|;]/).map((item) => normalizeLooseLabel(item)).filter(Boolean))

      : null;

    if (!removedSet || removedSet.size === 0) return hidden;

    scopeIds.forEach((id) => {

      const node = laidOut.nodes[id];

      if (!node) return;

      if (!hasAncestorMatching(laidOut, id, ATTACHMENT_SECTION_PATTERN)) return;

      const nodeName = node.name ?? "";

      if (!isListItemName(nodeName)) return;

      const text = collectTextContent(laidOut, id);

      const key = normalizeLooseLabel(text);

      if (removedSet.has(key)) hidden.add(id);

    });

    return hidden;

  }, [basePageId, laidOut, variableOverrides]);



  const { hidden: todoHiddenNodeIds, orderOverrides: todoOrderOverrides } = useMemo(() => {

    const hidden = new Set<string>();

    const orderOverrides: Record<string, string[]> = {};

    if (!basePageId) return { hidden, orderOverrides };

    const page = laidOut.pages.find((p) => p.id === basePageId) ?? laidOut.pages[0];

    if (!page) return { hidden, orderOverrides };

    const scopeIds = collectDescendants(laidOut, page.rootId);

    const itemIds: string[] = [];

    const listContainerIds = new Set<string>();

    const filterChoiceIds: string[] = [];



    controlRootRoles.forEach((role, rootId) => {

      if (!scopeIds.has(rootId)) return;

      if (!hasAncestorMatching(laidOut, rootId, TODO_SECTION_PATTERN)) return;

      if (role.type === "choice") {

        const label = controlFields.get(rootId)?.label ?? resolveControlLabel(laidOut as Doc, role, rootId);

        if (matchesPattern(label, TODO_FILTER_DONE_PATTERN) || matchesPattern(label, TODO_FILTER_PENDING_PATTERN) || matchesPattern(label, ALL_FILTER_PATTERN)) {

          filterChoiceIds.push(rootId);

          return;

        }

      }

      if (role.type !== "toggle" && role.type !== "checkbox") return;

      itemIds.push(rootId);

      const listContainerId = findAncestorIdMatching(laidOut, rootId, LIST_CONTAINER_PATTERN) ?? laidOut.nodes[rootId]?.parentId ?? null;

      if (listContainerId) listContainerIds.add(listContainerId);

    });



    let filterMode: "all" | "done" | "pending" = "all";

    const rawFilter =

      (typeof variableOverrides.todoFilter === "string" && variableOverrides.todoFilter) ||

      (typeof variableOverrides.todo_filter === "string" && variableOverrides.todo_filter) ||

      "";

    if (rawFilter) {

      if (matchesPattern(rawFilter, TODO_FILTER_DONE_PATTERN)) filterMode = "done";

      else if (matchesPattern(rawFilter, TODO_FILTER_PENDING_PATTERN)) filterMode = "pending";

    } else {

      const activeFilterId = filterChoiceIds.find((id) => Boolean(controlState[id])) ?? null;

      if (activeFilterId) {

        const role = controlRootRoles.get(activeFilterId);

        const label = role ? controlFields.get(activeFilterId)?.label ?? resolveControlLabel(laidOut, role, activeFilterId) : "";

        if (matchesPattern(label, TODO_FILTER_DONE_PATTERN)) filterMode = "done";

        else if (matchesPattern(label, TODO_FILTER_PENDING_PATTERN)) filterMode = "pending";

      }

    }



    if (filterMode !== "all") {

      itemIds.forEach((id) => {

        const done = Boolean(controlState[id]);

        if (filterMode === "done" && !done) hidden.add(id);

        if (filterMode === "pending" && done) hidden.add(id);

      });

    }



    const sortValue =

      (typeof variableOverrides.todoSort === "string" && variableOverrides.todoSort) ||

      (typeof variableOverrides.todo_sort === "string" && variableOverrides.todo_sort) ||

      "";

    let sortMode: "default" | "done" | "pending" = "default";

    if (sortValue) {

      if (matchesPattern(sortValue, TODO_FILTER_DONE_PATTERN)) sortMode = "done";

      else if (matchesPattern(sortValue, TODO_FILTER_PENDING_PATTERN)) sortMode = "pending";

    }

    const itemIdSet = new Set(itemIds);

    listContainerIds.forEach((containerId) => {

      const container = laidOut.nodes[containerId];

      const children = container?.children ?? [];

      const ordered = children

        .filter((id) => itemIdSet.has(id))

        .sort((a, b) => (laidOut.nodes[a]?.frame.y ?? 0) - (laidOut.nodes[b]?.frame.y ?? 0));

      if (!ordered.length) return;

      if (sortMode === "default") {

        orderOverrides[containerId] = ordered;

        return;

      }

      const sorted = [...ordered].sort((a, b) => {

        const aDone = Number(Boolean(controlState[a]));

        const bDone = Number(Boolean(controlState[b]));

        if (sortMode === "done") return bDone - aDone;

        if (sortMode === "pending") return aDone - bDone;

        return 0;

      });

      orderOverrides[containerId] = sorted;

    });



    return { hidden, orderOverrides };

  }, [basePageId, controlFields, controlRootRoles, controlState, laidOut, variableOverrides]);



  const faqAnswerHiddenNodeIds = useMemo(() => {

    const hidden = new Set<string>();

    if (!basePageId) return hidden;

    const page = laidOut.pages.find((p) => p.id === basePageId) ?? laidOut.pages[0];

    if (!page) return hidden;

    const scopeIds = collectDescendants(laidOut, page.rootId);

    scopeIds.forEach((id) => {

      const role = controlRootRoles.get(id);

      if (!role || role.type !== "choice") return;

      if (!hasAncestorMatching(laidOut, id, FAQ_SECTION_PATTERN)) return;

      const nodeName = laidOut.nodes[id]?.name ?? "";

      if (!isListItemName(nodeName)) return;

      if (controlState[id]) return;

      const textIds = collectTextNodeIds(laidOut, id);

      if (textIds.length <= 1) return;

      textIds.slice(1).forEach((textId) => hidden.add(textId));

    });

    return hidden;

  }, [basePageId, controlRootRoles, controlState, laidOut]);



  const sidebarHiddenNodeIds = useMemo(() => {

    const hidden = new Set<string>();

    if (!sidebarCollapsed || !basePageId) return hidden;

    const page = laidOut.pages.find((p) => p.id === basePageId) ?? laidOut.pages[0];

    if (!page) return hidden;

    const scopeIds = collectDescendants(laidOut, page.rootId);

    scopeIds.forEach((id) => {

      if (!hasAncestorMatching(laidOut, id, SIDEBAR_SECTION_PATTERN)) return;

      const node = laidOut.nodes[id];

      if (!node || node.type !== "text") return;

      const name = node.name ?? "";

      if (matchesPattern(name, SIDEBAR_BRAND_PATTERN)) return;

      if (!hasAncestorMatching(laidOut, id, NAV_SECTION_PATTERN) && !hasAncestorMatching(laidOut, id, LIST_CONTAINER_PATTERN)) return;

      hidden.add(id);

    });

    return hidden;

  }, [basePageId, laidOut, sidebarCollapsed]);



  const sidebarPermissionHiddenNodeIds = useMemo(() => {

    const hidden = new Set<string>();

    if (!basePageId) return hidden;

    const page = laidOut.pages.find((p) => p.id === basePageId) ?? laidOut.pages[0];

    if (!page) return hidden;

    const scopeIds = collectDescendants(laidOut, page.rootId);

    const rawList =

      (typeof variableOverrides.sidebar_permissions === "string" && variableOverrides.sidebar_permissions) ||

      (typeof variableOverrides.permissions === "string" && variableOverrides.permissions) ||

      (typeof variableOverrides.allowed === "string" && variableOverrides.allowed) ||

      (typeof variableOverrides.allowed_menu === "string" && variableOverrides.allowed_menu) ||

      "";

    const allowedSet = rawList

      ? new Set(parseStringList(rawList, /[,|;]/).map((item) => normalizeLooseLabel(item)).filter(Boolean))

      : null;



    controlRootRoles.forEach((role, rootId) => {

      if (role.type !== "choice") return;

      if (!scopeIds.has(rootId)) return;

      if (!hasAncestorMatching(laidOut, rootId, SIDEBAR_SECTION_PATTERN)) return;

      const label = controlFields.get(rootId)?.label ?? resolveControlLabel(laidOut as Doc, role, rootId);

      if (!label) return;

      if (matchesPattern(label, SIDEBAR_BRAND_PATTERN)) return;

      const normalized = normalizeLooseLabel(label);

      if (!normalized) return;

      const keys = [

        `perm_${normalized}`,

        `permission_${normalized}`,

        `allow_${normalized}`,

        `${normalized}_allowed`,

        `${normalized}_visible`,

        `visible_${normalized}`,

      ];

      let explicit: boolean | null = null;

      for (const key of keys) {

        if (!(key in variableOverrides)) continue;

        explicit = coerceBoolean(variableOverrides[key]);

        if (explicit !== null) break;

      }

      const allowed = explicit ?? (allowedSet ? allowedSet.has(normalized) : null);

      if (allowed === false) {

        collectDescendants(laidOut, rootId).forEach((id) => hidden.add(id));

      }

    });

    return hidden;

  }, [basePageId, controlFields, controlRootRoles, laidOut, variableOverrides]);



  const openModalIds = useMemo(() => new Set(modalStack), [modalStack]);



  const modalHiddenNodeIds = useMemo(() => {

    const hidden = new Set<string>();

    if (!modalRootIds.size) return hidden;

    modalRootIds.forEach((id) => {

      if (!openModalIds.has(id)) hidden.add(id);

    });

    return hidden;

  }, [modalRootIds, openModalIds]);



  const updateAvailable = useMemo(() => {

    const flagKeys = [

      "updateAvailable",

      "appUpdateAvailable",

      "app_update_available",

      "hasUpdate",

      "updateReady",

      "update_ready",

      "appUpdate",

      "app_update",

      "needsUpdate",

    ];

    for (const key of flagKeys) {

      if (!(key in variableOverrides)) continue;

      const value = coerceBoolean(variableOverrides[key]);

      if (value !== null) return value;

    }

    const current = resolveVersionForKeys(variableOverrides, [

      "appVersion",

      "currentVersion",

      "version",

      "app_version",

      "current_version",

    ]);

    const latest = resolveVersionForKeys(variableOverrides, [

      "latestVersion",

      "latest_version",

      "availableVersion",

      "updateVersion",

      "update_version",

      "latest_app_version",

    ]);

    if (current && latest) return compareVersionSegments(latest, current) > 0;

    return false;

  }, [variableOverrides]);



  useEffect(() => {

    if (!appUpdateModalIds.size) return;

    if (!updateAvailable) return;

    if (Date.now() < updateDismissedUntil) return;

    const alreadyOpen = modalStack.some((id) => appUpdateModalIds.has(id));

    if (alreadyOpen) return;

    if (modalStack.length) return;

    const targetId = Array.from(appUpdateModalIds)[0];

    if (targetId) deferStateUpdate(() => openModal(targetId));

  }, [appUpdateModalIds, modalStack, openModal, updateAvailable, updateDismissedUntil]);



  const stickyHiddenNodeIds = useMemo(() => {

    const hidden = new Set<string>();

    if (!stickyCtaRootIds.size) return hidden;

    const now = cooldownTick;

    const shouldShow = stickyVisible && now >= stickyDismissedUntil;

    if (shouldShow) return hidden;

    stickyCtaRootIds.forEach((id) => hidden.add(id));

    return hidden;

  }, [cooldownTick, stickyCtaRootIds, stickyVisible, stickyDismissedUntil]);



  const { hidden: filterHiddenNodeIds, orderOverrides: filterOrderOverrides } = useMemo(() => {

    const hidden = new Set<string>();

    const orderOverrides: Record<string, string[]> = {};

    if (!basePageId) return { hidden, orderOverrides };

    const page = laidOut.pages.find((p) => p.id === basePageId) ?? laidOut.pages[0];

    if (!page) return { hidden, orderOverrides };

    const activeFilters: Array<{ scopeId: string; label: string }> = [];

    controlRootRoles.forEach((role, rootId) => {

      if (role.type !== "choice") return;

      if (!controlState[rootId]) return;

      const inSelectTabs = hasAncestorMatching(laidOut, rootId, SELECT_TABS_PATTERN);

      const inDateSlider = hasAncestorMatching(laidOut, rootId, DATE_SLIDER_PATTERN);

      if (!inSelectTabs && !inDateSlider) return;

      const label = controlFields.get(rootId)?.label ?? resolveControlLabel(laidOut as Doc, role, rootId);

      if (!label || matchesPattern(label, ALL_FILTER_PATTERN)) return;

      const scopeId = findAncestorIdMatching(laidOut, rootId, LIST_CONTAINER_PATTERN) ?? page.rootId;

      activeFilters.push({ scopeId, label });

    });

    activeFilters.forEach(({ scopeId, label }) => {

      const labelKey = normalizeLooseLabel(label);

      if (!labelKey) return;

      const scopeIds = collectDescendants(laidOut, scopeId);

      scopeIds.forEach((id) => {

        const nodeName = laidOut.nodes[id]?.name ?? "";

        if (!isListItemName(nodeName)) return;

        const text = collectTextContent(laidOut, id);

        const textKey = normalizeLooseLabel(text);

        if (!textKey.includes(labelKey)) hidden.add(id);

      });

    });

    return { hidden, orderOverrides };

  }, [basePageId, controlFields, controlRootRoles, controlState, laidOut]);



  const combinedHiddenNodeIds = useMemo(() => {

    const next = new Set(hiddenNodeIds);

    searchHiddenNodeIds.forEach((id) => next.add(id));

    notificationHiddenNodeIds.forEach((id) => next.add(id));

    filterHiddenNodeIds.forEach((id) => next.add(id));

    contentFeedHiddenNodeIds.forEach((id) => next.add(id));

    commentHiddenNodeIds.forEach((id) => next.add(id));

    tagFilterHiddenNodeIds.forEach((id) => next.add(id));

    bookmarkFilterHiddenNodeIds.forEach((id) => next.add(id));

    kanbanFilterHiddenNodeIds.forEach((id) => next.add(id));

    mediaFilterHiddenNodeIds.forEach((id) => next.add(id));

    chartHiddenNodeIds.forEach((id) => next.add(id));

    tableHiddenNodeIds.forEach((id) => next.add(id));

    emptyStateHiddenNodeIds.forEach((id) => next.add(id));

    userManagerHiddenNodeIds.forEach((id) => next.add(id));

    auditLogHiddenNodeIds.forEach((id) => next.add(id));

    consoleHiddenNodeIds.forEach((id) => next.add(id));

    skeletonHiddenNodeIds.forEach((id) => next.add(id));

    chatListHiddenNodeIds.forEach((id) => next.add(id));

    mentionHiddenNodeIds.forEach((id) => next.add(id));

    attachmentHiddenNodeIds.forEach((id) => next.add(id));

    todoHiddenNodeIds.forEach((id) => next.add(id));

    faqSearchHiddenNodeIds.forEach((id) => next.add(id));

    faqAnswerHiddenNodeIds.forEach((id) => next.add(id));

    sidebarHiddenNodeIds.forEach((id) => next.add(id));

    sidebarPermissionHiddenNodeIds.forEach((id) => next.add(id));

    modalHiddenNodeIds.forEach((id) => next.add(id));

    stickyHiddenNodeIds.forEach((id) => next.add(id));

    return next;

  }, [

    hiddenNodeIds,

    searchHiddenNodeIds,

    notificationHiddenNodeIds,

    filterHiddenNodeIds,

    contentFeedHiddenNodeIds,

    commentHiddenNodeIds,

    tagFilterHiddenNodeIds,

    bookmarkFilterHiddenNodeIds,

    kanbanFilterHiddenNodeIds,

    mediaFilterHiddenNodeIds,

    chartHiddenNodeIds,

    tableHiddenNodeIds,

    emptyStateHiddenNodeIds,

    userManagerHiddenNodeIds,

    auditLogHiddenNodeIds,

    consoleHiddenNodeIds,

    skeletonHiddenNodeIds,

    chatListHiddenNodeIds,

    mentionHiddenNodeIds,

    attachmentHiddenNodeIds,

    todoHiddenNodeIds,

    faqSearchHiddenNodeIds,

    faqAnswerHiddenNodeIds,

    sidebarHiddenNodeIds,

    sidebarPermissionHiddenNodeIds,

    modalHiddenNodeIds,

    stickyHiddenNodeIds,

  ]);



  const combinedOrderOverrides = useMemo(() => {

    return {

      ...notificationOrderOverrides,

      ...filterOrderOverrides,

      ...contentFeedOrderOverrides,

      ...commentOrderOverrides,

      ...tagOrderOverrides,

      ...chatListOrderOverrides,

      ...mentionOrderOverrides,

      ...todoOrderOverrides,

      ...tableOrderOverrides,

    };

  }, [

    notificationOrderOverrides,

    filterOrderOverrides,

    contentFeedOrderOverrides,

    commentOrderOverrides,

    tagOrderOverrides,

    chatListOrderOverrides,

    mentionOrderOverrides,

    todoOrderOverrides,

    tableOrderOverrides,

  ]);



  useEffect(() => {

    const allVars = doc.variables ?? [];

    const computed = allVars.filter((v) => v.computed?.formula);

    if (computed.length === 0) return;

    setVariableOverrides((prev) => {

      const result = computeAllFormulas(allVars, prev, collectionCache);

      let changed = false;

      for (const key of Object.keys(result)) {

        if (prev[key] !== result[key]) { changed = true; break; }

      }

      return changed ? result : prev;

    });

  }, [doc.variables, variableOverrides, collectionCache]);



  useEffect(() => {

    if (!appPageId) return;

    let cancelled = false;

    const slugs = new Set<string>();

    for (const node of Object.values(doc.nodes)) {

      const binding = node.data as { type?: string; collectionId?: string } | undefined;

      if (binding?.type === "collection" && binding.collectionId) slugs.add(binding.collectionId);

    }

    for (const v of doc.variables ?? []) {

      if (v.computed?.formula?.includes("COLLECTION(")) {

        const match = v.computed.formula.match(/COLLECTION\(["']([^"']+)["']\)/g);

        if (match) match.forEach((m) => { const s = m.match(/["']([^"']+)["']/); if (s) slugs.add(s[1]); });

      }

    }

    if (slugs.size === 0) return;

    Promise.all(

      [...slugs].map((slug) =>

        fetch(`/api/app/${appPageId}/${slug}?limit=1000`, { credentials: "include" })

          .then((r) => r.json())

          .then((d) => [slug, Array.isArray(d?.records) ? d.records : []] as const)

          .catch(() => [slug, []] as const)

      )

    ).then((results) => {

      if (cancelled) return;

      const cache: CollectionCache = {};

      for (const [slug, records] of results) cache[slug] = records;

      setCollectionCache(cache);

    });

    return () => { cancelled = true; };

  }, [appPageId, doc.nodes, doc.variables]);



  const textOverrides = useMemo(() => {

    const overrides: Record<string, string> = {};

    const now = cooldownTick;



    const resolveLabelForRoot = (rootId: string) => {

      const role = controlRootRoles.get(rootId);

      if (role) return resolveControlLabel(laidOut as Doc, role, rootId);

      return findControlTextLabel(laidOut as Doc, rootId) || laidOut.nodes[rootId]?.name || "";

    };



    Object.entries(cooldownMap).forEach(([rootId, expiresAt]) => {

      if (expiresAt <= now) return;

      const label = resolveLabelForRoot(rootId);

      if (!isResendLabel(label)) return;

      const remaining = Math.max(0, Math.ceil((expiresAt - now) / 1000));

      const role = controlRootRoles.get(rootId);

      const textId =

        (role && "labelId" in role ? role.labelId : undefined) ?? findPrimaryTextNodeId(laidOut, rootId) ?? null;

      if (textId) {

        overrides[textId] = `${label} (${remaining}s)`;

      }

    });



    const resolveBadgeCount = (label: string) => {

      const normalized = normalizeLooseLabel(label);

      if (!normalized) return null;

      const keys = [

        `badge_${normalized}`,

        `count_${normalized}`,

        `badge${normalized}`,

        `count${normalized}`,

        `${normalized}_badge`,

        `${normalized}_count`,

      ];

      for (const key of keys) {

        const value = variableOverrides[key];

        if (typeof value === "number" && Number.isFinite(value)) return value;

        if (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value))) return Number(value);

      }

      return null;

    };



    Object.values(laidOut.nodes).forEach((node) => {

      if (node.type !== "text") return;

      if (!hasAncestorMatching(laidOut, node.id, TABBAR_SECTION_PATTERN)) return;

      const label = node.text?.value ?? "";

      const count = resolveBadgeCount(label);

      if (count != null && count > 0) {

        overrides[node.id] = `${label} (${count})`;

      }

    });



    let selectedPlan: string | null = null;

    controlRootRoles.forEach((role, rootId) => {

      if (selectedPlan) return;

      if (role.type === "input") return;

      const label = controlFields.get(rootId)?.label ?? resolveControlLabel(laidOut as Doc, role, rootId);

      if (!matchesPattern(label, PLAN_LABEL_PATTERN)) return;

      if (controlState[rootId]) {

        selectedPlan = resolvePlanKey(label);

      }

    });



    const resolvePlanPrice = (key: string, fallback: string) => {

      const keys = [

        `plan_${key}_price`,

        `plan${key[0].toUpperCase()}${key.slice(1)}Price`,

        `${key}Price`,

      ];

      for (const name of keys) {

        const value = variableOverrides[name];

        if (typeof value === "string" && value.trim()) return value;

        if (typeof value === "number" && Number.isFinite(value)) return String(value);

      }

      return fallback;

    };



    const planPrices: Record<string, string> = {

      basic: resolvePlanPrice("basic", "9,900"),

      standard: resolvePlanPrice("standard", "12,900"),

      pro: resolvePlanPrice("pro", "19,900"),

      enterprise: resolvePlanPrice("enterprise", "Contact us"),

    };

    const comparePlan =

      (typeof variableOverrides.comparePlan === "string" && variableOverrides.comparePlan) ||

      (typeof variableOverrides.compare_plan === "string" && variableOverrides.compare_plan) ||

      null;



    Object.values(laidOut.nodes).forEach((node) => {

      if (node.type !== "frame" && node.type !== "component" && node.type !== "instance" && node.type !== "group") return;

      if (!matchesPattern(node.name ?? "", PLAN_CARD_PATTERN) && !hasAncestorMatching(laidOut, node.id, PLAN_SECTION_PATTERN)) return;

      const textIds = collectTextNodeIds(laidOut, node.id);

      if (textIds.length < 2) return;

      const titleNode = laidOut.nodes[textIds[0]];

      const title = titleNode?.text?.value ?? "";

      const planKey = resolvePlanKey(title);

      if (!planKey) return;

      const priceNodeId = textIds.find((id) => {

        const value = laidOut.nodes[id]?.text?.value ?? "";

        return /\\$|month|mo|krw/i.test(value);

      });

      if (priceNodeId) {

        overrides[priceNodeId] = planPrices[planKey] ?? laidOut.nodes[priceNodeId]?.text?.value ?? "";

      }

      if (selectedPlan && selectedPlan === planKey) {

        overrides[textIds[0]] = title;

      }

      if (comparePlan && comparePlan === planKey) {

        overrides[textIds[0]] = `${title} (Compare)`;

      }

    });



    if (selectedPlan) {

      Object.values(laidOut.nodes).forEach((node) => {

        if (node.type !== "text") return;

        if (!hasAncestorMatching(laidOut, node.id, PLAN_SECTION_PATTERN)) return;

        const label = node.text?.value ?? "";

        if (!/(업그레이드|upgrade)/i.test(label)) return;

        const planLabel = selectedPlan === "pro"

          ? "Pro"

          : selectedPlan === "basic"

            ? "Basic"

            : selectedPlan === "standard"

              ? "Standard"

              : selectedPlan === "enterprise"

                ? "Enterprise"

                : selectedPlan;

        overrides[node.id] = `${planLabel} Upgrade`;

      });

    }



    const page = basePageId ? laidOut.pages.find((p) => p.id === basePageId) ?? laidOut.pages[0] : laidOut.pages[0];

    if (page) {

      const scopeIds = collectDescendants(laidOut, page.rootId);

      const breadcrumbItems = resolveBreadcrumbItems(variableOverrides, page.name ?? "");

      if (breadcrumbItems.length) {

        const items =

          breadcrumbItems.length > 3

            ? [breadcrumbItems[0], "...", breadcrumbItems[breadcrumbItems.length - 1]]

            : breadcrumbItems;

        const breadcrumbTextIds = Array.from(scopeIds).filter((id) => {

          const node = laidOut.nodes[id];

          if (!node || node.type !== "text") return false;

          return hasAncestorMatching(laidOut, id, BREADCRUMB_SECTION_PATTERN);

        });

        if (breadcrumbTextIds.length === 1) {

          overrides[breadcrumbTextIds[0]] = items.join(" / ");

        } else if (breadcrumbTextIds.length > 1) {

          const ordered = breadcrumbTextIds

            .map((id) => ({ id, x: laidOut.nodes[id]?.frame.x ?? 0, value: laidOut.nodes[id]?.text?.value ?? "" }))

            .sort((a, b) => a.x - b.x);

          let idx = 0;

          ordered.forEach((entry) => {

            if (isBreadcrumbSeparator(entry.value)) return;

            const nextValue = items[idx];

            if (!nextValue) return;

            overrides[entry.id] = nextValue;

            idx += 1;

          });

        }

      }



      const sectionRoots = Array.from(scopeIds).filter((id) => {

        const node = laidOut.nodes[id];

        if (!node) return false;

        if (!matchesPattern(node.name ?? "", SECTION_HEADER_PATTERN)) return false;

        const parentId = node.parentId;

        if (parentId && matchesPattern(laidOut.nodes[parentId]?.name ?? "", SECTION_HEADER_PATTERN)) return false;

        return true;

      });

      sectionRoots.sort((a, b) => (laidOut.nodes[a]?.frame.y ?? 0) - (laidOut.nodes[b]?.frame.y ?? 0));

      sectionRoots.forEach((rootId, index) => {

        const textIds = collectTextNodeIds(laidOut, rootId);

        if (!textIds.length) return;

        const orderedTexts = textIds

          .map((id) => ({ id, x: laidOut.nodes[id]?.frame.x ?? 0, value: laidOut.nodes[id]?.text?.value ?? "" }))

          .sort((a, b) => a.x - b.x);

        let titleId: string | null = null;

        let actionId: string | null = null;

        orderedTexts.forEach((entry) => {

          if (!actionId && matchesPattern(entry.value, MORE_ACTION_PATTERN)) {

            actionId = entry.id;

            return;

          }

          if (!titleId && !matchesPattern(entry.value, SORT_PATTERN) && !matchesPattern(entry.value, FILTER_PATTERN)) {

            titleId = entry.id;

          }

        });

        const existingTitle = titleId ? laidOut.nodes[titleId]?.text?.value ?? "" : "";

        const titleKey = normalizeLooseLabel(existingTitle);

        const ordinal = index + 1;

        const titleKeys = [

          `section_title_${ordinal}`,

          `section_${ordinal}_title`,

          ...(titleKey ? [`section_${titleKey}_title`] : []),

        ];

        const actionKeys = [

          `section_action_${ordinal}`,

          `section_${ordinal}_action`,

          `section_cta_${ordinal}`,

          `section_${ordinal}_cta`,

          ...(titleKey ? [`section_${titleKey}_action`, `section_${titleKey}_cta`] : []),

        ];

        const resolveOverride = (keys: string[]) => {

          for (const key of keys) {

            const value = variableOverrides[key];

            if (typeof value === "string" && value.trim()) return value;

            if (typeof value === "number" && Number.isFinite(value)) return String(value);

          }

          return null;

        };

        const titleOverride = resolveOverride(titleKeys);

        if (titleOverride && titleId) overrides[titleId] = titleOverride;

        const actionOverride = resolveOverride(actionKeys);

        if (actionOverride && actionId) overrides[actionId] = actionOverride;

      });

    }





    const resolveValueForKeys = (keys: string[]) => {

      for (const key of keys) {

        const value = variableOverrides[key];

        if (typeof value === "string" && value.trim()) return value;

        if (typeof value === "number" && Number.isFinite(value)) return String(value);

      }

      return null;

    };



    const resolveListForKeys = (keys: string[]) => {

      for (const key of keys) {

        const value = variableOverrides[key];

        if (typeof value === "string" && value.trim()) {

          const parsed = parseStringList(value, /[,|;]+/);

          if (parsed.length) return parsed;

        }

      }

      return null;

    };



    const applyListItemTextOverrides = (itemIds: string[], titles?: string[] | null, metas?: string[] | null) => {

      itemIds.forEach((itemId, index) => {

        const textIds = collectTextNodeIds(laidOut, itemId)

          .map((id) => ({ id, y: laidOut.nodes[id]?.frame.y ?? 0, x: laidOut.nodes[id]?.frame.x ?? 0 }))

          .sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y))

          .map((entry) => entry.id);

        if (!textIds.length) return;

        const titleId = textIds[0];

        const metaId = textIds[1];

        const nextTitle = titles?.[index];

        const nextMeta = metas?.[index];

        if (titleId && typeof nextTitle === "string") overrides[titleId] = nextTitle;

        if (metaId && typeof nextMeta === "string") overrides[metaId] = nextMeta;

      });

    };



    const applyContentCardOverrides = (cardIds: string[], titles?: string[] | null, metas?: string[] | null) => {

      cardIds.forEach((cardId, index) => {

        const textIds = collectTextNodeIds(laidOut, cardId)

          .map((id) => ({ id, y: laidOut.nodes[id]?.frame.y ?? 0, x: laidOut.nodes[id]?.frame.x ?? 0 }))

          .sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y))

          .map((entry) => entry.id);

        if (!textIds.length) return;

        const titleId = textIds[0];

        const metaId = textIds[1];

        const nextTitle = titles?.[index];

        const nextMeta = metas?.[index];

        if (titleId && typeof nextTitle === "string") overrides[titleId] = nextTitle;

        if (metaId && typeof nextMeta === "string") overrides[metaId] = nextMeta;

      });

    };



    const activePage = basePageId ? laidOut.pages.find((p) => p.id === basePageId) ?? laidOut.pages[0] : laidOut.pages[0];

    if (activePage) {

      const pageScopeIds = collectDescendants(laidOut, activePage.rootId);



      const contentTitle = resolveValueForKeys(["contentTitle", "content_title", "detailTitle", "detail_title", "content_name"]);

      const contentSubtitle = resolveValueForKeys([

        "contentSubtitle",

        "content_subtitle",

        "contentSummary",

        "content_summary",

        "contentDescription",

        "content_description",

        "content_desc",

        "summary",

        "description",

      ]);

      const contentBody = resolveValueForKeys(["contentBody", "content_body", "contentText", "content_text", "body"]);

      if (contentTitle || contentSubtitle || contentBody) {

        let contentRootId: string | null = null;

        pageScopeIds.forEach((id) => {

          if (contentRootId) return;

          const node = laidOut.nodes[id];

          if (!node) return;

          if (!matchesPattern(node.name ?? "", CONTENT_DETAIL_PATTERN)) return;

          const parentId = node.parentId;

          if (parentId && matchesPattern(laidOut.nodes[parentId]?.name ?? "", CONTENT_DETAIL_PATTERN)) return;

          contentRootId = id;

        });

        const contentScopeIds = contentRootId

          ? collectDescendants(laidOut, contentRootId)

          : matchesPattern(activePage.name ?? "", CONTENT_DETAIL_PATTERN)

            ? pageScopeIds

            : null;

        if (contentScopeIds) {

          const textEntries = Array.from(contentScopeIds)

            .map((id) => {

              const node = laidOut.nodes[id];

              if (!node || node.type !== "text") return null;

              return {

                id,

                y: node.frame.y ?? 0,

                x: node.frame.x ?? 0,

                size: node.text?.style?.fontSize ?? 0,

                value: node.text?.value ?? "",

                name: node.name ?? "",

              };

            })

            .filter(Boolean) as Array<{ id: string; y: number; x: number; size: number; value: string; name: string }>;

          textEntries.sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y));

          let titleId = textEntries.find((entry) => /title/i.test(entry.name) || /title/i.test(entry.value))?.id ?? null;

          if (!titleId && textEntries.length) {

            const maxSize = Math.max(...textEntries.map((entry) => entry.size));

            titleId = textEntries.find((entry) => entry.size === maxSize)?.id ?? null;

          }

          const remaining = textEntries.filter((entry) => entry.id !== titleId);

          let subtitleId = remaining.find((entry) => /subtitle|summary|body/i.test(entry.name + entry.value))?.id ?? null;

          if (!subtitleId && remaining.length) subtitleId = remaining[0]?.id ?? null;

          const bodyId = remaining.find((entry) => entry.id !== subtitleId)?.id ?? null;

          if (contentTitle && titleId) overrides[titleId] = contentTitle;

          if (contentSubtitle && subtitleId) overrides[subtitleId] = contentSubtitle;

          if (contentBody && bodyId) overrides[bodyId] = contentBody;

        }

      }



      const userName = resolveValueForKeys(["userName", "user_name", "profileName", "displayName", "name"]);

      const userMeta = resolveValueForKeys(["userMeta", "user_meta", "userRole", "user_role", "role", "bio"]);

      if (userName || userMeta) {

        let userRootId: string | null = null;

        pageScopeIds.forEach((id) => {

          if (userRootId) return;

          const node = laidOut.nodes[id];

          if (!node) return;

          if (!matchesPattern(node.name ?? "", USER_CARD_SECTION_PATTERN)) return;

          const parentId = node.parentId;

          if (parentId && matchesPattern(laidOut.nodes[parentId]?.name ?? "", USER_CARD_SECTION_PATTERN)) return;

          userRootId = id;

        });

        const userScopeIds = userRootId

          ? collectDescendants(laidOut, userRootId)

          : matchesPattern(activePage.name ?? "", USER_CARD_SECTION_PATTERN)

            ? pageScopeIds

            : null;

        if (userScopeIds) {

          const textEntries = Array.from(userScopeIds)

            .map((id) => {

              const node = laidOut.nodes[id];

              if (!node || node.type !== "text") return null;

              return { id, y: node.frame.y ?? 0, x: node.frame.x ?? 0 };

            })

            .filter(Boolean) as Array<{ id: string; y: number; x: number }>;

          textEntries.sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y));

          const nameId = textEntries[0]?.id ?? null;

          const metaId = textEntries[1]?.id ?? null;

          if (userName && nameId) overrides[nameId] = userName;

          if (userMeta && metaId) overrides[metaId] = userMeta;



          controlRootRoles.forEach((role, rootId) => {

            if (role.type !== "choice") return;

            if (!userScopeIds.has(rootId)) return;

            const label = controlFields.get(rootId)?.label ?? resolveControlLabel(laidOut as Doc, role, rootId);

            if (!label || !matchesPattern(label, FOLLOW_ACTION_PATTERN)) return;

            const labelId = role.labelId ?? findPrimaryTextNodeId(laidOut as Doc, rootId);

            if (!labelId) return;

            const following = Boolean(variableOverrides.following ?? variableOverrides.isFollowing ?? controlState[rootId]);

            const followLabel = resolveValueForKeys(["followLabel", "follow_label", "followingLabel", "following_label"]) ??

              (following ? "Following" : "Follow");

            overrides[labelId] = followLabel;

          });

        }

      }



      const tagLabels = resolveListForKeys(["tags", "tag_list", "tagLabels", "tag_labels"]);

      if (tagLabels) {

        const chipTextIds = Array.from(pageScopeIds).filter((id) => {

          const node = laidOut.nodes[id];

          if (!node || node.type !== "text") return false;

          if (!hasAncestorMatching(laidOut, id, TAG_SECTION_PATTERN)) return false;

          return /chip|tag/i.test(node.name ?? "");

        });

        const ordered = chipTextIds

          .map((id) => ({ id, y: laidOut.nodes[id]?.frame.y ?? 0, x: laidOut.nodes[id]?.frame.x ?? 0 }))

          .sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y));

        ordered.forEach((entry, index) => {

          const nextLabel = tagLabels[index];

          if (nextLabel) overrides[entry.id] = nextLabel;

        });

      }



      const tagCardTitles = resolveListForKeys(["tag_item_titles", "tag_titles", "tag_cards"]);

      const tagCardMetas = resolveListForKeys(["tag_counts", "tag_count_list", "tag_item_counts", "tag_metas"]);

      if (tagCardTitles || tagCardMetas) {

        const cardIds = Array.from(pageScopeIds).filter((id) => {

          const node = laidOut.nodes[id];

          if (!node) return false;

          if (!isContentCardName(node.name ?? "")) return false;

          return hasAncestorMatching(laidOut, id, TAG_SECTION_PATTERN);

        });

        const ordered = cardIds

          .map((id) => ({ id, y: laidOut.nodes[id]?.frame.y ?? 0, x: laidOut.nodes[id]?.frame.x ?? 0 }))

          .sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y))

          .map((entry) => entry.id);

        applyContentCardOverrides(ordered, tagCardTitles, tagCardMetas);

      }



      const bookmarkTitles = resolveListForKeys(["bookmark_items", "bookmark_titles", "bookmark_list"]);

      const bookmarkMetas = resolveListForKeys(["bookmark_meta", "bookmark_metas", "bookmark_dates", "bookmark_subtitles"]);

      if (bookmarkTitles || bookmarkMetas) {

        const itemIds = Array.from(pageScopeIds).filter((id) => {

          const node = laidOut.nodes[id];

          if (!node) return false;

          if (!isListItemName(node.name ?? "")) return false;

          return hasAncestorMatching(laidOut, id, BOOKMARK_SECTION_PATTERN);

        });

        const ordered = itemIds

          .map((id) => ({ id, y: laidOut.nodes[id]?.frame.y ?? 0, x: laidOut.nodes[id]?.frame.x ?? 0 }))

          .sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y))

          .map((entry) => entry.id);

        applyListItemTextOverrides(ordered, bookmarkTitles, bookmarkMetas);

      }



      const rankingTitles = resolveListForKeys(["ranking_titles", "ranking_items", "ranking_list"]);

      const rankingMetas = resolveListForKeys(["ranking_ranks", "ranking_meta", "ranking_metas"]);

      if (rankingTitles || rankingMetas) {

        const itemIds = Array.from(pageScopeIds).filter((id) => {

          const node = laidOut.nodes[id];

          if (!node) return false;

          if (!isListItemName(node.name ?? "")) return false;

          return hasAncestorMatching(laidOut, id, RANKING_SECTION_PATTERN);

        });

        const ordered = itemIds

          .map((id) => ({ id, y: laidOut.nodes[id]?.frame.y ?? 0, x: laidOut.nodes[id]?.frame.x ?? 0 }))

          .sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y))

          .map((entry) => entry.id);

        applyListItemTextOverrides(ordered, rankingTitles, rankingMetas);

      }



      const rankingPeriod = resolveValueForKeys(["rankingPeriod", "ranking_period", "period"]);

      if (rankingPeriod) {

        const periodTextIds = Array.from(pageScopeIds).filter((id) => {

          const node = laidOut.nodes[id];

          if (!node || node.type !== "text") return false;

          if (!hasAncestorMatching(laidOut, id, RANKING_SECTION_PATTERN)) return false;

          return matchesPattern(node.text?.value ?? "", PERIOD_FILTER_PATTERN);

        });

        periodTextIds.forEach((id) => {

          overrides[id] = rankingPeriod;

        });

      }



      const chatTitles = resolveListForKeys(["chat_titles", "chat_list", "chat_items"]);

      const chatPreviews = resolveListForKeys(["chat_previews", "chat_messages", "chat_metas"]);

      const chatTimes = resolveListForKeys(["chat_times", "chatTimes", "chat_timestamps"]);

      const formatRelativeTime = (value: string) => {

        const parsed = Date.parse(value);

        if (Number.isNaN(parsed)) return value;

        const diffSec = Math.max(0, Math.floor(((chatLiveTick || cooldownTick) - parsed) / 1000));

        if (diffSec < 60) return "방금";

        const diffMin = Math.floor(diffSec / 60);

        if (diffMin < 60) return `${diffMin}분 전`;

        const diffHour = Math.floor(diffMin / 60);

        if (diffHour < 24) return `${diffHour}시간 전`;

        const diffDay = Math.floor(diffHour / 24);

        return `${diffDay}일 전`;

      };

      const chatUnread = resolveListForKeys(["chat_unread", "chat_unread_counts", "chat_badges"]);

      if (chatTitles || chatPreviews || chatUnread || chatTimes) {

        const itemIds = Array.from(pageScopeIds).filter((id) => {

          const node = laidOut.nodes[id];

          if (!node) return false;

          if (!isListItemName(node.name ?? "")) return false;

          return hasAncestorMatching(laidOut, id, CHAT_LIST_SECTION_PATTERN);

        });

        const ordered = itemIds

          .map((id) => ({ id, y: laidOut.nodes[id]?.frame.y ?? 0, x: laidOut.nodes[id]?.frame.x ?? 0 }))

          .sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y))

          .map((entry) => entry.id);

        ordered.forEach((itemId, index) => {

          const textIds = collectTextNodeIds(laidOut, itemId)

            .map((id) => ({ id, y: laidOut.nodes[id]?.frame.y ?? 0, x: laidOut.nodes[id]?.frame.x ?? 0 }))

            .sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y))

            .map((entry) => entry.id);

          if (!textIds.length) return;

          const titleId = textIds[0];

          const metaId = textIds[1];

          const title = chatTitles?.[index];

          if (titleId && typeof title === "string") overrides[titleId] = title;

          const unreadRaw = chatUnread?.[index];

          const unreadCount = unreadRaw && !Number.isNaN(Number(unreadRaw)) ? Number(unreadRaw) : 0;

          const isRead = Boolean(controlState[itemId]);

          let metaValue = chatPreviews?.[index];

          if (unreadCount > 0 && !isRead) metaValue = `Unread messages ${unreadCount}`;

          if (!metaValue && isRead) metaValue = "Read";

          if (!metaValue && chatTimes?.[index]) metaValue = formatRelativeTime(chatTimes[index]);

          if (metaId && typeof metaValue === "string") overrides[metaId] = metaValue;

        });

      }

      if (chatTitles || chatPreviews || chatTimes) {

        const roomItemIds = Array.from(pageScopeIds).filter((id) => {

          const node = laidOut.nodes[id];

          if (!node) return false;

          if (!isListItemName(node.name ?? "")) return false;

          return hasAncestorMatching(laidOut, id, CHAT_ROOM_SECTION_PATTERN);

        });

        const orderedRoom = roomItemIds

          .map((id) => ({ id, y: laidOut.nodes[id]?.frame.y ?? 0, x: laidOut.nodes[id]?.frame.x ?? 0 }))

          .sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y))

          .map((entry) => entry.id);

        const len = orderedRoom.length;

        if (len > 0 && (chatTitles || chatPreviews || chatTimes)) {

          const total = Math.max(chatTitles?.length ?? 0, chatPreviews?.length ?? 0, chatTimes?.length ?? 0);

          orderedRoom.forEach((itemId, i) => {

            const index = total - len + i;

            const textIds = collectTextNodeIds(laidOut, itemId)

              .map((id) => ({ id, y: laidOut.nodes[id]?.frame.y ?? 0, x: laidOut.nodes[id]?.frame.x ?? 0 }))

              .sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y))

              .map((entry) => entry.id);

            if (!textIds.length) return;

            const titleId = textIds[0];

            const metaId = textIds[1];

            const title = chatTitles?.[index];

            if (titleId && typeof title === "string") overrides[titleId] = title;

            const metaValue = chatPreviews?.[index] ?? (chatTimes?.[index] ? formatRelativeTime(chatTimes[index]) : null);

            if (metaId && typeof metaValue === "string") overrides[metaId] = metaValue;

          });

        }

      }

      const attachmentNames = resolveListForKeys(["attachment_files", "attachmentFiles", "attachments"]);

      const attachmentMetas = resolveListForKeys(["attachment_sizes", "attachment_metas", "attachment_meta"]);

      if (attachmentNames || attachmentMetas) {

        const itemIds = Array.from(pageScopeIds).filter((id) => {

          const node = laidOut.nodes[id];

          if (!node) return false;

          if (!isListItemName(node.name ?? "")) return false;

          return hasAncestorMatching(laidOut, id, ATTACHMENT_SECTION_PATTERN);

        });

        const ordered = itemIds

          .map((id) => ({ id, y: laidOut.nodes[id]?.frame.y ?? 0, x: laidOut.nodes[id]?.frame.x ?? 0 }))

          .sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y))

          .map((entry) => entry.id);

        applyListItemTextOverrides(ordered, attachmentNames, attachmentMetas);

      }



      const mentionTitles = resolveListForKeys(["mention_titles", "mention_list", "mentions"]);

      const mentionMetas = resolveListForKeys(["mention_metas", "mention_meta", "mention_detail"]);

      if (mentionTitles || mentionMetas) {

        const itemIds = Array.from(pageScopeIds).filter((id) => {

          const node = laidOut.nodes[id];

          if (!node) return false;

          if (!isListItemName(node.name ?? "")) return false;

          return hasAncestorMatching(laidOut, id, MENTION_SECTION_PATTERN);

        });

        const ordered = itemIds

          .map((id) => ({ id, y: laidOut.nodes[id]?.frame.y ?? 0, x: laidOut.nodes[id]?.frame.x ?? 0 }))

          .sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y))

          .map((entry) => entry.id);

        ordered.forEach((itemId, index) => {

          const textIds = collectTextNodeIds(laidOut, itemId)

            .map((id) => ({ id, y: laidOut.nodes[id]?.frame.y ?? 0, x: laidOut.nodes[id]?.frame.x ?? 0 }))

            .sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y))

            .map((entry) => entry.id);

          if (!textIds.length) return;

          const titleId = textIds[0];

          const metaId = textIds[1];

          const title = mentionTitles?.[index];

          if (titleId && typeof title === "string") overrides[titleId] = title;

          let metaValue: string | undefined = mentionMetas?.[index];

          if (!metaValue) metaValue = controlState[itemId] ? "Read" : "Unread";

          if (metaId && typeof metaValue === "string") overrides[metaId] = metaValue;

        });

      }



      const channelTitles = resolveListForKeys(["channel_list", "channel_titles", "channels"]);

      if (channelTitles) {

        const channelIds = Array.from(pageScopeIds).filter((id) => {

          const node = laidOut.nodes[id];

          if (!node) return false;

          if (!isListItemName(node.name ?? "")) return false;

          return hasAncestorMatching(laidOut, id, CHANNEL_LIST_PATTERN) && hasAncestorMatching(laidOut, id, GROUP_CHANNEL_SECTION_PATTERN);

        });

        const ordered = channelIds

          .map((id) => ({ id, y: laidOut.nodes[id]?.frame.y ?? 0, x: laidOut.nodes[id]?.frame.x ?? 0 }))

          .sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y))

          .map((entry) => entry.id);

        applyListItemTextOverrides(ordered, channelTitles, null);

      }



      const memberNames = resolveListForKeys(["member_list", "member_names", "members"]);

      const memberRoles = resolveListForKeys(["member_roles", "member_role", "member_meta"]);

      if (memberNames || memberRoles) {

        const memberIds = Array.from(pageScopeIds).filter((id) => {

          const node = laidOut.nodes[id];

          if (!node) return false;

          if (!isListItemName(node.name ?? "")) return false;

          return hasAncestorMatching(laidOut, id, MEMBER_LIST_PATTERN) && hasAncestorMatching(laidOut, id, GROUP_CHANNEL_SECTION_PATTERN);

        });

        const ordered = memberIds

          .map((id) => ({ id, y: laidOut.nodes[id]?.frame.y ?? 0, x: laidOut.nodes[id]?.frame.x ?? 0 }))

          .sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y))

          .map((entry) => entry.id);

        applyListItemTextOverrides(ordered, memberNames, memberRoles);

      }



      const callStatus = resolveValueForKeys(["callStatus", "call_status", "status"]);

      if (callStatus) {

        const statusTextIds = Array.from(pageScopeIds).filter((id) => {

          const node = laidOut.nodes[id];

          if (!node || node.type !== "text") return false;

          if (!hasAncestorMatching(laidOut, id, CALL_SECTION_PATTERN)) return false;

          return matchesPattern(node.text?.value ?? "", CALL_STATUS_PATTERN) || matchesPattern(node.name ?? "", CALL_STATUS_PATTERN);

        });

        statusTextIds.forEach((id) => {

          overrides[id] = callStatus;

        });

      }



      const callParticipants = resolveListForKeys(["call_participants", "participants", "call_members"]);

      if (callParticipants) {

        const itemIds = Array.from(pageScopeIds).filter((id) => {

          const node = laidOut.nodes[id];

          if (!node) return false;

          if (!isListItemName(node.name ?? "")) return false;

          return hasAncestorMatching(laidOut, id, CALL_SECTION_PATTERN);

        });

        const ordered = itemIds

          .map((id) => ({ id, y: laidOut.nodes[id]?.frame.y ?? 0, x: laidOut.nodes[id]?.frame.x ?? 0 }))

          .sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y))

          .map((entry) => entry.id);

        applyListItemTextOverrides(ordered, callParticipants, null);

      }



      const todoTitles = resolveListForKeys(["todo_items", "todoItems", "todo_list"]);

      const todoMetas = resolveListForKeys(["todo_meta", "todo_metas", "todo_notes"]);

      if (todoTitles || todoMetas) {

        const byListName = Array.from(pageScopeIds).filter((id) => {

          const node = laidOut.nodes[id];

          if (!node) return false;

          if (!isListItemName(node.name ?? "")) return false;

          return hasAncestorMatching(laidOut, id, TODO_SECTION_PATTERN);

        });

        const byRowWithText = Array.from(pageScopeIds).filter((id) => {

          const node = laidOut.nodes[id];

          if (!node || (node.type !== "frame" && node.type !== "group")) return false;

          if (!hasAncestorMatching(laidOut, id, TODO_SECTION_PATTERN)) return false;

          const textIds = collectTextNodeIds(laidOut, id);

          if (!textIds.length) return false;

          const name = node.name ?? "";

          if (isListItemName(name)) return false;

          return /체크|row|행|todo|task/i.test(name) || (hasAncestorMatching(laidOut, id, LIST_CONTAINER_PATTERN) && textIds.length >= 1);

        });

        const seen = new Set<string>(byListName);

        byRowWithText.forEach((id) => seen.add(id));

        const itemIds = Array.from(seen);

        const ordered = itemIds

          .map((id) => ({ id, y: laidOut.nodes[id]?.frame.y ?? 0, x: laidOut.nodes[id]?.frame.x ?? 0 }))

          .sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y))

          .map((entry) => entry.id);

        applyListItemTextOverrides(ordered, todoTitles, todoMetas);

      }



      const calendarView = resolveValueForKeys(["calendarView", "calendar_view", "view"]);

      if (calendarView) {

        const viewTextIds = Array.from(pageScopeIds).filter((id) => {

          const node = laidOut.nodes[id];

          if (!node || node.type !== "text") return false;

          if (!hasAncestorMatching(laidOut, id, CALENDAR_SECTION_PATTERN)) return false;

          return matchesPattern(node.text?.value ?? "", CALENDAR_VIEW_PATTERN);

        });

        viewTextIds.forEach((id) => {

          overrides[id] = calendarView;

        });

      }



      const calendarTitles = resolveListForKeys(["calendar_events", "calendar_event_titles", "event_titles"]);

      const calendarMetas = resolveListForKeys(["calendar_event_metas", "calendar_event_meta", "event_metas"]);

      if (calendarTitles || calendarMetas) {

        const itemIds = Array.from(pageScopeIds).filter((id) => {

          const node = laidOut.nodes[id];

          if (!node) return false;

          if (!isListItemName(node.name ?? "")) return false;

          return hasAncestorMatching(laidOut, id, CALENDAR_SECTION_PATTERN);

        });

        const ordered = itemIds

          .map((id) => ({ id, y: laidOut.nodes[id]?.frame.y ?? 0, x: laidOut.nodes[id]?.frame.x ?? 0 }))

          .sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y))

          .map((entry) => entry.id);

        applyListItemTextOverrides(ordered, calendarTitles, calendarMetas);

      }



      const noteTitle = resolveValueForKeys(["note_title", "noteTitle", "title"]);

      const noteBody = resolveValueForKeys(["note_content", "noteContent", "note_body", "note_text", "content"]);

      const noteVersion = resolveValueForKeys(["note_version", "noteVersion"]);

      if (noteTitle || noteBody || noteVersion) {

        const textIds = Array.from(pageScopeIds).filter((id) => {

          const node = laidOut.nodes[id];

          if (!node || node.type !== "text") return false;

          if (!hasAncestorMatching(laidOut, id, NOTE_SECTION_PATTERN)) return false;

          if (hasAncestorMatching(laidOut, id, NOTE_TOOLBAR_PATTERN)) return false;

          return true;

        });

        textIds.forEach((id) => {

          const node = laidOut.nodes[id];

          const value = node?.text?.value ?? "";

          const name = node?.name ?? "";

          if (noteVersion && (/버전|version/i.test(value) || /버전|version/i.test(name))) {

            overrides[id] = noteVersion;

            return;

          }

          if (noteTitle && (/제목|title/i.test(value) || /제목|title/i.test(name))) {

            overrides[id] = noteTitle;

            return;

          }

          if (noteBody && (/내용|본문|content|body|note/i.test(value + name))) {

            overrides[id] = noteBody;

          }

        });

      }



      const roleTitles = resolveListForKeys(["member_roles", "role_list", "roles"]);

      const roleMetas = resolveListForKeys(["role_permissions", "role_meta", "role_metas"]);

      if (roleTitles || roleMetas) {

        const itemIds = Array.from(pageScopeIds).filter((id) => {

          const node = laidOut.nodes[id];

          if (!node) return false;

          if (!isListItemName(node.name ?? "")) return false;

          return hasAncestorMatching(laidOut, id, MEMBER_ROLE_SECTION_PATTERN);

        });

        const ordered = itemIds

          .map((id) => ({ id, y: laidOut.nodes[id]?.frame.y ?? 0, x: laidOut.nodes[id]?.frame.x ?? 0 }))

          .sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y))

          .map((entry) => entry.id);

        applyListItemTextOverrides(ordered, roleTitles, roleMetas);

      }



      const approvalSteps = resolveListForKeys(["approval_steps", "approvalSteps", "steps"]);

      if (approvalSteps) {

        const itemIds = Array.from(pageScopeIds).filter((id) => {

          const node = laidOut.nodes[id];

          if (!node) return false;

          if (!isListItemName(node.name ?? "")) return false;

          return hasAncestorMatching(laidOut, id, APPROVAL_SECTION_PATTERN);

        });

        const ordered = itemIds

          .map((id) => ({ id, y: laidOut.nodes[id]?.frame.y ?? 0, x: laidOut.nodes[id]?.frame.x ?? 0 }))

          .sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y))

          .map((entry) => entry.id);

        applyListItemTextOverrides(ordered, approvalSteps, null);

      }



      const approvalStatus = resolveValueForKeys(["approval_status", "approvalStatus", "status"]);

      if (approvalStatus) {

        const statusTextIds = Array.from(pageScopeIds).filter((id) => {

          const node = laidOut.nodes[id];

          if (!node || node.type !== "text") return false;

          if (!hasAncestorMatching(laidOut, id, APPROVAL_SECTION_PATTERN)) return false;

          return matchesPattern(node.text?.value ?? "", APPROVAL_SECTION_PATTERN) || matchesPattern(node.name ?? "", APPROVAL_SECTION_PATTERN);

        });

        statusTextIds.forEach((id) => {

          overrides[id] = approvalStatus;

        });

      }



      const kanbanCards = resolveListForKeys(["kanban_cards", "kanbanCards", "cards"]);

      if (kanbanCards) {

        const itemIds = Array.from(pageScopeIds).filter((id) => {

          const node = laidOut.nodes[id];

          if (!node) return false;

          if (!isListItemName(node.name ?? "")) return false;

          return hasAncestorMatching(laidOut, id, KANBAN_SECTION_PATTERN);

        });

        const ordered = itemIds

          .map((id) => ({ id, y: laidOut.nodes[id]?.frame.y ?? 0, x: laidOut.nodes[id]?.frame.x ?? 0 }))

          .sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y))

          .map((entry) => entry.id);

        applyListItemTextOverrides(ordered, kanbanCards, null);

      }



      const kanbanColumns = resolveListForKeys(["kanban_columns", "kanbanColumns", "columns"]);

      if (kanbanColumns) {

        const headerIds = Array.from(pageScopeIds).filter((id) => {

          const node = laidOut.nodes[id];

          if (!node || node.type !== "text") return false;

          if (!hasAncestorMatching(laidOut, id, KANBAN_SECTION_PATTERN)) return false;

          return matchesPattern(node.name ?? "", KANBAN_COLUMN_PATTERN) || matchesPattern(node.text?.value ?? "", KANBAN_COLUMN_PATTERN);

        });

        const ordered = headerIds

          .map((id) => ({ id, x: laidOut.nodes[id]?.frame.x ?? 0, y: laidOut.nodes[id]?.frame.y ?? 0 }))

          .sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y))

          .map((entry) => entry.id);

        ordered.forEach((id, index) => {

          if (kanbanColumns[index]) overrides[id] = kanbanColumns[index];

        });

      }



      const ganttTasks = resolveListForKeys(["gantt_tasks", "ganttTasks", "tasks"]);

      if (ganttTasks) {

        const itemIds = Array.from(pageScopeIds).filter((id) => {

          const node = laidOut.nodes[id];

          if (!node) return false;

          if (!isListItemName(node.name ?? "")) return false;

          return hasAncestorMatching(laidOut, id, GANTT_SECTION_PATTERN);

        });

        const ordered = itemIds

          .map((id) => ({ id, y: laidOut.nodes[id]?.frame.y ?? 0, x: laidOut.nodes[id]?.frame.x ?? 0 }))

          .sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y))

          .map((entry) => entry.id);

        applyListItemTextOverrides(ordered, ganttTasks, null);

      }



      const mediaTitles = resolveListForKeys(["media_titles", "media_items", "gallery_items", "gallery_titles"]);

      if (mediaTitles) {

        const itemIds = Array.from(pageScopeIds).filter((id) => {

          const node = laidOut.nodes[id];

          if (!node) return false;

          if (!isListItemName(node.name ?? "")) return false;

          return hasAncestorMatching(laidOut, id, MEDIA_GALLERY_SECTION_PATTERN);

        });

        const ordered = itemIds

          .map((id) => ({ id, y: laidOut.nodes[id]?.frame.y ?? 0, x: laidOut.nodes[id]?.frame.x ?? 0 }))

          .sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y))

          .map((entry) => entry.id);

        applyListItemTextOverrides(ordered, mediaTitles, null);

      }



      const mediaSelected = resolveValueForKeys(["mediaSelected", "media_selected"]);

      if (mediaSelected) {

        const detailTextIds = Array.from(pageScopeIds).filter((id) => {

          const node = laidOut.nodes[id];

          if (!node || node.type !== "text") return false;

          if (!hasAncestorMatching(laidOut, id, LIGHTBOX_SECTION_PATTERN)) return false;

          return matchesPattern(node.text?.value ?? "", MEDIA_DETAIL_PATTERN) || matchesPattern(node.name ?? "", MEDIA_DETAIL_PATTERN);

        });

        detailTextIds.forEach((id) => {

          overrides[id] = mediaSelected;

        });

      }



      const mediaPlaying = Boolean(variableOverrides.mediaPlaying ?? variableOverrides.media_playing);

      const mediaProgress =

        typeof variableOverrides.mediaProgress === "number"

          ? variableOverrides.mediaProgress

          : Number(variableOverrides.mediaProgress ?? variableOverrides.media_progress);

      if (mediaPlaying || Number.isFinite(mediaProgress)) {

        const statusTextIds = Array.from(pageScopeIds).filter((id) => {

          const node = laidOut.nodes[id];

          if (!node || node.type !== "text") return false;

          if (!hasAncestorMatching(laidOut, id, MEDIA_PLAYER_SECTION_PATTERN)) return false;

          return matchesPattern(node.text?.value ?? "", MEDIA_STATUS_PATTERN) || matchesPattern(node.name ?? "", MEDIA_STATUS_PATTERN);

        });

        statusTextIds.forEach((id) => {

          if (Number.isFinite(mediaProgress)) {

            const progressValue = mediaProgress as number;

            overrides[id] =

              progressValue <= 1 ? `Progress ${Math.round(progressValue * 100)}%` : `Time ${Math.round(progressValue)}s`;

          } else {

            overrides[id] = mediaPlaying ? "Playing" : "Paused";

          }

        });

      }



      const storyProgress =

        typeof variableOverrides.storyProgress === "number"

          ? variableOverrides.storyProgress

          : Number(variableOverrides.story_progress ?? variableOverrides.storyProgress);

      if (Number.isFinite(storyProgress)) {

        const storyTextIds = Array.from(pageScopeIds).filter((id) => {

          const node = laidOut.nodes[id];

          if (!node || node.type !== "text") return false;

          if (!hasAncestorMatching(laidOut, id, STORY_SECTION_PATTERN)) return false;

          return matchesPattern(node.text?.value ?? "", STORY_PROGRESS_PATTERN) || matchesPattern(node.name ?? "", STORY_PROGRESS_PATTERN);

        });

        storyTextIds.forEach((id) => {

          overrides[id] = `${Math.round((storyProgress as number) * 100)}%`;

        });

      }



      const liveMessages = resolveListForKeys(["live_messages", "liveMessages", "live_chat", "liveChat"]);

      if (liveMessages) {

        const itemIds = Array.from(pageScopeIds).filter((id) => {

          const node = laidOut.nodes[id];

          if (!node) return false;

          if (!isListItemName(node.name ?? "")) return false;

          return hasAncestorMatching(laidOut, id, LIVE_SECTION_PATTERN);

        });

        const ordered = itemIds

          .map((id) => ({ id, y: laidOut.nodes[id]?.frame.y ?? 0, x: laidOut.nodes[id]?.frame.x ?? 0 }))

          .sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y))

          .map((entry) => entry.id);

        applyListItemTextOverrides(ordered, liveMessages, null);

      }



      const liveViewers =

        typeof variableOverrides.live_viewers === "number"

          ? variableOverrides.live_viewers

          : Number(variableOverrides.live_viewers ?? variableOverrides.liveViewers ?? variableOverrides.viewer_count);

      if (Number.isFinite(liveViewers)) {

        const viewerTextIds = Array.from(pageScopeIds).filter((id) => {

          const node = laidOut.nodes[id];

          if (!node || node.type !== "text") return false;

          if (!hasAncestorMatching(laidOut, id, LIVE_SECTION_PATTERN)) return false;

          return matchesPattern(node.text?.value ?? "", LIVE_VIEWER_PATTERN) || matchesPattern(node.name ?? "", LIVE_VIEWER_PATTERN);

        });

        viewerTextIds.forEach((id) => {

          overrides[id] = `${liveViewers} viewers`;

        });

      }



      const liveStatus = resolveValueForKeys(["liveStatus", "live_status", "status"]);

      if (liveStatus) {

        const statusIds = Array.from(pageScopeIds).filter((id) => {

          const node = laidOut.nodes[id];

          if (!node || node.type !== "text") return false;

          if (!hasAncestorMatching(laidOut, id, LIVE_SECTION_PATTERN)) return false;

          return matchesPattern(node.text?.value ?? "", LIVE_STATUS_PATTERN) || matchesPattern(node.name ?? "", LIVE_STATUS_PATTERN);

        });

        statusIds.forEach((id) => {

          overrides[id] = liveStatus;

        });

      }



      const kpiTitles = resolveListForKeys(["kpi_titles", "kpi_title", "kpi_labels"]);

      const kpiValues = resolveListForKeys(["kpi_values", "kpi_value", "kpi_numbers"]);

      const kpiDeltas = resolveListForKeys(["kpi_deltas", "kpi_delta", "kpi_changes"]);

      if (kpiTitles || kpiValues || kpiDeltas) {

        const itemIds = Array.from(pageScopeIds).filter((id) => {

          const node = laidOut.nodes[id];

          if (!node) return false;

          if (!isListItemName(node.name ?? "")) return false;

          return hasAncestorMatching(laidOut, id, KPI_SECTION_PATTERN);

        });

        const ordered = itemIds

          .map((id) => ({ id, y: laidOut.nodes[id]?.frame.y ?? 0, x: laidOut.nodes[id]?.frame.x ?? 0 }))

          .sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y))

          .map((entry) => entry.id);

        ordered.forEach((itemId, index) => {

          const textIds = collectTextNodeIds(laidOut, itemId)

            .map((id) => ({ id, y: laidOut.nodes[id]?.frame.y ?? 0, x: laidOut.nodes[id]?.frame.x ?? 0 }))

            .sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y))

            .map((entry) => entry.id);

          if (!textIds.length) return;

          const titleId = textIds[0];

          const valueId = textIds[1];

          const deltaId = textIds[2];

          const title = kpiTitles?.[index];

          const value = kpiValues?.[index];

          const delta = kpiDeltas?.[index];

          if (title && titleId) overrides[titleId] = title;

          if (value && valueId) overrides[valueId] = value;

          if (delta && deltaId) overrides[deltaId] = delta;

        });

      }



      const chartTitle = resolveValueForKeys(["chart_title", "chartTitle", "title"]);

      if (chartTitle) {

        const titleIds = Array.from(pageScopeIds).filter((id) => {

          const node = laidOut.nodes[id];

          if (!node || node.type !== "text") return false;

          if (!hasAncestorMatching(laidOut, id, CHART_SECTION_PATTERN)) return false;

          return matchesPattern(node.text?.value ?? "", CHART_SECTION_PATTERN) || matchesPattern(node.name ?? "", CHART_SECTION_PATTERN);

        });

        titleIds.forEach((id) => {

          overrides[id] = chartTitle;

        });

      }



      const chartValues = resolveListForKeys(["chart_values", "chart_data", "chart_points"]);

      if (chartValues) {

        const itemIds = Array.from(pageScopeIds).filter((id) => {

          const node = laidOut.nodes[id];

          if (!node) return false;

          if (!isListItemName(node.name ?? "")) return false;

          return hasAncestorMatching(laidOut, id, CHART_SECTION_PATTERN);

        });

        const ordered = itemIds

          .map((id) => ({ id, y: laidOut.nodes[id]?.frame.y ?? 0, x: laidOut.nodes[id]?.frame.x ?? 0 }))

          .sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y))

          .map((entry) => entry.id);

        applyListItemTextOverrides(ordered, chartValues, null);

      }



      const chartLoading = coerceBoolean(variableOverrides.chartLoading ?? variableOverrides.chart_loading) === true;

      const chartEmpty = coerceBoolean(variableOverrides.chartEmpty ?? variableOverrides.chart_empty) === true;

      if (chartLoading || chartEmpty) {

        const statusIds = Array.from(pageScopeIds).filter((id) => {

          const node = laidOut.nodes[id];

          if (!node || node.type !== "text") return false;

          if (!hasAncestorMatching(laidOut, id, CHART_SECTION_PATTERN)) return false;

          return matchesPattern(node.text?.value ?? "", LOADING_PATTERN) || matchesPattern(node.text?.value ?? "", EMPTY_STATE_PATTERN);

        });

        statusIds.forEach((id) => {

          overrides[id] = chartLoading ? "Loading..." : "No data.";

        });

      }



      const tableColumns = resolveListForKeys(["table_columns", "tableColumns", "columns"]);

      if (tableColumns) {

        const headerIds = Array.from(pageScopeIds).filter((id) => {

          const node = laidOut.nodes[id];

          if (!node || node.type !== "text") return false;

          if (!hasAncestorMatching(laidOut, id, DATA_TABLE_SECTION_PATTERN)) return false;

          return matchesPattern(node.name ?? "", TABLE_HEADER_PATTERN) || matchesPattern(node.text?.value ?? "", TABLE_HEADER_PATTERN);

        });

        const ordered = headerIds

          .map((id) => ({ id, x: laidOut.nodes[id]?.frame.x ?? 0, y: laidOut.nodes[id]?.frame.y ?? 0 }))

          .sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y))

          .map((entry) => entry.id);

        ordered.forEach((id, index) => {

          if (tableColumns[index]) overrides[id] = tableColumns[index];

        });

      }



      const tableRows = resolveListForKeys(["table_rows", "tableRows", "rows"]);

      const tableMetas = resolveListForKeys(["table_row_metas", "tableMetas", "row_metas"]);

      if (tableRows || tableMetas) {

        const itemIds = Array.from(pageScopeIds).filter((id) => {

          const node = laidOut.nodes[id];

          if (!node) return false;

          if (!isListItemName(node.name ?? "")) return false;

          return hasAncestorMatching(laidOut, id, DATA_TABLE_SECTION_PATTERN);

        });

        const ordered = itemIds

          .map((id) => ({ id, y: laidOut.nodes[id]?.frame.y ?? 0, x: laidOut.nodes[id]?.frame.x ?? 0 }))

          .sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y))

          .map((entry) => entry.id);

        applyListItemTextOverrides(ordered, tableRows, tableMetas);

      }



      const userNames = resolveListForKeys(["user_names", "user_list", "users"]);

      const userMetas = resolveListForKeys(["user_statuses", "user_roles", "user_metas"]);

      if (userNames || userMetas) {

        const itemIds = Array.from(pageScopeIds).filter((id) => {

          const node = laidOut.nodes[id];

          if (!node) return false;

          if (!isListItemName(node.name ?? "")) return false;

          return hasAncestorMatching(laidOut, id, USER_ADMIN_SECTION_PATTERN);

        });

        const ordered = itemIds

          .map((id) => ({ id, y: laidOut.nodes[id]?.frame.y ?? 0, x: laidOut.nodes[id]?.frame.x ?? 0 }))

          .sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y))

          .map((entry) => entry.id);

        applyListItemTextOverrides(ordered, userNames, userMetas);

      }



      const auditLogs = resolveListForKeys(["audit_logs", "audit_log", "audit_items"]);

      const auditMetas = resolveListForKeys(["audit_meta", "audit_metas", "audit_detail"]);

      if (auditLogs || auditMetas) {

        const itemIds = Array.from(pageScopeIds).filter((id) => {

          const node = laidOut.nodes[id];

          if (!node) return false;

          if (!isListItemName(node.name ?? "")) return false;

          return hasAncestorMatching(laidOut, id, AUDIT_LOG_SECTION_PATTERN);

        });

        const ordered = itemIds

          .map((id) => ({ id, y: laidOut.nodes[id]?.frame.y ?? 0, x: laidOut.nodes[id]?.frame.x ?? 0 }))

          .sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y))

          .map((entry) => entry.id);

        applyListItemTextOverrides(ordered, auditLogs, auditMetas);

      }



      const invoiceTitles = resolveListForKeys(["invoice_list", "invoice_titles", "invoices"]);

      const invoiceMetas = resolveListForKeys(["invoice_statuses", "invoice_meta", "invoice_metas"]);

      if (invoiceTitles || invoiceMetas) {

        const itemIds = Array.from(pageScopeIds).filter((id) => {

          const node = laidOut.nodes[id];

          if (!node) return false;

          if (!isListItemName(node.name ?? "")) return false;

          return hasAncestorMatching(laidOut, id, BILLING_SECTION_PATTERN);

        });

        const ordered = itemIds

          .map((id) => ({ id, y: laidOut.nodes[id]?.frame.y ?? 0, x: laidOut.nodes[id]?.frame.x ?? 0 }))

          .sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y))

          .map((entry) => entry.id);

        applyListItemTextOverrides(ordered, invoiceTitles, invoiceMetas);

      }



      const billingStatus = resolveValueForKeys(["billing_status", "payment_status", "billingStatus"]);

      if (billingStatus) {

        const statusIds = Array.from(pageScopeIds).filter((id) => {

          const node = laidOut.nodes[id];

          if (!node || node.type !== "text") return false;

          if (!hasAncestorMatching(laidOut, id, BILLING_SECTION_PATTERN)) return false;

          return matchesPattern(node.text?.value ?? "", PAYMENT_STATUS_PATTERN) || matchesPattern(node.name ?? "", PAYMENT_STATUS_PATTERN);

        });

        statusIds.forEach((id) => {

          overrides[id] = billingStatus;

        });

      }



      const consoleLogs = resolveListForKeys(["console_logs", "system_logs", "logs"]);

      if (consoleLogs) {

        const itemIds = Array.from(pageScopeIds).filter((id) => {

          const node = laidOut.nodes[id];

          if (!node) return false;

          if (!isListItemName(node.name ?? "")) return false;

          return hasAncestorMatching(laidOut, id, SYSTEM_CONSOLE_SECTION_PATTERN);

        });

        const ordered = itemIds

          .map((id) => ({ id, y: laidOut.nodes[id]?.frame.y ?? 0, x: laidOut.nodes[id]?.frame.x ?? 0 }))

          .sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y))

          .map((entry) => entry.id);

        applyListItemTextOverrides(ordered, consoleLogs, null);

      }



      const dataProgress = resolveValueForKeys(["import_progress", "export_progress", "data_progress", "progress"]);

      if (dataProgress) {

        const progressIds = Array.from(pageScopeIds).filter((id) => {

          const node = laidOut.nodes[id];

          if (!node || node.type !== "text") return false;

          if (!hasAncestorMatching(laidOut, id, DATA_TRANSFER_SECTION_PATTERN)) return false;

          return matchesPattern(node.text?.value ?? "", DATA_PROGRESS_PATTERN) || matchesPattern(node.name ?? "", DATA_PROGRESS_PATTERN);

        });

        progressIds.forEach((id) => {

          overrides[id] = dataProgress;

        });

      }



      const monitorMetrics = resolveListForKeys(["monitor_metrics", "monitor_items", "monitor_list"]);

      const monitorMetas = resolveListForKeys(["monitor_meta", "monitor_status", "monitor_metas"]);

      if (monitorMetrics || monitorMetas) {

        const itemIds = Array.from(pageScopeIds).filter((id) => {

          const node = laidOut.nodes[id];

          if (!node) return false;

          if (!isListItemName(node.name ?? "")) return false;

          return hasAncestorMatching(laidOut, id, MONITORING_SECTION_PATTERN);

        });

        const ordered = itemIds

          .map((id) => ({ id, y: laidOut.nodes[id]?.frame.y ?? 0, x: laidOut.nodes[id]?.frame.x ?? 0 }))

          .sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y))

          .map((entry) => entry.id);

        applyListItemTextOverrides(ordered, monitorMetrics, monitorMetas);

      }



      const alarmStatus = resolveValueForKeys(["alarm_status", "alarmStatus", "alert_status"]);

      if (alarmStatus) {

        const alarmIds = Array.from(pageScopeIds).filter((id) => {

          const node = laidOut.nodes[id];

          if (!node || node.type !== "text") return false;

          if (!hasAncestorMatching(laidOut, id, MONITORING_SECTION_PATTERN)) return false;

          return matchesPattern(node.text?.value ?? "", MONITORING_ALARM_PATTERN) || matchesPattern(node.name ?? "", MONITORING_ALARM_PATTERN);

        });

        alarmIds.forEach((id) => {

          overrides[id] = alarmStatus;

        });

      }



      const emptyMessage = resolveValueForKeys(["emptyMessage", "empty_message", "noDataMessage", "no_data_message"]);

      if (emptyMessage) {

        const emptyIds = Array.from(pageScopeIds).filter((id) => {

          const node = laidOut.nodes[id];

          if (!node || node.type !== "text") return false;

          const label = `${node.name ?? ""} ${node.text?.value ?? ""}`;

          return matchesPattern(label, EMPTY_STATE_PATTERN);

        });

        emptyIds.forEach((id) => {

          overrides[id] = emptyMessage;

        });

      }



      const errorCode = resolveValueForKeys(["errorCode", "error_code", "code"]);

      if (errorCode) {

        const errorIds = Array.from(pageScopeIds).filter((id) => {

          const node = laidOut.nodes[id];

          if (!node || node.type !== "text") return false;

          if (!hasAncestorMatching(laidOut, id, ERROR_PAGE_PATTERN)) return false;

          return matchesPattern(node.text?.value ?? "", ERROR_CODE_PATTERN) || matchesPattern(node.name ?? "", ERROR_CODE_PATTERN);

        });

        errorIds.forEach((id) => {

          overrides[id] = errorCode;

        });

      }



      const addressResults = resolveListForKeys(["address_results", "addressResults", "addresses"]);

      if (addressResults) {

        const itemIds = Array.from(pageScopeIds).filter((id) => {

          const node = laidOut.nodes[id];

          if (!node) return false;

          if (!isListItemName(node.name ?? "")) return false;

          return hasAncestorMatching(laidOut, id, ADDRESS_SECTION_PATTERN);

        });

        const ordered = itemIds

          .map((id) => ({ id, y: laidOut.nodes[id]?.frame.y ?? 0, x: laidOut.nodes[id]?.frame.x ?? 0 }))

          .sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y))

          .map((entry) => entry.id);

        applyListItemTextOverrides(ordered, addressResults, null);

      }



      const cartTotal =

        typeof variableOverrides.cart_total === "number"

          ? variableOverrides.cart_total

          : Number(variableOverrides.cart_total ?? variableOverrides.cartTotal ?? variableOverrides.total_amount);

      if (Number.isFinite(cartTotal)) {

        const totalIds = Array.from(pageScopeIds).filter((id) => {

          const node = laidOut.nodes[id];

          if (!node || node.type !== "text") return false;

          if (!hasAncestorMatching(laidOut, id, CART_SECTION_PATTERN)) return false;

          return matchesPattern(node.text?.value ?? "", CART_TOTAL_PATTERN) || matchesPattern(node.name ?? "", CART_TOTAL_PATTERN);

        });

        totalIds.forEach((id) => {

          overrides[id] = String(cartTotal);

        });

      }



      const paymentMethods = resolveListForKeys(["payment_methods", "paymentMethods", "cards"]);

      if (paymentMethods) {

        const itemIds = Array.from(pageScopeIds).filter((id) => {

          const node = laidOut.nodes[id];

          if (!node) return false;

          if (!isListItemName(node.name ?? "")) return false;

          return hasAncestorMatching(laidOut, id, PAYMENT_METHOD_SECTION_PATTERN);

        });

        const ordered = itemIds

          .map((id) => ({ id, y: laidOut.nodes[id]?.frame.y ?? 0, x: laidOut.nodes[id]?.frame.x ?? 0 }))

          .sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y))

          .map((entry) => entry.id);

        applyListItemTextOverrides(ordered, paymentMethods, null);

      }



      const paymentStatus = resolveValueForKeys(["payment_status", "paymentStatus", "status"]);

      if (paymentStatus) {

        const statusIds = Array.from(pageScopeIds).filter((id) => {

          const node = laidOut.nodes[id];

          if (!node || node.type !== "text") return false;

          if (!hasAncestorMatching(laidOut, id, PAYMENT_RESULT_PATTERN)) return false;

          return matchesPattern(node.text?.value ?? "", PAYMENT_STATUS_PATTERN) || matchesPattern(node.name ?? "", PAYMENT_STATUS_PATTERN);

        });

        statusIds.forEach((id) => {

          overrides[id] = paymentStatus;

        });

      }



      const couponError = resolveValueForKeys(["coupon_error", "couponError"]);

      if (couponError) {

        const errorIds = Array.from(pageScopeIds).filter((id) => {

          const node = laidOut.nodes[id];

          if (!node || node.type !== "text") return false;

          if (!hasAncestorMatching(laidOut, id, COUPON_SECTION_PATTERN)) return false;

          return matchesPattern(node.text?.value ?? "", COUPON_ERROR_PATTERN) || matchesPattern(node.name ?? "", COUPON_ERROR_PATTERN);

        });

        errorIds.forEach((id) => {

          overrides[id] = couponError;

        });

      }



      const blankHint = resolveValueForKeys(["blank_hint", "blankHint", "emptyMessage", "empty_message"]);

      if (blankHint) {

        const hintIds = Array.from(pageScopeIds).filter((id) => {

          const node = laidOut.nodes[id];

          if (!node || node.type !== "text") return false;

          if (!hasAncestorMatching(laidOut, id, BLANK_TEMPLATE_PATTERN)) return false;

          return matchesPattern(node.text?.value ?? "", EMPTY_STATE_PATTERN) || matchesPattern(node.name ?? "", EMPTY_STATE_PATTERN);

        });

        hintIds.forEach((id) => {

          overrides[id] = blankHint;

        });

      }



      const landingSections = resolveListForKeys(["landing_sections", "landing_section_titles", "landing_sections_title"]);

      if (landingSections) {

        const itemIds = Array.from(pageScopeIds).filter((id) => {

          const node = laidOut.nodes[id];

          if (!node) return false;

          if (!isListItemName(node.name ?? "")) return false;

          return hasAncestorMatching(laidOut, id, LANDING_SECTION_PATTERN);

        });

        const ordered = itemIds

          .map((id) => ({ id, y: laidOut.nodes[id]?.frame.y ?? 0, x: laidOut.nodes[id]?.frame.x ?? 0 }))

          .sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y))

          .map((entry) => entry.id);

        applyListItemTextOverrides(ordered, landingSections, null);

      }



      const dashboardWidgets = resolveListForKeys(["dashboard_widgets", "dashboard_widget_titles", "widgets"]);

      const dashboardValues = resolveListForKeys(["dashboard_values", "dashboard_widget_values", "widget_values"]);

      if (dashboardWidgets || dashboardValues) {

        const itemIds = Array.from(pageScopeIds).filter((id) => {

          const node = laidOut.nodes[id];

          if (!node) return false;

          if (!isListItemName(node.name ?? "")) return false;

          return hasAncestorMatching(laidOut, id, DASHBOARD_SECTION_PATTERN);

        });

        const ordered = itemIds

          .map((id) => ({ id, y: laidOut.nodes[id]?.frame.y ?? 0, x: laidOut.nodes[id]?.frame.x ?? 0 }))

          .sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y))

          .map((entry) => entry.id);

        applyListItemTextOverrides(ordered, dashboardWidgets, dashboardValues);

      }



      const communityPosts = resolveListForKeys(["community_posts", "community_list", "community_items"]);

      const communityMetas = resolveListForKeys(["community_meta", "community_metas", "community_detail"]);

      if (communityPosts || communityMetas) {

        const itemIds = Array.from(pageScopeIds).filter((id) => {

          const node = laidOut.nodes[id];

          if (!node) return false;

          if (!isListItemName(node.name ?? "")) return false;

          return hasAncestorMatching(laidOut, id, COMMUNITY_SECTION_PATTERN);

        });

        const ordered = itemIds

          .map((id) => ({ id, y: laidOut.nodes[id]?.frame.y ?? 0, x: laidOut.nodes[id]?.frame.x ?? 0 }))

          .sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y))

          .map((entry) => entry.id);

        applyListItemTextOverrides(ordered, communityPosts, communityMetas);

      }



      const communityTags = resolveListForKeys(["community_tags", "community_tag_list", "tags"]);

      if (communityTags) {

        const tagIds = Array.from(pageScopeIds).filter((id) => {

          const node = laidOut.nodes[id];

          if (!node) return false;

          if (!isListItemName(node.name ?? "")) return false;

          return hasAncestorMatching(laidOut, id, COMMUNITY_SECTION_PATTERN) && hasAncestorMatching(laidOut, id, TAG_SECTION_PATTERN);

        });

        const ordered = tagIds

          .map((id) => ({ id, y: laidOut.nodes[id]?.frame.y ?? 0, x: laidOut.nodes[id]?.frame.x ?? 0 }))

          .sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y))

          .map((entry) => entry.id);

        applyListItemTextOverrides(ordered, communityTags, null);

      }



      const communityRecommendations = resolveListForKeys(["community_recommendations", "community_reco", "recommendations"]);

      if (communityRecommendations) {

        const itemIds = Array.from(pageScopeIds).filter((id) => {

          const node = laidOut.nodes[id];

          if (!node) return false;

          if (!isListItemName(node.name ?? "")) return false;

          if (!hasAncestorMatching(laidOut, id, COMMUNITY_SECTION_PATTERN)) return false;

          if (!hasAncestorMatching(laidOut, id, SIDEBAR_SECTION_PATTERN) && !matchesPattern(node.name ?? "", RECOMMEND_PATTERN)) return false;

          return true;

        });

        const ordered = itemIds

          .map((id) => ({ id, y: laidOut.nodes[id]?.frame.y ?? 0, x: laidOut.nodes[id]?.frame.x ?? 0 }))

          .sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y))

          .map((entry) => entry.id);

        applyListItemTextOverrides(ordered, communityRecommendations, null);

      }



      const serviceStep = resolveValueForKeys(["service_step", "serviceStep", "step"]);

      if (serviceStep) {

        const stepIds = Array.from(pageScopeIds).filter((id) => {

          const node = laidOut.nodes[id];

          if (!node || node.type !== "text") return false;

          if (!hasAncestorMatching(laidOut, id, SERVICE_SECTION_PATTERN)) return false;

          return matchesPattern(node.text?.value ?? "", STEP_PROGRESS_PATTERN) || matchesPattern(node.name ?? "", STEP_PROGRESS_PATTERN);

        });

        stepIds.forEach((id) => {

          overrides[id] = serviceStep;

        });

      }



    }



    const safe: Record<string, string> = {};

    for (const [id, val] of Object.entries(overrides)) {

      safe[id] = typeof val === "string" ? val : val != null && typeof val === "object" ? "" : String(val ?? "");

    }

    return safe;

  }, [basePageId, chatLiveTick, cooldownMap, cooldownTick, controlFields, controlRootRoles, controlState, laidOut, variableOverrides]);







  const resolveRequiredStatus = useCallback((scopeIds: Set<string>) => {

    const scoped = Array.from(controlRootRoles.entries()).filter(([rootId]) => scopeIds.has(rootId));

    if (!scoped.length) return { ok: true };



    const getControlValue = (rootId: string, role: ControlRole) => {

      if (role.type === "input") {

        if (role.inputType === "file") return (controlFileState[rootId]?.length ?? 0) > 0;

        return (controlTextState[rootId] ?? "").trim().length > 0;

      }

      return Boolean(controlState[rootId]);

    };



    const requiredInputs = scoped.filter(([rootId, role]) => {

      if (role.type !== "input") return false;

      const label = controlFields.get(rootId)?.label ?? "";

      return !isOptionalLabel(label);

    });



    const groupStats = new Map<string, { total: number; required: boolean; anyChecked: boolean }>();

    scoped.forEach(([rootId, role]) => {

      if (role.type === "input" || role.type === "choice") return;

      const meta = controlFields.get(rootId);

      if (!meta?.key || meta.key !== "reason") return;

      const entry = groupStats.get(meta.key) ?? { total: 0, required: false, anyChecked: false };

      entry.total += 1;

      if (isRequiredCheckboxLabel(meta.label ?? "", meta.key)) entry.required = true;

      if (getControlValue(rootId, role)) entry.anyChecked = true;

      groupStats.set(meta.key, entry);

    });



    const groupRequiredKeys = new Set<string>();

    let groupsOk = true;

    groupStats.forEach((entry, key) => {

      if (entry.total > 1 && entry.required) {

        groupRequiredKeys.add(key);

        if (!entry.anyChecked) groupsOk = false;

      }

    });



    const requiredChecks = scoped.filter(([rootId, role]) => {

      if (role.type === "input" || role.type === "choice") return false;

      const meta = controlFields.get(rootId);

      const key = meta?.key;

      if (!meta) return false;

      if (key && groupRequiredKeys.has(key)) return false;

      return isRequiredCheckboxLabel(meta.label ?? "", key);

    });



    const inputsOk = requiredInputs.every(([rootId, role]) => getControlValue(rootId, role));

    const checksOk = requiredChecks.every(([rootId, role]) => getControlValue(rootId, role));



    const hasInvalid = scoped.some(([rootId]) => invalidInputIds.has(rootId));

    return { ok: inputsOk && checksOk && groupsOk && !hasInvalid };

  }, [controlRootRoles, controlFields, controlState, controlTextState, controlFileState, invalidInputIds]);

  const activeSubmitButtonIdsByPage = useMemo(() => {

    const result = new Map<string, Set<string>>();



    const getControlValue = (rootId: string, role: ControlRole) => {

      if (role.type === "input") {

        if (role.inputType === "file") return (controlFileState[rootId]?.length ?? 0) > 0;

        return (controlTextState[rootId] ?? "").trim().length > 0;

      }

      return Boolean(controlState[rootId]);

    };



    const collectScopeControls = (scopeIds: Set<string>) =>

      Array.from(controlRootRoles.entries()).filter(([rootId]) => scopeIds.has(rootId));



    const isLoginReady = (scopeIds: Set<string>) => {

      const scoped = collectScopeControls(scopeIds);

      const hasInput = (inputType: "email" | "password") =>

        scoped.some(([rootId, role]) => role.type === "input" && role.inputType === inputType && getControlValue(rootId, role));

      return hasInput("email") && hasInput("password");

    };



    const isSignupReady = (scopeIds: Set<string>) => {

      const scoped = collectScopeControls(scopeIds);

      const requiredInputs = scoped.filter(([rootId, role]) => {

        if (role.type !== "input") return false;

        const label = controlFields.get(rootId)?.label ?? "";

        return !isOptionalLabel(label);

      });

      const requiredChecks = scoped.filter(([rootId, role]) => {

        if (role.type === "input") return false;

        const meta = controlFields.get(rootId);

        return isRequiredCheckboxLabel(meta?.label ?? "", meta?.key);

      });

      const inputsOk = requiredInputs.every(([rootId, role]) => getControlValue(rootId, role));

      const checksOk = requiredChecks.every(([rootId, role]) => getControlValue(rootId, role));

      return inputsOk && checksOk;

    };



    laidOut.pages.forEach((page) => {

      const pageIds = collectDescendants(laidOut, page.rootId);

      pageIds.forEach((nodeId) => {

        const node = laidOut.nodes[nodeId];

        const interactions = node?.prototype?.interactions ?? [];

        const submit = interactions.find((interaction) => interaction.action.type === "submit")?.action as PrototypeAction | undefined;

        if (!submit || submit.type !== "submit") return;

        const scopeIds = resolveSubmitScopeIds(laidOut, page.id, nodeId);

        const ready =

          submit.url === "/api/auth/login"

            ? isLoginReady(scopeIds)

            : submit.url === "/api/auth/signup"

              ? isSignupReady(scopeIds)

              : resolveRequiredStatus(scopeIds).ok;

        if (!ready) return;

        const set = result.get(page.id) ?? new Set<string>();

        set.add(nodeId);

        result.set(page.id, set);

      });

    });



    return result;

  }, [laidOut, controlRootRoles, controlFields, controlState, controlTextState, controlFileState, resolveRequiredStatus]);





  const timersRef = useRef<number[]>([]);

  const basePageRef = useRef(basePageId);

  const overlayRef = useRef(overlayStack);

  const modalStackRef = useRef(modalStack);

  const historyRef = useRef(history);

  const onPageChangeRef = useRef(onPageChange);

  useEffect(() => {

    onPageChangeRef.current = onPageChange;

  }, [onPageChange]);



  useEffect(() => {

    basePageRef.current = basePageId;

    onboardingCompleteRef.current = new Set();

    deferStateUpdate(() => setModalStack([]));

  }, [basePageId]);

  useEffect(() => {

    overlayRef.current = overlayStack;

  }, [overlayStack]);

  useEffect(() => {

    modalStackRef.current = modalStack;

  }, [modalStack]);

  useEffect(() => {

    if (!confirmModalIds.size) return;

    if (typeof document === "undefined") return;

    const openConfirmId = modalStack.find((id) => confirmModalIds.has(id));

    if (!openConfirmId) return;

    const root = document.querySelector(`[data-node-id="${openConfirmId}"]`);

    if (!(root instanceof HTMLElement)) return;

    const focusables = Array.from(

      root.querySelectorAll<HTMLElement>('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])'),

    ).filter((el) => !el.hasAttribute("disabled"));

    if (focusables.length) {

      focusables[0].focus();

    }

    const handleKeyDown = (event: KeyboardEvent) => {

      if (event.key !== "Tab") return;

      if (!focusables.length) return;

      const first = focusables[0];

      const last = focusables[focusables.length - 1];

      if (event.shiftKey && document.activeElement === first) {

        event.preventDefault();

        last.focus();

      } else if (!event.shiftKey && document.activeElement === last) {

        event.preventDefault();

        first.focus();

      }

    };

    root.addEventListener("keydown", handleKeyDown);

    return () => {

      root.removeEventListener("keydown", handleKeyDown);

    };

  }, [confirmModalIds, modalStack]);

  useEffect(() => {

    if (typeof document === "undefined") return;

    const body = document.body;

    const lightboxOpen = Boolean(variableOverrides.lightboxOpen ?? variableOverrides.lightbox_open);

    if (overlayStack.length > 0 || modalStack.length > 0 || lightboxOpen) {

      if (bodyOverflowRef.current === null) bodyOverflowRef.current = body.style.overflow;

      body.style.overflow = "hidden";

      return;

    }

    if (bodyOverflowRef.current !== null) {

      body.style.overflow = bodyOverflowRef.current;

      bodyOverflowRef.current = null;

    }

  }, [overlayStack.length, modalStack.length, variableOverrides]);

  useEffect(() => {

    historyRef.current = history;

  }, [history]);



  // NOTE: comment removed (encoding issue).

  // NOTE: comment removed (encoding issue).

  useEffect(() => {

    if (!initialPageId || !pageIds.includes(initialPageId)) return;

    deferStateUpdate(() => {

      setBasePageId(initialPageId);

      setHistory([]);

      setOverlayStack([]);

    });

  }, [initialPageId, pageIds]);



  // NOTE: comment removed (encoding issue).

  useEffect(() => {

    const next = buildVariableOverridesFromQuery(doc, initialQueryParams);

    if (Object.keys(next).length === 0) return;

    deferStateUpdate(() => setVariableOverrides((prev) => ({ ...prev, ...next })));

  }, [initialQueryParams, doc]);



  useEffect(() => {

    if (!basePageId || !pageIds.includes(basePageId)) {

      deferStateUpdate(() => {

        setBasePageId(startPageId);

        setHistory([]);

        setOverlayStack([]);

      });

    }

  }, [basePageId, pageIds, startPageId]);



  useEffect(() => {

    if (!basePageId) return;

    onPageChangeRef.current?.(basePageId);

  }, [basePageId]);



  useEffect(() => {

    const timers = timersRef.current;
    const noticeTimers = noticeTimersRef.current;

    return () => {

      timers.forEach((id) => window.clearTimeout(id));

      timersRef.current = [];

      noticeTimers.forEach((id) => window.clearTimeout(id));

      noticeTimers.clear();

    };

  }, []);



  // NOTE: comment removed (encoding issue).

  // NOTE: comment removed (encoding issue).

  useEffect(() => {

    if (previewMode) return;

    const initialRoles = buildControlRoles(baseLaidOut);

    const initialChoices = deriveInitialChoiceState(baseLaidOut, initialRoles);

    let nextChoices = initialChoices;

    if (typeof localStorage !== "undefined") {

      try {

        const raw = localStorage.getItem(controlStorageKey);

        if (raw) {

          const parsed = JSON.parse(raw) as { controlState?: Record<string, boolean> } | null;

          if (parsed?.controlState && typeof parsed.controlState === "object") {

            const merged: Record<string, boolean> = { ...initialChoices };

            Object.entries(parsed.controlState).forEach(([id, value]) => {

              if (initialRoles[id]) merged[id] = Boolean(value);

            });

            nextChoices = merged;

          }

        }

      } catch {

        // ignore

      }

    }

    deferStateUpdate(() => {

      setControlState(nextChoices);

      setControlTextState({});

      setControlFileState({});

      setSubmitNotices([]);

    });

    controlStateLoadedRef.current = true;

    noticeTimersRef.current.forEach((id) => window.clearTimeout(id));

    noticeTimersRef.current.clear();

    choiceFocusRef.current = { parentId: null, rootId: null };

    const nextModes = doc.variableModes?.length ? doc.variableModes : ["Default"];

    deferStateUpdate(() => {

      setVariableMode(doc.variableMode ?? nextModes[0] ?? "Default");

      setVariableOverrides({});

    });

  }, [baseLaidOut, controlStorageKey, doc, previewMode]);



  useEffect(() => {

    if (!pageTransition) return;

    const duration = pageTransition.duration ?? TRANSITION_DURATION[pageTransition.type];

    if (duration === 0) {

      deferStateUpdate(() => {

        setBasePageId(pageTransition.toId);

        setPageTransition(null);

      });

      return;

    }

    const raf = window.requestAnimationFrame(() => {

      setPageTransition((prev) => (prev ? { ...prev, phase: "active" } : prev));

    });

    const timeout = window.setTimeout(() => {

      setBasePageId(pageTransition.toId);

      setPageTransition(null);

    }, duration);

    return () => {

      window.cancelAnimationFrame(raf);

      window.clearTimeout(timeout);

    };

  }, [pageTransition]);



  useEffect(() => {

    if (!overlayTransition) return;

    const duration = overlayTransition.duration ?? TRANSITION_DURATION[overlayTransition.type];

    if (duration === 0) {

      deferStateUpdate(() => {

        if (overlayTransition.mode === "exit") {

          setOverlayStack((prev) => {

            const index = prev.findLastIndex((entry) => entry.id === overlayTransition.overlayId);

            if (index === -1) return prev;

            return prev.filter((_, idx) => idx !== index);

          });

        }

        setOverlayTransition(null);

      });

      return;

    }

    const raf = window.requestAnimationFrame(() => {

      setOverlayTransition((prev) => (prev ? { ...prev, phase: "active" } : prev));

    });

    const timeout = window.setTimeout(() => {

      if (overlayTransition.mode === "exit") {

        setOverlayStack((prev) => {

          const index = prev.findLastIndex((entry) => entry.id === overlayTransition.overlayId);

          if (index === -1) return prev;

          return prev.filter((_, idx) => idx !== index);

        });

      }

      setOverlayTransition(null);

    }, duration);

    return () => {

      window.cancelAnimationFrame(raf);

      window.clearTimeout(timeout);

    };

  }, [overlayTransition]);



  const startPageTransition = useCallback(

    (fromId: string, toId: string, type: PrototypeTransitionType, options?: { duration?: number; easing?: string }) => {

      if (type === "instant") {

        setBasePageId(toId);

        return;

      }

      setPageTransition({
        type,
        fromId,
        toId,
        phase: "start",
        duration: options?.duration,
        easing: options?.easing,
        smartPlan: type === "smart" ? deriveSmartAnimatePlan(docRef.current, fromId, toId) : undefined,
      });

    },

    [],

  );



  const openOverlay = useCallback(

    (
      targetId: string,
      type: PrototypeTransitionType,
      options?: { duration?: number; easing?: string },
      presentation?: OverlayPresentation,
    ) => {

      if (!targetId) return;

      const entry: OverlayEntry = {
        id: `overlay_${Date.now()}_${Math.random().toString(16).slice(2)}`,
        pageId: targetId,
        presentation: presentation ?? normalizeOverlayPresentation(),
        smartPlan: type === "smart"
          ? deriveSmartAnimatePlan(docRef.current, basePageRef.current ?? targetId, targetId)
          : undefined,
      };

      setOverlayStack((prev) => [...prev, entry]);

      if (type !== "instant") {

        setOverlayTransition({

          type,

          overlayId: entry.id,

          presentation: entry.presentation,

          mode: "enter",

          phase: "start",

          duration: options?.duration,

          easing: options?.easing,

          smartPlan: entry.smartPlan,

        });

      }

    },

    [],

  );



  const closeOverlay = useCallback(

    (type: PrototypeTransitionType, options?: { duration?: number; easing?: string }) => {

      const stack = overlayRef.current;

      const top = stack[stack.length - 1];

      if (!top) return;

      if (type === "instant") {

        setOverlayStack((prev) => prev.slice(0, -1));

        return;

      }

      setOverlayTransition({
        type,
        overlayId: top.id,
        presentation: top.presentation,
        mode: "exit",
        phase: "start",
        duration: options?.duration,
        easing: options?.easing,
        smartPlan: top.smartPlan,
      });

    },

    [],

  );



  const closeOverlayDefault = useCallback(() => {

    closeOverlay(DEFAULT_OVERLAY_CLOSE);

  }, [closeOverlay]);



  const updateQueryParam = useCallback((key: string, value: string | number | null) => {

    if (typeof window === "undefined") return;

    const url = new URL(window.location.href);

    if (value === null || value === undefined || String(value).trim() === "") url.searchParams.delete(key);

    else url.searchParams.set(key, String(value));

    const next = `${url.pathname}${url.search}${url.hash}`;

    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;

    if (next !== current) window.history.replaceState(null, "", next);

  }, []);



  const dismissStickyCta = useCallback(() => {

    if (!basePageId) return;

    const until = Date.now() + STICKY_CTA_DISMISS_MS;

    setStickyDismissedUntil(until);

    if (typeof localStorage !== "undefined") {

      try {

        localStorage.setItem(`${STICKY_CTA_STORAGE_PREFIX}:${basePageId}`, String(until));

      } catch {

        // ignore

      }

    }

  }, [basePageId]);



  const dismissAppUpdate = useCallback(

    (modalId?: string | null) => {

      const until = Date.now() + APP_UPDATE_DISMISS_MS;

      setUpdateDismissedUntil(until);

      if (typeof localStorage !== "undefined") {

        try {

          localStorage.setItem(APP_UPDATE_STORAGE_KEY, String(until));

        } catch {

          // ignore

        }

      }

      if (modalId) {

        closeModal(modalId);

        return;

      }

      setModalStack((prev) => prev.filter((id) => !appUpdateModalIds.has(id)));

    },

    [appUpdateModalIds, closeModal],

  );



  const handleToggleControl = useCallback(

    (rootId: string) => {

      const currentDoc = docRef.current;

      const currentPageId = basePageRef.current;

      const scopeIds = resolveSubmitScopeIds(currentDoc, currentPageId, rootId);

      if (disabledChoiceIds.has(rootId)) return;

      const role = controlRootRoles.get(rootId);

      const label = role ? controlFields.get(rootId)?.label ?? resolveControlLabel(currentDoc as Doc, role, rootId) : "";

      const nodeName = currentDoc.nodes[rootId]?.name ?? "";

      const appUpdateModalId = appUpdateModalIds.size ? findAncestorIdInSet(currentDoc, rootId, appUpdateModalIds) : null;

      const isAppUpdateContext = Boolean(appUpdateModalId);

      const isAppUpdateDismiss = Boolean(isAppUpdateContext && label && matchesPattern(label, APP_UPDATE_LATER_PATTERN));

      const isContentDetailCtx = isContentDetailContext(currentDoc, currentPageId, rootId);

      const isCommentCtx = isCommentContext(currentDoc, currentPageId, rootId);

      const isUserCardCtx = isUserCardContext(currentDoc, currentPageId, rootId);

      const isTagCtx = isTagContext(currentDoc, currentPageId, rootId);

      const isBookmarkCtx = isBookmarkContext(currentDoc, currentPageId, rootId);

      const isRankingCtx = isRankingContext(currentDoc, currentPageId, rootId);

      const isChatListCtx = isChatListContext(currentDoc, currentPageId, rootId);

      const isChatListItem = Boolean(role?.type === "choice" && isListItemName(nodeName) && isChatListCtx);

      const isContentCardItem = Boolean(isContentCardName(nodeName) || isListItemName(nodeName));

      const isRelatedContentItem = Boolean(isContentCardItem && isContentDetailCtx);

      const isTagCardItem = Boolean(isContentCardItem && isTagCtx);

      const isRankingItem = Boolean(isContentCardItem && isRankingCtx);

      const isShareAction = Boolean(isContentDetailCtx && label && matchesPattern(label, SHARE_ACTION_PATTERN));

      const isSaveAction = Boolean((isContentDetailCtx || isBookmarkCtx) && label && matchesPattern(label, SAVE_ACTION_PATTERN));

      const isFollowAction = Boolean(isUserCardCtx && label && matchesPattern(label, FOLLOW_ACTION_PATTERN));

      const isCommentLoadMore = Boolean(isCommentCtx && label && matchesPattern(label, LOAD_MORE_PATTERN));

      const isTagFilterChoice = Boolean(isTagCtx && role?.type === "choice" && !isContentCardItem);

      const isBookmarkFilterChoice = Boolean(isBookmarkCtx && role?.type === "choice" && !isContentCardItem);

      const isRankingPeriodChoice = Boolean(isRankingCtx && label && matchesPattern(label, PERIOD_FILTER_PATTERN));

      const isAttachmentCtx = isAttachmentContext(currentDoc, currentPageId, rootId);

      const isMentionCtx = isMentionContext(currentDoc, currentPageId, rootId);

      const isGroupChannelCtx = isGroupChannelContext(currentDoc, currentPageId, rootId);

      const isCallCtx = isCallContext(currentDoc, currentPageId, rootId);

      const isTodoCtx = isTodoContext(currentDoc, currentPageId, rootId);

      const isCalendarCtx = isCalendarContext(currentDoc, currentPageId, rootId);

      const isNoteCtx = isNoteContext(currentDoc, currentPageId, rootId);

      const isMemberRoleCtx = isMemberRoleContext(currentDoc, currentPageId, rootId);

      const isApprovalCtx = isApprovalContext(currentDoc, currentPageId, rootId);

      const isKanbanCtx = isKanbanContext(currentDoc, currentPageId, rootId);

      const isGanttCtx = isGanttContext(currentDoc, currentPageId, rootId);

      const isMediaGalleryCtx = isMediaGalleryContext(currentDoc, currentPageId, rootId);

      const isLightboxCtx = isLightboxContext(currentDoc, currentPageId, rootId);

      const isMediaPlayerCtx = isMediaPlayerContext(currentDoc, currentPageId, rootId);

      const isStoryCtx = isStoryContext(currentDoc, currentPageId, rootId);

      const isKpiCtx = isKpiContext(currentDoc, currentPageId, rootId);

      const isChartCtx = isChartContext(currentDoc, currentPageId, rootId);

      const isTableCtx = isDataTableContext(currentDoc, currentPageId, rootId);

      const isUserAdminCtx = isUserAdminContext(currentDoc, currentPageId, rootId);

      const isAuditLogCtx = isAuditLogContext(currentDoc, currentPageId, rootId);

      const isBillingCtx = isBillingContext(currentDoc, currentPageId, rootId);

      const isSystemConsoleCtx = isSystemConsoleContext(currentDoc, currentPageId, rootId);

      const isDataTransferCtx = isDataTransferContext(currentDoc, currentPageId, rootId);

      const isMonitoringCtx = isMonitoringContext(currentDoc, currentPageId, rootId);

      const isPaymentResultCtx = isPaymentResultContext(currentDoc, currentPageId, rootId);

      const isCouponCtx = isCouponContext(currentDoc, currentPageId, rootId);

      const isBlankTemplateCtx = isBlankTemplateContext(currentDoc, currentPageId, rootId);

      const isLandingCtx = isLandingContext(currentDoc, currentPageId, rootId);

      const isDashboardCtx = isDashboardContext(currentDoc, currentPageId, rootId);

      const isCommunityCtx = isCommunityContext(currentDoc, currentPageId, rootId);

      const isServiceCtx = isServiceContext(currentDoc, currentPageId, rootId);

      const isMentionItem = Boolean(role?.type === "choice" && isListItemName(nodeName) && isMentionCtx);

      const isMentionFilterChoice = Boolean(isMentionCtx && role?.type === "choice" && !isListItemName(nodeName));

      const isAttachmentItem = Boolean(role?.type === "choice" && isListItemName(nodeName) && isAttachmentCtx);

      const isAttachmentDeleteAction = Boolean(isAttachmentCtx && label && matchesPattern(label, TODO_DELETE_PATTERN));

      const isEmojiAction = Boolean(isAttachmentCtx && label && matchesPattern(label, EMOJI_PATTERN));

      const isChannelItem = Boolean(role?.type === "choice" && isListItemName(nodeName) && isGroupChannelCtx && hasAncestorMatching(currentDoc, rootId, CHANNEL_LIST_PATTERN));

      const isMemberItem = Boolean(role?.type === "choice" && isListItemName(nodeName) && isGroupChannelCtx && hasAncestorMatching(currentDoc, rootId, MEMBER_LIST_PATTERN));

      const isCallMute = Boolean(isCallCtx && label && matchesPattern(label, CALL_MUTE_PATTERN));

      const isCallVideo = Boolean(isCallCtx && label && matchesPattern(label, CALL_VIDEO_PATTERN));

      const isCallEnd = Boolean(isCallCtx && (matchesPattern(label, CALL_END_PATTERN) || matchesPattern(nodeName, CALL_END_PATTERN)));

      const isTodoAdd = Boolean(isTodoCtx && label && matchesPattern(label, TODO_ADD_PATTERN));

      const isTodoDelete = Boolean(isTodoCtx && label && matchesPattern(label, TODO_DELETE_PATTERN));

      const isTodoFilterChoice = Boolean(isTodoCtx && role?.type === "choice" && !isListItemName(nodeName));

      const isCalendarViewChoice = Boolean(isCalendarCtx && label && matchesPattern(label, CALENDAR_VIEW_PATTERN));

      const isCalendarPrev = Boolean(isCalendarCtx && label && matchesPattern(label, CALENDAR_PREV_PATTERN));

      const isCalendarNext = Boolean(isCalendarCtx && label && matchesPattern(label, CALENDAR_NEXT_PATTERN));

      const isCalendarDateChoice = Boolean(isCalendarCtx && label && matchesPattern(label, CALENDAR_DATE_PATTERN));

      const isCalendarDelete = Boolean(isCalendarCtx && label && matchesPattern(label, TODO_DELETE_PATTERN));

      const isNoteBold = Boolean(isNoteCtx && label && matchesPattern(label, NOTE_BOLD_PATTERN));

      const isNoteItalic = Boolean(isNoteCtx && label && matchesPattern(label, NOTE_ITALIC_PATTERN));

      const isNoteUnderline = Boolean(isNoteCtx && label && matchesPattern(label, NOTE_UNDERLINE_PATTERN));

      const isNoteSave = Boolean(isNoteCtx && label && matchesPattern(label, SAVE_ACTION_PATTERN));

      const isNoteVersion = Boolean(isNoteCtx && label && matchesPattern(label, NOTE_VERSION_PATTERN));

      const isNoteSync = Boolean(isNoteCtx && label && matchesPattern(label, NOTE_SYNC_PATTERN));

      const isMemberRoleChoice = Boolean(isMemberRoleCtx && role?.type === "choice");

      const isMemberPermissionToggle = Boolean(isMemberRoleCtx && (role?.type === "toggle" || role?.type === "checkbox"));

      const isMemberRoleSave = Boolean(isMemberRoleCtx && label && matchesPattern(label, MEMBER_ROLE_SAVE_PATTERN));

      const isMemberRoleAudit = Boolean(isMemberRoleCtx && label && matchesPattern(label, MEMBER_ROLE_AUDIT_PATTERN));

      const isApprovalStep = Boolean(isApprovalCtx && role?.type === "choice" && (matchesPattern(label, APPROVAL_STEP_PATTERN) || isListItemName(nodeName)));

      const isApprovalApprove = Boolean(isApprovalCtx && label && matchesPattern(label, APPROVE_ACTION_PATTERN));

      const isApprovalReject = Boolean(isApprovalCtx && label && matchesPattern(label, REJECT_ACTION_PATTERN));

      const isApprovalNotify = Boolean(isApprovalCtx && label && matchesPattern(label, APPROVAL_NOTIFY_PATTERN));

      const isKanbanCard = Boolean(isKanbanCtx && role?.type === "choice" && isListItemName(nodeName));

      const isKanbanMove = Boolean(isKanbanCtx && label && matchesPattern(label, KANBAN_MOVE_PATTERN));

      const isKanbanAdd = Boolean(isKanbanCtx && label && matchesPattern(label, TODO_ADD_PATTERN));

      const isKanbanDelete = Boolean(isKanbanCtx && label && matchesPattern(label, TODO_DELETE_PATTERN));

      const isKanbanFilterChoice = Boolean(isKanbanCtx && role?.type === "choice" && !isListItemName(nodeName) && matchesPattern(label, FILTER_PATTERN));

      const isKanbanSortChoice = Boolean(isKanbanCtx && role?.type === "choice" && !isListItemName(nodeName) && matchesPattern(label, SORT_PATTERN));

      const isGanttZoomIn = Boolean(isGanttCtx && label && matchesPattern(label, GANTT_ZOOM_IN_PATTERN));

      const isGanttZoomOut = Boolean(isGanttCtx && label && matchesPattern(label, GANTT_ZOOM_OUT_PATTERN));

      const isGanttScroll = Boolean(isGanttCtx && label && matchesPattern(label, GANTT_SCROLL_PATTERN));

      const isMediaItem = Boolean(isMediaGalleryCtx && role?.type === "choice" && isListItemName(nodeName));

      const isMediaFilterChoice = Boolean(isMediaGalleryCtx && role?.type === "choice" && !isListItemName(nodeName) && matchesPattern(label, FILTER_PATTERN));

      const isMediaSortChoice = Boolean(isMediaGalleryCtx && role?.type === "choice" && !isListItemName(nodeName) && matchesPattern(label, SORT_PATTERN));

      const isLightboxClose = Boolean(isLightboxCtx && label && matchesPattern(label, LIGHTBOX_CLOSE_PATTERN));

      const isLightboxNext = Boolean(isLightboxCtx && label && matchesPattern(label, LIGHTBOX_NEXT_PATTERN));

      const isLightboxPrev = Boolean(isLightboxCtx && label && matchesPattern(label, LIGHTBOX_PREV_PATTERN));

      const isMediaPlay = Boolean(isMediaPlayerCtx && label && matchesPattern(label, MEDIA_PLAY_PATTERN));

      const isMediaPause = Boolean(isMediaPlayerCtx && label && matchesPattern(label, MEDIA_PAUSE_PATTERN));

      const isMediaSeekForward = Boolean(isMediaPlayerCtx && label && matchesPattern(label, MEDIA_SEEK_FORWARD_PATTERN));

      const isMediaSeekBack = Boolean(isMediaPlayerCtx && label && matchesPattern(label, MEDIA_SEEK_BACK_PATTERN));

      const isMediaVolumeUp = Boolean(isMediaPlayerCtx && label && matchesPattern(label, MEDIA_VOLUME_UP_PATTERN));

      const isMediaVolumeDown = Boolean(isMediaPlayerCtx && label && matchesPattern(label, MEDIA_VOLUME_DOWN_PATTERN));

      const isMediaMute = Boolean(isMediaPlayerCtx && label && matchesPattern(label, MEDIA_MUTE_PATTERN));

      const isStoryNext = Boolean(isStoryCtx && label && matchesPattern(label, STORY_NEXT_PATTERN));

      const isStoryPrev = Boolean(isStoryCtx && label && matchesPattern(label, STORY_PREV_PATTERN));

      const isStoryPlay = Boolean(isStoryCtx && label && matchesPattern(label, STORY_PLAY_PATTERN));

      const isStoryPause = Boolean(isStoryCtx && label && matchesPattern(label, STORY_PAUSE_PATTERN));

      const isKpiPeriodChoice = Boolean(isKpiCtx && label && matchesPattern(label, PERIOD_FILTER_PATTERN));

      const isChartPeriodChoice = Boolean(isChartCtx && label && matchesPattern(label, PERIOD_FILTER_PATTERN));

      const isChartFilterChoice = Boolean(isChartCtx && label && matchesPattern(label, FILTER_PATTERN));

      const isChartSortChoice = Boolean(isChartCtx && label && matchesPattern(label, SORT_PATTERN));

      const isTableSortChoice = Boolean(isTableCtx && label && matchesPattern(label, SORT_PATTERN));

      const isTablePaginationChoice = Boolean(

        isTableCtx && label && hasAncestorMatching(currentDoc, rootId, PAGINATION_PATTERN) && parseNumericLabel(label) != null,

      );

      const isTableRowToggle = Boolean(isTableCtx && (role?.type === "toggle" || role?.type === "checkbox") && isListItemName(nodeName));

      const isTableAction = Boolean(isTableCtx && label && (matchesPattern(label, SAVE_ACTION_PATTERN) || matchesPattern(label, TODO_DELETE_PATTERN)));

      const isUserAdminItem = Boolean(isUserAdminCtx && role?.type === "choice" && isListItemName(nodeName));

      const isUserFilterChoice = Boolean(isUserAdminCtx && role?.type === "choice" && !isListItemName(nodeName));

      const isUserStatusChoice = Boolean(

        isUserAdminCtx && label && (matchesPattern(label, USER_STATUS_ACTIVE_PATTERN) || matchesPattern(label, USER_STATUS_INACTIVE_PATTERN) || matchesPattern(label, USER_STATUS_SUSPENDED_PATTERN)),

      );

      const isAuditFilterChoice = Boolean(isAuditLogCtx && role?.type === "choice" && !isListItemName(nodeName));

      const isAuditExport = Boolean(isAuditLogCtx && label && matchesPattern(label, AUDIT_EXPORT_PATTERN));

      const isBillingPlanChoice = Boolean(isBillingCtx && role?.type === "choice" && label && matchesPattern(label, PLAN_LABEL_PATTERN));

      const isBillingInvoice = Boolean(isBillingCtx && label && matchesPattern(label, INVOICE_ACTION_PATTERN));

      const isConsoleLevelChoice = Boolean(isSystemConsoleCtx && role?.type === "choice" && label && matchesPattern(label, CONSOLE_LEVEL_PATTERN));

      const isConsoleAutoScrollToggle = Boolean(isSystemConsoleCtx && (role?.type === "toggle" || role?.type === "checkbox") && matchesPattern(label, AUTO_SCROLL_PATTERN));

      const isDataMap = Boolean(isDataTransferCtx && label && matchesPattern(label, DATA_MAPPING_PATTERN));

      const isDataValidate = Boolean(isDataTransferCtx && label && matchesPattern(label, DATA_VALIDATE_PATTERN));

      const isDataProgress = Boolean(isDataTransferCtx && label && matchesPattern(label, DATA_PROGRESS_PATTERN));

      const isMonitoringItem = Boolean(isMonitoringCtx && role?.type === "choice" && isListItemName(nodeName));

      const isSkeletonToggle = Boolean(matchesPattern(label, LOADING_PATTERN) && (role?.type === "toggle" || role?.type === "checkbox"));

      const isFormWizardNext = Boolean(isFormWizardContext(currentDoc, currentPageId, rootId) && label && matchesPattern(label, FORM_NEXT_PATTERN));

      const isFormWizardPrev = Boolean(isFormWizardContext(currentDoc, currentPageId, rootId) && label && matchesPattern(label, FORM_PREV_PATTERN));

      const isAddressSearch = Boolean(isAddressContext(currentDoc, currentPageId, rootId) && label && matchesPattern(label, ADDRESS_SEARCH_PATTERN));

      const isAddressResultItem = Boolean(isAddressContext(currentDoc, currentPageId, rootId) && role?.type === "choice" && isListItemName(nodeName));

      const isCartQtyPlus = Boolean(isCartContext(currentDoc, currentPageId, rootId) && label && matchesPattern(label, CART_QTY_PLUS_PATTERN));

      const isCartQtyMinus = Boolean(isCartContext(currentDoc, currentPageId, rootId) && label && matchesPattern(label, CART_QTY_MINUS_PATTERN));

      const isPaymentMethodItem = Boolean(isPaymentMethodContext(currentDoc, currentPageId, rootId) && role?.type === "choice" && isListItemName(nodeName));

      const isPaymentAdd = Boolean(isPaymentMethodContext(currentDoc, currentPageId, rootId) && label && matchesPattern(label, PAYMENT_ADD_PATTERN));

      const isPaymentDelete = Boolean(isPaymentMethodContext(currentDoc, currentPageId, rootId) && label && matchesPattern(label, PAYMENT_DELETE_PATTERN));

      const isPaymentDefault = Boolean(isPaymentMethodContext(currentDoc, currentPageId, rootId) && label && matchesPattern(label, PAYMENT_DEFAULT_PATTERN));

      const isPaymentSelect = Boolean(isPaymentMethodContext(currentDoc, currentPageId, rootId) && label && matchesPattern(label, PAYMENT_SELECT_PATTERN));

      const isErrorLogAction = Boolean(isErrorPageContext(currentDoc, currentPageId, rootId) && label && matchesPattern(label, ERROR_LOG_PATTERN));

      const isPriceCompareAction = Boolean(label && matchesPattern(label, PRICE_COMPARE_PATTERN));

      const isPaymentRetry = Boolean(isPaymentResultCtx && label && matchesPattern(label, PAYMENT_RETRY_PATTERN));

      const isPaymentReceipt = Boolean(isPaymentResultCtx && label && matchesPattern(label, PAYMENT_RECEIPT_PATTERN));

      const isPaymentHistory = Boolean(isPaymentResultCtx && label && matchesPattern(label, PAYMENT_HISTORY_PATTERN));

      const isCouponApply = Boolean(isCouponCtx && label && matchesPattern(label, COUPON_APPLY_PATTERN));

      const isBlankGridToggle = Boolean(isBlankTemplateCtx && label && matchesPattern(label, GRID_GUIDE_PATTERN));

      const isBlankInit = Boolean(isBlankTemplateCtx && label && matchesPattern(label, BLANK_INIT_PATTERN));

      const isLandingAnchor = Boolean(isLandingCtx && label && (matchesPattern(label, ANCHOR_PATTERN) || matchesPattern(nodeName, ANCHOR_PATTERN)));

      const isDashboardFilter = Boolean(isDashboardCtx && label && matchesPattern(label, FILTER_PATTERN));

      const isDashboardSort = Boolean(isDashboardCtx && label && matchesPattern(label, SORT_PATTERN));

      const isDashboardSave = Boolean(isDashboardCtx && label && matchesPattern(label, LAYOUT_SAVE_PATTERN));

      const isCommunityWrite = Boolean(isCommunityCtx && label && matchesPattern(label, WRITE_ACTION_PATTERN));

      const isCommunityRecommend = Boolean(isCommunityCtx && label && matchesPattern(label, RECOMMEND_PATTERN));

      const isServiceContact = Boolean(isServiceCtx && label && matchesPattern(label, CONTACT_FORM_PATTERN));

      const isServiceStep = Boolean(isServiceCtx && label && matchesPattern(label, STEP_PROGRESS_PATTERN));

      const isNotificationContext = Boolean(role?.type === "choice" && hasAncestorMatching(currentDoc, rootId, NOTIFICATION_SECTION_PATTERN));

      const isNotificationItem = Boolean(

        role?.type === "choice" && isListItemName(nodeName) && hasAncestorMatching(currentDoc, rootId, NOTIFICATION_SECTION_PATTERN),

      );

      const isContentFeedItem = Boolean(

        role?.type === "choice" && isListItemName(nodeName) && hasAncestorMatching(currentDoc, rootId, CONTENT_FEED_PATTERN),

      );

      const isBreadcrumbItem = Boolean(role?.type === "choice" && hasAncestorMatching(currentDoc, rootId, BREADCRUMB_SECTION_PATTERN));

      const isSectionHeaderItem = Boolean(role?.type === "choice" && hasAncestorMatching(currentDoc, rootId, SECTION_HEADER_PATTERN));

      const isSelectTabItem = Boolean(role?.type === "choice" && hasAncestorMatching(currentDoc, rootId, SELECT_TABS_PATTERN));

      const isDateSliderItem = Boolean(role?.type === "choice" && hasAncestorMatching(currentDoc, rootId, DATE_SLIDER_PATTERN));

      const isLocaleItem = Boolean(role?.type === "choice" && hasAncestorMatching(currentDoc, rootId, LOCALE_SECTION_PATTERN));

      const isThemeItem = Boolean(role?.type === "choice" && hasAncestorMatching(currentDoc, rootId, THEME_SECTION_PATTERN));

      const isModalContext = hasAncestorMatching(currentDoc, rootId, MODAL_SECTION_PATTERN);

      const isModalOpenTrigger = matchesPattern(label, MODAL_OPEN_PATTERN) || matchesPattern(nodeName, MODAL_OPEN_PATTERN);

      const isModalCloseTrigger = matchesPattern(label, MODAL_CLOSE_PATTERN) || matchesPattern(nodeName, MODAL_CLOSE_PATTERN);

      const isModalOverlay = matchesPattern(label, MODAL_OVERLAY_PATTERN) || matchesPattern(nodeName, MODAL_OVERLAY_PATTERN);

      const isStickyCtaItem = hasAncestorMatching(currentDoc, rootId, STICKY_CTA_PATTERN);

      const isStickyClose = Boolean(

        isStickyCtaItem && (matchesPattern(label, MODAL_CLOSE_PATTERN) || matchesPattern(nodeName, MODAL_CLOSE_PATTERN)),

      );

      const isSkipLink = matchesPattern(label, SKIP_PATTERN) || matchesPattern(nodeName, SKIP_PATTERN);

      const isNotificationMatrixContext = hasAncestorMatching(currentDoc, rootId, NOTIFICATION_MATRIX_PATTERN);

      const isNotificationMatrixSave = Boolean(isNotificationMatrixContext && matchesPattern(label, NOTIFICATION_SAVE_PATTERN));

      const cookieBannerId = (() => {

        if (!cookieBannerIds.size) return null;

        let current: Node | undefined | null = currentDoc.nodes[rootId];

        while (current) {

          if (cookieBannerIds.has(current.id)) return current.id;

          current = current.parentId ? currentDoc.nodes[current.parentId] : null;

        }

        return null;

      })();

      const isCookieSettingsLink = Boolean(

        cookieBannerId && (matchesPattern(label, COOKIE_SETTINGS_PATTERN) || matchesPattern(nodeName, COOKIE_SETTINGS_PATTERN)),

      );

      const isSecurityToggle = Boolean(

        role && (role.type === "toggle" || role.type === "checkbox") && isSecurityContext(currentDoc, currentPageId, rootId),

      );

      const isFaqItem = Boolean(role?.type === "choice" && isListItemName(nodeName) && hasAncestorMatching(currentDoc, rootId, FAQ_SECTION_PATTERN));

      const isSecurityItem = Boolean(role?.type === "choice" && isListItemName(nodeName) && hasAncestorMatching(currentDoc, rootId, SECURITY_SECTION_PATTERN));

      const isSettingsLink = Boolean(role?.type === "choice" && hasAncestorMatching(currentDoc, rootId, SETTINGS_SECTION_PATTERN));

      const isHeaderNavItem = Boolean(role?.type === "choice" && isHeaderNavContext(currentDoc, rootId));

      const isTabbarItem = Boolean(role?.type === "choice" && isTabbarContext(currentDoc, rootId));

      const isSidebarItem = Boolean(role?.type === "choice" && isSidebarContext(currentDoc, rootId));

      const isSidebarToggle = Boolean(isSidebarItem && (matchesPattern(label, SIDEBAR_TOGGLE_PATTERN) || matchesPattern(nodeName, SIDEBAR_TOGGLE_PATTERN)));

      const isSidebarBrand = Boolean(isSidebarItem && (matchesPattern(label, SIDEBAR_BRAND_PATTERN) || matchesPattern(nodeName, SIDEBAR_BRAND_PATTERN)));

      const isNavItem = Boolean(isHeaderNavItem || isTabbarItem || isSidebarItem);

      const isSearchSuggestion =

        Boolean(role?.type === "choice") &&

        hasAncestorMatching(currentDoc, rootId, SEARCH_CONTEXT_PATTERN) &&

        hasAncestorMatching(currentDoc, rootId, SEARCH_SECTION_PATTERN);

      const searchResultPageId = isSearchSuggestion ? findSearchResultPageId(currentDoc) : null;

      const navTargetPageId = isNavItem && label ? findPageIdByLabel(currentDoc, label, currentPageId) : null;

      const hasNavigateInteraction = Boolean(

        currentDoc.nodes[rootId]?.prototype?.interactions?.some((interaction) => interaction.trigger === "click" && interaction.action.type === "navigate"),

      );

      if (role?.type === "choice") {

        choiceFocusRef.current = { parentId: currentDoc.nodes[rootId]?.parentId ?? null, rootId };

      }

      setControlState((prev) => {

        const meta = controlFields.get(rootId);

        let nextValue = !prev[rootId];

        if (isNotificationContext && nextValue === false) nextValue = true;

        if (isChatListItem && nextValue === false) nextValue = true;

        if (isMentionItem && nextValue === false) nextValue = true;

        if (meta?.key === "targetPlan") {

          const next = { ...prev };

          controlFields.forEach((field, id) => {

            if (field.key === "targetPlan") next[id] = false;

          });

          next[rootId] = nextValue;

          return next;

        }

        if (meta?.label && isAllConsentLabel(meta.label)) {

          const next = { ...prev };

          controlFields.forEach((field, id) => {

            if (!scopeIds.has(id)) return;

            if (field.key === "terms" || CONSENT_LABEL_PATTERN.test(field.label)) {

              next[id] = nextValue;

            }

          });

          next[rootId] = nextValue;

          return next;

        }

        if (isChannelItem) {

          const next = { ...prev };

          const parentId = currentDoc.nodes[rootId]?.parentId ?? null;

          if (parentId) {

            controlRootRoles.forEach((rootRole, id) => {

              if (rootRole.type !== "choice") return;

              if (currentDoc.nodes[id]?.parentId === parentId) next[id] = false;

            });

          }

          next[rootId] = nextValue;

          return next;

        }

        const next = { ...prev };

        if (role?.type === "choice") {

          const parentId = currentDoc.nodes[rootId]?.parentId ?? null;

          const parentName = parentId ? (currentDoc.nodes[parentId]?.name ?? "") : "";

          if (parentId && isPaginationGroupName(parentName)) {

            const label = resolveControlLabel(currentDoc, role, rootId);

            const siblings = Array.from(controlRootRoles.entries())

              .filter(([id, rootRole]) => rootRole.type === "choice" && currentDoc.nodes[id]?.parentId === parentId);

            const pages: Array<{ id: string; num: number }> = [];

            let prevId: string | undefined;

            let nextId: string | undefined;

            siblings.forEach(([id, rootRole]) => {

              const siblingLabel = resolveControlLabel(currentDoc, rootRole, id);

              if (isPrevLabel(siblingLabel)) prevId = id;

              else if (isNextLabel(siblingLabel)) nextId = id;

              else {

                const num = parseNumericLabel(siblingLabel);

                if (num != null) pages.push({ id, num });

              }

            });

            pages.sort((a, b) => a.num - b.num);

            if (pages.length) {

              const activeIndex = pages.findIndex((page) => Boolean(prev[page.id]));

              const index = activeIndex >= 0 ? activeIndex : 0;

              if (isPrevLabel(label) || isNextLabel(label)) {

                const targetIndex = isPrevLabel(label) ? index - 1 : index + 1;

                if (targetIndex < 0 || targetIndex >= pages.length) return prev;

                const targetId = pages[targetIndex]?.id;

                if (!targetId) return prev;

                pages.forEach((page) => {

                  next[page.id] = false;

                });

                if (prevId) next[prevId] = false;

                if (nextId) next[nextId] = false;

                next[targetId] = true;

                return next;

              }

            }

          }

          const exclusive = isExclusiveChoiceGroupName(parentName.toLowerCase());

          if (exclusive) {

            controlRootRoles.forEach((rootRole, id) => {

              if (rootRole.type !== "choice") return;

              if (currentDoc.nodes[id]?.parentId === parentId) next[id] = false;

            });

          }

          if (isLocaleItem || isThemeItem) {

            const sectionPattern = isLocaleItem ? LOCALE_SECTION_PATTERN : THEME_SECTION_PATTERN;

            controlRootRoles.forEach((rootRole, id) => {

              if (rootRole.type !== "choice") return;

              if (id === rootId) return;

              if (!hasAncestorMatching(currentDoc, id, sectionPattern)) return;

              next[id] = false;

            });

          }

          next[rootId] = nextValue;

        } else {

          next[rootId] = nextValue;

        }



        if (meta?.label && !isAllConsentLabel(meta.label) && (meta.key === "terms" || CONSENT_LABEL_PATTERN.test(meta.label))) {

          const consentIds = Array.from(controlFields.entries())

            .filter(([id, field]) => scopeIds.has(id) && (field.key === "terms" || CONSENT_LABEL_PATTERN.test(field.label)))

            .map(([id]) => id);

          const allConsentId = Array.from(controlFields.entries()).find(([id, field]) => scopeIds.has(id) && isAllConsentLabel(field.label))?.[0];

          if (allConsentId) {

            const allOn = consentIds.length > 0 && consentIds.every((id) => Boolean(next[id]));

            next[allConsentId] = allOn;

          }

        }



        return next;

      });

      if (isSecurityToggle) {

        pushNotice({ type: "info", message: "Security settings updated." });

      }

      if (isNotificationMatrixSave) {

        pushNotice({ type: "success", message: "Notification settings saved." });

      }



      if (isShareAction) {

        const keys = ["content_share_count", "shareCount", "shares", "contentShareCount"];

        let nextValue: number | null = null;

        for (const key of keys) {

          const raw = variableOverrides[key];

          const num = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() !== "" && !Number.isNaN(Number(raw)) ? Number(raw) : null;

          if (num !== null) {

            nextValue = num + 1;

            applyVariableOverrides({ [key]: nextValue });

            break;

          }

        }

        if (nextValue === null) {

          applyVariableOverrides({ content_share_count: 1 });

        }

        pushNotice({ type: "success", message: "Shared." });

      }

      if (isSaveAction) {

        const saved = Boolean(variableOverrides.saved ?? variableOverrides.bookmarked ?? variableOverrides.favorite);

        applyVariableOverrides({ saved: !saved, bookmarked: !saved, favorite: !saved });

        pushNotice({ type: "success", message: !saved ? "Saved." : "Removed." });

      }

      if (isFollowAction) {

        const following = Boolean(variableOverrides.following ?? variableOverrides.isFollowing ?? controlState[rootId]);

        applyVariableOverrides({ following: !following, isFollowing: !following });

        pushNotice({ type: "success", message: !following ? "Followed." : "Unfollowed." });

      }

      if (isCommentLoadMore) {

        const resolveNumber = (value: unknown) => {

          if (typeof value === "number" && Number.isFinite(value)) return value;

          if (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value))) return Number(value);

          return null;

        };

        const currentPage = resolveNumber(variableOverrides.commentPage) ?? resolveNumber(variableOverrides.comment_page) ?? 1;

        const nextPage = currentPage + 1;

        applyVariableOverrides({ commentPage: nextPage, comment_page: nextPage });

      }

      if (isTagFilterChoice && label && !matchesPattern(label, ALL_FILTER_PATTERN)) {

        applyVariableOverrides({ tag: label, selectedTag: label, tagFilter: label, tag_filter: label });

      }

      if (isBookmarkFilterChoice && label && !matchesPattern(label, ALL_FILTER_PATTERN)) {

        applyVariableOverrides({ bookmarkFilter: label, bookmark_filter: label, bookmarkFolder: label, bookmark_folder: label });

      }

      if (isRankingPeriodChoice && label) {

        applyVariableOverrides({ rankingPeriod: label, ranking_period: label });

      }



      if (isMentionFilterChoice && label) {

        if (matchesPattern(label, ALL_FILTER_PATTERN)) {

          applyVariableOverrides({ mentionFilter: "all", mention_filter: "all" });

        } else if (matchesPattern(label, MENTION_FILTER_UNREAD_PATTERN)) {

          applyVariableOverrides({ mentionFilter: "unread", mention_filter: "unread" });

        } else if (matchesPattern(label, NOTIFICATION_FILTER_READ_PATTERN)) {

          applyVariableOverrides({ mentionFilter: "read", mention_filter: "read" });

        }

      }

      if (isMentionItem) {

        const text = collectTextContent(currentDoc, rootId) || label;

        if (text) applyVariableOverrides({ mentionRead: text, mention_read: text });

      }

      if (isAttachmentItem) {

        const text = collectTextContent(currentDoc, rootId) || label;

        if (text) applyVariableOverrides({ attachmentPreview: text, attachment_preview: text });

      }

      if (isAttachmentDeleteAction) {

        const targetId = findAncestorIdMatching(currentDoc, rootId, LIST_ITEM_PATTERN) ?? rootId;

        setHiddenNodeIds((prev) => {

          const next = new Set(prev);

          collectDescendants(currentDoc, targetId).forEach((id) => next.add(id));

          return next;

        });

        const text = collectTextContent(currentDoc, targetId) || label;

        if (text) {

          const raw = (typeof variableOverrides.attachment_removed === "string" && variableOverrides.attachment_removed) || "";

          const items = raw ? parseStringList(raw, /[,|;]/) : [];

          items.push(text);

          applyVariableOverrides({ attachment_removed: items.join(", ") });

        }

      }

      if (isEmojiAction) {

        const open = Boolean(variableOverrides.emojiPickerOpen ?? variableOverrides.emoji_open);

        applyVariableOverrides({ emojiPickerOpen: !open, emoji_open: !open });

      }

      if (isChannelItem && label) {

        applyVariableOverrides({ activeChannel: label, active_channel: label });

      }

      if (isMemberItem && label) {

        applyVariableOverrides({ activeMember: label, active_member: label });

      }

      if (isCallMute) {

        const muted = Boolean(variableOverrides.callMuted ?? variableOverrides.muted);

        applyVariableOverrides({ callMuted: !muted, muted: !muted });

      }

      if (isCallVideo) {

        const videoOn = Boolean(variableOverrides.callVideo ?? variableOverrides.video); 

        applyVariableOverrides({ callVideo: !videoOn, video: !videoOn });

      }

      if (isCallEnd) {

        applyVariableOverrides({ callStatus: "ended", call_status: "ended", callActive: false, call_active: false });

        pushNotice({ type: "success", message: "Call ended." });

        const modalRootId = findAncestorIdMatching(currentDoc, rootId, MODAL_SECTION_PATTERN);

        if (modalRootId) closeModal(modalRootId);

      }

      if (isTodoAdd) {

        const existingRaw =

          (typeof variableOverrides.todo_items === "string" && variableOverrides.todo_items) ||

          (typeof variableOverrides.todoItems === "string" && variableOverrides.todoItems) ||

          "";

        const items = existingRaw ? parseStringList(existingRaw, /[,|;]/) : [];

        let nextLabel: string | null = null;

        controlRootRoles.forEach((role, id) => {

          if (nextLabel) return;

          if (role.type !== "input") return;

          if (!hasAncestorMatching(currentDoc, id, TODO_SECTION_PATTERN)) return;

          const value = (controlTextState[id] ?? "").trim();

          if (value) nextLabel = value;

        });

        if (!nextLabel) nextLabel = "New item";

        items.push(nextLabel);

        applyVariableOverrides({ todo_items: items.join(", "), todoItems: items.join(", ") });

        setControlTextState((prev) => {

          const next = { ...prev };

          controlRootRoles.forEach((role, id) => {

            if (role.type !== "input") return;

            if (!hasAncestorMatching(currentDoc, id, TODO_SECTION_PATTERN)) return;

            next[id] = "";

          });

          return next;

        });

      }

      if (isTodoDelete) {

        const targetId = findAncestorIdMatching(currentDoc, rootId, LIST_ITEM_PATTERN) ?? rootId;

        setHiddenNodeIds((prev) => {

          const next = new Set(prev);

          collectDescendants(currentDoc, targetId).forEach((id) => next.add(id));

          return next;

        });

        const text = collectTextContent(currentDoc, targetId) || label;

        if (text) {

          const raw =

            (typeof variableOverrides.todo_items === "string" && variableOverrides.todo_items) ||

            (typeof variableOverrides.todoItems === "string" && variableOverrides.todoItems) ||

            "";

          const items = raw ? parseStringList(raw, /[,|;]/) : [];

          const targetKey = normalizeLooseLabel(text);

          const nextItems = items.filter((item) => normalizeLooseLabel(item) !== targetKey);

          applyVariableOverrides({ todo_items: nextItems.join(", "), todoItems: nextItems.join(", ") });

        }

      }

      if (isTodoFilterChoice && label) {

        if (matchesPattern(label, ALL_FILTER_PATTERN)) {

          applyVariableOverrides({ todoFilter: "all", todo_filter: "all" });

        } else if (matchesPattern(label, TODO_FILTER_DONE_PATTERN)) {

          applyVariableOverrides({ todoFilter: "done", todo_filter: "done" });

        } else if (matchesPattern(label, TODO_FILTER_PENDING_PATTERN)) {

          applyVariableOverrides({ todoFilter: "pending", todo_filter: "pending" });

        }

      }

      if (isCalendarViewChoice && label) {

        applyVariableOverrides({ calendarView: label, calendar_view: label });

      }

      if (isCalendarPrev || isCalendarNext) {

        const currentOffset = typeof variableOverrides.calendarOffset === "number"

          ? variableOverrides.calendarOffset

          : Number(variableOverrides.calendarOffset ?? variableOverrides.calendar_offset) || 0;

        const nextOffset = currentOffset + (isCalendarNext ? 1 : -1);

        applyVariableOverrides({ calendarOffset: nextOffset, calendar_offset: nextOffset });

      }

      if (isCalendarDateChoice && label) {

        applyVariableOverrides({ selectedDate: label, selected_date: label, date: label });

      }

      if (isCalendarDelete) {

        const targetId = findAncestorIdMatching(currentDoc, rootId, LIST_ITEM_PATTERN) ?? rootId;

        const text = collectTextContent(currentDoc, targetId) || label;

        if (text) {

          const raw = (typeof variableOverrides.calendar_events === "string" && variableOverrides.calendar_events) || "";

          const items = raw ? parseStringList(raw, /[,|;]/) : [];

          const targetKey = normalizeLooseLabel(text);

          const nextItems = items.filter((item) => normalizeLooseLabel(item) !== targetKey);

          applyVariableOverrides({ calendar_events: nextItems.join(", ") });

        }

      }

      if (isNoteBold) {

        const nextValue = !Boolean(variableOverrides.noteBold ?? variableOverrides.note_bold);

        applyVariableOverrides({ noteBold: nextValue, note_bold: nextValue });

      }

      if (isNoteItalic) {

        const nextValue = !Boolean(variableOverrides.noteItalic ?? variableOverrides.note_italic);

        applyVariableOverrides({ noteItalic: nextValue, note_italic: nextValue });

      }

      if (isNoteUnderline) {

        const nextValue = !Boolean(variableOverrides.noteUnderline ?? variableOverrides.note_underline);

        applyVariableOverrides({ noteUnderline: nextValue, note_underline: nextValue });

      }

      if (isNoteSave) {

        let titleValue: string | null = null;

        let bodyValue: string | null = null;

        controlRootRoles.forEach((role, id) => {

          if (role.type !== "input") return;

          if (!hasAncestorMatching(currentDoc, id, NOTE_SECTION_PATTERN)) return;

          const value = (controlTextState[id] ?? "").trim();

          if (!value) return;

          const key = controlFields.get(id)?.key ?? "";

          if (!titleValue && /title/i.test(key)) titleValue = value;

          else if (!bodyValue) bodyValue = value;

        });

        if (titleValue) applyVariableOverrides({ note_title: titleValue, noteTitle: titleValue });

        if (bodyValue) applyVariableOverrides({ note_content: bodyValue, noteContent: bodyValue });

        const currentVersion =

          typeof variableOverrides.note_version === "number"

            ? variableOverrides.note_version

            : Number(variableOverrides.note_version ?? variableOverrides.noteVersion) || 0;

        const nextVersion = currentVersion + 1;

        applyVariableOverrides({ note_version: nextVersion, noteVersion: nextVersion, noteSavedAt: new Date().toISOString() });

        pushNotice({ type: "success", message: "Note saved." });

      }

      if (isNoteVersion && label) {

        applyVariableOverrides({ noteVersion: label, note_version: label });

      }

      if (isNoteSync) {

        applyVariableOverrides({ noteSynced: true, note_synced: true, noteSyncAt: new Date().toISOString() });

        pushNotice({ type: "success", message: "Note synced." });

      }

      if (isMemberRoleChoice && label) {

        applyVariableOverrides({ memberRole: label, member_role: label, role: label });

      }

      if (isMemberPermissionToggle && label) {

        const nextValue = !Boolean(controlState[rootId]);

        const raw =

          (typeof variableOverrides.member_permissions === "string" && variableOverrides.member_permissions) ||

          (typeof variableOverrides.memberPermissions === "string" && variableOverrides.memberPermissions) ||

          "";

        const items = raw ? parseStringList(raw, /[,|;]/) : [];

        const key = normalizeLooseLabel(label);

        const nextItems = nextValue

          ? Array.from(new Set([...items, label]))

          : items.filter((item) => normalizeLooseLabel(item) !== key);

        applyVariableOverrides({

          member_permissions: nextItems.join(", "),

          memberPermissions: nextItems.join(", "),

          memberPermission: label,

          member_permission: label,

        });

      }

      if (isMemberRoleSave) {

        applyVariableOverrides({ memberRoleSavedAt: new Date().toISOString(), member_role_saved: true });

        pushNotice({ type: "success", message: "Member roles saved." });

      }

      if (isMemberRoleAudit) {

        applyVariableOverrides({ memberAuditUpdatedAt: new Date().toISOString(), member_audit: true });

        pushNotice({ type: "success", message: "Audit log updated." });

      }

      if (isApprovalStep && label) {

        applyVariableOverrides({ approvalStep: label, approval_step: label });

      }

      if (isApprovalApprove) {

        applyVariableOverrides({ approvalStatus: "approved", approval_status: "approved" });

        pushNotice({ type: "success", message: "Approved." });

      }

      if (isApprovalReject) {

        applyVariableOverrides({ approvalStatus: "rejected", approval_status: "rejected" });

        pushNotice({ type: "error", message: "Rejected." });

      }

      if (isApprovalNotify) {

        applyVariableOverrides({ approvalNotified: true, approval_notified: true });

        pushNotice({ type: "success", message: "Notification sent." });

      }

      if (isKanbanAdd) {

        const existingRaw =

          (typeof variableOverrides.kanban_cards === "string" && variableOverrides.kanban_cards) ||

          (typeof variableOverrides.kanbanCards === "string" && variableOverrides.kanbanCards) ||

          "";

        const items = existingRaw ? parseStringList(existingRaw, /[,|;]/) : [];

        let nextLabel: string | null = null;

        controlRootRoles.forEach((role, id) => {

          if (nextLabel) return;

          if (role.type !== "input") return;

          if (!hasAncestorMatching(currentDoc, id, KANBAN_SECTION_PATTERN)) return;

          const value = (controlTextState[id] ?? "").trim();

          if (value) nextLabel = value;

        });

        if (!nextLabel) nextLabel = "New card";

        items.push(nextLabel);

        applyVariableOverrides({ kanban_cards: items.join(", "), kanbanCards: items.join(", ") });

        setControlTextState((prev) => {

          const next = { ...prev };

          controlRootRoles.forEach((role, id) => {

            if (role.type !== "input") return;

            if (!hasAncestorMatching(currentDoc, id, KANBAN_SECTION_PATTERN)) return;

            next[id] = "";

          });

          return next;

        });

      }

      if (isKanbanDelete) {

        const targetId = findAncestorIdMatching(currentDoc, rootId, LIST_ITEM_PATTERN) ?? rootId;

        setHiddenNodeIds((prev) => {

          const next = new Set(prev);

          collectDescendants(currentDoc, targetId).forEach((id) => next.add(id));

          return next;

        });

        const text = collectTextContent(currentDoc, targetId) || label;

        if (text) {

          const raw =

            (typeof variableOverrides.kanban_cards === "string" && variableOverrides.kanban_cards) ||

            (typeof variableOverrides.kanbanCards === "string" && variableOverrides.kanbanCards) ||

            "";

          const items = raw ? parseStringList(raw, /[,|;]/) : [];

          const targetKey = normalizeLooseLabel(text);

          const nextItems = items.filter((item) => normalizeLooseLabel(item) !== targetKey);

          applyVariableOverrides({ kanban_cards: nextItems.join(", "), kanbanCards: nextItems.join(", ") });

        }

      }

      if (isKanbanFilterChoice && label) {

        applyVariableOverrides({ kanbanFilter: label, kanban_filter: label });

      }

      if (isKanbanSortChoice && label) {

        applyVariableOverrides({ kanbanSort: label, kanban_sort: label });

      }

      if (isKanbanCard || isKanbanMove) {

        const targetId = isKanbanCard ? rootId : findAncestorIdMatching(currentDoc, rootId, LIST_ITEM_PATTERN) ?? rootId;

        const text = collectTextContent(currentDoc, targetId) || label;

        if (text) {

          applyVariableOverrides({ kanbanActiveCard: text, kanban_active_card: text });

          const columnsRaw =

            (typeof variableOverrides.kanban_columns === "string" && variableOverrides.kanban_columns) ||

            (typeof variableOverrides.kanbanColumns === "string" && variableOverrides.kanbanColumns) ||

            (typeof variableOverrides.columns === "string" && variableOverrides.columns) ||

            "";

          const columns = columnsRaw ? parseStringList(columnsRaw, /[,|;]/) : [];

          if (columns.length) {

            const cardKey = normalizeLooseLabel(text);

            const cardStatusKey = cardKey ? `kanban_${cardKey}_status` : null;

            const currentStatus =

              (cardStatusKey && typeof variableOverrides[cardStatusKey] === "string" && String(variableOverrides[cardStatusKey])) ||

              (typeof variableOverrides.kanban_status === "string" && variableOverrides.kanban_status) ||

              (typeof variableOverrides.kanbanStatus === "string" && variableOverrides.kanbanStatus) ||

              "";

            let nextColumn = columns[0];

            const normalizedLabel = normalizeLooseLabel(label);

            const directMatch = columns.find((column) => normalizedLabel.includes(normalizeLooseLabel(column)));

            if (directMatch) {

              nextColumn = directMatch;

            } else if (currentStatus) {

              const currentIndex = columns.findIndex((col) => normalizeLooseLabel(col) === normalizeLooseLabel(currentStatus));

              nextColumn = columns[(currentIndex + 1 + columns.length) % columns.length] ?? columns[0];

            }

            if (cardStatusKey) {

              applyVariableOverrides({ kanban_status: nextColumn, kanbanStatus: nextColumn, [cardStatusKey]: nextColumn });

            } else {

              applyVariableOverrides({ kanban_status: nextColumn, kanbanStatus: nextColumn });

            }

          }

        }

      }

      if (isGanttZoomIn || isGanttZoomOut) {

        const currentZoom =

          typeof variableOverrides.ganttZoom === "number"

            ? variableOverrides.ganttZoom

            : Number(variableOverrides.ganttZoom ?? variableOverrides.gantt_zoom) || 1;

        const delta = isGanttZoomIn ? 0.1 : -0.1;

        const nextZoom = Math.min(3, Math.max(0.3, Number((currentZoom + delta).toFixed(2))));

        applyVariableOverrides({ ganttZoom: nextZoom, gantt_zoom: nextZoom });

      }

      if (isGanttScroll) {

        const currentOffset =

          typeof variableOverrides.ganttOffset === "number"

            ? variableOverrides.ganttOffset

            : Number(variableOverrides.ganttOffset ?? variableOverrides.gantt_offset) || 0;

        const direction = matchesPattern(label, CALENDAR_PREV_PATTERN) ? -1 : 1;

        const nextOffset = currentOffset + direction;

        applyVariableOverrides({ ganttOffset: nextOffset, gantt_offset: nextOffset });

      }

      if (isMediaFilterChoice && label) {

        applyVariableOverrides({ mediaFilter: label, media_filter: label });

      }

      if (isMediaSortChoice && label) {

        applyVariableOverrides({ mediaSort: label, media_sort: label });

      }

      if (isMediaItem) {

        const text = collectTextContent(currentDoc, rootId) || label;

        if (text) {

          applyVariableOverrides({ mediaSelected: text, media_selected: text, lightboxOpen: true, lightbox_open: true });

        }

        const lightboxId = Array.from(lightboxModalIds)[0];

        if (lightboxId) openModal(lightboxId);

      }

      if (isLightboxClose) {

        applyVariableOverrides({ lightboxOpen: false, lightbox_open: false });

        const lightboxRootId = findAncestorIdMatching(currentDoc, rootId, LIGHTBOX_SECTION_PATTERN);

        if (lightboxRootId) closeModal(lightboxRootId);

      }

      if (isLightboxNext || isLightboxPrev) {

        const listRaw =

          (typeof variableOverrides.media_items === "string" && variableOverrides.media_items) ||

          (typeof variableOverrides.media_titles === "string" && variableOverrides.media_titles) ||

          (typeof variableOverrides.gallery_items === "string" && variableOverrides.gallery_items) ||

          "";

        const list = listRaw ? parseStringList(listRaw, /[,|;]/) : [];

        if (list.length) {

          const currentIndex =

            typeof variableOverrides.lightboxIndex === "number"

              ? variableOverrides.lightboxIndex

              : Number(variableOverrides.lightboxIndex ?? variableOverrides.mediaIndex ?? variableOverrides.media_index) || 0;

          const nextIndex = isLightboxPrev

            ? (currentIndex - 1 + list.length) % list.length

            : (currentIndex + 1) % list.length;

          const nextItem = list[nextIndex];

          applyVariableOverrides({

            lightboxIndex: nextIndex,

            lightbox_index: nextIndex,

            mediaIndex: nextIndex,

            media_index: nextIndex,

            mediaSelected: nextItem,

            media_selected: nextItem,

          });

        }

      }

      if (isMediaPlay || isMediaPause) {

        const playing = isMediaPlay ? true : isMediaPause ? false : !Boolean(variableOverrides.mediaPlaying ?? variableOverrides.media_playing);

        applyVariableOverrides({ mediaPlaying: playing, media_playing: playing });

      }

      if (isMediaSeekForward || isMediaSeekBack) {

        const current =

          typeof variableOverrides.mediaProgress === "number"

            ? variableOverrides.mediaProgress

            : Number(variableOverrides.mediaProgress ?? variableOverrides.media_progress) || 0;

        const duration =

          typeof variableOverrides.mediaDuration === "number"

            ? variableOverrides.mediaDuration

            : Number(variableOverrides.mediaDuration ?? variableOverrides.media_duration) || 0;

        const step = duration > 1 ? 10 : 0.1;

        const delta = isMediaSeekBack ? -step : step;

        const nextValue = duration > 1 ? Math.min(duration, Math.max(0, current + delta)) : Math.min(1, Math.max(0, current + delta));

        applyVariableOverrides({ mediaProgress: Number(nextValue.toFixed(2)), media_progress: Number(nextValue.toFixed(2)) });

      }

      if (isMediaVolumeUp || isMediaVolumeDown) {

        const current =

          typeof variableOverrides.mediaVolume === "number"

            ? variableOverrides.mediaVolume

            : Number(variableOverrides.mediaVolume ?? variableOverrides.media_volume) || 0;

        const delta = isMediaVolumeDown ? -0.1 : 0.1;

        const nextValue = Math.min(1, Math.max(0, Number((current + delta).toFixed(2))));

        applyVariableOverrides({ mediaVolume: nextValue, media_volume: nextValue });

      }

      if (isMediaMute) {

        const muted = !Boolean(variableOverrides.mediaMuted ?? variableOverrides.media_muted);

        applyVariableOverrides({ mediaMuted: muted, media_muted: muted });

      }

      if (isStoryPlay || isStoryPause) {

        const playing = isStoryPlay ? true : isStoryPause ? false : !Boolean(variableOverrides.storyPlaying ?? variableOverrides.story_playing);

        applyVariableOverrides({ storyPlaying: playing, story_playing: playing });

      }

      if (isStoryNext || isStoryPrev) {

        const listRaw =

          (typeof variableOverrides.story_titles === "string" && variableOverrides.story_titles) ||

          (typeof variableOverrides.storyTitles === "string" && variableOverrides.storyTitles) ||

          "";

        const list = listRaw ? parseStringList(listRaw, /[,|;]/) : [];

        const total =

          (typeof variableOverrides.storyTotal === "number" && variableOverrides.storyTotal) ||

          Number(variableOverrides.story_total ?? variableOverrides.storyTotal) ||

          list.length ||

          0;

        const currentIndex =

          typeof variableOverrides.storyIndex === "number"

            ? variableOverrides.storyIndex

            : Number(variableOverrides.story_index ?? variableOverrides.storyIndex) || 0;

        const nextIndex = total

          ? isStoryPrev

            ? (currentIndex - 1 + total) % total

            : (currentIndex + 1) % total

          : isStoryPrev

            ? Math.max(0, currentIndex - 1)

            : currentIndex + 1;

        const nextTitle = list[nextIndex] ?? list[0];

        applyVariableOverrides({

          storyIndex: nextIndex,

          story_index: nextIndex,

          storyProgress: 0,

          story_progress: 0,

          storyTitle: nextTitle,

          story_title: nextTitle,

        });

        storyProgressRef.current = 0;

      }

      if (isKpiPeriodChoice && label) {

        applyVariableOverrides({ kpiPeriod: label, kpi_period: label });

      }

      if (isChartPeriodChoice && label) {

        applyVariableOverrides({ chartPeriod: label, chart_period: label });

      }

      if (isChartFilterChoice && label) {

        applyVariableOverrides({ chartFilter: label, chart_filter: label });

      }

      if (isChartSortChoice && label) {

        applyVariableOverrides({ chartSort: label, chart_sort: label });

      }

      if (isTableSortChoice && label) {

        applyVariableOverrides({ tableSort: label, table_sort: label });

      }

      if (isTablePaginationChoice && label) {

        const num = parseNumericLabel(label);

        if (num != null) applyVariableOverrides({ tablePage: num, table_page: num });

      }

      if (isTableRowToggle) {

        const text = collectTextContent(currentDoc, rootId) || label;

        if (text) {

          const raw =

            (typeof variableOverrides.selected_rows === "string" && variableOverrides.selected_rows) ||

            (typeof variableOverrides.selectedRows === "string" && variableOverrides.selectedRows) ||

            "";

          const items = raw ? parseStringList(raw, /[,|;]/) : [];

          const key = normalizeLooseLabel(text);

          const selected = !Boolean(controlState[rootId]);

          const nextItems = selected

            ? Array.from(new Set([...items, text]))

            : items.filter((item) => normalizeLooseLabel(item) !== key);

          applyVariableOverrides({ selected_rows: nextItems.join(", "), selectedRows: nextItems.join(", ") });

        }

      }

      if (isTableAction && label) {

        applyVariableOverrides({ tableAction: label, table_action: label });

      }

      if (isUserAdminItem && currentPageId && !hasNavigateInteraction) {

        const detailPageId =

          findUserProfilePageId(currentDoc, currentPageId, label) ??

          findPageIdByLabel(currentDoc, label, currentPageId);

        if (detailPageId && detailPageId !== currentPageId) {

          setOverlayStack([]);

          setHistory((prev) => [...prev, currentPageId]);

          startPageTransition(currentPageId, detailPageId, "instant");

        }

      }

      if (isMonitoringItem && currentPageId && !hasNavigateInteraction) {

        const detailPageId =

          findPageIdByLabel(currentDoc, label, currentPageId) ??

          findPageIdByLabel(currentDoc, "monitor", currentPageId) ??

          findPageIdByLabel(currentDoc, "status", currentPageId);

        if (detailPageId && detailPageId !== currentPageId) {

          setOverlayStack([]);

          setHistory((prev) => [...prev, currentPageId]);

          startPageTransition(currentPageId, detailPageId, "instant");

        }

      }

      if (isUserFilterChoice && label) {

        if (matchesPattern(label, ALL_FILTER_PATTERN)) {

          applyVariableOverrides({ userFilter: "all", user_filter: "all" });

        } else {

          applyVariableOverrides({ userFilter: label, user_filter: label });

        }

      }

      if (isUserStatusChoice && label) {

        applyVariableOverrides({ userStatus: label, user_status: label });

      }

      if (isUserAdminItem) {

        const text = collectTextContent(currentDoc, rootId) || label;

        if (text) applyVariableOverrides({ selectedUser: text, selected_user: text });

      }

      if (isAuditFilterChoice && label) {

        if (matchesPattern(label, ALL_FILTER_PATTERN)) {

          applyVariableOverrides({ auditFilter: "all", audit_filter: "all" });

        } else {

          applyVariableOverrides({ auditFilter: label, audit_filter: label });

        }

      }

      if (isAuditExport) {

        applyVariableOverrides({ auditExportedAt: new Date().toISOString(), audit_exported: true });

        pushNotice({ type: "success", message: "Audit log exported." });

      }

      if (isBillingPlanChoice && label) {

        applyVariableOverrides({ billingPlan: label, billing_plan: label, plan: label });

        pushNotice({ type: "success", message: "Plan updated." });

      }

      if (isBillingInvoice) {

        applyVariableOverrides({ invoiceLookup: label || "invoice", invoice_lookup: label || "invoice" });

        pushNotice({ type: "info", message: "Invoice requested." });

      }

      if (isConsoleLevelChoice && label) {

        applyVariableOverrides({ consoleLevel: label, console_level: label });

      }

      if (isConsoleAutoScrollToggle) {

        const nextValue = !Boolean(variableOverrides.consoleAutoScroll ?? variableOverrides.console_auto_scroll);

        applyVariableOverrides({ consoleAutoScroll: nextValue, console_auto_scroll: nextValue });

      }

      if (isDataMap) {

        applyVariableOverrides({ dataMapped: true, data_mapped: true });

        pushNotice({ type: "success", message: "Mapping updated." });

      }

      if (isDataValidate) {

        applyVariableOverrides({ dataValidated: true, data_validated: true });

        pushNotice({ type: "success", message: "Validation passed." });

      }

      if (isDataProgress) {

        const currentValue =

          typeof variableOverrides.import_progress === "number"

            ? variableOverrides.import_progress

            : Number(variableOverrides.import_progress ?? variableOverrides.export_progress ?? 0) || 0;

        const nextValue = Math.min(100, currentValue + 20);

        applyVariableOverrides({ import_progress: nextValue, export_progress: nextValue, data_progress: nextValue });

      }

      if (isSkeletonToggle) {

        const nextValue = !Boolean(variableOverrides.loading ?? variableOverrides.isLoading ?? variableOverrides.skeletonLoading);

        applyVariableOverrides({ loading: nextValue, isLoading: nextValue, skeletonLoading: nextValue, skeleton_loading: nextValue });

      }

      if (isFormWizardNext || isFormWizardPrev) {

        const page = currentPageId ? currentDoc.pages.find((p) => p.id === currentPageId) ?? currentDoc.pages[0] : currentDoc.pages[0];

        const scopeIds = page ? collectDescendants(currentDoc, page.rootId) : new Set<string>();

        const wizardRootId = findAncestorIdMatching(currentDoc, rootId, FORM_WIZARD_SECTION_PATTERN) ?? null;

        const wizardScope = wizardRootId ? collectDescendants(currentDoc, wizardRootId) : scopeIds;

        if (isFormWizardNext) {

          const status = resolveRequiredStatus(wizardScope);

          if (!status.ok) {

            pushNotice({ type: "error", message: "Please complete required fields." });

            return;

          }

        }

        const currentStep =

          typeof variableOverrides.wizardStep === "number"

            ? variableOverrides.wizardStep

            : Number(variableOverrides.wizardStep ?? variableOverrides.wizard_step) || 1;

        const nextStep = Math.max(1, currentStep + (isFormWizardPrev ? -1 : 1));

        applyVariableOverrides({ wizardStep: nextStep, wizard_step: nextStep });

      }

      if (isAddressSearch) {

        let query =

          (typeof variableOverrides.addressQuery === "string" && variableOverrides.addressQuery) ||

          (typeof variableOverrides.address_query === "string" && variableOverrides.address_query) ||

          "";

        if (!query) {

          controlRootRoles.forEach((role, id) => {

            if (query) return;

            if (role.type !== "input") return;

            if (!hasAncestorMatching(currentDoc, id, ADDRESS_SECTION_PATTERN)) return;

            const value = (controlTextState[id] ?? "").trim();

            if (value) query = value;

          });

        }

        if (query) {

          const results = [`${query} Main St`, `${query} 2nd Ave`, `${query} Plaza`];

          applyVariableOverrides({

            address_results: results.join(", "),

            addressResults: results.join(", "),

            addressQuery: query,

            address_query: query,

          });

          pushNotice({ type: "success", message: "Address results updated." });

        }

      }

      if (isAddressResultItem) {

        const text = collectTextContent(currentDoc, rootId) || label;

        if (text) applyVariableOverrides({ selectedAddress: text, selected_address: text });

      }

      if (isCartQtyPlus || isCartQtyMinus) {

        const delta = isCartQtyPlus ? 1 : -1;

        let qty =

          typeof variableOverrides.cartQty === "number"

            ? variableOverrides.cartQty

            : Number(variableOverrides.cartQty ?? variableOverrides.cart_qty) || 1;

        qty = Math.max(1, qty + delta);

        applyVariableOverrides({ cartQty: qty, cart_qty: qty });

        const price =

          typeof variableOverrides.cartPrice === "number"

            ? variableOverrides.cartPrice

            : Number(variableOverrides.cartPrice ?? variableOverrides.cart_price) || 0;

        if (price) {

          const total = Number((qty * price).toFixed(2));

          applyVariableOverrides({ cartTotal: total, cart_total: total, total_amount: total });

        }

      }

      if (isPaymentMethodItem) {

        const text = collectTextContent(currentDoc, rootId) || label;

        if (text) applyVariableOverrides({ paymentSelected: text, payment_selected: text });

      }

      if (isPaymentAdd) {

        const raw =

          (typeof variableOverrides.payment_methods === "string" && variableOverrides.payment_methods) ||

          (typeof variableOverrides.paymentMethods === "string" && variableOverrides.paymentMethods) ||

          "";

        const items = raw ? parseStringList(raw, /[,|;]/) : [];

        const nextLabel = `Card ${items.length + 1}`;

        items.push(nextLabel);

        applyVariableOverrides({ payment_methods: items.join(", "), paymentMethods: items.join(", "), paymentSelected: nextLabel, payment_selected: nextLabel });

        pushNotice({ type: "success", message: "Payment method added." });

      }

      if (isPaymentDelete) {

        const text = collectTextContent(currentDoc, rootId) || label;

        const raw =

          (typeof variableOverrides.payment_methods === "string" && variableOverrides.payment_methods) ||

          (typeof variableOverrides.paymentMethods === "string" && variableOverrides.paymentMethods) ||

          "";

        const items = raw ? parseStringList(raw, /[,|;]/) : [];

        const targetKey = normalizeLooseLabel(text);

        const nextItems = items.filter((item) => normalizeLooseLabel(item) !== targetKey);

        applyVariableOverrides({ payment_methods: nextItems.join(", "), paymentMethods: nextItems.join(", ") });

        pushNotice({ type: "success", message: "Payment method removed." });

      }

      if (isPaymentDefault) {

        const text = collectTextContent(currentDoc, rootId) || label;

        if (text) applyVariableOverrides({ paymentDefault: text, payment_default: text });

      }

      if (isPaymentSelect) {

        const text = collectTextContent(currentDoc, rootId) || label;

        if (text) applyVariableOverrides({ paymentSelected: text, payment_selected: text });

      }

      if (isErrorLogAction) {

        applyVariableOverrides({ errorLogOpened: true, error_log_opened: true });

        const logPageId = findPageIdByLabel(currentDoc, "log", currentPageId ?? undefined);

        if (logPageId && currentPageId && logPageId !== currentPageId && !hasNavigateInteraction) {

          setOverlayStack([]);

          setHistory((prev) => [...prev, currentPageId]);

          startPageTransition(currentPageId, logPageId, "instant");

        }

      }

      if (isPriceCompareAction) {

        const planKey = resolvePlanKey(label || "");

        if (planKey) applyVariableOverrides({ comparePlan: planKey, compare_plan: planKey });

      }

      if (isPaymentRetry) {

        applyVariableOverrides({ paymentStatus: "retrying", payment_status: "retrying" });

        pushNotice({ type: "info", message: "Retrying payment..." });

      }

      if (isPaymentReceipt) {

        const receiptPageId =

          findPageIdByLabel(currentDoc, "receipt", currentPageId ?? undefined) ??

          findPageIdByLabel(currentDoc, "invoice", currentPageId ?? undefined);

        if (receiptPageId && currentPageId && receiptPageId !== currentPageId && !hasNavigateInteraction) {

          setOverlayStack([]);

          setHistory((prev) => [...prev, currentPageId]);

          startPageTransition(currentPageId, receiptPageId, "instant");

        } else {

          applyVariableOverrides({ receiptRequested: true, receipt_requested: true });

        }

      }

      if (isPaymentHistory) {

        const historyPageId = findPageIdByLabel(currentDoc, "history", currentPageId ?? undefined);

        if (historyPageId && currentPageId && historyPageId !== currentPageId && !hasNavigateInteraction) {

          setOverlayStack([]);

          setHistory((prev) => [...prev, currentPageId]);

          startPageTransition(currentPageId, historyPageId, "instant");

        } else {

          applyVariableOverrides({ paymentHistory: true, payment_history: true });

        }

      }

      if (isCouponApply) {

        let code =

          (typeof variableOverrides.couponCode === "string" && variableOverrides.couponCode) ||

          (typeof variableOverrides.coupon_code === "string" && variableOverrides.coupon_code) ||

          "";

        if (!code) {

          controlRootRoles.forEach((role, id) => {

            if (code) return;

            if (role.type !== "input") return;

            if (!hasAncestorMatching(currentDoc, id, COUPON_SECTION_PATTERN)) return;

            const value = (controlTextState[id] ?? "").trim();

            if (value) code = value;

          });

        }

        const validRaw =

          (typeof variableOverrides.coupon_codes === "string" && variableOverrides.coupon_codes) ||

          (typeof variableOverrides.couponCodes === "string" && variableOverrides.couponCodes) ||

          "WELCOME,SAVE10";

        const validList = validRaw ? parseStringList(validRaw, /[,|;]/) : [];

        const isValid = validList.some((item) => normalizeLooseLabel(item) === normalizeLooseLabel(code));

        if (isValid) {

          applyVariableOverrides({ couponValid: true, coupon_valid: true, couponError: "", coupon_error: "" });

          pushNotice({ type: "success", message: "Coupon applied." });

        } else {

          applyVariableOverrides({ couponValid: false, coupon_valid: false, couponError: "Invalid code", coupon_error: "Invalid code" });

          pushNotice({ type: "error", message: "Invalid coupon code." });

        }

      }

      if (isBlankGridToggle) {

        const nextValue = !Boolean(variableOverrides.gridOn ?? variableOverrides.grid_on ?? variableOverrides.guideOn);

        applyVariableOverrides({ gridOn: nextValue, grid_on: nextValue, guideOn: nextValue, guide_on: nextValue });

      }

      if (isBlankInit) {

        applyVariableOverrides({ blankTemplateInit: true, blank_template_init: true });

        pushNotice({ type: "success", message: "Blank template initialized." });

      }

      if (isLandingAnchor && label && currentPageId) {

        const targetId = findSectionNodeId(currentDoc, currentPageId, label);

        if (targetId && typeof document !== "undefined") {

          const el = document.querySelector(`[data-node-id="${targetId}"]`);

          if (el instanceof HTMLElement) {

            el.scrollIntoView({ behavior: "smooth", block: "start", inline: "nearest" });

          }

        }

      }

      if (isDashboardFilter && label) {

        applyVariableOverrides({ dashboardFilter: label, dashboard_filter: label });

      }

      if (isDashboardSort && label) {

        applyVariableOverrides({ dashboardSort: label, dashboard_sort: label });

      }

      if (isDashboardSave) {

        applyVariableOverrides({ dashboardLayoutSaved: true, dashboard_layout_saved: true });

        pushNotice({ type: "success", message: "Layout saved." });

      }

      if (isCommunityWrite) {

        applyVariableOverrides({ communityCompose: true, community_compose: true });

        pushNotice({ type: "info", message: "Compose new post." });

      }

      if (isCommunityRecommend && label) {

        applyVariableOverrides({ communityRecommend: label, community_recommend: label });

      }

      if (isServiceContact) {

        applyVariableOverrides({ serviceContact: true, service_contact: true });

        pushNotice({ type: "success", message: "Contact form opened." });

      }

      if (isServiceStep && label) {

        applyVariableOverrides({ serviceStep: label, service_step: label });

      }

      if (isSearchSuggestion && searchResultPageId && currentPageId && searchResultPageId !== currentPageId && !hasNavigateInteraction) {

        setOverlayStack([]);

        setHistory((prev) => [...prev, currentPageId]);

        startPageTransition(currentPageId, searchResultPageId, "instant");

      }

      if (isNotificationItem && currentPageId && !hasNavigateInteraction) {

        const detailPageId = findNotificationDetailPageId(currentDoc, currentPageId);

        if (detailPageId && detailPageId !== currentPageId) {

          setOverlayStack([]);

          setHistory((prev) => [...prev, currentPageId]);

          startPageTransition(currentPageId, detailPageId, "instant");

        }

      }

      if (isContentFeedItem && currentPageId && !hasNavigateInteraction) {

        const detailPageId = findContentDetailPageId(currentDoc, currentPageId);

        if (detailPageId && detailPageId !== currentPageId) {

          setOverlayStack([]);

          setHistory((prev) => [...prev, currentPageId]);

          startPageTransition(currentPageId, detailPageId, "instant");

        }

      }



      if (isRelatedContentItem && currentPageId && !hasNavigateInteraction) {

        const detailPageId = findContentDetailPageId(currentDoc, currentPageId);

        if (detailPageId && detailPageId !== currentPageId) {

          setOverlayStack([]);

          setHistory((prev) => [...prev, currentPageId]);

          startPageTransition(currentPageId, detailPageId, "instant");

        }

      }

      if (isTagCardItem && currentPageId && !hasNavigateInteraction) {

        const detailPageId = findContentDetailPageId(currentDoc, currentPageId);

        if (detailPageId && detailPageId !== currentPageId) {

          setOverlayStack([]);

          setHistory((prev) => [...prev, currentPageId]);

          startPageTransition(currentPageId, detailPageId, "instant");

        }

      }

      if (isRankingItem && currentPageId && !hasNavigateInteraction) {

        const detailPageId = findContentDetailPageId(currentDoc, currentPageId);

        if (detailPageId && detailPageId !== currentPageId) {

          setOverlayStack([]);

          setHistory((prev) => [...prev, currentPageId]);

          startPageTransition(currentPageId, detailPageId, "instant");

        }

      }



      if (isMentionItem && currentPageId && !hasNavigateInteraction) {

        const detailPageId = findContentDetailPageId(currentDoc, currentPageId);

        if (detailPageId && detailPageId !== currentPageId) {

          setOverlayStack([]);

          setHistory((prev) => [...prev, currentPageId]);

          startPageTransition(currentPageId, detailPageId, "instant");

        }

      }

      if (isChannelItem && currentPageId && !hasNavigateInteraction) {

        const roomPageId = findChatRoomPageId(currentDoc, currentPageId);

        if (roomPageId && roomPageId !== currentPageId) {

          setOverlayStack([]);

          setHistory((prev) => [...prev, currentPageId]);

          startPageTransition(currentPageId, roomPageId, "instant");

        }

      }

      if (isFaqItem && currentPageId && !hasNavigateInteraction) {

        const detailPageId = findFaqDetailPageId(currentDoc, currentPageId);

        if (detailPageId && detailPageId !== currentPageId) {

          setOverlayStack([]);

          setHistory((prev) => [...prev, currentPageId]);

          startPageTransition(currentPageId, detailPageId, "instant");

        }

      }

      if (isSecurityItem && currentPageId && !hasNavigateInteraction) {

        const detailPageId = findSecurityDetailPageId(currentDoc, currentPageId);

        if (detailPageId && detailPageId !== currentPageId) {

          setOverlayStack([]);

          setHistory((prev) => [...prev, currentPageId]);

          startPageTransition(currentPageId, detailPageId, "instant");

        }

      }



      if (isChatListItem && currentPageId && !hasNavigateInteraction) {

        const roomPageId = findChatRoomPageId(currentDoc, currentPageId);

        if (roomPageId && roomPageId !== currentPageId) {

          setOverlayStack([]);

          setHistory((prev) => [...prev, currentPageId]);

          startPageTransition(currentPageId, roomPageId, "instant");

        }

      }

      if (isUserCardCtx && !isFollowAction && currentPageId && !hasNavigateInteraction) {

        const profilePageId = findUserProfilePageId(currentDoc, currentPageId, label);

        if (profilePageId && profilePageId !== currentPageId) {

          setOverlayStack([]);

          setHistory((prev) => [...prev, currentPageId]);

          startPageTransition(currentPageId, profilePageId, "instant");

        }

      }

      if (isNavItem && navTargetPageId && currentPageId && navTargetPageId !== currentPageId && !hasNavigateInteraction) {

        setOverlayStack([]);

        setHistory((prev) => [...prev, currentPageId]);

        startPageTransition(currentPageId, navTargetPageId, "instant");

      }

      if (isSidebarToggle || isSidebarBrand) {

        setSidebarCollapsed((prev) => !prev);

      }

      if (isSettingsLink && label && currentPageId) {

        const excludeIds = collectDescendants(currentDoc, rootId);

        const targetId = findSectionNodeId(currentDoc, currentPageId, label, excludeIds);

        if (targetId && typeof document !== "undefined") {

          const el = document.querySelector(`[data-node-id="${targetId}"]`);

          if (el instanceof HTMLElement) {

            el.scrollIntoView({ behavior: "smooth", block: "start", inline: "nearest" });

          }

        }

        if (typeof window !== "undefined") {

          const slug = normalizeLooseLabel(label);

          if (slug) {

            const base = `${window.location.pathname}${window.location.search}`;

            window.history.replaceState(null, "", `${base}#${encodeURIComponent(slug)}`);

          }

        }

      }

      if (isCookieSettingsLink && currentPageId) {

        const targetPageId =

          findPageIdByLabel(currentDoc, "settings", currentPageId) ??

          findPageIdByLabel(currentDoc, "privacy", currentPageId) ??

          (label ? findPageIdByLabel(currentDoc, label, currentPageId) : null);

        if (targetPageId && targetPageId !== currentPageId) {

          setOverlayStack([]);

          setHistory((prev) => [...prev, currentPageId]);

          startPageTransition(currentPageId, targetPageId, "instant");

        } else if (label) {

          const targetId = findSectionNodeId(currentDoc, currentPageId, label);

          if (targetId && typeof document !== "undefined") {

            const el = document.querySelector(`[data-node-id="${targetId}"]`);

            if (el instanceof HTMLElement) {

              el.scrollIntoView({ behavior: "smooth", block: "start", inline: "nearest" });

            }

          }

        }

      }

      if (isBreadcrumbItem && label && currentPageId && !hasNavigateInteraction) {

        if (!isBreadcrumbSeparator(label)) {

          const targetPageId = findPageIdByLabel(currentDoc, label, currentPageId);

          if (targetPageId && targetPageId !== currentPageId) {

            setOverlayStack([]);

            setHistory((prev) => [...prev, currentPageId]);

            startPageTransition(currentPageId, targetPageId, "instant");

          }

        }

      }

      if (isSectionHeaderItem && label) {

        const sectionRootId = findAncestorIdMatching(currentDoc, rootId, SECTION_HEADER_PATTERN);

        if (sectionRootId) {

          const textIds = collectTextNodeIds(currentDoc, sectionRootId);

          const orderedTexts = textIds

            .map((id) => ({ id, x: currentDoc.nodes[id]?.frame.x ?? 0, value: currentDoc.nodes[id]?.text?.value ?? "" }))

            .sort((a, b) => a.x - b.x);

          const sectionTitle = orderedTexts.find(

            (entry) =>

              !matchesPattern(entry.value, MORE_ACTION_PATTERN) &&

              !matchesPattern(entry.value, SORT_PATTERN) &&

              !matchesPattern(entry.value, FILTER_PATTERN),

          )?.value ?? "";

          const sectionKey = normalizeLooseLabel(sectionTitle);

          if (matchesPattern(label, MORE_ACTION_PATTERN) && currentPageId && !hasNavigateInteraction) {

            const targetPageId = findPageIdByLabel(currentDoc, sectionTitle || label, currentPageId);

            if (targetPageId && targetPageId !== currentPageId) {

              setOverlayStack([]);

              setHistory((prev) => [...prev, currentPageId]);

              startPageTransition(currentPageId, targetPageId, "instant");

            }

          }

          if (matchesPattern(label, SORT_PATTERN)) {

            applyVariableOverrides({

              sort: label,

              ...(sectionKey ? { [`section_${sectionKey}_sort`]: label } : {}),

            });

          }

          if (matchesPattern(label, FILTER_PATTERN)) {

            applyVariableOverrides({

              filter: label,

              ...(sectionKey ? { [`section_${sectionKey}_filter`]: label } : {}),

            });

          }

        }

      }

      if (isSelectTabItem && label) {

        applyVariableOverrides({ tab: label, selectedTab: label, filter: label });

        updateQueryParam("tab", normalizeLooseLabel(label) || label);

      }

      if (isDateSliderItem && label) {

        applyVariableOverrides({ date: label, selectedDate: label, filterDate: label });

        updateQueryParam("date", label);

      }

      if (isModalContext && (isModalCloseTrigger || isModalOverlay)) {

        const modalRootId = findAncestorIdMatching(currentDoc, rootId, MODAL_SECTION_PATTERN);

        if (modalRootId) closeModal(modalRootId);

      } else if (!isModalContext && isModalOpenTrigger) {

        const targetModalId = resolveModalTargetId(label || nodeName);

        if (targetModalId) openModal(targetModalId);

      }

      if (isStickyClose) {

        dismissStickyCta();

      }

      if (isAppUpdateDismiss) {

        dismissAppUpdate(appUpdateModalId);

      }

      if (isSkipLink && currentPageId && typeof document !== "undefined") {

        const page = currentDoc.pages.find((p) => p.id === currentPageId) ?? currentDoc.pages[0];

        if (page) {

          const scopeIds = collectDescendants(currentDoc, page.rootId);

          const targetId = Array.from(scopeIds).find((id) => matchesPattern(currentDoc.nodes[id]?.name ?? "", CONTENT_SECTION_PATTERN));

          if (targetId) {

            const el = document.querySelector(`[data-node-id="${targetId}"]`);

            if (el instanceof HTMLElement) {

              el.scrollIntoView({ behavior: "smooth", block: "start", inline: "nearest" });

            }

          }

        }

      }

    },

    [

      appUpdateModalIds,

      applyVariableOverrides,

      closeModal,

      cookieBannerIds,

      controlFields,

      controlRootRoles,

      disabledChoiceIds,

      dismissAppUpdate,

      dismissStickyCta,

      lightboxModalIds,

      openModal,

      pushNotice,

      resolveModalTargetId,

      resolveRequiredStatus,

      startPageTransition,

      updateQueryParam,

      variableOverrides,

      controlState,

      controlTextState,

    ],

  );



  const handleControlTextChange = useCallback(

    (rootId: string, value: string) => {

      const role = controlRootRoles.get(rootId);

      const label = controlFields.get(rootId)?.label ?? (role ? resolveControlLabel(docRef.current as Doc, role, rootId) : "");

      let nextValue = value;

      const digits = value.replace(/\D/g, "");

      if (matchesPattern(label, INPUT_PHONE_PATTERN)) {

        if (digits.length <= 3) nextValue = digits;

        else if (digits.length <= 7) nextValue = `${digits.slice(0, 3)}-${digits.slice(3)}`;

        else if (digits.length <= 10) nextValue = `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;

        else nextValue = `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7, 11)}`;

        applyVariableOverrides({ phoneValid: digits.length >= 10, phone_valid: digits.length >= 10 });

      } else if (matchesPattern(label, INPUT_CARD_PATTERN)) {

        const parts = [];

        for (let i = 0; i < digits.length; i += 4) parts.push(digits.slice(i, i + 4));

        nextValue = parts.join(" ").trim();

        applyVariableOverrides({ cardValid: digits.length === 16, card_valid: digits.length === 16 });

      } else if (matchesPattern(label, INPUT_DATE_PATTERN)) {

        if (digits.length <= 4) nextValue = digits;

        else if (digits.length <= 6) nextValue = `${digits.slice(0, 4)}-${digits.slice(4)}`;

        else nextValue = `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;

        applyVariableOverrides({ dateValid: digits.length === 8, date_valid: digits.length === 8 });

      } else if (matchesPattern(label, INPUT_ZIP_PATTERN)) {

        nextValue = digits.slice(0, 5);

        applyVariableOverrides({ zipValid: digits.length >= 5, zip_valid: digits.length >= 5 });

      }

      if (matchesPattern(label, ADDRESS_DETAIL_PATTERN) && isAddressContext(docRef.current, basePageRef.current, rootId)) {

        applyVariableOverrides({ addressDetail: nextValue, address_detail: nextValue });

      }

      if (isAddressContext(docRef.current, basePageRef.current, rootId) && matchesPattern(label, ADDRESS_SEARCH_PATTERN)) {

        applyVariableOverrides({ addressQuery: nextValue, address_query: nextValue });

      }

      setControlTextState((prev) => ({ ...prev, [rootId]: nextValue }));

    },

    [applyVariableOverrides, controlFields, controlRootRoles],

  );

  const handleControlFileChange = useCallback((rootId: string, files: File[]) => {

    const maxBytes = 10 * 1024 * 1024;

    const filtered = files.filter((file) => file.size <= maxBytes);

    if (!filtered.length) {

      pushNotice({ type: "error", message: "파일 크기 제한(10MB)을 초과했습니다." });

      return;

    }

    if (filtered.length < files.length) {

      pushNotice({ type: "error", message: "처음 파일이 크기 제한(10MB)을 초과했습니다." });

    }



    const currentDoc = docRef.current;

    const currentPageId = basePageRef.current;

    if (isAttachmentContext(currentDoc, currentPageId, rootId)) {

      const names = filtered.map((file) => file.name).join(", ");

      applyVariableOverrides({

        attachment_files: names,

        attachmentFiles: names,

        attachment_count: filtered.length,

      });

      pushNotice({ type: "success", message: "Files added." });

    }

    if (isDataTransferContext(currentDoc, currentPageId, rootId)) {

      const names = filtered.map((file) => file.name).join(", ");

      applyVariableOverrides({

        import_files: names,

        importFiles: names,

        data_files: names,

        data_file_count: filtered.length,

      });

      pushNotice({ type: "success", message: "Files queued for import." });

    }

    setControlFileState((prev) => ({ ...prev, [rootId]: filtered }));

  }, [applyVariableOverrides, pushNotice]);



  const triggerOnboardingComplete = useCallback(

    (pageId: string | null, sourceNodeId?: string | null) => {

      if (!pageId) return;

      const currentDoc = docRef.current;

      if (!isOnboardingContext(currentDoc, pageId, sourceNodeId ?? null)) return;

      if (onboardingCompleteRef.current.has(pageId)) return;

      const nextPageId = findNextPageId(currentDoc, pageId);

      if (!nextPageId || nextPageId === pageId) return;

      onboardingCompleteRef.current.add(pageId);

      setOverlayStack([]);

      setHistory((prev) => [...prev, pageId]);

      startPageTransition(pageId, nextPageId, "instant");

    },

    [startPageTransition],

  );



  const applyPermissionDecision = useCallback(

    (nodeId: string, decision: "allow" | "deny") => {

      const currentDoc = docRef.current;

      const scopeRootId = findAncestorIdMatching(currentDoc, nodeId, PERMISSION_SECTION_PATTERN);

      if (!scopeRootId) return false;

      const scopeIds = collectDescendants(currentDoc, scopeRootId);

      const targetIds: string[] = [];

      controlRootRoles.forEach((role, rootId) => {

        if (!scopeIds.has(rootId)) return;

        if (role.type === "toggle" || role.type === "checkbox") targetIds.push(rootId);

      });

      if (!targetIds.length) return false;

      setControlState((prev) => {

        const next = { ...prev };

        const nextValue = decision === "allow";

        targetIds.forEach((id) => {

          next[id] = nextValue;

        });

        return next;

      });

      return true;

    },

    [controlRootRoles],

  );



  const handleCookieBannerAction = useCallback((nodeId?: string) => {

    if (!nodeId || !cookieBannerIds.size) return;

    const currentDoc = docRef.current;

    let current: Node | undefined | null = currentDoc.nodes[nodeId];

    let bannerId: string | null = null;

    while (current) {

      if (cookieBannerIds.has(current.id)) {

        bannerId = current.id;

        break;

      }

      current = current.parentId ? currentDoc.nodes[current.parentId] : null;

    }

    if (!bannerId) return;

    const label = (findControlTextLabel(currentDoc, nodeId) || currentDoc.nodes[nodeId]?.name || "").trim();

    const normalized = label.toLowerCase();

    let status: CookieConsentState["status"] | null = null;

    if (
      normalized.includes("accept") ||
      normalized.includes("agree") ||
      normalized.includes("consent") ||
      normalized.includes("동의") ||
      normalized.includes("허용")
    )
      status = "accepted";
    if (
      normalized.includes("reject") ||
      normalized.includes("deny") ||
      normalized.includes("거부") ||
      normalized.includes("비동의") ||
      normalized.includes("차단")
    )
      status = "rejected";

    if (!status) return;

    try {

      if (typeof localStorage !== "undefined") {

        localStorage.setItem(COOKIE_CONSENT_STORAGE_KEY, JSON.stringify({ status, timestamp: Date.now() }));

      }

    } catch {

      // ignore

    }

    applyVariableOverrides({ cookieConsent: status, cookie_consent: status });

    setHiddenNodeIds((prev) => {

      const next = new Set(prev);

      cookieBannerIds.forEach((id) => next.add(id));

      return next;

    });

  }, [applyVariableOverrides, cookieBannerIds]);



  const buildSubmitPayload = useCallback((options?: { pageId?: string | null; scopeIds?: Set<string> }) => {

    const doc = docRef.current;

    const pageId = options?.pageId ?? basePageRef.current ?? null;

    const scopeIds = options?.scopeIds ?? resolveSubmitScopeIds(doc, pageId, null);

    const fields: Record<string, string | number | boolean | Record<string, unknown> | unknown[] | null> = {};

    const files: Record<string, File | File[]> = {};

    const fallbackValues: Record<string, string | number | boolean | Record<string, unknown> | unknown[] | null> = {};

    const otpInputs: Array<{ id: string; value: string; x: number }> = [];

    const appendReason = (raw: string) => {

      const value = raw.trim();

      if (!value) return;

      const existing = fields.reason;

      if (typeof existing === "string" && existing.length > 0) {

        fields.reason = `${existing}, ${value}`;

      } else {

        fields.reason = value;

      }

    };

    controlRootRoles.forEach((role, rootId) => {

      if (!scopeIds.has(rootId)) return;

      const meta = controlFields.get(rootId);

      const key = meta?.key ?? rootId;

      if (role.type === "input") {

        if (role.inputType === "file") {

          const fileList = controlFileState[rootId];

          if (fileList && fileList.length) {

            files[key] = fileList.length > 1 ? fileList : fileList[0];

          }

          return;

        }

        const rawValue = controlTextState[rootId] ?? "";
        const value = coerceControlFieldValue(rawValue, meta);

        if (meta?.label && matchesPattern(meta.label, OTP_LABEL_PATTERN)) {

          const node = doc.nodes[rootId];

          otpInputs.push({ id: rootId, value: String(value).trim(), x: node?.frame?.x ?? 0 });

          return;

        }

        if (key === "targetPlan") {

          if (value) fields[key] = value;

        } else if (key === "reason") {

          if (typeof value === "string" && value.trim()) {

            appendReason(value);

          } else if (!(key in fields)) {

            fallbackValues[key] = meta?.fallbackValue ?? "";

          }

        } else if (!(typeof value === "string" && value === "")) {

          fields[key] = value;

        } else if (!(key in fields)) {

          fallbackValues[key] = meta?.fallbackValue ?? "";

        }

      } else if (role.type === "checkbox" || role.type === "toggle") {

        const checked = Boolean(controlState[rootId]);

        if (key === "targetPlan") {

          if (checked && !fields[key]) {

            fields[key] = meta?.valueHint ?? "pro";

          }

        } else if (key === "reason") {

          if (checked) {

            appendReason(stripFieldKey(meta?.label ?? ""));

          } else if (!(key in fields)) {

            fallbackValues[key] = meta?.fallbackValue ?? "";

          }

        } else {

          if (checked) {

            fields[key] = true;

          } else if (!(key in fields)) {

            fallbackValues[key] = meta?.fallbackValue ?? false;

        }
        }

      }

    });

    if (otpInputs.length) {

      otpInputs.sort((a, b) => a.x - b.x);

      const code = otpInputs.map((item) => item.value).join("");

      fields.otp = code;

    }

    Object.entries(fallbackValues).forEach(([key, value]) => {

      if (!(key in fields)) fields[key] = value;

    });

    return { fields, files, pageId, submittedAt: new Date().toISOString() };

  }, [controlFields, controlRootRoles, controlState, controlTextState, controlFileState]);



  const ensureAnonSession = useCallback(async () => {

    if (typeof localStorage === "undefined") return null;

    const existing = localStorage.getItem("anon_user_id");

    if (existing) return existing;

    try {

      const res = await fetch("/api/anon/init", { method: "POST", headers: { "Content-Type": "application/json" } });

      const data = await res.json().catch(() => null);

      if (data?.anonUserId) {

        localStorage.setItem("anon_user_id", data.anonUserId);

        return data.anonUserId as string;

      }

    } catch {

      // ignore

    }

    return null;

  }, []);



  useEffect(() => {

    if (appPageId && typeof window !== "undefined") {

      void ensureAnonSession();

    }

  }, [appPageId, ensureAnonSession]);



  const handleAction = useCallback(function handleActionInner(

    action: PrototypeAction,

    source?: { nodeId?: string; pageId?: string },

  ) {

    const currentDoc = docRef.current;

    const currentPageId = basePageRef.current;

    const nextDelay = getDelayMs(action);

    const doAction = () => {

      if (!currentPageId) return;

      handleCookieBannerAction(source?.nodeId);

      if ("condition" in action && action.condition) {

        const cond = action.condition as PrototypeCondition;

        if (!evaluateCondition(currentDoc, cond, variableMode, variableOverrides)) return;

      }

      if (source?.nodeId) {

        const label = resolveActionLabel(currentDoc, source.nodeId, controlRootRoles);

        if (label) {

          if (matchesPattern(label, PERMISSION_ALLOW_PATTERN) || matchesPattern(label, PERMISSION_DENY_PATTERN)) {

            const decision = matchesPattern(label, PERMISSION_ALLOW_PATTERN) ? "allow" : "deny";

            if (applyPermissionDecision(source.nodeId, decision)) {

              pushNotice({

                type: "success",

                message: decision === "allow" ? "권한 요청이 처리되었습니다." : "권한 요청이 거부되었습니다.",

              });

            }

          }

          if (isResendLabel(label)) {

            const rootId = resolveActionRootId(currentDoc, source.nodeId, controlRootRoles);

            const existing = cooldownMapRef.current[rootId];

            if (existing && existing > Date.now()) {

              pushNotice({ type: "info", message: "잠시만 기다려 주세요." });

              return;

            }

            startCooldown(rootId);

          }



          if (matchesPattern(label, SHARE_ACTION_PATTERN) && isContentDetailContext(currentDoc, currentPageId, source.nodeId)) {

            applyVariableOverrides({ content_share_count: (Number(variableOverrides.content_share_count) || 0) + 1 });

            pushNotice({ type: "success", message: "Shared." });

          }

          if (

            matchesPattern(label, SAVE_ACTION_PATTERN) &&

            (isContentDetailContext(currentDoc, currentPageId, source.nodeId) || isBookmarkContext(currentDoc, currentPageId, source.nodeId))

          ) {

            const saved = Boolean(variableOverrides.saved ?? variableOverrides.bookmarked ?? variableOverrides.favorite);

            applyVariableOverrides({ saved: !saved, bookmarked: !saved, favorite: !saved });

            pushNotice({ type: "success", message: !saved ? "Saved." : "Removed." });

          }

          if (matchesPattern(label, PERIOD_FILTER_PATTERN) && isRankingContext(currentDoc, currentPageId, source.nodeId)) {

            applyVariableOverrides({ rankingPeriod: label, ranking_period: label });

          }

          if (matchesPattern(label, LOAD_MORE_PATTERN) && isCommentContext(currentDoc, currentPageId, source.nodeId)) {

            const currentPage = typeof variableOverrides.commentPage === "number" ? variableOverrides.commentPage : Number(variableOverrides.commentPage ?? variableOverrides.comment_page) || 1;

            const nextPage = currentPage + 1;

            applyVariableOverrides({ commentPage: nextPage, comment_page: nextPage });

          }

        }

      }

      if (action.type === "setVariable") {
        if (action.variableId) {
          if (action.mode !== undefined) setVariableMode(action.mode);
          const val = action.value;
          if (val !== undefined) {

            const safe =

              typeof val === "string" || typeof val === "number" || typeof val === "boolean"

                ? val

                : val != null && typeof val === "object"

                  ? ""

                  : undefined;

            if (safe !== undefined) setVariableOverrides((prev) => ({ ...prev, [action.variableId]: safe }));

          }

        }
        return;
      }
      if (action.type === "setGlobalState") {
        if (action.key) {
          applyGlobalStateValue(action.key, action.value);
        }
        return;
      }
      if (action.type === "apiCall") {

        const proxyUrl = appPageId ? `/api/app/${appPageId}/proxy` : null;

        if (!proxyUrl) {

          pushNotice({ type: "error", message: "API 호출에는 앱 페이지 ID가 필요합니다." });

          return;

        }

        (async () => {

          try {

            const res = await fetch(proxyUrl, {

              method: "POST",

              headers: { "Content-Type": "application/json" },

              body: JSON.stringify({

                url: action.url,

                method: action.method ?? "GET",

                headers: action.headers ?? {},

                body: action.body,

              }),

            });

            const data = await res.json().catch(() => ({ ok: false, error: "parse_error" }));

            if (action.responseVariable) {

              const v = typeof data.data === "object" ? JSON.stringify(data.data) : String(data.data ?? "");

              applyVariableOverrides({ [action.responseVariable]: v });

            }

            if (data.ok && action.onSuccess) {

              handleActionInner(action.onSuccess, source);

            } else if (!data.ok) {

              if (action.errorVariable) {

                applyVariableOverrides({ [action.errorVariable]: String(data.error ?? "요청 실패") });

              }

              if (action.onError) {

                handleActionInner(action.onError, source);

              }

            }

          } catch (err) {

            const msg = err instanceof Error ? err.message : "요청 실패";

            if (action.errorVariable) applyVariableOverrides({ [action.errorVariable]: msg });

            if (action.onError) handleActionInner(action.onError, source);

          }

        })();

        return;

      }

      if (action.type === "nativeCall") {

        const name = action.name?.trim();

        if (!name) {

          pushNotice({ type: "error", message: "네이티브 호출 이름이 필요합니다." });

          return;

        }

        const bridge =

          (window as { __nullNativeBridge?: { invoke?: (payload: unknown) => unknown } }).__nullNativeBridge

          ?? (window as { Capacitor?: { Plugins?: Record<string, { invoke?: (payload: unknown) => unknown }> } }).Capacitor?.Plugins?.NullBridge

          ?? (window as { Capacitor?: { Plugins?: Record<string, { invoke?: (payload: unknown) => unknown }> } }).Capacitor?.Plugins?.NullNative;

        let args: unknown = action.args;

        if (typeof args === "string") {

          try {

            args = JSON.parse(args);

          } catch {

            // keep raw string

          }

        }

        (async () => {

          try {

            const res = bridge && typeof bridge.invoke === "function"

              ? await bridge.invoke({ name, args })

              : await invokeWebNativeBridge(name, args);

            const isObject = typeof res === "object" && res !== null;

            const ok = isObject && "ok" in (res as Record<string, unknown>) ? Boolean((res as Record<string, unknown>).ok) : true;

            const data = isObject && "data" in (res as Record<string, unknown>) ? (res as Record<string, unknown>).data : res;

            if (action.responseVariable) {

              const value = typeof data === "object" ? JSON.stringify(data ?? {}) : String(data ?? "");

              applyVariableOverrides({ [action.responseVariable]: value });

            }

            if (ok) {

              if (action.onSuccess) handleActionInner(action.onSuccess, source);

            } else {

              const errMsg = isObject && "error" in (res as Record<string, unknown>)

                ? String((res as Record<string, unknown>).error ?? "native_error")

                : "native_error";

              if (action.errorVariable) applyVariableOverrides({ [action.errorVariable]: errMsg });

              if (action.onError) handleActionInner(action.onError, source);

            }

          } catch (err) {

            const msg = err instanceof Error ? err.message : "native_call_failed";

            if (action.errorVariable) applyVariableOverrides({ [action.errorVariable]: msg });

            if (action.onError) handleActionInner(action.onError, source);

          }

        })();

        return;

      }

      const transitionType = getTransitionType(action);

      const transitionOpts =

        "transition" in action && action.transition

          ? { duration: action.transition.duration, easing: action.transition.easing }

          : { duration: undefined, easing: undefined };

      if (action.type === "service") {

        const servicePageId = appPageId;

        if (!servicePageId) {

          pushNotice({ type: "error", message: "Service actions require an app page id." });

          return;

        }

        const pageId = source?.pageId ?? currentPageId;

        const scopeIds = resolveSubmitScopeIds(currentDoc, pageId, source?.nodeId ?? null);

        const payload = buildSubmitPayload({ pageId, scopeIds });

        const descriptor = buildServiceActionRequest({

          pageId: servicePageId,

          action,

          fields: payload.fields,

          variables: variableOverrides,

          globalState,

        });

        if ("error" in descriptor) {

          applyVariableOverrides({

            service_last_action: action.action,

            service_last_ok: false,

            service_last_error: descriptor.error,

          });

          pushNotice({ type: "error", message: descriptor.error });

          return;

        }

        (async () => {

          try {

            const res = await fetch(descriptor.endpoint, {

              method: descriptor.method,

              headers: { "Content-Type": "application/json" },

              credentials: "include",

              body: descriptor.body ? JSON.stringify(descriptor.body) : undefined,

            });

            const data = await res.json().catch(() => ({ ok: false, error: "parse_error" }));

            if (!res.ok || !data?.ok) {

              throw new Error(String(data?.error ?? `service_${res.status}`));

            }

            if ((action.action === "auth.login" || action.action === "auth.register") && data.user) {

              applyVariableOverrides({

                "$app_user.id": data.user.id,

                "$app_user.email": data.user.email,

                "$app_user.display_name": data.user.display_name ?? "",

                "$app_user.role": data.user.role ?? "user",

                "$app_user.logged_in": true,

              });

              const partnerUpdates = await fetchPartnerPortalVariableUpdatesForPage(servicePageId, " | ");
              if (Object.keys(partnerUpdates).length) {
                applyVariableOverrides(partnerUpdates);
              }
              const opsUpdates = await fetchOpsConsoleVariableUpdatesForPage(servicePageId, " | ");
              if (Object.keys(opsUpdates).length) {
                applyVariableOverrides(opsUpdates);
              }

            } else if (action.action === "auth.logout") {

              applyVariableOverrides({

                "$app_user.id": "",

                "$app_user.email": "",

                "$app_user.display_name": "",

                "$app_user.role": "",

                "$app_user.logged_in": false,

                ops_release_count: "",
                ops_latest_release_note: "",
                ops_latest_release_env: "",
                ops_latest_release_url: "",
                ops_latest_release_at: "",
                ops_deployed_at: "",
                ops_current_version_id: "",
                ops_prod_url: "",
                ops_last_backup_kind: "",
                ops_runbook_release: "",
                ops_runbook_rollback: "",
                ops_runbook_backup: "",
                ops_policy_rule_count: "",
                ops_risk_incident_count: "",
                ops_sanction_count: "",
                ops_approval_request_count: "",
                ops_events_24h: "",
                ops_app_collections: "",
                ops_app_records: "",
                ops_media_assets: "",
                ops_queued_jobs: "",
                ops_dead_lettered_jobs: "",
                ops_page_audit_24h: "",
                ops_app_audit_24h: "",
                ops_latest_app_audit_action: "",
                ops_latest_app_audit_at: "",
                ops_latest_page_audit_action: "",
                ops_latest_page_audit_at: "",
                policy_eval_decision: "",
                policy_eval_allowed: false,
                policy_eval_requires_approval: false,
                policy_eval_blocked: false,
                policy_eval_risk_score: 0,
                policy_eval_reasons: "",
                policy_eval_request_id: "",

              });

            }

            if (action.action === "todo.create") {
              const todoRes = await fetch(`/api/pages/${servicePageId}/todos`, { credentials: "include" });
              const todoData = await todoRes.json().catch(() => null);
              if (Array.isArray(todoData?.todos)) {
                const sep = ", ";
                applyVariableOverrides({
                  todo_items: todoData.todos.map((t: { title?: string }) => t.title ?? "").join(sep),
                  todo_list: todoData.todos.map((t: { title?: string }) => t.title ?? "").join(sep),
                  todo_meta: todoData.todos.map((t: { done?: boolean }) => (t.done ? "완료" : "미완료")).join(sep),
                });
              }
            } else if (action.action === "note.save") {
              const noteRes = await fetch(`/api/pages/${servicePageId}/note`, { credentials: "include" });
              const noteData = await noteRes.json().catch(() => null);
              const content = noteData?.note?.content ?? noteData?.content ?? "";
              if (typeof content === "string") {
                applyVariableOverrides({ note_content: content, noteContent: content });
              }
            } else if (action.action === "kanban.column.create" || action.action === "kanban.card.create") {
              const kanbanRes = await fetch(`/api/pages/${servicePageId}/kanban/columns`, { credentials: "include" });
              const kanbanData = await kanbanRes.json().catch(() => null);
              if (Array.isArray(kanbanData?.columns)) {
                const sep = ", ";
                const cards: string[] = [];
                kanbanData.columns.forEach((column: { title?: string; cards?: Array<{ title?: string }> }) => {
                  (column.cards ?? []).forEach((card) => cards.push(card.title ?? ""));
                });
                applyVariableOverrides({
                  kanban_columns: kanbanData.columns.map((c: { title?: string }) => c.title ?? "").join(sep),
                  kanbanColumns: kanbanData.columns.map((c: { title?: string }) => c.title ?? "").join(sep),
                  kanban_cards: cards.join(sep),
                  kanbanCards: cards.join(sep),
                });
              }
            } else if (
              action.action === "reservation.create" ||
              action.action === "reservation.transition" ||
              action.action === "ticket.create" ||
              action.action === "ticket.reply" ||
              action.action === "document.submit" ||
              action.action === "document.decide"
            ) {
              const sep = " | ";
              const partnerUpdates = await fetchPartnerPortalVariableUpdatesForPage(servicePageId, sep);
              if (Object.keys(partnerUpdates).length) {
                applyVariableOverrides(partnerUpdates);
              }
            } else if (
              action.action === "operations.release.record" ||
              action.action === "operations.runbook.generate" ||
              action.action === "billing.checkout" ||
              action.action === "billing.invoice.pay"
            ) {
              const opsUpdates = await fetchOpsConsoleVariableUpdatesForPage(servicePageId, " | ");
              if (Object.keys(opsUpdates).length) {
                applyVariableOverrides(opsUpdates);
              }
            } else if (action.action === "policy.evaluate") {
              const policyEvaluationUpdates = buildPolicyEvaluationVariableUpdates(data, " | ");
              if (Object.keys(policyEvaluationUpdates).length) {
                applyVariableOverrides(policyEvaluationUpdates);
              }
              const opsUpdates = await fetchOpsConsoleVariableUpdatesForPage(servicePageId, " | ");
              if (Object.keys(opsUpdates).length) {
                applyVariableOverrides(opsUpdates);
              }
            }

            applyVariableOverrides({

              service_last_action: action.action,

              service_last_ok: true,

              service_last_error: "",

              service_last_response: JSON.stringify(data),

            });

            pushNotice({ type: "success", message: descriptor.successMessage });

            if (action.nextPageId) {

              startPageTransition(currentPageId ?? "", action.nextPageId, transitionType, transitionOpts);

            }

          } catch (error) {

            const message = error instanceof Error ? error.message : "service_action_failed";

            applyVariableOverrides({

              service_last_action: action.action,

              service_last_ok: false,

              service_last_error: message,

            });

            pushNotice({ type: "error", message });

          }

        })();

        return;

      }

      if (action.type === "appAuth") {

        const authPageId = appPageId;

        if (!authPageId) {

          pushNotice({ type: "error", message: "인증에는 앱 페이지 ID가 필요합니다." });

          return;

        }

        if (action.action === "logout") {

          (async () => {

            try {

              await fetch(`/api/app/${authPageId}/auth/logout`, { method: "POST", credentials: "include" });

              applyVariableOverrides({

                "$app_user.id": "", "$app_user.email": "", "$app_user.display_name": "",

                "$app_user.role": "", "$app_user.logged_in": false,

              });

              pushNotice({ type: "success", message: "로그아웃되었습니다." });

              if (action.nextPageId) startPageTransition(currentPageId ?? "", action.nextPageId, "instant");

            } catch { pushNotice({ type: "error", message: "로그아웃에 실패했습니다." }); }

          })();

          return;

        }

        const pageId = source?.pageId ?? currentPageId;

        const scopeIds = resolveSubmitScopeIds(currentDoc, pageId, source?.nodeId ?? null);

        const payload = buildSubmitPayload({ pageId, scopeIds });

        const email = String(payload.fields.email ?? "");

        const password = String(payload.fields.password ?? "");

        const displayName = payload.fields.display_name ? String(payload.fields.display_name) : undefined;

        if (!email || !password) {

          pushNotice({ type: "error", message: "이메일과 비밀번호를 입력해 주세요." });

          return;

        }

        const endpoint = action.action === "register"

          ? `/api/app/${authPageId}/auth/register`

          : `/api/app/${authPageId}/auth/login`;

        (async () => {

          try {

            const res = await fetch(endpoint, {

              method: "POST",

              headers: { "Content-Type": "application/json" },

              credentials: "include",

              body: JSON.stringify({ email, password, ...(displayName ? { display_name: displayName } : {}) }),

            });

            const data = await res.json();

            if (data.ok && data.user) {

              applyVariableOverrides({

                "$app_user.id": data.user.id,

                "$app_user.email": data.user.email,

                "$app_user.display_name": data.user.display_name ?? "",

                "$app_user.role": data.user.role ?? "user",

                "$app_user.logged_in": true,

              });

              pushNotice({ type: "success", message: action.action === "register" ? "가입되었습니다." : "로그인되었습니다." });

              if (action.nextPageId) startPageTransition(currentPageId ?? "", action.nextPageId, "instant");

            } else {

              pushNotice({ type: "error", message: data.error ?? "인증에 실패했습니다." });

            }

          } catch { pushNotice({ type: "error", message: "네트워크 오류가 발생했습니다." }); }

        })();

        return;

      }

      if (action.type === "url") {

        const href = action.url?.trim();

        if (!href) return;

        if (action.openInNewTab === false) {

          window.location.href = href;

        } else {

          window.open(href, "_blank", "noopener,noreferrer");

        }

        return;

      }

      if (action.type === "submit") {

        const rawEndpoint = action.url?.trim();

        const hasPageIdPlaceholder = !!rawEndpoint && /\{pageId\}|\:pageId|\{\{pageId\}\}/.test(rawEndpoint);

        if (hasPageIdPlaceholder && !appPageId) {

          if (previewMode) {

            pushNotice({ type: "success", message: SUBMIT_SUCCESS_MESSAGE });

          } else {

            pushNotice({ type: "error", message: "Page ID is required." });

          }

          return;

        }

        const endpoint =

          rawEndpoint && appPageId

            ? rawEndpoint.replace(/\{pageId\}|\:pageId|\{\{pageId\}\}/g, appPageId)

            : rawEndpoint;

        if (!endpoint) return;

        const pageId = source?.pageId ?? currentPageId;

        const scopeIds = resolveSubmitScopeIds(currentDoc, pageId, source?.nodeId ?? null);

        const payload = buildSubmitPayload({ pageId, scopeIds });



        if (isChatRoomContext(currentDoc, pageId, source?.nodeId ?? null)) {

          const message =

            (typeof payload.fields.message === "string" && payload.fields.message.trim()) ||

            (typeof payload.fields.content === "string" && payload.fields.content.trim()) ||

            (typeof payload.fields.text === "string" && payload.fields.text.trim()) ||

            "";

          if (!message && endpoint && endpoint.includes("/chat")) {

            pushNotice({ type: "error", message: "메시지를 입력해 주세요." });

            return;

          }

          if (message) {

            const prevPreviews = variableOverrides.chat_previews ?? variableOverrides.chat_messages;

            const prevList =

              typeof prevPreviews === "string" && prevPreviews.trim()

                ? parseStringList(prevPreviews, /[,|;]+/)

                : [];

            const second = prevList[1] ?? "";

            applyVariableOverrides({

              chat_last_message: message,

              last_message: message,

              chat_previews: [message, second].join("|"),

              chat_messages: [message, second].join("|"),

            });

            setControlTextState((prev) => {

              const next = { ...prev };

              controlRootRoles.forEach((role, rootId) => {

                if (!scopeIds.has(rootId)) return;

                if (role.type !== "input") return;

                const key = controlFields.get(rootId)?.key ?? "";

                if (key === "message" || key === "content" || key === "text") next[rootId] = "";

              });

              return next;

            });

            pushNotice({ type: "success", message: SUBMIT_SENT_MESSAGE });

          }

        }

        if (isLiveContext(currentDoc, pageId, source?.nodeId ?? null)) {

          const message =

            (typeof payload.fields.message === "string" && payload.fields.message.trim()) ||

            (typeof payload.fields.content === "string" && payload.fields.content.trim()) ||

            (typeof payload.fields.text === "string" && payload.fields.text.trim()) ||

            "";

          if (message) {

            const raw =

              (typeof variableOverrides.live_messages === "string" && variableOverrides.live_messages) ||

              (typeof variableOverrides.liveMessages === "string" && variableOverrides.liveMessages) ||

              "";

            const items = raw ? parseStringList(raw, /[,|;]/) : [];

            items.push(message);

            applyVariableOverrides({

              live_last_message: message,

              live_last: message,

              live_messages: items.join(", "),

              liveMessages: items.join(", "),

            });

            setControlTextState((prev) => {

              const next = { ...prev };

              controlRootRoles.forEach((role, rootId) => {

                if (!scopeIds.has(rootId)) return;

                if (role.type !== "input") return;

                const key = controlFields.get(rootId)?.key ?? "";

                if (key === "message" || key === "content" || key === "text") next[rootId] = "";

              });

              return next;

            });

            pushNotice({ type: "success", message: "Live message sent." });

          }

        }

        if (isAttachmentContext(currentDoc, pageId, source?.nodeId ?? null)) {

          const files = payload.files ?? {};

          const names: string[] = [];

          Object.values(files).forEach((entry) => {

            if (!entry) return;

            if (Array.isArray(entry)) {

              entry.forEach((file) => {

                if (file?.name) names.push(file.name);

              });

              return;

            }

            if (typeof entry === "object" && "name" in entry && entry.name) names.push((entry as File).name);

          });

          if (names.length) {

            applyVariableOverrides({ attachment_uploaded: names.join(", "), attachment_uploaded_count: names.length });

            pushNotice({ type: "success", message: "Upload ready." });

          }

        }





        if (isCalendarContext(currentDoc, pageId, source?.nodeId ?? null)) {

          const fields = payload.fields as Record<string, string | boolean>;

          const title =

            (typeof fields.eventTitle === "string" && fields.eventTitle.trim()) ||

            (typeof fields.title === "string" && fields.title.trim()) ||

            (typeof fields.name === "string" && fields.name.trim()) ||

            "";

          if (title) {

            const raw = (typeof variableOverrides.calendar_events === "string" && variableOverrides.calendar_events) || "";

            const items = raw ? parseStringList(raw, /[,|;]/) : [];

            const selected =

              (typeof variableOverrides.selectedEvent === "string" && variableOverrides.selectedEvent) ||

              (typeof variableOverrides.selected_event === "string" && variableOverrides.selected_event) ||

              "";

            const selectedKey = normalizeLooseLabel(selected);

            let nextItems = items;

            if (selectedKey) {

              let replaced = false;

              nextItems = items.map((item) => {

                if (normalizeLooseLabel(item) === selectedKey) {

                  replaced = true;

                  return title;

                }

                return item;

              });

              if (!replaced) nextItems = [...nextItems, title];

            } else if (!items.some((item) => normalizeLooseLabel(item) === normalizeLooseLabel(title))) {

              nextItems = [...items, title];

            }

            applyVariableOverrides({ calendar_events: nextItems.join(", "), selectedEvent: title, selected_event: title });

          }

        }

        const interpolated = endpoint.replace(/(\{\{([^}]+)\}\}|\{([^}]+)\}|:([A-Za-z0-9_-]+))/g, (match, _g1, g2, g3, g4) => {

          const key = (g2 ?? g3 ?? g4 ?? "").trim();

          if (!key) return match;

          const value = (payload.fields as Record<string, string | boolean>)[key];

          if (value === undefined || value === null || value === "") return match;

          return encodeURIComponent(String(value));

        });

        const unresolved = interpolated.match(/(\{\{[^}]+\}\}|\{[^}]+\}|:[A-Za-z0-9_-]+)/g);

        if (unresolved?.length) {

          pushNotice({ type: "error", message: "Required identifier is missing." });

          return;

        }

        const isRecovery = isRecoveryContext(currentDoc, pageId, source?.nodeId ?? null);

        const isDelete = isDeleteContext(currentDoc, pageId, source?.nodeId ?? null);

        const isChatSubmitWithMessage =

          endpoint?.includes("/chat") &&

          isChatRoomContext(currentDoc, pageId, source?.nodeId ?? null) &&

          ((typeof payload.fields.message === "string" && payload.fields.message.trim()) ||

            (typeof payload.fields.content === "string" && payload.fields.content.trim()) ||

            (typeof payload.fields.text === "string" && payload.fields.text.trim()));

        if (!isChatSubmitWithMessage) {

          const requiredStatus = resolveRequiredStatus(scopeIds);

          if (!requiredStatus.ok) {

            const message = isDelete

              ? "삭제 확인 문구를 입력해 주세요."

              : isRecovery

                ? "이메일을 입력해 주세요."

                : "필수 항목을 입력해 주세요.";

            pushNotice({ type: "error", message });

            return;

          }

        }

        const required = currentDoc.prototype?.submitRequiredFields;

        if (required?.length) {

          for (const key of required) {

            const val = payload.fields[key];

            const fileVal = payload.files?.[key];

            if ((val === undefined || val === null || val === "") && !fileVal) {

              pushNotice({ type: "error", message: "필수 항목을 입력해 주세요." });

              return;

            }

          }

        }

        const isOtp = isOtpContext(currentDoc, pageId, source?.nodeId ?? null);

        if (isOtp) {

          const otpIds = Array.from(controlRootRoles.entries())

            .filter(([rootId, role]) => role.type === "input" && scopeIds.has(rootId))

            .filter(([rootId]) => matchesPattern(controlFields.get(rootId)?.label ?? "", OTP_LABEL_PATTERN))

            .map(([rootId]) => rootId);

          const otpValue = typeof payload.fields.otp === "string" ? payload.fields.otp : "";

          const expectedLength = otpIds.length;

          if (!otpValue || (expectedLength > 0 && otpValue.length < expectedLength)) {

            pushNotice({ type: "error", message: "인증 코드를 모두 입력해 주세요." });

            return;

          }

        }

        const actionRootId = source?.nodeId ? resolveActionRootId(currentDoc, source.nodeId, controlRootRoles) : null;

        if (endpoint.startsWith("mock://")) {

          const kind = endpoint.slice("mock://".length).toLowerCase();

          const isError = kind.startsWith("error");

          const isSent = kind.startsWith("sent");

          const message = isError

            ? isDelete

              ? "삭제 요청이 실패했습니다."

              : isRecovery

                ? "복구 메일 전송이 실패했습니다."

                : SUBMIT_FAILED_MESSAGE

            : isSent

              ? isRecovery

                ? "복구 메일이 전송되었습니다."

                : SUBMIT_SENT_MESSAGE

              : isDelete

                ? "삭제 요청이 완료되었습니다."

                : SUBMIT_SUCCESS_MESSAGE;

          pushNotice({ type: isError ? "error" : "success", message });

          if (isDelete && actionRootId) {

            startCooldown(actionRootId, DELETE_COOLDOWN_MS);

          }

          if (!isError && action.nextPageId && currentPageId && currentDoc.pages.some((page) => page.id === action.nextPageId)) {

            setOverlayStack([]);

            setHistory((prev) => [...prev, currentPageId]);

            startPageTransition(currentPageId, action.nextPageId, transitionType, transitionOpts);

          }

          return;

        }

        const method = action.method ?? "POST";

        const hasFiles = Object.keys(payload.files ?? {}).length > 0;

        const target = new URL(interpolated, window.location.origin);

        const queryFields = Object.fromEntries(target.searchParams.entries());

        const mergedFields = { ...queryFields, ...payload.fields };

        const sameOrigin = isSameOriginUrl(target.toString());

        const pathname = target.pathname;

        if (pathname.includes("/chat")) {

          const msg = mergedFields.message ?? mergedFields.content ?? mergedFields.text;

          if (msg != null && typeof msg === "string") {

            mergedFields.content = msg;

            mergedFields.message = msg;

          }

        }

        const meta = { _pageId: payload.pageId ?? "", _submittedAt: payload.submittedAt };

        const body = { ...mergedFields, ...meta };

        const storedAnonId = typeof localStorage !== "undefined" ? localStorage.getItem("anon_user_id") : null;

        const passwordFields = Array.from(controlFields.entries())

          .filter(([, meta]) => meta.key === "password" || meta.key === "passwordConfirm")

          .map(([rootId]) => rootId);



        const runSubmit = async () => {

          const tryFallbackNavigate = (message: string) => {

            if (!previewMode) return false;

            const fallbackId = action.nextPageId ?? target.searchParams.get("nextPageId");

            if (!fallbackId || !currentPageId) return false;

            if (!currentDoc.pages.some((page) => page.id === fallbackId)) return false;

            setOverlayStack([]);

            setHistory((prev) => [...prev, currentPageId]);

            startPageTransition(currentPageId, fallbackId, transitionType);

            pushNotice({ type: "success", message });

            return true;

          };

          try {

            const anonId = sameOrigin ? (storedAnonId ?? (await ensureAnonSession())) : null;

            if (hasFiles && method === "GET") {

              pushNotice({ type: "error", message: "파일 전송에는 GET을 사용할 수 없습니다." });

              return;

            }

            if (method === "GET") {

              Object.entries(body).forEach(([key, value]) => {

                if (value === undefined) return;

                target.searchParams.set(key, String(value));

              });

              await fetch(target.toString(), sameOrigin ? { method: "GET", credentials: "include" } : { method: "GET", mode: "no-cors" });

              pushNotice({ type: "success", message: sameOrigin ? SUBMIT_SUCCESS_MESSAGE : SUBMIT_SENT_MESSAGE });

              if (action.nextPageId && currentPageId && currentDoc.pages.some((page) => page.id === action.nextPageId)) {

                setOverlayStack([]);

                setHistory((prev) => [...prev, currentPageId]);

                startPageTransition(currentPageId, action.nextPageId, transitionType, transitionOpts);

              }

              return;

            }



            if (hasFiles) {

              if (!sameOrigin) {

                pushNotice({ type: "success", message: SUBMIT_SENT_MESSAGE });

                return;

              }

              pushNotice({ type: "info", message: "파일 전송 중..." });

              const formData = new FormData();

              Object.entries(mergedFields).forEach(([key, value]) => {

                if (value === undefined) return;

                formData.append(key, String(value));

              });

              Object.entries(payload.files ?? {}).forEach(([key, value]) => {

                if (Array.isArray(value)) {

                  value.forEach((file) => formData.append(key, file));

                } else {

                  formData.append(key, value);

                }

              });

              formData.append("_pageId", payload.pageId ?? "");

              formData.append("_submittedAt", payload.submittedAt);



              const res = await fetch(target.toString(), {

                method,

                headers: {

                  ...(anonId ? { "x-anon-user-id": anonId } : {}),

                },

                body: formData,

                credentials: "include",

              });



              const data = await res.json().catch(() => null);

              if (res.ok) {

                const nextPageId =

                  data?.nextPageId ??

                  action.nextPageId ??

                  target.searchParams.get("nextPageId");

                if (data?.redirectUrl && typeof data.redirectUrl === "string") {

                  window.location.href = data.redirectUrl;

                  return;

                }

                if (data?.anonUserId && typeof localStorage !== "undefined") {

                  localStorage.setItem("anon_user_id", data.anonUserId);

                }

                if (pathname.endsWith("/api/auth/logout") && typeof localStorage !== "undefined") {

                  localStorage.removeItem("anon_user_id");

                }

                if (nextPageId && currentPageId && currentDoc.pages.some((page) => page.id === nextPageId)) {

                  setOverlayStack([]);

                  setHistory((prev) => [...prev, currentPageId]);

                  startPageTransition(currentPageId, nextPageId, transitionType, transitionOpts);

                }

                if (passwordFields.length) {

                  setControlTextState((prev) => {

                    const next = { ...prev };

                    passwordFields.forEach((id) => {

                      next[id] = "";

                    });

                    return next;

                  });

                }

                if (hasFiles) {

                  setControlFileState((prev) => {

                    const next = { ...prev };

                    scopeIds.forEach((id) => {

                      if (next[id]) delete next[id];

                    });

                    return next;

                  });

                }

                if (isDelete && actionRootId) {

                  startCooldown(actionRootId, DELETE_COOLDOWN_MS);

                }

                const fileNoticeMsg = typeof data?.message === "string" ? data.message : SUBMIT_SUCCESS_MESSAGE;

                pushNotice({ type: "success", message: fileNoticeMsg });

              } else {

                const fallbackMessage = `${resolveSubmitError(data?.error, SUBMIT_FAILED_MESSAGE)} (제출 실패 시 대안)`;

                if (!tryFallbackNavigate(fallbackMessage)) {

                  pushNotice({

                    type: "error",

                    message: resolveSubmitError(data?.error, SUBMIT_FAILED_MESSAGE),

                  });

                }

              }

              return;

            }



            const res = await fetch(sameOrigin ? target.toString() : interpolated, {

              method,

              headers: {

                "Content-Type": "application/json",

                ...(sameOrigin && anonId ? { "x-anon-user-id": anonId } : {}),

              },

              body: JSON.stringify(body),

              ...(sameOrigin ? { credentials: "include" } : { mode: "no-cors" as RequestMode }),

            });



            if (!sameOrigin) {

              pushNotice({ type: "success", message: SUBMIT_SENT_MESSAGE });

              return;

            }



            const data = await res.json().catch(() => null);

            if (res.ok) {

              const nextPageId =

                data?.nextPageId ??

                action.nextPageId ??

                target.searchParams.get("nextPageId");

              if (data?.redirectUrl && typeof data.redirectUrl === "string") {

                window.location.href = data.redirectUrl;

                return;

              }

              if (data?.anonUserId && typeof localStorage !== "undefined") {

                localStorage.setItem("anon_user_id", data.anonUserId);

              }

              if (pathname.endsWith("/api/auth/logout") && typeof localStorage !== "undefined") {

                localStorage.removeItem("anon_user_id");

              }

              if (nextPageId && currentPageId && currentDoc.pages.some((page) => page.id === nextPageId)) {

                setOverlayStack([]);

                setHistory((prev) => [...prev, currentPageId]);

                startPageTransition(currentPageId, nextPageId, transitionType, transitionOpts);

              }

              if (passwordFields.length) {

                setControlTextState((prev) => {

                  const next = { ...prev };

                  passwordFields.forEach((id) => {

                    next[id] = "";

                  });

                  return next;

                });

              }

              if (isDelete && actionRootId) {

                startCooldown(actionRootId, DELETE_COOLDOWN_MS);

              }

              const origin = typeof window !== "undefined" ? window.location.origin : "";

              const refetchHeaders: Record<string, string> = anonId ? { "x-anon-user-id": anonId } : {};

              const sep = "|";

              if (appPageId && pathname === `/api/app/${appPageId}/messages`) {

                setControlTextState((prev) => {

                  const next = { ...prev };

                  controlRootRoles.forEach((role, rootId) => {

                    if (!scopeIds.has(rootId)) return;

                    if (role.type !== "input") return;

                    const key = controlFields.get(rootId)?.key ?? "";

                    if (key === "message" || key === "content" || key === "text") next[rootId] = "";

                  });

                  return next;

                });

                await refetchAppMessages();

                onChatSent?.();

              }

              if (pathname.includes("/chat") && appPageId) {

                try {

                  const chatRes = await fetch(`${origin}/api/pages/${appPageId}/chat?limit=50`, {

                    credentials: "include",

                    headers: refetchHeaders,

                  });

                  const chatData = await chatRes.json().catch(() => null);

                  const messages = Array.isArray(chatData?.messages) ? chatData.messages : [];

                  const previews = messages.map((m: { content?: string }) => (m.content ?? "").slice(0, 100)).join(sep);

                  const times = messages.map((m: { createdAt?: string }) => m.createdAt ?? "").join(sep);

                  const titles = messages

                    .map((m: { senderAnonId?: string; senderUserId?: string }) => m.senderAnonId ?? m.senderUserId ?? "User")

                    .join(sep);

                  if (previews || times || titles) {

                    applyVariableOverrides({

                      chat_previews: previews,

                      chat_messages: previews,

                      chat_times: times,

                      chatTimes: times,

                      chat_titles: titles,

                      chat_titles_list: titles,

                    });

                  }

                } catch {

                  // ignore

                }

                onChatSent?.();

              }

              if (pathname.includes("/todos") && appPageId) {

                try {

                  const res = await fetch(`${origin}/api/pages/${appPageId}/todos`, { credentials: "include", headers: refetchHeaders });

                  const d = await res.json().catch(() => null);

                  if (Array.isArray(d?.todos)) {

                    applyVariableOverrides({

                      todo_items: d.todos.map((t: { title?: string }) => t.title ?? "").join(sep),

                      todo_list: d.todos.map((t: { title?: string }) => t.title ?? "").join(sep),

                      todo_meta: d.todos.map((t: { done?: boolean }) => (t.done ? "완료" : "미완료")).join(sep),

                    });

                  }

                } catch {

                  // ignore

                }

              }

              if (pathname.includes("/note") && appPageId) {

                try {

                  const res = await fetch(`${origin}/api/pages/${appPageId}/note`, { credentials: "include", headers: refetchHeaders });

                  const d = await res.json().catch(() => null);

                  const content = d?.note?.content ?? d?.content ?? "";

                  if (typeof content === "string") applyVariableOverrides({ note_content: content, noteContent: content });

                } catch {

                  // ignore

                }

              }

              if (pathname.includes("/calendar") && appPageId) {

                try {

                  const res = await fetch(`${origin}/api/pages/${appPageId}/calendar?from=1970-01-01&to=2100-12-31`, {

                    credentials: "include",

                    headers: refetchHeaders,

                  });

                  const d = await res.json().catch(() => null);

                  if (Array.isArray(d?.events)) {

                    applyVariableOverrides({

                      calendar_events: d.events.map((e: { title?: string }) => e.title ?? "").join(sep),

                      calendar_event_titles: d.events.map((e: { title?: string }) => e.title ?? "").join(sep),

                      calendar_event_metas: d.events.map((e: { startAt?: string }) => (e.startAt ?? "").slice(0, 16)).join(sep),

                    });

                  }

                } catch {

                  // ignore

                }

              }

              const postNoticeMsg = typeof data?.message === "string" ? data.message : SUBMIT_SUCCESS_MESSAGE;

              pushNotice({ type: "success", message: postNoticeMsg });

            } else {

              const fallbackMessage = `${resolveSubmitError(data?.error, SUBMIT_FAILED_MESSAGE)} (제출 실패 시 대안)`;

              if (!tryFallbackNavigate(fallbackMessage)) {

                pushNotice({

                  type: "error",

                  message: resolveSubmitError(data?.error, SUBMIT_FAILED_MESSAGE),

                });

              }

            }

          } catch {

            const fallbackMessage = `${SUBMIT_FAILED_MESSAGE} (제출 실패 시 대안)`;

            if (!tryFallbackNavigate(fallbackMessage)) {

              pushNotice({ type: "error", message: SUBMIT_FAILED_MESSAGE });

            }

          }

        };



        void runSubmit();

        return;

      }

      if (action.type === "navigate") {

        if (!currentDoc.pages.some((page) => page.id === action.targetPageId)) return;

        if (action.targetPageId === currentPageId) return;

        const scopeIds = source?.nodeId ? resolveFormScopeIds(currentDoc, currentPageId, source.nodeId) : null;

        if (scopeIds) {

          const requiredStatus = resolveRequiredStatus(scopeIds);

          if (!requiredStatus.ok) {

            pushNotice({ type: "error", message: "필수 항목을 입력해 주세요." });

            return;

          }

        }

        setOverlayStack([]);

        setHistory((prev) => [...prev, currentPageId]);

        startPageTransition(currentPageId, action.targetPageId, transitionType, transitionOpts);

        return;

      }

      if (action.type === "back") {

        if (overlayRef.current.length) {

          closeOverlay(transitionType, transitionOpts);

          return;

        }

        const prevId = historyRef.current[historyRef.current.length - 1];

        if (!prevId) return;

        setHistory((prev) => prev.slice(0, -1));

        startPageTransition(currentPageId, prevId, transitionType, transitionOpts);

        return;

      }

      if (action.type === "overlay") {

        if (!currentDoc.pages.some((page) => page.id === action.targetPageId)) return;

        openOverlay(action.targetPageId, transitionType, transitionOpts, normalizeOverlayPresentation(action));

        return;

      }

      if (action.type === "closeOverlay") {

        closeOverlay(transitionType, transitionOpts);

        return;

      }

      if (action.type === "scrollTo") {

        const el = typeof document !== "undefined" ? document.querySelector(`[data-node-id="${action.targetNodeId}"]`) : null;

        if (el instanceof Element && typeof (el as Element & { scrollIntoView?: unknown }).scrollIntoView === "function") {

          el.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });

        }

        return;

      }

      if (action.type === "setVariant") {

        const targetId = action.targetNodeId ?? source?.nodeId;

        if (targetId) {

          setInstanceVariantOverrides((prev) => ({ ...prev, [targetId]: action.variantId }));

        }

        return;

      }

    };

    if (nextDelay > 0) {

      const timeout = window.setTimeout(doAction, nextDelay);

      timersRef.current.push(timeout);

    } else {

      doAction();

    }

  }, [

    appPageId,

    applyPermissionDecision,

    applyVariableOverrides,

    buildSubmitPayload,

    closeOverlay,

    controlFields,

    controlRootRoles,

    ensureAnonSession,

    globalState,

    handleCookieBannerAction,

    openOverlay,

    previewMode,

    pushNotice,

    refetchAppMessages,

    resolveRequiredStatus,

    startCooldown,

    startPageTransition,

    variableMode,

    variableOverrides,

    applyGlobalStateValue,

    onChatSent,

  ]);



  const runLoadInteractions = useCallback(

    (pageId: string | null) => {

      if (!pageId) return;

      const currentDoc = docRef.current;

      const page = currentDoc.pages.find((item) => item.id === pageId) ?? currentDoc.pages[0];

      if (!page) return;

      const ids = collectDescendants(currentDoc, page.rootId);

      ids.forEach((id) => {

        const node = currentDoc.nodes[id];

        const interactions = node?.prototype?.interactions ?? [];

        interactions.forEach((interaction) => {

          if (interaction.trigger === "load") {

            handleAction(interaction.action, { nodeId: node?.id, pageId: page.id });

          }

        });

      });

    },

    [handleAction],

  );



  const handleNavigate = useCallback(

    (event: NavigateEvent) => {

      handleAction(event.action, { nodeId: event.nodeId, pageId: event.pageId });

    },

    [handleAction],

  );



  const topOverlayEntry = overlayStack.length ? overlayStack[overlayStack.length - 1] : null;
  const topOverlayId = topOverlayEntry?.id ?? null;

  const allowInteraction = !pageTransition && !overlayTransition;



  const baseLayerId = pageTransition ? pageTransition.fromId : basePageId;

  const nextLayerId = pageTransition?.toId ?? null;



  useEffect(() => {

    if (!allowInteraction) return;

    void ensureAnonSession();

  }, [allowInteraction, ensureAnonSession]);



  useEffect(() => {

    if (!allowInteraction) return;

    runLoadInteractions(basePageId);

  }, [allowInteraction, basePageId, runLoadInteractions]);



  useEffect(() => {

    if (!allowInteraction || !basePageId) return;

    if (typeof window === "undefined") return;

    const raw = window.location.hash ? window.location.hash.slice(1) : "";

    if (!raw) return;

    const label = decodeURIComponent(raw);

    if (!label) return;

    const currentDoc = docRef.current;

    const targetId = findSectionNodeId(currentDoc, basePageId, label);

    if (!targetId) return;

    const el = document.querySelector(`[data-node-id="${targetId}"]`);

    if (el instanceof HTMLElement) {

      el.scrollIntoView({ behavior: "smooth", block: "start", inline: "nearest" });

    }

  }, [allowInteraction, basePageId]);



  useEffect(() => {

    if (!allowInteraction || !basePageId) return;

    const currentDoc = docRef.current;

    const page = currentDoc.pages.find((p) => p.id === basePageId) ?? currentDoc.pages[0];

    if (!page) return;

    const descendantIds = Array.from(collectDescendants(currentDoc, page.rootId));

    const scrollableNodeIds = descendantIds.filter((id) => currentDoc.nodes[id]?.overflowScrolling);

    const threshold = 24;

    let cleanup: (() => void) | null = null;

    if (scrollableNodeIds.length) {

      const containerId = scrollableNodeIds[0];

      const nodeEl = typeof document !== "undefined" ? document.querySelector(`[data-node-id="${containerId}"]`) : null;

      const scrollEl = nodeEl?.querySelector("foreignObject div") as HTMLElement | null;

      if (!scrollEl) return;

      const update = () => {

        const compact = scrollEl.scrollTop > threshold || scrollEl.scrollLeft > threshold;

        setHeaderCompact(compact);

      };

      scrollEl.addEventListener("scroll", update, { passive: true });

      update();

      cleanup = () => scrollEl.removeEventListener("scroll", update);

    } else if (typeof window !== "undefined") {

      const update = () => {

        const compact = window.scrollY > threshold;

        setHeaderCompact(compact);

      };

      window.addEventListener("scroll", update, { passive: true });

      update();

      cleanup = () => window.removeEventListener("scroll", update);

    }

    return () => {

      if (cleanup) cleanup();

    };

  }, [allowInteraction, basePageId]);



  useEffect(() => {

    if (!allowInteraction || !basePageId || stickyCtaRootIds.size === 0) {

      deferStateUpdate(() => setStickyVisible(false));

      return;

    }

    const currentDoc = docRef.current;

    const page = currentDoc.pages.find((p) => p.id === basePageId) ?? currentDoc.pages[0];

    if (!page) return;

    const descendantIds = Array.from(collectDescendants(currentDoc, page.rootId));

    const scrollableNodeIds = descendantIds.filter((id) => currentDoc.nodes[id]?.overflowScrolling);

    const threshold = STICKY_CTA_SCROLL_THRESHOLD;

    let cleanup: (() => void) | null = null;

    if (scrollableNodeIds.length) {

      const containerId = scrollableNodeIds[0];

      const nodeEl = typeof document !== "undefined" ? document.querySelector(`[data-node-id="${containerId}"]`) : null;

      const scrollEl = nodeEl?.querySelector("foreignObject div") as HTMLElement | null;

      if (!scrollEl) return;

      const update = () => {

        const visible = scrollEl.scrollTop > threshold || scrollEl.scrollLeft > threshold;

        setStickyVisible(visible);

      };

      scrollEl.addEventListener("scroll", update, { passive: true });

      update();

      cleanup = () => scrollEl.removeEventListener("scroll", update);

    } else if (typeof window !== "undefined") {

      const update = () => {

        const visible = window.scrollY > threshold;

        setStickyVisible(visible);

      };

      window.addEventListener("scroll", update, { passive: true });

      update();

      cleanup = () => window.removeEventListener("scroll", update);

    }

    return () => {

      if (cleanup) cleanup();

    };

  }, [allowInteraction, basePageId, stickyCtaRootIds]);



  useEffect(() => {

    if (!basePageId) return;

    const currentDoc = docRef.current;

    const page = currentDoc.pages.find((p) => p.id === basePageId) ?? currentDoc.pages[0];

    if (!page) return;

    const pageLabel = normalizeLooseLabel(page.name ?? "");

    if (!pageLabel) return;

    const navGroups = new Map<string | null, Array<{ rootId: string; label: string }>>();

    controlRootRoles.forEach((role, rootId) => {

      if (role.type !== "choice") return;

      const isNavItem = isHeaderNavContext(currentDoc, rootId) || isTabbarContext(currentDoc, rootId) || isSidebarContext(currentDoc, rootId);

      if (!isNavItem) return;

      const label = resolveControlLabel(currentDoc as Doc, role, rootId);

      const parentId = currentDoc.nodes[rootId]?.parentId ?? null;

      const entry = navGroups.get(parentId) ?? [];

      entry.push({ rootId, label });

      navGroups.set(parentId, entry);

    });

    if (!navGroups.size) return;

    deferStateUpdate(() => {

      setControlState((prev) => {

        let changed = false;

        const next = { ...prev };

        navGroups.forEach((items) => {

          const match = items.find((item) => {

            const normalized = normalizeLooseLabel(item.label);

            return normalized && (pageLabel === normalized || pageLabel.includes(normalized) || normalized.includes(pageLabel));

          });

          items.forEach((item) => {

            const shouldBeActive = Boolean(match && match.rootId === item.rootId);

            if (next[item.rootId] !== shouldBeActive) {

              next[item.rootId] = shouldBeActive;

              changed = true;

            }

          });

        });

        return changed ? next : prev;

      });

    });

  }, [basePageId, controlRootRoles]);



  useEffect(() => {

    if (!basePageId) return;

    const currentDoc = docRef.current;

    const groups = new Map<string, { parentName: string; pages: Array<{ id: string; num: number }> }>();

    controlRootRoles.forEach((role, rootId) => {

      if (role.type !== "choice") return;

      const parentId = currentDoc.nodes[rootId]?.parentId;

      if (!parentId) return;

      const parentName = currentDoc.nodes[parentId]?.name ?? "";

      if (!isPaginationGroupName(parentName)) return;

      const label = resolveControlLabel(currentDoc as Doc, role, rootId);

      const num = parseNumericLabel(label);

      if (num == null) return;

      const entry = groups.get(parentId) ?? { parentName, pages: [] };

      entry.pages.push({ id: rootId, num });

      groups.set(parentId, entry);

    });

    if (!groups.size) return;

    const resolveLimit = () => {

      const candidates = ["pageSize", "perPage", "limit", "page_size", "per_page"];

      for (const key of candidates) {

        const value = variableOverrides[key];

        if (typeof value === "number" && Number.isFinite(value)) return value;

        if (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value))) return Number(value);

      }

      return 20;

    };

    const limit = resolveLimit();

    const updates: Record<string, string | number | boolean> = {};

    let firstPage: number | null = null;

    groups.forEach((group) => {

      group.pages.sort((a, b) => a.num - b.num);

      const active = group.pages.find((page) => controlState[page.id]) ?? group.pages[0];

      const pageNum = active?.num ?? 1;

      const groupKey = normalizeLooseLabel(group.parentName) || `pagination_${pageNum}`;

      updates[`page_${groupKey}`] = pageNum;

      updates[`offset_${groupKey}`] = Math.max(0, (pageNum - 1) * limit);

      if (firstPage === null) firstPage = pageNum;

    });

    if (firstPage !== null) {

      updates.page = firstPage;

      updates.offset = Math.max(0, (firstPage - 1) * limit);

      updateQueryParam("page", firstPage);

    }

    if (Object.keys(updates).length) applyVariableOverrides(updates);

  }, [applyVariableOverrides, basePageId, controlRootRoles, controlState, updateQueryParam, variableOverrides]);



  useEffect(() => {

    if (!basePageId) return;

    const currentDoc = docRef.current;

    const tabValue = variableOverrides.tab ?? variableOverrides.selectedTab ?? variableOverrides.filter ?? "";

    const dateValue = variableOverrides.date ?? variableOverrides.selectedDate ?? variableOverrides.filterDate ?? "";

    const tabKey = typeof tabValue === "string" ? normalizeLooseLabel(tabValue) : "";

    const dateKey = typeof dateValue === "string" ? normalizeLooseLabel(dateValue) : "";

    if (!tabKey && !dateKey) return;

    const groups = new Map<string, { type: "tab" | "date"; items: Array<{ id: string; label: string }> }>();

    controlRootRoles.forEach((role, rootId) => {

      if (role.type !== "choice") return;

      const isTab = hasAncestorMatching(currentDoc, rootId, SELECT_TABS_PATTERN);

      const isDate = hasAncestorMatching(currentDoc, rootId, DATE_SLIDER_PATTERN);

      if (!isTab && !isDate) return;

      const parentId = currentDoc.nodes[rootId]?.parentId ?? rootId;

      const entry = groups.get(parentId) ?? { type: isDate ? "date" : "tab", items: [] };

      const label = controlFields.get(rootId)?.label ?? resolveControlLabel(currentDoc as Doc, role, rootId);

      entry.items.push({ id: rootId, label });

      groups.set(parentId, entry);

    });

    if (!groups.size) return;

    deferStateUpdate(() => {

      setControlState((prev) => {

        let changed = false;

        const next = { ...prev };

        groups.forEach((group) => {

          const target = group.type === "date" ? dateKey : tabKey;

          if (!target) return;

          const match = group.items.find((item) => {

            const normalized = normalizeLooseLabel(item.label);

            return normalized && (normalized === target || normalized.includes(target) || target.includes(normalized));

          });

          if (!match) return;

          group.items.forEach((item) => {

            const shouldBeActive = item.id === match.id;

            if (next[item.id] !== shouldBeActive) {

              next[item.id] = shouldBeActive;

              changed = true;

            }

          });

        });

        return changed ? next : prev;

      });

    });

  }, [basePageId, controlFields, controlRootRoles, variableOverrides]);



  useEffect(() => {

    if (!basePageId) return;

    const currentDoc = docRef.current;

    const page = currentDoc.pages.find((p) => p.id === basePageId) ?? currentDoc.pages[0];

    if (!page) return;

    const scopeIds = collectDescendants(currentDoc, page.rootId);

    let activeLocaleLabel: string | null = null;

    let activeThemeLabel: string | null = null;

    let hasAccessibility = false;

    let highContrast = false;

    let largeText = false;



    controlRootRoles.forEach((role, rootId) => {

      if (!scopeIds.has(rootId)) return;

      if (role.type === "input") return;

      const label = controlFields.get(rootId)?.label ?? resolveControlLabel(currentDoc as Doc, role, rootId);

      if (!label) return;

      if (hasAncestorMatching(currentDoc, rootId, LOCALE_SECTION_PATTERN) && controlState[rootId]) {

        activeLocaleLabel = label;

      }

      if (hasAncestorMatching(currentDoc, rootId, THEME_SECTION_PATTERN) && controlState[rootId]) {

        activeThemeLabel = label;

      }

      if (hasAncestorMatching(currentDoc, rootId, ACCESSIBILITY_SECTION_PATTERN)) {

        hasAccessibility = true;

        if (matchesPattern(label, HIGH_CONTRAST_PATTERN) && controlState[rootId]) highContrast = true;

        if (matchesPattern(label, LARGE_TEXT_PATTERN) && controlState[rootId]) largeText = true;

      }

    });



    const nextTheme = activeThemeLabel ? resolveThemeKey(activeThemeLabel) : null;

    if (nextTheme) {

      applyVariableOverrides({ theme: nextTheme, themeMode: nextTheme });

      if (typeof document !== "undefined") {

        document.documentElement.dataset.theme = nextTheme;

      }

      if (typeof localStorage !== "undefined") {

        try {

          localStorage.setItem(THEME_STORAGE_KEY, nextTheme);

        } catch {

          // ignore

        }

      }

      themeSyncRef.current = nextTheme;

    }



    if (activeLocaleLabel) {

      applyVariableOverrides({ locale: activeLocaleLabel, language: activeLocaleLabel });

      const modes = currentDoc.variableModes?.length ? currentDoc.variableModes : [];

      const mode = resolveLocaleMode(activeLocaleLabel, modes);

      if (mode && mode !== variableMode) {

        deferStateUpdate(() => setVariableMode(mode));

      }

      if (typeof document !== "undefined") {

        const code = resolveLocaleCode(activeLocaleLabel);

        if (code) document.documentElement.lang = code;

      }

      if (typeof localStorage !== "undefined") {

        try {

          localStorage.setItem(LOCALE_STORAGE_KEY, activeLocaleLabel);

        } catch {

          // ignore

        }

      }

      localeSyncRef.current = activeLocaleLabel;

    }



    if (hasAccessibility) {

      const textScale = largeText ? 1.15 : 1;

      applyVariableOverrides({ highContrast, textScale, largeText });

      if (typeof document !== "undefined") {

        document.documentElement.dataset.contrast = highContrast ? "high" : "normal";

        document.documentElement.style.setProperty("--runtime-text-scale", String(textScale));

      }

      if (typeof localStorage !== "undefined") {

        try {

          const raw = JSON.stringify({ highContrast, textScale, largeText });

          localStorage.setItem(ACCESSIBILITY_STORAGE_KEY, raw);

          accessibilitySyncRef.current = raw;

        } catch {

          // ignore

        }

      }

    }

  }, [applyVariableOverrides, basePageId, controlFields, controlRootRoles, controlState, variableMode]);



  useEffect(() => {

    if (!basePageId) return;

    const cleanupTheme = subscribeStorageKey(

      THEME_STORAGE_KEY,

      (raw) => (raw && raw.trim() ? raw.trim() : null),

      (value) => {

        if (!value || themeSyncRef.current === value) return;

        themeSyncRef.current = value;

        applyVariableOverrides({ theme: value, themeMode: value });

        if (typeof document !== "undefined") {

          document.documentElement.dataset.theme = value;

        }

      },

    );

    const cleanupLocale = subscribeStorageKey(

      LOCALE_STORAGE_KEY,

      (raw) => (raw && raw.trim() ? raw.trim() : null),

      (value) => {

        if (!value || localeSyncRef.current === value) return;

        localeSyncRef.current = value;

        applyVariableOverrides({ locale: value, language: value });

        const modes = docRef.current.variableModes?.length ? docRef.current.variableModes : [];

        const mode = resolveLocaleMode(value, modes);

        if (mode && mode !== variableMode) {

          deferStateUpdate(() => setVariableMode(mode));

        }

        if (typeof document !== "undefined") {

          const code = resolveLocaleCode(value);

          if (code) document.documentElement.lang = code;

        }

      },

    );

    const cleanupAccessibility = subscribeStorageKey(

      ACCESSIBILITY_STORAGE_KEY,

      (raw) => (raw && raw.trim() ? raw : null),

      (raw) => {

        if (!raw || accessibilitySyncRef.current === raw) return;

        accessibilitySyncRef.current = raw;

        try {

          const parsed = JSON.parse(raw) as { highContrast?: boolean; textScale?: number; largeText?: boolean };

          const highContrast = Boolean(parsed.highContrast);

          const textScale = typeof parsed.textScale === "number" && Number.isFinite(parsed.textScale) ? parsed.textScale : 1;

          const largeText = Boolean(parsed.largeText);

          applyVariableOverrides({ highContrast, textScale, largeText });

          if (typeof document !== "undefined") {

            document.documentElement.dataset.contrast = highContrast ? "high" : "normal";

            document.documentElement.style.setProperty("--runtime-text-scale", String(textScale));

          }

        } catch {

          // ignore invalid JSON

        }

      },

    );

    return () => {

      cleanupTheme();

      cleanupLocale();

      cleanupAccessibility();

    };

  }, [applyVariableOverrides, basePageId, variableMode]);



  useEffect(() => {

    if (!basePageId) return;

    const currentDoc = docRef.current;

    const page = currentDoc.pages.find((p) => p.id === basePageId) ?? currentDoc.pages[0];

    if (!page) return;

    const scopeIds = collectDescendants(currentDoc, page.rootId);

    const updates: Record<string, boolean> = {};

    let hasMatrix = false;

    controlRootRoles.forEach((role, rootId) => {

      if (!scopeIds.has(rootId)) return;

      if (role.type === "input") return;

      if (!hasAncestorMatching(currentDoc, rootId, NOTIFICATION_MATRIX_PATTERN)) return;

      const label = controlFields.get(rootId)?.label ?? resolveControlLabel(currentDoc as Doc, role, rootId);

      const key = normalizeLooseLabel(label);

      if (!key) return;

      updates[`matrix_${key}`] = Boolean(controlState[rootId]);

      hasMatrix = true;

    });

    if (!hasMatrix) return;

    applyVariableOverrides(updates);

    if (typeof localStorage !== "undefined") {

      try {

        localStorage.setItem(NOTIFICATION_MATRIX_STORAGE_KEY, JSON.stringify(updates));

      } catch {

        // ignore

      }

    }

  }, [applyVariableOverrides, basePageId, controlFields, controlRootRoles, controlState]);



  useEffect(() => {

    if (!basePageId) return;

    const currentDoc = docRef.current;

    const page = currentDoc.pages.find((p) => p.id === basePageId) ?? currentDoc.pages[0];

    if (!page) return;

    let selectedPlan: string | null = null;

    controlRootRoles.forEach((role, rootId) => {

      if (selectedPlan) return;

      const label = controlFields.get(rootId)?.label ?? resolveControlLabel(currentDoc as Doc, role, rootId);

      if (!matchesPattern(label, PLAN_LABEL_PATTERN)) return;

      if (controlState[rootId]) selectedPlan = resolvePlanKey(label);

    });

    if (!selectedPlan) return;

    const planCardIds: Array<{ id: string; key: string }> = [];

    Object.values(currentDoc.nodes).forEach((node) => {

      if (!node || !matchesPattern(node.name ?? "", PLAN_CARD_PATTERN)) return;

      const textIds = collectTextNodeIds(currentDoc, node.id);

      const titleText = textIds.length ? currentDoc.nodes[textIds[0]]?.text?.value ?? "" : "";

      const key = resolvePlanKey(titleText);

      if (key) planCardIds.push({ id: node.id, key });

    });

    if (!planCardIds.length) return;

    deferStateUpdate(() => {

      setControlState((prev) => {

        let changed = false;

        const next = { ...prev };

        planCardIds.forEach(({ id, key }) => {

          const shouldBeActive = key === selectedPlan;

          if (next[id] !== shouldBeActive) {

            next[id] = shouldBeActive;

            changed = true;

          }

        });

        return changed ? next : prev;

      });

    });

  }, [basePageId, controlFields, controlRootRoles, controlState]);



  useEffect(() => {

    if (!basePageId) return;

    const currentDoc = docRef.current;

    const page = currentDoc.pages.find((p) => p.id === basePageId) ?? currentDoc.pages[0];

    if (!page) return;

    const scopeIds = collectDescendants(currentDoc, page.rootId);

    setControlState((prev) => {

      let changed = false;

      const next = { ...prev };

      controlRootRoles.forEach((role, rootId) => {

        if (role.type === "input") return;

        if (!scopeIds.has(rootId)) return;

        if (!isSecurityContext(currentDoc, page.id, rootId)) return;

        const label = controlFields.get(rootId)?.label ?? resolveControlLabel(currentDoc as Doc, role, rootId);

        const normalized = normalizeLooseLabel(label);

        if (!normalized) return;

        const candidates = [

          `security_${normalized}`,

          `status_${normalized}`,

          `${normalized}_status`,

        ];

        let value: boolean | null = null;

        for (const key of candidates) {

          const raw = variableOverrides[key];

          if (typeof raw === "boolean") value = raw;

          if (typeof raw === "number") value = raw > 0;

          if (typeof raw === "string") {

            const lower = raw.toLowerCase();

            if (lower === "true" || lower === "on" || lower === "1") value = true;

            if (lower === "false" || lower === "off" || lower === "0") value = false;

          }

          if (value !== null) break;

        }

        if (value === null) return;

        if (next[rootId] !== value) {

          next[rootId] = value;

          changed = true;

        }

      });

      return changed ? next : prev;

    });

  }, [basePageId, controlFields, controlRootRoles, variableOverrides]);



  useEffect(() => {

    if (!allowInteraction || !basePageId) return;

    const currentDoc = docRef.current;

    const page = currentDoc.pages.find((p) => p.id === basePageId) ?? currentDoc.pages[0];

    if (!page) return;

    const descendantIds = Array.from(collectDescendants(currentDoc, page.rootId));

    const progressMap = new Map<string, Array<{ dotId: string; targetId: string }>>();

    descendantIds.forEach((id) => {

      const role = controlRootRoles.get(id);

      if (!role || role.type !== "choice") return;

      const node = currentDoc.nodes[id];

      if (!node?.prototype?.interactions?.length) return;

      node.prototype.interactions.forEach((interaction) => {

        if (interaction.trigger !== "click" || interaction.action.type !== "scrollTo") return;

        const targetId = interaction.action.targetNodeId;

        if (!targetId) return;

        const containerId = findScrollableAncestor(currentDoc, targetId);

        if (!containerId) return;

        const list = progressMap.get(containerId) ?? [];

        list.push({ dotId: id, targetId });

        progressMap.set(containerId, list);

      });

    });

    if (!progressMap.size) return;



    const cleanupFns: Array<() => void> = [];

    for (const [containerId, items] of progressMap.entries()) {

      const containerNode = currentDoc.nodes[containerId];

      if (!containerNode) continue;

      const axis = containerNode.overflowScrolling === "vertical" ? "y" : "x";

      const orderedItems = [...items].sort((a, b) => {

        const ta = currentDoc.nodes[a.targetId];

        const tb = currentDoc.nodes[b.targetId];

        if (!ta || !tb) return 0;

        return axis === "x" ? ta.frame.x - tb.frame.x : ta.frame.y - tb.frame.y;

      });

      const lastDotId = orderedItems.length ? orderedItems[orderedItems.length - 1].dotId : null;

      const lastDotHasNavigate = lastDotId

        ? currentDoc.nodes[lastDotId]?.prototype?.interactions?.some(

            (interaction) => interaction.trigger === "click" && interaction.action.type === "navigate",

          )

        : false;

      const shouldAutoNavigate = isOnboardingContext(currentDoc, page.id, containerId);

      const nodeEl = typeof document !== "undefined" ? document.querySelector(`[data-node-id="${containerId}"]`) : null;

      if (!nodeEl) continue;

      const scrollEl = nodeEl.querySelector("foreignObject div") as HTMLElement | null;

      if (!scrollEl) continue;

      let rafId: number | null = null;

      const update = () => {

        rafId = null;

        const containerX = containerNode.frame.x;

        const containerCenter = scrollEl.scrollLeft + containerNode.frame.w / 2;

        let best: { dotId: string; dist: number } | null = null;

        items.forEach(({ dotId, targetId }) => {

          const target = currentDoc.nodes[targetId];

          if (!target) return;

          const targetCenter = (target.frame.x - containerX) + target.frame.w / 2;

          const dist = Math.abs(targetCenter - containerCenter);

          if (!best || dist < best.dist) best = { dotId, dist };

        });

        if (!best) return;

        setControlState((prev) => {

          let changed = false;

          const next = { ...prev };

          items.forEach(({ dotId }) => {

            if (next[dotId]) {

              next[dotId] = false;

              changed = true;

            }

          });

          if (!next[best!.dotId]) {

            next[best!.dotId] = true;

            changed = true;

          }

          return changed ? next : prev;

        });

        const bestDotId = (best as { dotId: string; dist: number } | null)?.dotId ?? null;

        if (bestDotId && lastDotId && bestDotId === lastDotId && shouldAutoNavigate && !lastDotHasNavigate) {

          triggerOnboardingComplete(page.id, lastDotId);

        }

      };

      const onScroll = () => {

        if (rafId != null) return;

        rafId = window.requestAnimationFrame(update);

      };

      scrollEl.addEventListener("scroll", onScroll, { passive: true });

      update();

      cleanupFns.push(() => {

        scrollEl.removeEventListener("scroll", onScroll);

        if (rafId != null) window.cancelAnimationFrame(rafId);

      });

    }



    return () => cleanupFns.forEach((fn) => fn());

  }, [allowInteraction, basePageId, controlRootRoles, triggerOnboardingComplete]);



  const scrollTriggerFiredRef = useRef<Set<string>>(new Set());

  useEffect(() => {

    if (!allowInteraction || !basePageId) return;

    scrollTriggerFiredRef.current = new Set();

    const currentDoc = docRef.current;

    const page = currentDoc.pages.find((p) => p.id === basePageId) ?? currentDoc.pages[0];

    if (!page) return;

    const descendantIds = Array.from(collectDescendants(currentDoc, page.rootId));

    const scrollableNodeIds = descendantIds.filter((id) => currentDoc.nodes[id]?.overflowScrolling);

    const scrollInteractions: { interaction: PrototypeInteraction; nodeId: string; pageId: string }[] = [];

    descendantIds.forEach((id) => {

      const node = currentDoc.nodes[id];

      node?.prototype?.interactions?.forEach((interaction) => {

        if (interaction.trigger === "scroll" && interaction.scrollTriggerConfig) {

          scrollInteractions.push({ interaction, nodeId: id, pageId: page.id });

        }

      });

    });

    if (scrollInteractions.length === 0) return;

    const cleanupFns: (() => void)[] = [];

    const raf = requestAnimationFrame(() => {

      scrollInteractions.forEach(({ interaction, nodeId, pageId }) => {

        const config = interaction.scrollTriggerConfig!;

        const containerNodeId = config.nodeId && scrollableNodeIds.includes(config.nodeId) ? config.nodeId : scrollableNodeIds[0];

        if (!containerNodeId) return;

        const nodeEl = typeof document !== "undefined" ? document.querySelector(`[data-node-id="${containerNodeId}"]`) : null;

        if (!nodeEl) return;

        const scrollEl = nodeEl.querySelector("foreignObject div") as HTMLElement | null;

        if (!scrollEl || !(scrollEl.scrollHeight > scrollEl.clientHeight || scrollEl.scrollWidth > scrollEl.clientWidth)) return;

        const check = () => {

          if (scrollTriggerFiredRef.current.has(interaction.id)) return;

          const { threshold, unit } = config;

          const verticalRatio = scrollEl.scrollHeight > scrollEl.clientHeight

            ? scrollEl.scrollTop / (scrollEl.scrollHeight - scrollEl.clientHeight) : 0;

          const horizontalRatio = scrollEl.scrollWidth > scrollEl.clientWidth

            ? scrollEl.scrollLeft / (scrollEl.scrollWidth - scrollEl.clientWidth) : 0;

          const ratio = Math.max(verticalRatio, horizontalRatio);

          const reached = unit === "percent" ? ratio >= threshold : (scrollEl.scrollTop >= threshold || scrollEl.scrollLeft >= threshold);

          if (reached) {

            scrollTriggerFiredRef.current.add(interaction.id);

            handleAction(interaction.action, { nodeId, pageId });

          }

        };

        scrollEl.addEventListener("scroll", check, { passive: true });

        check();

        cleanupFns.push(() => scrollEl.removeEventListener("scroll", check));

      });

    });

    return () => {

      cancelAnimationFrame(raf);

      cleanupFns.forEach((fn) => fn());

    };

  }, [allowInteraction, basePageId, handleAction, laidOut]);



  useEffect(() => {

    if (!allowInteraction) return;

    const handleKey = (event: KeyboardEvent) => {

      if (event.key !== "Escape") return;

      if (modalStackRef.current.length) {

        event.preventDefault();

        closeModal();

        return;

      }

      if (!overlayRef.current.length) return;

      event.preventDefault();

      closeOverlayDefault();

    };

    window.addEventListener("keydown", handleKey);

    return () => window.removeEventListener("keydown", handleKey);

  }, [allowInteraction, closeModal, closeOverlayDefault]);



  useEffect(() => {

    if (choiceFocusRef.current.rootId) return;

    const currentDoc = docRef.current;

    const firstActive = Array.from(controlRootRoles.entries()).find(

      ([rootId, role]) => role.type === "choice" && Boolean(controlState[rootId]),

    );

    if (!firstActive) return;

    const rootId = firstActive[0];

    choiceFocusRef.current = { parentId: currentDoc.nodes[rootId]?.parentId ?? null, rootId };

  }, [controlRootRoles, controlState]);



  useEffect(() => {

    if (!allowInteraction) return;

    const handleChoiceKeys = (event: KeyboardEvent) => {

      const target = event.target as HTMLElement | null;

      if (target) {

        const tag = target.tagName?.toLowerCase();

        if (tag === "input" || tag === "textarea" || target.isContentEditable) return;

      }

      const focus = choiceFocusRef.current;

      if (!focus.rootId || !focus.parentId) return;

      const currentDoc = docRef.current;

      const siblings = Array.from(controlRootRoles.entries())

        .filter(([id, role]) => role.type === "choice" && currentDoc.nodes[id]?.parentId === focus.parentId)

        .map(([id]) => id);

      if (!siblings.length) return;

      const currentIndex = siblings.indexOf(focus.rootId);

      if (currentIndex < 0) return;

      if (event.key === "ArrowRight" || event.key === "ArrowDown") {

        event.preventDefault();

        handleToggleControl(siblings[(currentIndex + 1) % siblings.length]);

        return;

      }

      if (event.key === "ArrowLeft" || event.key === "ArrowUp") {

        event.preventDefault();

        handleToggleControl(siblings[(currentIndex - 1 + siblings.length) % siblings.length]);

        return;

      }

      if (event.key === "Enter" || event.key === " ") {

        event.preventDefault();

        handleToggleControl(focus.rootId);

      }

    };

    window.addEventListener("keydown", handleChoiceKeys);

    return () => window.removeEventListener("keydown", handleChoiceKeys);

  }, [allowInteraction, controlRootRoles, handleToggleControl]);



  return (

    <div ref={containerRef} className={className ?? "relative h-full w-full"}>

      {submitNotices.length ? (

        <div className="absolute right-4 top-4 z-20 flex flex-col gap-2">

          {submitNotices.map((notice) => (

            <div

              key={notice.id}

              className={`rounded-full border px-3 py-2 text-xs shadow-sm ${

                notice.type === "success"

                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"

                  : notice.type === "info"

                    ? "border-sky-200 bg-sky-50 text-sky-700"

                    : "border-rose-200 bg-rose-50 text-rose-700"

              }`}

            >

              {typeof notice.message === "string" ? notice.message : String(notice.message ?? "")}

            </div>

          ))}

        </div>

      ) : null}

      {!isOnline ? (

        <div className="absolute left-4 top-4 z-20 flex items-center gap-3 rounded-full border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 shadow-sm">

          <span>네트워크 연결이 끊어져 있습니다.</span>

          <button

            type="button"

            className="rounded-full border border-amber-300 px-2 py-0.5 text-[10px] font-semibold"

            onClick={() => window.location.reload()}

          >

            새로고침

          </button>

        </div>

      ) : null}

      {baseLayerId ? (

        <div className="absolute inset-0" style={{ pointerEvents: topOverlayId ? "none" : "auto" }}>

          <div

            className="absolute inset-0"

            style={pageTransition ? transitionStyles(pageTransition, "from") : undefined}

          >

            <RuntimeRenderer

              doc={laidOutResponsive}

              activePageId={baseLayerId}

              interactive={allowInteraction && !topOverlayId}

              onNavigate={handleNavigate}

              fitToContent={fitToContent}

              activeSubmitButtonIds={activeSubmitButtonIdsByPage.get(baseLayerId ?? "")}

              controlState={controlState}

              onToggleControl={handleToggleControl}

              controlTextState={controlTextState}

              controlFileState={controlFileState}

              onChangeControlText={handleControlTextChange}

              onChangeControlFile={handleControlFileChange}

              invalidControlIds={invalidInputIds}

              disabledControlIds={disabledChoiceIds}

              hiddenNodeIds={combinedHiddenNodeIds}

              childOrderOverrides={combinedOrderOverrides}

              textOverrides={textOverrides}

              headerCompact={headerCompact}

              variableRuntime={{ mode: variableMode, variableOverrides, globalState }}

              instanceVariantOverrides={instanceVariantOverrides}

              appPageId={appPageId}

            />

          </div>

          {pageTransition && nextLayerId ? (

            <div className="absolute inset-0" style={transitionStyles(pageTransition, "to")}>

              <RuntimeRenderer

                doc={doc}

                activePageId={nextLayerId}

                interactive={false}

                fitToContent={fitToContent}

                activeSubmitButtonIds={activeSubmitButtonIdsByPage.get(nextLayerId ?? "")}

                controlState={controlState}

                controlTextState={controlTextState}

                controlFileState={controlFileState}

                invalidControlIds={invalidInputIds}

                disabledControlIds={disabledChoiceIds}

                hiddenNodeIds={combinedHiddenNodeIds}

                childOrderOverrides={combinedOrderOverrides}

                textOverrides={textOverrides}

                headerCompact={headerCompact}

                variableRuntime={{ mode: variableMode, variableOverrides, globalState }}

                instanceVariantOverrides={instanceVariantOverrides}

                appPageId={appPageId}

              />

            </div>

          ) : null}

        </div>

      ) : null}



      {topOverlayEntry ? (

        <div className="absolute inset-0" style={{ ...buildOverlayBackdropStyle(topOverlayEntry.presentation), pointerEvents: "none" }} />

      ) : null}



      {overlayStack.map((overlayEntry, index) => {

        const isTop = overlayEntry.id === topOverlayId;

        const hasTransition = overlayTransition && overlayTransition.overlayId === overlayEntry.id;
        const overlayRoot = doc.nodes[overlayEntry.pageId];

        return (

          <div

            key={`${overlayEntry.id}-${index}`}

            className="absolute inset-0"

            style={{

              ...(hasTransition ? overlayStyles(overlayTransition) : undefined),

              pointerEvents: isTop ? "auto" : "none",

            }}

            onClick={() => {

              if (!allowInteraction || !isTop) return;

              closeOverlayDefault();

            }}

          >

            <div className="absolute inset-0" style={buildOverlayShellStyle(overlayEntry.presentation)}>
              <div
                style={buildOverlayCardStyle(overlayEntry.presentation, overlayRoot?.frame)}
                onClick={(event) => event.stopPropagation()}
              >
                <RuntimeRenderer

                  doc={doc}

                  activePageId={overlayEntry.pageId}

                  interactive={allowInteraction && isTop}

                  onNavigate={handleNavigate}

                  fitToContent={fitToContent}

                  activeSubmitButtonIds={activeSubmitButtonIdsByPage.get(overlayEntry.pageId)}

                  controlState={controlState}

                  onToggleControl={handleToggleControl}

                  controlTextState={controlTextState}

                  controlFileState={controlFileState}

                  onChangeControlText={handleControlTextChange}

                  onChangeControlFile={handleControlFileChange}

                  invalidControlIds={invalidInputIds}

                  disabledControlIds={disabledChoiceIds}

                  hiddenNodeIds={combinedHiddenNodeIds}

                  childOrderOverrides={combinedOrderOverrides}

                  textOverrides={textOverrides}

                  headerCompact={headerCompact}

                  variableRuntime={{ mode: variableMode, variableOverrides, globalState }}

                  instanceVariantOverrides={instanceVariantOverrides}

                  appPageId={appPageId}

                />
              </div>
            </div>

          </div>

        );

      })}

      <div className="sr-only" aria-live="polite">
        {[
          typeof variableOverrides.ops_latest_release_note === "string" ? variableOverrides.ops_latest_release_note : "",
          typeof variableOverrides.billing_latest_invoice_id === "string" ? variableOverrides.billing_latest_invoice_id : "",
          typeof variableOverrides.ops_current_version_id === "string" ? variableOverrides.ops_current_version_id : "",
          typeof variableOverrides.ops_latest_release_env === "string" ? variableOverrides.ops_latest_release_env : "",
        ]
          .filter((value) => typeof value === "string" && value.trim().length > 0)
          .join(" | ")}
      </div>

    </div>

  );

}



export { resolveLocaleMode, resolveLocaleCode };



