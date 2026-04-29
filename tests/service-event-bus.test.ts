// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  serviceEvent: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
}));

const logAppAuditMock = vi.hoisted(() => vi.fn());
const triggerWorkflowsForEventMock = vi.hoisted(() => vi.fn());
const enqueueJobMock = vi.hoisted(() => vi.fn());
const applyServiceEventToStateMachinesMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({ prisma: prismaMock }));
vi.mock("@/lib/app-audit", () => ({ logAppAudit: logAppAuditMock }));
vi.mock("@/lib/app-workflow", () => ({ triggerWorkflowsForEvent: triggerWorkflowsForEventMock }));
vi.mock("@/lib/background-jobs", () => ({ enqueueJob: enqueueJobMock }));
vi.mock("@/lib/service-state-machine", () => ({ applyServiceEventToStateMachines: applyServiceEventToStateMachinesMock }));

import {
  dispatchServiceEvent,
  publishServiceEvent,
  scheduleServiceEventRetry,
} from "@/lib/service-event-bus";

describe("service event bus", () => {
  beforeEach(() => {
    prismaMock.serviceEvent.findMany.mockReset();
    prismaMock.serviceEvent.findFirst.mockReset();
    prismaMock.serviceEvent.create.mockReset();
    prismaMock.serviceEvent.update.mockReset();
    logAppAuditMock.mockReset();
    triggerWorkflowsForEventMock.mockReset();
    enqueueJobMock.mockReset();
    applyServiceEventToStateMachinesMock.mockReset();
  });

  it("publishes service events and triggers workflow hooks", async () => {
    prismaMock.serviceEvent.create.mockResolvedValue({
      id: "evt_1",
      page_id: "page_1",
      stream: "orders",
      topic: "orders",
      event_key: "order:1",
      type: "order.created",
      entity_type: "order",
      entity_id: "order_1",
      source: "api",
      payload: { orderId: "order_1" },
      meta: null,
      status: "published",
      attempts: 0,
      max_attempts: 3,
    });

    const result = await publishServiceEvent({
      pageId: "page_1",
      dispatch: false,
      envelope: {
        stream: "orders",
        topic: "orders",
        type: "order.created",
        eventKey: "order:1",
        entityType: "order",
        entityId: "order_1",
        payload: { orderId: "order_1" },
      },
    });

    expect(result.event.id).toBe("evt_1");
    expect(triggerWorkflowsForEventMock).toHaveBeenCalledWith(
      "page_1",
      "service_event",
      expect.objectContaining({ eventType: "order.created", topic: "orders", stream: "orders", entityType: "order" }),
      expect.objectContaining({ eventId: "evt_1", entityId: "order_1" }),
    );
  });

  it("dispatches service events and marks them processed", async () => {
    prismaMock.serviceEvent.findFirst.mockResolvedValue({
      id: "evt_2",
      page_id: "page_1",
      stream: "orders",
      topic: "orders",
      type: "order.approved",
      entity_type: "order",
      entity_id: "order_2",
      source: "api",
      payload: { approvedBy: "system" },
      meta: null,
      attempts: 0,
      max_attempts: 3,
    });
    prismaMock.serviceEvent.update
      .mockResolvedValueOnce({
        id: "evt_2",
        page_id: "page_1",
        stream: "orders",
        topic: "orders",
        type: "order.approved",
        entity_type: "order",
        entity_id: "order_2",
        source: "api",
        payload: { approvedBy: "system" },
        meta: null,
        attempts: 1,
        max_attempts: 3,
      })
      .mockResolvedValueOnce({ id: "evt_2" });
    applyServiceEventToStateMachinesMock.mockResolvedValue([{ transitionId: "tr_1", toState: "approved" }]);

    const result = await dispatchServiceEvent({ pageId: "page_1", eventId: "evt_2" });

    expect(result.ok).toBe(true);
    expect(result.status).toBe("processed");
    expect(applyServiceEventToStateMachinesMock).toHaveBeenCalled();
    expect(prismaMock.serviceEvent.update).toHaveBeenCalledTimes(2);
  });

  it("schedules retries instead of failing immediately", async () => {
    prismaMock.serviceEvent.findFirst.mockResolvedValue({
      id: "evt_3",
      page_id: "page_1",
      stream: "orders",
      topic: "orders",
      type: "order.failed",
      entity_type: "order",
      entity_id: "order_3",
      source: "api",
      payload: null,
      meta: null,
      attempts: 1,
      max_attempts: 3,
    });
    prismaMock.serviceEvent.update.mockResolvedValue({ id: "evt_3" });

    const result = await scheduleServiceEventRetry({
      pageId: "page_1",
      eventId: "evt_3",
      reason: "temporary_failure",
    });

    expect(result.status).toBe("scheduled_retry");
    expect(enqueueJobMock).toHaveBeenCalledWith(
      expect.objectContaining({
        pageId: "page_1",
        type: "service-event-dispatch",
        payload: { eventId: "evt_3" },
      }),
    );
  });
});
