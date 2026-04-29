import { beforeEach, describe, expect, it, vi } from "vitest";

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

describe("background worker", () => {
  beforeEach(() => {
    recoverStaleJobsMock.mockReset();
    claimDueJobsMock.mockReset();
    completeJobMock.mockReset();
    failJobMock.mockReset();
    executeBackgroundJobMock.mockReset();
  });

  it("runs a full cycle and tracks succeeded, requeued, and dead-lettered jobs", async () => {
    recoverStaleJobsMock.mockResolvedValue({ scanned: 1, requeued: 1, deadLettered: 0 });
    claimDueJobsMock.mockResolvedValue([
      { id: "job_ok", type: "ok", payload: null, page_id: "page_1", queue: "default", priority: 100 },
      { id: "job_retry", type: "retry", payload: null, page_id: "page_1", queue: "default", priority: 100 },
      { id: "job_dead", type: "dead", payload: null, page_id: "page_1", queue: "default", priority: 100 },
    ]);
    executeBackgroundJobMock
      .mockResolvedValueOnce({ ok: true, logs: [], kind: "background_job" })
      .mockResolvedValueOnce({ ok: false, error: "retry_me", logs: [], kind: "background_job" })
      .mockResolvedValueOnce({ ok: false, error: "dead_me", logs: [], kind: "background_job" });
    completeJobMock.mockResolvedValue(null);
    failJobMock.mockResolvedValueOnce({ status: "queued" }).mockResolvedValueOnce({ status: "dead_lettered" });

    const result = await runBackgroundWorkerCycle({
      workerId: "worker_1",
      batchSize: 10,
      staleAfterMs: 300_000,
    });

    expect(result.recovered.requeued).toBe(1);
    expect(result.claimed).toBe(3);
    expect(result.succeeded).toBe(1);
    expect(result.requeued).toBe(1);
    expect(result.deadLettered).toBe(1);
    expect(completeJobMock).toHaveBeenCalledWith("job_ok");
    expect(failJobMock).toHaveBeenCalledTimes(2);
  });
});
