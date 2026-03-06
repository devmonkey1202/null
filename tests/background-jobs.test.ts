import { describe, it, expect, vi, beforeEach } from "vitest";

const prismaMock = vi.hoisted(() => ({
  backgroundJob: {
    create: vi.fn(),
    findMany: vi.fn(),
    updateMany: vi.fn(),
    update: vi.fn(),
    findUnique: vi.fn(),
  },
}));

vi.mock("@/lib/db", () => ({ prisma: prismaMock }));

import { claimDueJobs, failJob, enqueueJob } from "@/lib/background-jobs";

describe("background jobs", () => {
  beforeEach(() => {
    prismaMock.backgroundJob.create.mockReset();
    prismaMock.backgroundJob.findMany.mockReset();
    prismaMock.backgroundJob.updateMany.mockReset();
    prismaMock.backgroundJob.update.mockReset();
    prismaMock.backgroundJob.findUnique.mockReset();
  });
  it("claims due jobs with updateMany guard", async () => {
    prismaMock.backgroundJob.findMany.mockResolvedValue([
      { id: "job1", attempts: 0 },
      { id: "job2", attempts: 1 },
    ]);
    prismaMock.backgroundJob.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });

    const jobs = await claimDueJobs(5, "worker-1");
    expect(jobs.length).toBe(1);
    expect(jobs[0].id).toBe("job1");
    expect(prismaMock.backgroundJob.updateMany).toHaveBeenCalledTimes(2);
  });

  it("requeues job on failure when attempts remain", async () => {
    prismaMock.backgroundJob.findUnique.mockResolvedValue({
      id: "job1",
      attempts: 1,
      max_attempts: 3,
      run_at: new Date(),
    });
    prismaMock.backgroundJob.update.mockResolvedValue({ id: "job1" });

    await failJob("job1", "boom");
    const args = prismaMock.backgroundJob.update.mock.calls[0]?.[0];
    expect(args.data.status).toBe("queued");
    expect(args.data.last_error).toBe("boom");
  });

  it("marks job failed when attempts exhausted", async () => {
    prismaMock.backgroundJob.findUnique.mockResolvedValue({
      id: "job2",
      attempts: 3,
      max_attempts: 3,
      run_at: new Date(),
    });
    prismaMock.backgroundJob.update.mockResolvedValue({ id: "job2" });

    await failJob("job2", "fatal");
    const args = prismaMock.backgroundJob.update.mock.calls.at(-1)?.[0];
    expect(args.data.status).toBe("failed");
  });

  it("enqueues job with defaults", async () => {
    prismaMock.backgroundJob.create.mockResolvedValue({ id: "job3" });
    const job = await enqueueJob({ type: "noop" });
    expect(job.id).toBe("job3");
    expect(prismaMock.backgroundJob.create).toHaveBeenCalled();
  });
});
