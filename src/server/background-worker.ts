import "@/lib/service-event-bus";
import "@/lib/service-media";
import "@/lib/service-ranking";
import "@/lib/service-search";
import {
  claimDueJobs,
  completeJob,
  failJob,
  recoverStaleJobs,
  type BackgroundJob,
} from "@/lib/background-jobs";
import { executeBackgroundJob } from "@/lib/service-runtime";

type SchedulerHandle = {
  stop: () => void;
};

type WorkerCycleOptions = {
  workerId: string;
  batchSize?: number;
  queues?: string[] | null;
  staleAfterMs?: number;
};

function shouldEnableWorker() {
  const raw = (process.env.BACKGROUND_WORKER ?? "").toLowerCase();
  if (raw === "false" || raw === "0" || raw === "off") return false;
  if (raw === "true" || raw === "1" || raw === "on") return true;
  return false;
}

function resolveIntervalMs() {
  const raw = Number(process.env.BACKGROUND_WORKER_INTERVAL_MS ?? 30_000);
  if (!Number.isFinite(raw) || raw < 5_000) return 30_000;
  return Math.floor(raw);
}

function resolveBatchSize() {
  const raw = Number(process.env.BACKGROUND_WORKER_BATCH_SIZE ?? 10);
  if (!Number.isFinite(raw) || raw < 1) return 10;
  return Math.min(100, Math.floor(raw));
}

function resolveStaleAfterMs() {
  const raw = Number(process.env.BACKGROUND_WORKER_STALE_AFTER_MS ?? 5 * 60_000);
  if (!Number.isFinite(raw) || raw < 10_000) return 5 * 60_000;
  return Math.floor(raw);
}

function resolveQueues() {
  const raw = String(process.env.BACKGROUND_WORKER_QUEUES ?? "").trim();
  if (!raw) return null;
  const queues = raw
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  return queues.length ? queues : null;
}

async function runJob(workerId: string, job: BackgroundJob) {
  try {
    const result = await executeBackgroundJob(
      {
        id: job.id,
        type: job.type,
        payload: job.payload,
        pageId: job.page_id,
      },
      {
        pageId: job.page_id ?? undefined,
        metadata: {
          workerId,
          queue: job.queue,
          priority: job.priority,
        },
      },
    );
    if (!result.ok) {
      throw new Error(result.error ?? `background_job_failed:${job.type}`);
    }
    if (result.logs.length) {
      console.log(`[background:${job.queue}] ${job.type}`, result.logs);
    }
    await completeJob(job.id);
    return { ok: true as const, status: "succeeded" as const };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const updated = await failJob(job.id, message);
    return {
      ok: false as const,
      status: updated?.status ?? "failed",
    };
  }
}

export async function runBackgroundWorkerCycle(options: WorkerCycleOptions) {
  const workerId = options.workerId;
  const batchSize = Math.min(100, Math.max(1, Math.floor(options.batchSize ?? 10)));
  const staleAfterMs = Math.max(10_000, Math.floor(options.staleAfterMs ?? 5 * 60_000));
  const queues = options.queues?.length ? options.queues : null;

  const recovered = await recoverStaleJobs({ staleAfterMs, workerId, queues });
  const jobs = await claimDueJobs(batchSize, workerId, { queues });

  let succeeded = 0;
  let requeued = 0;
  let deadLettered = 0;
  for (const job of jobs) {
    const result = await runJob(workerId, job);
    if (result.ok) {
      succeeded += 1;
    } else if (result.status === "queued") {
      requeued += 1;
    } else if (result.status === "dead_lettered") {
      deadLettered += 1;
    }
  }

  return {
    workerId,
    batchSize,
    queues,
    recovered,
    claimed: jobs.length,
    succeeded,
    requeued,
    deadLettered,
  };
}

export function startBackgroundWorker(): SchedulerHandle | null {
  if (!shouldEnableWorker()) return null;
  const intervalMs = resolveIntervalMs();
  const batchSize = resolveBatchSize();
  const staleAfterMs = resolveStaleAfterMs();
  const queues = resolveQueues();
  const workerId = `worker_${Math.random().toString(16).slice(2, 8)}`;
  let running = false;
  const timer = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      await runBackgroundWorkerCycle({
        workerId,
        batchSize,
        staleAfterMs,
        queues,
      });
    } finally {
      running = false;
    }
  }, intervalMs);

  return {
    stop: () => clearInterval(timer),
  };
}
