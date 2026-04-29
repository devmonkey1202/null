import { prisma } from "@/lib/db";

export type BackgroundJobPayload = Record<string, unknown>;
export type BackgroundJobStatus = "queued" | "running" | "succeeded" | "failed" | "dead_lettered";

export type BackgroundJob = {
  id: string;
  page_id: string | null;
  queue: string;
  type: string;
  payload: BackgroundJobPayload | null;
  dedupe_key: string | null;
  status: BackgroundJobStatus;
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

export type BackgroundQueueTelemetry = {
  generatedAt: string;
  queues: Array<{
    queue: string;
    queued: number;
    running: number;
    succeeded: number;
    failed: number;
    deadLettered: number;
    due: number;
    staleRunning: number;
    oldestQueuedAt: string | null;
    deadLetters: number;
  }>;
  totals: {
    queued: number;
    running: number;
    succeeded: number;
    failed: number;
    deadLettered: number;
    due: number;
    deadLetters: number;
  };
};

type BackgroundJobClient = {
  backgroundJob: {
    create(args: { data: Record<string, unknown> }): Promise<unknown>;
    findFirst(args: { where: Record<string, unknown> }): Promise<unknown | null>;
    findMany(args?: Record<string, unknown>): Promise<unknown[]>;
    updateMany(args: { where: Record<string, unknown>; data: Record<string, unknown> }): Promise<{ count: number }>;
    update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<unknown>;
    findUnique(args: { where: { id: string } }): Promise<unknown | null>;
  };
  backgroundJobDeadLetter: {
    upsert(args: {
      where: { job_id: string };
      update: Record<string, unknown>;
      create: Record<string, unknown>;
    }): Promise<unknown>;
    findMany(args?: Record<string, unknown>): Promise<unknown[]>;
  };
};

const backgroundJobPrisma = prisma as unknown as BackgroundJobClient;

function computeBackoffMs(attempts: number) {
  const base = 1000;
  const max = 60_000;
  const exp = Math.min(6, Math.max(0, attempts));
  return Math.min(max, base * 2 ** exp);
}

function normalizeQueueName(value: unknown) {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  return raw || "default";
}

function normalizePriority(value: unknown) {
  const num = typeof value === "number" ? value : Number(value ?? 100);
  if (!Number.isFinite(num)) return 100;
  return Math.max(0, Math.min(1000, Math.round(num)));
}

function normalizeAttempts(value: unknown, fallback: number) {
  const num = typeof value === "number" ? value : Number(value ?? fallback);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(1, Math.min(100, Math.round(num)));
}

function asBackgroundJob(job: Record<string, unknown>): BackgroundJob {
  return job as unknown as BackgroundJob;
}

async function createDeadLetter(job: BackgroundJob, errorMessage: string) {
  return backgroundJobPrisma.backgroundJobDeadLetter.upsert({
    where: { job_id: job.id },
    update: {
      page_id: job.page_id,
      queue: job.queue,
      type: job.type,
      payload: (job.payload ?? null) as unknown as object,
      attempts: job.attempts,
      max_attempts: job.max_attempts,
      last_error: errorMessage.slice(0, 500),
      failed_at: new Date(),
      metadata: { source: "background_job" } as unknown as object,
    },
    create: {
      job_id: job.id,
      page_id: job.page_id,
      queue: job.queue,
      type: job.type,
      payload: (job.payload ?? null) as unknown as object,
      attempts: job.attempts,
      max_attempts: job.max_attempts,
      last_error: errorMessage.slice(0, 500),
      metadata: { source: "background_job" } as unknown as object,
    },
  });
}

export async function enqueueJob(params: {
  pageId?: string | null;
  queue?: string | null;
  type: string;
  payload?: BackgroundJobPayload | null;
  runAt?: Date;
  priority?: number;
  dedupeKey?: string | null;
  maxAttempts?: number;
}): Promise<BackgroundJob> {
  const now = new Date();
  const queue = normalizeQueueName(params.queue);
  const dedupeKey = typeof params.dedupeKey === "string" && params.dedupeKey.trim() ? params.dedupeKey.trim() : null;

  if (dedupeKey) {
    const existing = await backgroundJobPrisma.backgroundJob.findFirst({
      where: {
        page_id: params.pageId ?? null,
        queue,
        dedupe_key: dedupeKey,
        status: { in: ["queued", "running"] },
      },
    });
    if (existing) return existing as BackgroundJob;
  }

  return (await backgroundJobPrisma.backgroundJob.create({
    data: {
      page_id: params.pageId ?? null,
      queue,
      type: params.type,
      payload: (params.payload ?? null) as unknown as object,
      dedupe_key: dedupeKey,
      run_at: params.runAt ?? now,
      priority: normalizePriority(params.priority),
      max_attempts: normalizeAttempts(params.maxAttempts, 3),
      status: "queued",
    },
  })) as BackgroundJob;
}

export async function claimDueJobs(limit: number, workerId: string, options?: { queues?: string[] | null }): Promise<BackgroundJob[]> {
  const now = new Date();
  const queueFilter = options?.queues?.length
    ? { in: options.queues.map((queue) => normalizeQueueName(queue)) }
    : undefined;
  const candidates = (await backgroundJobPrisma.backgroundJob.findMany({
    where: {
      status: "queued",
      run_at: { lte: now },
      ...(queueFilter ? { queue: queueFilter } : {}),
    },
    orderBy: [{ priority: "desc" }, { run_at: "asc" }, { created_at: "asc" }],
    take: limit,
  })) as BackgroundJob[];

  const claimed: BackgroundJob[] = [];
  for (const job of candidates) {
    const updated = await backgroundJobPrisma.backgroundJob.updateMany({
      where: {
        id: job.id,
        status: "queued",
      },
      data: {
        status: "running",
        locked_at: now,
        locked_by: workerId,
        attempts: { increment: 1 },
      },
    });
    if (updated.count === 1) {
      claimed.push(
        asBackgroundJob({
          ...job,
          status: "running",
          locked_at: now,
          locked_by: workerId,
          attempts: job.attempts + 1,
        }),
      );
    }
  }
  return claimed;
}

export async function recoverStaleJobs(input: {
  staleAfterMs: number;
  workerId: string;
  queues?: string[] | null;
}) {
  const cutoff = new Date(Date.now() - Math.max(10_000, Math.round(input.staleAfterMs)));
  const queueFilter = input.queues?.length
    ? { in: input.queues.map((queue) => normalizeQueueName(queue)) }
    : undefined;
  const staleJobs = (await backgroundJobPrisma.backgroundJob.findMany({
    where: {
      status: "running",
      locked_at: { lte: cutoff },
      ...(queueFilter ? { queue: queueFilter } : {}),
    },
    orderBy: { locked_at: "asc" },
  })) as BackgroundJob[];

  let requeued = 0;
  let deadLettered = 0;
  for (const row of staleJobs) {
    const job = asBackgroundJob(row as unknown as Record<string, unknown>);
    if (job.attempts < job.max_attempts) {
      await backgroundJobPrisma.backgroundJob.update({
        where: { id: job.id },
        data: {
          status: "queued",
          run_at: new Date(),
          locked_at: null,
          locked_by: null,
          last_error: `stale_lock_recovered:${input.workerId}`.slice(0, 500),
        },
      });
      requeued += 1;
    } else {
      await createDeadLetter(job, `stale_lock_exhausted:${input.workerId}`);
      await backgroundJobPrisma.backgroundJob.update({
        where: { id: job.id },
        data: {
          status: "dead_lettered",
          finished_at: new Date(),
          locked_at: null,
          locked_by: null,
          last_error: `stale_lock_exhausted:${input.workerId}`.slice(0, 500),
        },
      });
      deadLettered += 1;
    }
  }

  return { scanned: staleJobs.length, requeued, deadLettered };
}

export async function completeJob(jobId: string): Promise<BackgroundJob> {
  return (await backgroundJobPrisma.backgroundJob.update({
    where: { id: jobId },
    data: {
      status: "succeeded",
      finished_at: new Date(),
      locked_at: null,
      locked_by: null,
      last_error: null,
    },
  })) as BackgroundJob;
}

export async function failJob(jobId: string, errorMessage: string): Promise<BackgroundJob | null> {
  const row = await backgroundJobPrisma.backgroundJob.findUnique({ where: { id: jobId } });
  if (!row) return null;

  const job = asBackgroundJob(row as unknown as Record<string, unknown>);
  const retry = job.attempts < job.max_attempts;
  const nextRun = new Date(Date.now() + computeBackoffMs(job.attempts));

  if (retry) {
    return (await backgroundJobPrisma.backgroundJob.update({
      where: { id: jobId },
      data: {
        status: "queued",
        run_at: nextRun,
        finished_at: null,
        last_error: errorMessage.slice(0, 500),
        locked_at: null,
        locked_by: null,
      },
    })) as BackgroundJob;
  }

  await createDeadLetter(job, errorMessage);
  return (await backgroundJobPrisma.backgroundJob.update({
    where: { id: jobId },
    data: {
      status: "dead_lettered",
      finished_at: new Date(),
      last_error: errorMessage.slice(0, 500),
      locked_at: null,
      locked_by: null,
    },
  })) as BackgroundJob;
}

export async function listQueueTelemetry(input?: { staleAfterMs?: number }) {
  const now = new Date();
  const staleAfterMs = Math.max(10_000, Math.round(input?.staleAfterMs ?? 5 * 60_000));
  const cutoff = new Date(now.getTime() - staleAfterMs);
  const [jobs, deadLetters] = await Promise.all([
    backgroundJobPrisma.backgroundJob.findMany(),
    backgroundJobPrisma.backgroundJobDeadLetter.findMany(),
  ]);

  const buckets = new Map<
    string,
    {
      queue: string;
      queued: number;
      running: number;
      succeeded: number;
      failed: number;
      deadLettered: number;
      due: number;
      staleRunning: number;
      oldestQueuedAt: string | null;
      deadLetters: number;
    }
  >();

  function ensure(queue: string) {
    const key = normalizeQueueName(queue);
    const existing = buckets.get(key);
    if (existing) return existing;
    const created = {
      queue: key,
      queued: 0,
      running: 0,
      succeeded: 0,
      failed: 0,
      deadLettered: 0,
      due: 0,
      staleRunning: 0,
      oldestQueuedAt: null as string | null,
      deadLetters: 0,
    };
    buckets.set(key, created);
    return created;
  }

  for (const row of jobs) {
    const bucket = ensure((row as { queue?: string }).queue ?? "default");
    const status = String((row as { status?: string }).status ?? "queued");
    if (status === "queued") {
      bucket.queued += 1;
      const runAt = (row as { run_at?: Date }).run_at;
      if (runAt instanceof Date && runAt <= now) bucket.due += 1;
      if (runAt instanceof Date) {
        const iso = runAt.toISOString();
        if (!bucket.oldestQueuedAt || iso < bucket.oldestQueuedAt) bucket.oldestQueuedAt = iso;
      }
    } else if (status === "running") {
      bucket.running += 1;
      const lockedAt = (row as { locked_at?: Date | null }).locked_at;
      if (lockedAt instanceof Date && lockedAt <= cutoff) bucket.staleRunning += 1;
    } else if (status === "succeeded") {
      bucket.succeeded += 1;
    } else if (status === "dead_lettered") {
      bucket.deadLettered += 1;
    } else {
      bucket.failed += 1;
    }
  }

  for (const row of deadLetters) {
    const bucket = ensure((row as { queue?: string }).queue ?? "default");
    bucket.deadLetters += 1;
  }

  const queues = Array.from(buckets.values()).sort((left, right) => left.queue.localeCompare(right.queue));
  return {
    generatedAt: now.toISOString(),
    queues,
    totals: queues.reduce(
      (acc, queue) => ({
        queued: acc.queued + queue.queued,
        running: acc.running + queue.running,
        succeeded: acc.succeeded + queue.succeeded,
        failed: acc.failed + queue.failed,
        deadLettered: acc.deadLettered + queue.deadLettered,
        due: acc.due + queue.due,
        deadLetters: acc.deadLetters + queue.deadLetters,
      }),
      { queued: 0, running: 0, succeeded: 0, failed: 0, deadLettered: 0, due: 0, deadLetters: 0 },
    ),
  } satisfies BackgroundQueueTelemetry;
}
