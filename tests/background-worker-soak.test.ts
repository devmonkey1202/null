import { describe, expect, it, vi } from "vitest";

const recoverStaleJobsMock = vi.hoisted(() => vi.fn());
const claimDueJobsMock = vi.hoisted(() => vi.fn());
const completeJobMock = vi.hoisted(() => vi.fn());
const failJobMock = vi.hoisted(() => vi.fn());
const executeBackgroundJobMock = vi.hoisted(() => vi.fn());
const registerBackgroundJobHandlerMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/background-jobs", () => ({
  recoverStaleJobs: recoverStaleJobsMock,
  claimDueJobs: claimDueJobsMock,
  completeJob: completeJobMock,
  failJob: failJobMock,
}));

vi.mock("@/lib/service-runtime", () => ({
  executeBackgroundJob: executeBackgroundJobMock,
  registerBackgroundJobHandler: registerBackgroundJobHandlerMock,
}));

import { runBackgroundWorkerCycle } from "@/server/background-worker";

describe("background worker soak", () => {
  it("processes a larger batch without dropping counts", async () => {
    recoverStaleJobsMock.mockResolvedValue({ scanned: 0, requeued: 0, deadLettered: 0 });
    claimDueJobsMock.mockResolvedValue(
      Array.from({ length: 50 }, (_, index) => ({
        id: `job_${index + 1}`,
        type: "bulk",
        payload: { index },
        page_id: "page_1",
        queue: "bulk",
        priority: 100,
      })),
    );
    executeBackgroundJobMock.mockImplementation(async () => ({ ok: true, logs: [], kind: "background_job" }));
    completeJobMock.mockResolvedValue(null);

    const result = await runBackgroundWorkerCycle({
      workerId: "worker_bulk",
      batchSize: 50,
      queues: ["bulk"],
    });

    expect(result.claimed).toBe(50);
    expect(result.succeeded).toBe(50);
    expect(result.requeued).toBe(0);
    expect(result.deadLettered).toBe(0);
    expect(completeJobMock).toHaveBeenCalledTimes(50);
  });
});
