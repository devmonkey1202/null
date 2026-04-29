import { beforeEach, describe, expect, it, vi } from "vitest";

type JobRow = {
  id: string;
  page_id: string | null;
  queue: string;
  type: string;
  payload: Record<string, unknown> | null;
  dedupe_key: string | null;
  status: "queued" | "running" | "succeeded" | "failed" | "dead_lettered";
  run_at: Date;
  priority: number;
  locked_at: Date | null;
  locked_by: string | null;
  attempts: number;
  max_attempts: number;
  last_error: string | null;
  created_at: Date;
  updated_at: Date;
  finished_at: Date | null;
};

type DeadLetterRow = {
  id: string;
  job_id: string;
  page_id: string | null;
  queue: string;
  type: string;
  payload: Record<string, unknown> | null;
  attempts: number;
  max_attempts: number;
  last_error: string | null;
  failed_at: Date;
  metadata: Record<string, unknown> | null;
  created_at: Date;
};

const state = vi.hoisted(() => ({
  seq: 0,
  jobs: [] as JobRow[],
  deadLetters: [] as DeadLetterRow[],
}));

function nextId(prefix: string) {
  state.seq += 1;
  return `${prefix}_${state.seq}`;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

const prismaMock = vi.hoisted(() => ({
  backgroundJob: {
    create: vi.fn(async ({ data }: any) => {
      const row: JobRow = {
        id: nextId("job"),
        page_id: (data.page_id as string | null) ?? null,
        queue: String(data.queue ?? "default"),
        type: String(data.type),
        payload: (data.payload as Record<string, unknown> | null) ?? null,
        dedupe_key: (data.dedupe_key as string | null) ?? null,
        status: String(data.status ?? "queued") as JobRow["status"],
        run_at: data.run_at as Date,
        priority: Number(data.priority ?? 100),
        locked_at: null,
        locked_by: null,
        attempts: Number(data.attempts ?? 0),
        max_attempts: Number(data.max_attempts ?? 3),
        last_error: null,
        created_at: new Date(),
        updated_at: new Date(),
        finished_at: null,
      };
      state.jobs.push(row);
      return clone(row);
    }),
    findFirst: vi.fn(async ({ where }: any) => {
      return clone(
        state.jobs.find(
          (item) =>
            item.page_id === (where.page_id ?? null) &&
            item.queue === where.queue &&
            item.dedupe_key === where.dedupe_key &&
            (!where.status?.in || where.status.in.includes(item.status)),
        ) ?? null,
      );
    }),
    findMany: vi.fn(async ({ where, orderBy, take }: any = {}) => {
      let rows = state.jobs.slice();
      if (where?.status) rows = rows.filter((item) => item.status === where.status);
      if (where?.status?.in) rows = rows.filter((item) => where.status.in.includes(item.status));
      if (where?.run_at?.lte) rows = rows.filter((item) => item.run_at <= where.run_at.lte);
      if (where?.locked_at?.lte) rows = rows.filter((item) => item.locked_at && item.locked_at <= where.locked_at.lte);
      if (where?.queue?.in) rows = rows.filter((item) => where.queue.in.includes(item.queue));
      rows = rows.sort((left, right) => {
        if (Array.isArray(orderBy)) {
          for (const order of orderBy) {
            if (order.priority) {
              const diff = right.priority - left.priority;
              if (diff !== 0) return diff;
            }
            if (order.run_at) {
              const diff = left.run_at.getTime() - right.run_at.getTime();
              if (diff !== 0) return diff;
            }
            if (order.created_at) {
              const diff = left.created_at.getTime() - right.created_at.getTime();
              if (diff !== 0) return diff;
            }
            if (order.locked_at) {
              const diff = (left.locked_at?.getTime() ?? 0) - (right.locked_at?.getTime() ?? 0);
              if (diff !== 0) return diff;
            }
          }
        } else if (orderBy?.updated_at === "desc") {
          return right.updated_at.getTime() - left.updated_at.getTime();
        }
        return 0;
      });
      if (typeof take === "number") rows = rows.slice(0, take);
      return clone(rows);
    }),
    updateMany: vi.fn(async ({ where, data }: any) => {
      const row = state.jobs.find((item) => item.id === where.id && item.status === where.status);
      if (!row) return { count: 0 };
      row.status = data.status;
      row.locked_at = data.locked_at;
      row.locked_by = data.locked_by;
      row.attempts += Number(data.attempts?.increment ?? 0);
      row.updated_at = new Date();
      return { count: 1 };
    }),
    update: vi.fn(async ({ where, data }: any) => {
      const row = state.jobs.find((item) => item.id === where.id);
      if (!row) throw new Error("job_not_found");
      Object.assign(row, data, { updated_at: new Date() });
      return clone(row);
    }),
    findUnique: vi.fn(async ({ where }: any) => {
      return clone(state.jobs.find((item) => item.id === where.id) ?? null);
    }),
  },
  backgroundJobDeadLetter: {
    upsert: vi.fn(async ({ where, update, create }: any) => {
      let row = state.deadLetters.find((item) => item.job_id === where.job_id);
      if (row) {
        Object.assign(row, update);
        return clone(row);
      }
      row = {
        id: nextId("dead"),
        job_id: String(create.job_id),
        page_id: (create.page_id as string | null) ?? null,
        queue: String(create.queue ?? "default"),
        type: String(create.type),
        payload: (create.payload as Record<string, unknown> | null) ?? null,
        attempts: Number(create.attempts),
        max_attempts: Number(create.max_attempts),
        last_error: (create.last_error as string | null) ?? null,
        failed_at: new Date(),
        metadata: (create.metadata as Record<string, unknown> | null) ?? null,
        created_at: new Date(),
      };
      state.deadLetters.push(row);
      return clone(row);
    }),
    findMany: vi.fn(async () => clone(state.deadLetters)),
  },
}));

vi.mock("@/lib/db", () => ({ prisma: prismaMock }));

import {
  claimDueJobs,
  enqueueJob,
  failJob,
  listQueueTelemetry,
  recoverStaleJobs,
} from "@/lib/background-jobs";

describe("background jobs", () => {
  beforeEach(() => {
    state.seq = 0;
    state.jobs.length = 0;
    state.deadLetters.length = 0;
    prismaMock.backgroundJob.create.mockClear();
    prismaMock.backgroundJob.findFirst.mockClear();
    prismaMock.backgroundJob.findMany.mockClear();
    prismaMock.backgroundJob.updateMany.mockClear();
    prismaMock.backgroundJob.update.mockClear();
    prismaMock.backgroundJob.findUnique.mockClear();
    prismaMock.backgroundJobDeadLetter.upsert.mockClear();
    prismaMock.backgroundJobDeadLetter.findMany.mockClear();
  });

  it("dedupes queued jobs by queue and dedupe key", async () => {
    const first = await enqueueJob({
      pageId: "page_1",
      queue: "search",
      type: "service-search-reindex",
      dedupeKey: "page_1:search",
    });
    const second = await enqueueJob({
      pageId: "page_1",
      queue: "search",
      type: "service-search-reindex",
      dedupeKey: "page_1:search",
    });

    expect(first.id).toBe(second.id);
    expect(state.jobs).toHaveLength(1);
  });

  it("claims due jobs by priority and queue", async () => {
    await enqueueJob({ pageId: "page_1", queue: "notifications", type: "low", priority: 10 });
    await enqueueJob({ pageId: "page_1", queue: "notifications", type: "high", priority: 900 });
    await enqueueJob({ pageId: "page_1", queue: "search", type: "other", priority: 800 });

    const jobs = await claimDueJobs(5, "worker-1", { queues: ["notifications"] });

    expect(jobs).toHaveLength(2);
    expect(jobs[0]?.type).toBe("high");
    expect(jobs[1]?.type).toBe("low");
    expect(jobs.every((job) => job.queue === "notifications")).toBe(true);
  });

  it("requeues stale running jobs and dead-letters exhausted ones", async () => {
    const now = Date.now();
    state.jobs.push(
      {
        id: "job_requeue",
        page_id: "page_1",
        queue: "default",
        type: "stale",
        payload: null,
        dedupe_key: null,
        status: "running",
        run_at: new Date(now - 60_000),
        priority: 100,
        locked_at: new Date(now - 600_000),
        locked_by: "worker-a",
        attempts: 1,
        max_attempts: 3,
        last_error: null,
        created_at: new Date(now - 700_000),
        updated_at: new Date(now - 700_000),
        finished_at: null,
      },
      {
        id: "job_dead",
        page_id: "page_1",
        queue: "default",
        type: "stale",
        payload: null,
        dedupe_key: null,
        status: "running",
        run_at: new Date(now - 60_000),
        priority: 100,
        locked_at: new Date(now - 600_000),
        locked_by: "worker-a",
        attempts: 3,
        max_attempts: 3,
        last_error: null,
        created_at: new Date(now - 700_000),
        updated_at: new Date(now - 700_000),
        finished_at: null,
      },
    );

    const result = await recoverStaleJobs({ staleAfterMs: 300_000, workerId: "worker-b" });

    expect(result.requeued).toBe(1);
    expect(result.deadLettered).toBe(1);
    expect(state.jobs.find((item) => item.id === "job_requeue")?.status).toBe("queued");
    expect(state.jobs.find((item) => item.id === "job_dead")?.status).toBe("dead_lettered");
    expect(state.deadLetters).toHaveLength(1);
  });

  it("dead-letters exhausted jobs on failure", async () => {
    await enqueueJob({
      pageId: "page_1",
      queue: "media",
      type: "service-media-process",
      maxAttempts: 1,
    });
    state.jobs[0]!.attempts = 1;

    const updated = await failJob(state.jobs[0]!.id, "fatal");

    expect(updated?.status).toBe("dead_lettered");
    expect(state.deadLetters[0]?.last_error).toBe("fatal");
  });

  it("summarizes queue telemetry", async () => {
    await enqueueJob({ pageId: "page_1", queue: "search", type: "service-search-reindex", priority: 50 });
    await enqueueJob({
      pageId: "page_1",
      queue: "media",
      type: "service-media-process",
      priority: 90,
      maxAttempts: 1,
    });
    state.jobs[0]!.status = "running";
    state.jobs[0]!.locked_at = new Date(Date.now() - 600_000);
    state.jobs[1]!.attempts = 1;
    await failJob(state.jobs[1]!.id, "fatal");

    const telemetry = await listQueueTelemetry({ staleAfterMs: 300_000 });

    expect(telemetry.queues).toHaveLength(2);
    expect(telemetry.totals.running).toBe(1);
    expect(telemetry.totals.deadLettered).toBe(1);
    expect(telemetry.totals.deadLetters).toBe(1);
    expect(telemetry.queues.find((item) => item.queue === "search")?.staleRunning).toBe(1);
  });
});
