import { claimDueJobs, completeJob, failJob } from "@/lib/background-jobs";

type SchedulerHandle = {
  stop: () => void;
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

async function runJob(job: { id: string; type: string; payload: unknown }) {
  if (job.type === "noop") return;
  if (job.type === "log") {
    console.log(`[background] log job`, job.payload ?? {});
    return;
  }
  throw new Error(`unknown_job_type:${job.type}`);
}

export function startBackgroundWorker(): SchedulerHandle | null {
  if (!shouldEnableWorker()) return null;
  const intervalMs = resolveIntervalMs();
  const workerId = `worker_${Math.random().toString(16).slice(2, 8)}`;
  let running = false;
  const timer = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      const jobs = await claimDueJobs(10, workerId);
      for (const job of jobs) {
        try {
          await runJob(job);
          await completeJob(job.id);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          await failJob(job.id, message);
        }
      }
    } finally {
      running = false;
    }
  }, intervalMs);

  return {
    stop: () => clearInterval(timer),
  };
}
