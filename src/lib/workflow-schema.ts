import { z } from "zod";

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

const optionalMethodSchema = z.preprocess(
  (value) => (typeof value === "string" ? value.trim().toUpperCase() : value),
  z.enum(HTTP_METHODS).optional(),
);

const retrySchema = z.object({
  retries: z.number().int().min(0).max(5).optional(),
  retryDelayMs: z.number().int().min(0).max(30_000).optional(),
});

const conditionOpSchema = z.enum([
  "eq",
  "==",
  "neq",
  "!=",
  "gt",
  ">",
  "lt",
  "<",
  "gte",
  ">=",
  "lte",
  "<=",
  "contains",
  "exists",
]);

const triggerSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("record_created"), collection: z.string().min(1) }),
  z.object({ type: z.literal("record_updated"), collection: z.string().min(1), field: z.string().min(1).optional() }),
  z.object({ type: z.literal("record_deleted"), collection: z.string().min(1) }),
  z.object({ type: z.literal("form_submitted"), formName: z.string().min(1) }),
  z.object({ type: z.literal("schedule"), cron: z.string().min(1) }),
  z.object({ type: z.literal("webhook"), path: z.string().min(1) }),
  z.object({ type: z.literal("user_registered") }),
  z.object({ type: z.literal("user_logged_in") }),
]);

const baseRecordData = z.record(z.unknown());

const workflowStepSchema: z.ZodType<Record<string, unknown>> = z.lazy(() =>
  z.discriminatedUnion("type", [
    z.object({
      type: z.literal("create_record"),
      collection: z.string().min(1),
      data: baseRecordData,
    }).merge(retrySchema),
    z.object({
      type: z.literal("update_record"),
      collection: z.string().min(1),
      recordId: z.string().min(1),
      data: baseRecordData,
    }).merge(retrySchema),
    z.object({
      type: z.literal("delete_record"),
      collection: z.string().min(1),
      recordId: z.string().min(1),
    }).merge(retrySchema),
    z.object({
      type: z.literal("api_call"),
      url: z.string().url(),
      method: optionalMethodSchema,
      headers: z.record(z.string()).optional(),
      body: z.unknown().optional(),
      timeoutMs: z.number().int().min(0).max(30_000).optional(),
      retryOn: z.array(z.number().int().min(100).max(599)).optional(),
    }).merge(retrySchema),
    z.object({
      type: z.literal("set_variable"),
      key: z.string().min(1),
      value: z.unknown(),
    }).merge(retrySchema),
    z.object({
      type: z.literal("condition"),
      if: z.object({
        field: z.string().min(1),
        op: conditionOpSchema,
        value: z.unknown(),
      }),
      then: z.array(workflowStepSchema),
      else: z.array(workflowStepSchema).optional(),
    }).merge(retrySchema),
    z.object({
      type: z.literal("loop"),
      items: z.string().min(1),
      variable: z.string().min(1),
      maxItems: z.number().int().min(1).max(2000).optional(),
      steps: z.array(workflowStepSchema),
    }).merge(retrySchema),
    z.object({
      type: z.literal("delay"),
      ms: z.number().int().min(0).max(30_000),
    }).merge(retrySchema),
    z.object({
      type: z.literal("log"),
      message: z.string().min(1),
    }).merge(retrySchema),
    z.object({
      type: z.literal("serverless_node"),
      code: z.string().min(1).max(80_000),
      inputs: z.unknown().optional(),
      timeoutMs: z.number().int().min(100).max(30_000).optional(),
      memoryMb: z.number().int().min(64).max(1024).optional(),
      secrets: z.array(z.string().min(1)).max(50).optional(),
      responseVariable: z.string().min(1).optional(),
      errorVariable: z.string().min(1).optional(),
    }).merge(retrySchema),
  ])
);

const workflowCreateSchema = z.object({
  name: z.string().min(1),
  trigger: triggerSchema,
  steps: z.array(workflowStepSchema).default([]),
  enabled: z.boolean().optional(),
}).passthrough();

const workflowUpdateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).optional(),
  trigger: triggerSchema.optional(),
  steps: z.array(workflowStepSchema).optional(),
  enabled: z.boolean().optional(),
}).passthrough();

export function parseWorkflowCreate(input: unknown) {
  return workflowCreateSchema.safeParse(input);
}

export function parseWorkflowUpdate(input: unknown) {
  return workflowUpdateSchema.safeParse(input);
}

export function parseWorkflowTrigger(input: unknown) {
  return triggerSchema.safeParse(input);
}

export function parseWorkflowSteps(input: unknown) {
  return z.array(workflowStepSchema).safeParse(input);
}

export const WORKFLOW_HTTP_METHODS = HTTP_METHODS;
