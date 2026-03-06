import { runScheduledWorkflows } from "@/lib/workflow-scheduler";
import { expireStalePages } from "@/lib/expire";
import { runDailyReportsOnce } from "@/lib/daily-reports";
import { runConnectorSchedules } from "@/lib/connector-scheduler";

type SchedulerHandle = {
  stop: () => void;
};

function shouldEnableInternalCron() {
  const raw = (process.env.INTERNAL_CRON ?? "").toLowerCase();
  if (raw === "false" || raw === "0" || raw === "off") return false;
  if (raw === "true" || raw === "1" || raw === "on") return true;
  return true;
}

function resolveIntervalMs() {
  const raw = Number(process.env.INTERNAL_CRON_INTERVAL_MS ?? 60_000);
  if (!Number.isFinite(raw) || raw < 5_000) return 60_000;
  return Math.floor(raw);
}

function resolveExpireIntervalMs() {
  const raw = Number(process.env.INTERNAL_EXPIRE_INTERVAL_MS ?? 300_000);
  if (!Number.isFinite(raw) || raw < 60_000) return 300_000;
  return Math.floor(raw);
}

export function startInternalWorkflowScheduler(): SchedulerHandle | null {
  if (!shouldEnableInternalCron()) return null;
  const intervalMs = resolveIntervalMs();
  const expireIntervalMs = resolveExpireIntervalMs();
  let running = false;
  let timer: NodeJS.Timeout | null = null;
  let delayTimer: NodeJS.Timeout | null = null;
  let lastExpireAt = 0;

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const now = new Date();
      await runScheduledWorkflows(now);
      await runConnectorSchedules(now);
      const nowMs = now.getTime();
      if (nowMs - lastExpireAt >= expireIntervalMs) {
        await expireStalePages(now);
        lastExpireAt = nowMs;
      }
      await runDailyReportsOnce(now);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[cron] failed: ${message}`);
    } finally {
      running = false;
    }
  };

  const now = Date.now();
  const offset = now % intervalMs;
  const initialDelay = intervalMs - offset;
  delayTimer = setTimeout(() => {
    tick().catch(() => undefined);
    timer = setInterval(() => {
      tick().catch(() => undefined);
    }, intervalMs);
  }, initialDelay);

  return {
    stop: () => {
      if (delayTimer) clearTimeout(delayTimer);
      if (timer) clearInterval(timer);
    },
  };
}
