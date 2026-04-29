// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  serviceStateMachine: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  serviceStateInstance: {
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  serviceStateTransition: {
    create: vi.fn(),
  },
}));

const logAppAuditMock = vi.hoisted(() => vi.fn());
const triggerWorkflowsForEventMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({ prisma: prismaMock }));
vi.mock("@/lib/app-audit", () => ({ logAppAudit: logAppAuditMock }));
vi.mock("@/lib/app-workflow", () => ({ triggerWorkflowsForEvent: triggerWorkflowsForEventMock }));

import {
  applyServiceEventToStateMachines,
  parseServiceStateMachineDefinition,
} from "@/lib/service-state-machine";

describe("service state machine", () => {
  beforeEach(() => {
    prismaMock.serviceStateMachine.findMany.mockReset();
    prismaMock.serviceStateMachine.findFirst.mockReset();
    prismaMock.serviceStateMachine.create.mockReset();
    prismaMock.serviceStateMachine.update.mockReset();
    prismaMock.serviceStateMachine.delete.mockReset();
    prismaMock.serviceStateInstance.findFirst.mockReset();
    prismaMock.serviceStateInstance.create.mockReset();
    prismaMock.serviceStateInstance.update.mockReset();
    prismaMock.serviceStateTransition.create.mockReset();
    logAppAuditMock.mockReset();
    triggerWorkflowsForEventMock.mockReset();
  });

  it("rejects invalid definitions", () => {
    const parsed = parseServiceStateMachineDefinition({
      initialState: "draft",
      states: [{ key: "draft" }],
      transitions: [{ key: "approve", from: "missing", to: "done" }],
    });
    expect(parsed.success).toBe(false);
  });

  it("applies a matching transition and triggers workflows", async () => {
    prismaMock.serviceStateMachine.findMany.mockResolvedValue([
      {
        id: "machine_1",
        key: "order",
        name: "Order",
        definition: {
          initialState: "draft",
          states: [{ key: "draft" }, { key: "approved" }],
          transitions: [
            {
              key: "approve",
              from: "draft",
              to: "approved",
              on: { type: "order.approved", topic: "orders" },
              mergePayload: true,
            },
          ],
        },
      },
    ]);
    prismaMock.serviceStateInstance.findFirst.mockResolvedValue(null);
    prismaMock.serviceStateInstance.create.mockResolvedValue({
      id: "inst_1",
      current_state: "draft",
      data: null,
    });
    prismaMock.serviceStateInstance.update.mockResolvedValue({
      id: "inst_1",
      current_state: "approved",
      data: { approvedBy: "system" },
    });
    prismaMock.serviceStateTransition.create.mockResolvedValue({ id: "tr_1" });

    const results = await applyServiceEventToStateMachines({
      pageId: "page_1",
      event: {
        id: "evt_1",
        page_id: "page_1",
        stream: "orders",
        topic: "orders",
        type: "order.approved",
        entity_type: "order",
        entity_id: "order_1",
        source: "api",
        payload: { approvedBy: "system" },
        meta: null,
      },
    });

    expect(results).toHaveLength(1);
    expect(results[0]?.toState).toBe("approved");
    expect(prismaMock.serviceStateInstance.update).toHaveBeenCalled();
    expect(prismaMock.serviceStateTransition.create).toHaveBeenCalled();
    expect(triggerWorkflowsForEventMock).toHaveBeenCalledWith(
      "page_1",
      "state_transition",
      expect.objectContaining({ machine: "order", from: "draft", to: "approved", entityType: "order" }),
      expect.objectContaining({ eventId: "evt_1", entityId: "order_1" }),
    );
  });

  it("skips events without entity coordinates", async () => {
    const results = await applyServiceEventToStateMachines({
      pageId: "page_1",
      event: {
        id: "evt_2",
        page_id: "page_1",
        stream: "system",
        topic: "system",
        type: "system.tick",
        entity_type: null,
        entity_id: null,
        source: "timer",
        payload: null,
        meta: null,
      },
    });
    expect(results).toEqual([]);
    expect(prismaMock.serviceStateMachine.findMany).not.toHaveBeenCalled();
  });
});
