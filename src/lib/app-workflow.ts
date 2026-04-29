/**
 * Server-side workflow runner.
 * Executes AppWorkflow steps sequentially with optional retries.
 */

import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { executeServiceAction } from "@/lib/service-runtime";

export type WorkflowTrigger =
  | { type: "record_created"; collection: string }
  | { type: "record_updated"; collection: string; field?: string }
  | { type: "record_deleted"; collection: string }
  | { type: "form_submitted"; formName: string }
  | { type: "schedule"; cron: string }
  | { type: "webhook"; path: string }
  | { type: "service_event"; eventType?: string; topic?: string; stream?: string; entityType?: string }
  | { type: "state_transition"; machine: string; from?: string; to?: string; entityType?: string }
  | { type: "user_registered" }
  | { type: "user_logged_in" };

type RetryOptions = {
  retries?: number;
  retryDelayMs?: number;
};

export type WorkflowStep =
  | ({ type: "create_record"; collection: string; data: Record<string, unknown> } & RetryOptions)
  | ({ type: "update_record"; collection: string; recordId: string; data: Record<string, unknown> } & RetryOptions)
  | ({ type: "delete_record"; collection: string; recordId: string } & RetryOptions)
  | ({
      type: "api_call";
      url: string;
      method: string;
      headers?: Record<string, string>;
      body?: unknown;
      retries?: number;
      retryDelayMs?: number;
      timeoutMs?: number;
      retryOn?: number[];
    } & RetryOptions)
  | ({ type: "set_variable"; key: string; value: unknown } & RetryOptions)
  | ({ type: "condition"; if: { field: string; op: string; value: unknown }; then: WorkflowStep[]; else?: WorkflowStep[] } & RetryOptions)
  | ({ type: "loop"; items: string; variable: string; steps: WorkflowStep[]; maxItems?: number } & RetryOptions)
  | ({ type: "delay"; ms: number } & RetryOptions)
  | ({ type: "log"; message: string } & RetryOptions)
  | ({
      type: "serverless_node";
      code: string;
      inputs?: unknown;
      timeoutMs?: number;
      memoryMb?: number;
      secrets?: string[];
      responseVariable?: string;
      errorVariable?: string;
    } & RetryOptions);

type WorkflowContext = {
  pageId: string;
  variables: Record<string, unknown>;
  logs: string[];
  triggerData?: unknown;
  stepCount: number;
  maxSteps: number;
};

const MAX_LOOP_ITEMS_DEFAULT = 500;

function interpolate(template: string, ctx: WorkflowContext): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_, key: string) => {
    const trimmed = key.trim();
    if (trimmed.startsWith("record.") || trimmed.startsWith("trigger.")) {
      const path = trimmed.split(".");
      let current: unknown = ctx.triggerData;
      for (const part of path.slice(1)) {
        if (current && typeof current === "object") {
          current = (current as Record<string, unknown>)[part];
        } else {
          current = undefined;
        }
      }
      return String(current ?? "");
    }
    return String(ctx.variables[trimmed] ?? "");
  });
}

function interpolateObj(obj: Record<string, unknown>, ctx: WorkflowContext): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    result[k] = typeof v === "string" ? interpolate(v, ctx) : v;
  }
  return result;
}

function interpolateDeep(value: unknown, ctx: WorkflowContext): unknown {
  if (typeof value === "string") return interpolate(value, ctx);
  if (Array.isArray(value)) return value.map((item) => interpolateDeep(item, ctx));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = interpolateDeep(v, ctx);
    }
    return out;
  }
  return value;
}

function evaluateCondition(cond: { field: string; op: string; value: unknown }, ctx: WorkflowContext): boolean {
  const actual = ctx.variables[cond.field];
  const expected = cond.value;
  switch (cond.op) {
    case "eq": case "==": return actual == expected;
    case "neq": case "!=": return actual != expected;
    case "gt": case ">": return Number(actual) > Number(expected);
    case "lt": case "<": return Number(actual) < Number(expected);
    case "gte": case ">=": return Number(actual) >= Number(expected);
    case "lte": case "<=": return Number(actual) <= Number(expected);
    case "contains": return String(actual).includes(String(expected));
    case "exists": return actual !== undefined && actual !== null && actual !== "";
    default: return false;
  }
}

function guardStep(ctx: WorkflowContext) {
  ctx.stepCount += 1;
  if (ctx.stepCount > ctx.maxSteps) {
    throw new Error("workflow_step_limit_exceeded");
  }
}

async function executeApiCallStep(step: Extract<WorkflowStep, { type: "api_call" }>, ctx: WorkflowContext) {
  const headers: Record<string, string> = {};
  if (step.headers) {
    for (const [k, v] of Object.entries(step.headers)) {
      headers[k] = interpolate(v, ctx);
    }
  }
  const body =
    step.body && typeof step.body === "object"
      ? interpolateObj(step.body as Record<string, unknown>, ctx)
      : typeof step.body === "string"
        ? interpolate(step.body, ctx)
        : step.body;
  const result = await executeServiceAction(
    {
      type: "http_request",
      url: interpolate(step.url, ctx),
      method: step.method ?? "GET",
      headers,
      body,
      retries: step.retries,
      retryDelayMs: step.retryDelayMs,
      timeoutMs: step.timeoutMs,
      retryOn: step.retryOn,
    },
    {
      pageId: ctx.pageId,
      variables: ctx.variables,
      triggerData: ctx.triggerData,
    },
  );
  ctx.variables["$api_response"] = result.data ?? null;
  ctx.variables["$api_status"] = result.statusCode ?? null;
  if (!result.ok) {
    ctx.variables["$api_error"] = result.error ?? "api_call_failed";
    throw new Error(result.error ?? "api_call_failed");
  }
}

async function executeStepOnce(step: WorkflowStep, ctx: WorkflowContext): Promise<void> {
  guardStep(ctx);
  switch (step.type) {
    case "create_record": {
      const data = interpolateObj(step.data, ctx);
      const record = await prisma.appRecord.create({
        data: {
          page_id: ctx.pageId,
          collection_slug: step.collection,
          data: data as object,
        },
      });
      ctx.variables["$last_record_id"] = record.id;
      break;
    }
    case "update_record": {
      const data = interpolateObj(step.data, ctx);
      const recordId = interpolate(step.recordId, ctx);
      await prisma.appRecord.update({
        where: { id: recordId },
        data: { data: data as object },
      });
      break;
    }
    case "delete_record": {
      const recordId = interpolate(step.recordId, ctx);
      await prisma.appRecord.delete({ where: { id: recordId } });
      break;
    }
    case "api_call": {
      await executeApiCallStep(step, ctx);
      break;
    }
    case "set_variable":
      ctx.variables[step.key] = typeof step.value === "string" ? interpolate(step.value, ctx) : step.value;
      break;
    case "condition": {
      const result = evaluateCondition(step.if, ctx);
      const branch = result ? step.then : (step.else ?? []);
      for (const s of branch) {
        await executeStep(s, ctx);
      }
      break;
    }
    case "loop": {
      const items = ctx.variables[step.items];
      if (Array.isArray(items)) {
        const limit = Math.min(
          typeof step.maxItems === "number" ? step.maxItems : MAX_LOOP_ITEMS_DEFAULT,
          MAX_LOOP_ITEMS_DEFAULT
        );
        const sliced = items.slice(0, limit);
        if (items.length > limit) {
          ctx.logs.push(`loop_truncated:${items.length}->${limit}`);
        }
        for (const item of sliced) {
          ctx.variables[step.variable] = item;
          for (const s of step.steps) {
            await executeStep(s, ctx);
          }
        }
      }
      break;
    }
    case "delay":
      await new Promise((r) => setTimeout(r, Math.min(step.ms, 30_000)));
      break;
    case "log":
      ctx.logs.push(interpolate(step.message, ctx));
      break;
    case "serverless_node": {
      const result = await executeServiceAction(
        {
          type: "serverless_node",
          code: step.code,
          inputs: interpolateDeep(step.inputs, ctx),
          secrets: step.secrets,
          timeoutMs: step.timeoutMs,
          memoryMb: step.memoryMb,
        },
        {
          pageId: ctx.pageId,
          variables: ctx.variables,
          triggerData: ctx.triggerData,
        },
      );
      if (result.logs?.length) ctx.logs.push(...result.logs);
      if (result.ok) {
        const key = step.responseVariable ?? "$serverless_result";
        ctx.variables[key] = result.data ?? null;
        break;
      }
      const errKey = step.errorVariable ?? "$serverless_error";
      ctx.variables[errKey] = result.error ?? "serverless_failed";
      throw new Error(result.error ?? "serverless_failed");
    }
  }
}

async function executeStep(step: WorkflowStep, ctx: WorkflowContext): Promise<void> {
  if (step.type === "api_call") {
    await executeStepOnce(step, ctx);
    return;
  }
  const maxRetries = Math.max(0, Math.min(Number(step.retries ?? 0), 3));
  const retryDelayMs = Math.max(0, Math.min(Number(step.retryDelayMs ?? 500), 30_000));
  let lastError: unknown = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      await executeStepOnce(step, ctx);
      return;
    } catch (err) {
      lastError = err;
      if (attempt >= maxRetries) throw err;
      await new Promise((r) => setTimeout(r, retryDelayMs));
    }
  }
  if (lastError) {
    throw lastError;
  }
}

export async function executeWorkflow(
  workflowId: string,
  pageId: string,
  triggerData?: unknown
): Promise<{ status: "success" | "error"; logs: string[]; error?: string }> {
  const workflow = await prisma.appWorkflow.findUnique({ where: { id: workflowId } });
  if (!workflow || !workflow.enabled) {
    return { status: "error", logs: [], error: "Workflow not found or disabled" };
  }

  const log = await prisma.appWorkflowLog.create({
    data: {
      workflow_id: workflowId,
      page_id: pageId,
      status: "running",
      input: triggerData == null ? Prisma.DbNull : (triggerData as Prisma.InputJsonValue),
    },
  });

  const steps = workflow.steps as unknown as WorkflowStep[];
  const ctx: WorkflowContext = {
    pageId,
    variables: {},
    logs: [],
    triggerData,
    stepCount: 0,
    maxSteps: 1000,
  };

  try {
    for (const step of steps) {
      await executeStep(step, ctx);
    }
    await prisma.appWorkflowLog.update({
      where: { id: log.id },
      data: {
        status: "success",
        output: { logs: ctx.logs, variables: ctx.variables } as Prisma.InputJsonValue,
        finished_at: new Date(),
      },
    });
    return { status: "success", logs: ctx.logs };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    await prisma.appWorkflowLog.update({
      where: { id: log.id },
      data: {
        status: "error",
        error: errorMsg,
        output: { logs: ctx.logs, variables: ctx.variables } as Prisma.InputJsonValue,
        finished_at: new Date(),
      },
    });
    return { status: "error", logs: ctx.logs, error: errorMsg };
  }
}

export async function findMatchingWorkflows(
  pageId: string,
  triggerType: string,
  triggerMeta?: Record<string, string>
) {
  const workflows = await prisma.appWorkflow.findMany({
    where: { page_id: pageId, enabled: true },
  });

  return workflows.filter((w) => {
    const trigger = w.trigger as unknown as WorkflowTrigger;
    if (trigger.type !== triggerType) return false;
    if (triggerMeta) {
      if ("collection" in trigger && triggerMeta.collection && trigger.collection !== triggerMeta.collection) return false;
      if ("formName" in trigger && triggerMeta.formName && trigger.formName !== triggerMeta.formName) return false;
      if ("path" in trigger && triggerMeta.path && trigger.path !== triggerMeta.path) return false;
      if ("eventType" in trigger && trigger.eventType && triggerMeta.eventType && trigger.eventType !== triggerMeta.eventType) return false;
      if ("topic" in trigger && trigger.topic && triggerMeta.topic && trigger.topic !== triggerMeta.topic) return false;
      if ("stream" in trigger && trigger.stream && triggerMeta.stream && trigger.stream !== triggerMeta.stream) return false;
      if ("entityType" in trigger && trigger.entityType && triggerMeta.entityType && trigger.entityType !== triggerMeta.entityType) return false;
      if ("machine" in trigger && trigger.machine && triggerMeta.machine && trigger.machine !== triggerMeta.machine) return false;
      if ("from" in trigger && trigger.from && triggerMeta.from && trigger.from !== triggerMeta.from) return false;
      if ("to" in trigger && trigger.to && triggerMeta.to && trigger.to !== triggerMeta.to) return false;
    }
    return true;
  });
}

export async function triggerWorkflowsForEvent(
  pageId: string,
  triggerType: string,
  triggerMeta?: Record<string, string>,
  triggerData?: unknown
): Promise<Array<{ workflowId: string; name: string; status: "success" | "error"; logs: string[]; error?: string }>> {
  const matched = await findMatchingWorkflows(pageId, triggerType, triggerMeta);
  const results: Array<{ workflowId: string; name: string; status: "success" | "error"; logs: string[]; error?: string }> = [];
  for (const w of matched) {
    const result = await executeWorkflow(w.id, pageId, triggerData);
    results.push({ workflowId: w.id, name: w.name, ...result });
  }
  return results;
}
