import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { logAppAudit, type AppAuditActor } from "@/lib/app-audit";
import { triggerWorkflowsForEvent } from "@/lib/app-workflow";

type JsonObject = Record<string, unknown>;

export type ServiceEventLike = {
  id: string;
  page_id: string;
  stream: string;
  topic: string;
  type: string;
  entity_type: string | null;
  entity_id: string | null;
  source: string | null;
  payload: unknown;
  meta: unknown;
};

const machineStateSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1).optional(),
  terminal: z.boolean().optional(),
});

const transitionGuardSchema = z.object({
  path: z.string().min(1),
  op: z.enum(["eq", "neq", "gt", "lt", "gte", "lte", "contains", "exists"]),
  value: z.unknown().optional(),
});

const transitionEventSchema = z.object({
  type: z.string().min(1).optional(),
  topic: z.string().min(1).optional(),
  stream: z.string().min(1).optional(),
  entityType: z.string().min(1).optional(),
  source: z.string().min(1).optional(),
});

const transitionSchema = z.object({
  key: z.string().min(1),
  from: z.union([z.literal("*"), z.string().min(1), z.array(z.string().min(1)).min(1)]),
  to: z.string().min(1),
  on: transitionEventSchema.optional(),
  guard: transitionGuardSchema.optional(),
  mergePayload: z.boolean().optional(),
  setData: z.record(z.unknown()).optional(),
  compensation: z
    .object({
      to: z.string().min(1).optional(),
      reason: z.string().min(1).optional(),
    })
    .optional(),
});

const serviceStateMachineDefinitionSchema = z
  .object({
    initialState: z.string().min(1),
    deadLetterState: z.string().min(1).optional(),
    states: z.array(machineStateSchema).min(1),
    transitions: z.array(transitionSchema).default([]),
  })
  .superRefine((value, ctx) => {
    const stateKeys = new Set(value.states.map((state) => state.key));
    if (!stateKeys.has(value.initialState)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "initial_state_not_found",
        path: ["initialState"],
      });
    }
    if (value.deadLetterState && !stateKeys.has(value.deadLetterState)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "dead_letter_state_not_found",
        path: ["deadLetterState"],
      });
    }
    const keys = new Set<string>();
    value.transitions.forEach((transition, index) => {
      if (keys.has(transition.key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "duplicate_transition_key",
          path: ["transitions", index, "key"],
        });
      }
      keys.add(transition.key);
      const fromStates = transition.from === "*" ? [] : Array.isArray(transition.from) ? transition.from : [transition.from];
      fromStates.forEach((fromState) => {
        if (!stateKeys.has(fromState)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "transition_from_state_not_found",
            path: ["transitions", index, "from"],
          });
        }
      });
      if (!stateKeys.has(transition.to)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "transition_to_state_not_found",
          path: ["transitions", index, "to"],
        });
      }
      if (transition.compensation?.to && !stateKeys.has(transition.compensation.to)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "compensation_state_not_found",
          path: ["transitions", index, "compensation", "to"],
        });
      }
    });
  });

export type ServiceStateMachineDefinition = z.infer<typeof serviceStateMachineDefinitionSchema>;
export type ServiceStateMachineTransition = z.infer<typeof transitionSchema>;

export function parseServiceStateMachineDefinition(input: unknown) {
  return serviceStateMachineDefinitionSchema.safeParse(input);
}

export function assertServiceStateMachineDefinition(input: unknown): ServiceStateMachineDefinition {
  return serviceStateMachineDefinitionSchema.parse(input);
}

function normalizeRecord(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? { ...(value as JsonObject) } : {};
}

function getByPath(input: unknown, path: string): unknown {
  const parts = path.split(".").filter(Boolean);
  let current: unknown = input;
  for (const part of parts) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as JsonObject)[part];
  }
  return current;
}

function interpolateTemplate(value: unknown, scope: { event: ServiceEventLike; instance: { data: JsonObject; currentState: string } }): unknown {
  if (typeof value === "string") {
    return value.replace(/\{\{([^}]+)\}\}/g, (_, raw: string) => {
      const key = raw.trim();
      if (key.startsWith("event.")) return String(getByPath(scope.event, key.slice("event.".length)) ?? "");
      if (key.startsWith("instance.")) return String(getByPath({ data: scope.instance.data, currentState: scope.instance.currentState }, key.slice("instance.".length)) ?? "");
      return "";
    });
  }
  if (Array.isArray(value)) return value.map((item) => interpolateTemplate(item, scope));
  if (value && typeof value === "object") {
    const next: JsonObject = {};
    for (const [key, child] of Object.entries(value as JsonObject)) {
      next[key] = interpolateTemplate(child, scope);
    }
    return next;
  }
  return value;
}

function evaluateGuard(
  guard: z.infer<typeof transitionGuardSchema> | undefined,
  event: ServiceEventLike,
  instanceData: JsonObject,
) {
  if (!guard) return true;
  const actual = getByPath({ event, instance: { data: instanceData } }, guard.path);
  switch (guard.op) {
    case "eq":
      return actual == guard.value;
    case "neq":
      return actual != guard.value;
    case "gt":
      return Number(actual) > Number(guard.value);
    case "lt":
      return Number(actual) < Number(guard.value);
    case "gte":
      return Number(actual) >= Number(guard.value);
    case "lte":
      return Number(actual) <= Number(guard.value);
    case "contains":
      return String(actual ?? "").includes(String(guard.value ?? ""));
    case "exists":
      return actual !== undefined && actual !== null && actual !== "";
    default:
      return false;
  }
}

function matchesTransition(currentState: string, transition: ServiceStateMachineTransition, event: ServiceEventLike) {
  const fromMatch =
    transition.from === "*"
      ? true
      : Array.isArray(transition.from)
        ? transition.from.includes(currentState)
        : transition.from === currentState;
  if (!fromMatch) return false;
  if (!transition.on) return true;
  if (transition.on.type && transition.on.type !== event.type) return false;
  if (transition.on.topic && transition.on.topic !== event.topic) return false;
  if (transition.on.stream && transition.on.stream !== event.stream) return false;
  if (transition.on.entityType && transition.on.entityType !== (event.entity_type ?? undefined)) return false;
  if (transition.on.source && transition.on.source !== (event.source ?? undefined)) return false;
  return true;
}

function buildTransitionData(
  transition: ServiceStateMachineTransition,
  event: ServiceEventLike,
  instanceData: JsonObject,
  currentState: string,
) {
  const next = { ...instanceData };
  if (transition.mergePayload && event.payload && typeof event.payload === "object" && !Array.isArray(event.payload)) {
    Object.assign(next, event.payload as JsonObject);
  }
  if (transition.setData) {
    Object.assign(
      next,
      interpolateTemplate(transition.setData, {
        event,
        instance: { data: instanceData, currentState },
      }) as JsonObject,
    );
  }
  return next;
}

export async function listServiceStateMachines(pageId: string) {
  return prisma.serviceStateMachine.findMany({
    where: { page_id: pageId },
    orderBy: [{ key: "asc" }],
    include: {
      instances: {
        orderBy: [{ updated_at: "desc" }],
        take: 50,
      },
      transitions: {
        orderBy: [{ created_at: "desc" }],
        take: 100,
      },
    },
  });
}

export async function createServiceStateMachine(input: {
  pageId: string;
  key: string;
  name: string;
  definition: unknown;
  enabled?: boolean;
  actor?: AppAuditActor;
}) {
  const definition = assertServiceStateMachineDefinition(input.definition);
  const machine = await prisma.serviceStateMachine.create({
    data: {
      page_id: input.pageId,
      key: input.key,
      name: input.name,
      definition: definition as unknown as Prisma.InputJsonValue,
      enabled: input.enabled !== false,
    },
  });
  await logAppAudit({
    pageId: input.pageId,
    action: "service_state_machine_create",
    targetType: "service_state_machine",
    targetId: machine.id,
    actor: input.actor,
    meta: { key: input.key, name: input.name },
  });
  return machine;
}

export async function updateServiceStateMachine(input: {
  pageId: string;
  machineId: string;
  key?: string;
  name?: string;
  definition?: unknown;
  enabled?: boolean;
  actor?: AppAuditActor;
}) {
  const data: Record<string, unknown> = {};
  if (input.key !== undefined) data.key = input.key;
  if (input.name !== undefined) data.name = input.name;
  if (input.definition !== undefined) {
    data.definition = assertServiceStateMachineDefinition(input.definition) as unknown as Prisma.InputJsonValue;
  }
  if (input.enabled !== undefined) data.enabled = input.enabled;
  const existing = await prisma.serviceStateMachine.findFirst({
    where: { id: input.machineId, page_id: input.pageId },
  });
  if (!existing) {
    throw new Error("service_state_machine_not_found");
  }
  const machine = await prisma.serviceStateMachine.update({
    where: { id: existing.id },
    data: {
      ...data,
      version: { increment: 1 },
    },
  });
  await logAppAudit({
    pageId: input.pageId,
    action: "service_state_machine_update",
    targetType: "service_state_machine",
    targetId: machine.id,
    actor: input.actor,
    meta: { key: machine.key, name: machine.name, version: machine.version },
  });
  return machine;
}

export async function deleteServiceStateMachine(input: {
  pageId: string;
  machineId: string;
  actor?: AppAuditActor;
}) {
  const existing = await prisma.serviceStateMachine.findFirst({
    where: { id: input.machineId, page_id: input.pageId },
  });
  if (!existing) return null;
  await prisma.serviceStateMachine.delete({ where: { id: existing.id } });
  await logAppAudit({
    pageId: input.pageId,
    action: "service_state_machine_delete",
    targetType: "service_state_machine",
    targetId: existing.id,
    actor: input.actor,
    meta: { key: existing.key, name: existing.name },
  });
  return existing;
}

export async function applyServiceEventToStateMachines(input: {
  pageId: string;
  event: ServiceEventLike;
  actor?: AppAuditActor;
}) {
  if (!input.event.entity_type || !input.event.entity_id) {
    return [];
  }
  const machines = await prisma.serviceStateMachine.findMany({
    where: { page_id: input.pageId, enabled: true },
    orderBy: [{ created_at: "asc" }],
  });
  const results: Array<{
    machineId: string;
    machineKey: string;
    instanceId: string;
    transitionId: string;
    fromState: string;
    toState: string;
  }> = [];

  for (const machine of machines) {
    const definition = assertServiceStateMachineDefinition(machine.definition);
    const existing = await prisma.serviceStateInstance.findFirst({
      where: {
        machine_id: machine.id,
        entity_type: input.event.entity_type,
        entity_id: input.event.entity_id,
      },
    });
    const instance =
      existing ??
      (await prisma.serviceStateInstance.create({
        data: {
          page_id: input.pageId,
          machine_id: machine.id,
          entity_type: input.event.entity_type,
          entity_id: input.event.entity_id,
          current_state: definition.initialState,
          data: Prisma.DbNull,
        },
      }));

    const instanceData = normalizeRecord(instance.data);
    const transition = definition.transitions.find(
      (candidate) =>
        matchesTransition(instance.current_state, candidate, input.event) &&
        evaluateGuard(candidate.guard, input.event, instanceData),
    );
    if (!transition) continue;

    const nextData = buildTransitionData(transition, input.event, instanceData, instance.current_state);
    const updated = await prisma.serviceStateInstance.update({
      where: { id: instance.id },
      data: {
        current_state: transition.to,
        data: Object.keys(nextData).length ? (nextData as Prisma.InputJsonValue) : Prisma.DbNull,
        version: { increment: 1 },
        last_event_id: input.event.id,
      },
    });

    const transitionLog = await prisma.serviceStateTransition.create({
      data: {
        page_id: input.pageId,
        machine_id: machine.id,
        instance_id: instance.id,
        event_id: input.event.id,
        transition_key: transition.key,
        from_state: instance.current_state,
        to_state: transition.to,
        status: "applied",
        payload: {
          eventType: input.event.type,
          topic: input.event.topic,
          stream: input.event.stream,
          entityType: input.event.entity_type,
          entityId: input.event.entity_id,
        } as Prisma.InputJsonValue,
      },
    });

    await logAppAudit({
      pageId: input.pageId,
      action: "service_state_transition_apply",
      targetType: "service_state_machine",
      targetId: machine.id,
      actor: input.actor,
      meta: {
        machineKey: machine.key,
        instanceId: instance.id,
        transitionKey: transition.key,
        fromState: instance.current_state,
        toState: transition.to,
        entityType: input.event.entity_type,
        entityId: input.event.entity_id,
        eventId: input.event.id,
      },
    });

    await triggerWorkflowsForEvent(
      input.pageId,
      "state_transition",
      {
        machine: machine.key,
        from: instance.current_state,
        to: transition.to,
        entityType: input.event.entity_type,
      },
      {
        machineId: machine.id,
        machineKey: machine.key,
        instanceId: instance.id,
        transitionId: transitionLog.id,
        fromState: instance.current_state,
        toState: transition.to,
        eventId: input.event.id,
        entityType: input.event.entity_type,
        entityId: input.event.entity_id,
        stateData: updated.data,
      },
    );

    results.push({
      machineId: machine.id,
      machineKey: machine.key,
      instanceId: instance.id,
      transitionId: transitionLog.id,
      fromState: instance.current_state,
      toState: transition.to,
    });
  }

  return results;
}
