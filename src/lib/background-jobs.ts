import { prisma } from "@/lib/db";

export type BackgroundJobPayload = Record<string, unknown>;

export type BackgroundJob = {
  id: string;
  page_id: string | null;
  type: string;
  payload: BackgroundJobPayload | null;
  status: "queued" | "running" | "succeeded" | "failed";
  run_at: Date;
  locked_at: Date | null;
  locked_by: string | null;
  attempts: number;
  max_attempts: number;
  last_error: string | null;
  created_at: Date;
  updated_at: Date;
  finished_at: Date | null;
};

function computeBackoffMs(attempts: number) {
  const base = 1000;
  const max = 60_000;
  const exp = Math.min(6, Math.max(0, attempts));
  return Math.min(max, base * 2 ** exp);
}

export async function enqueueJob(params: {
  pageId?: string | null;
  type: string;
  payload?: BackgroundJobPayload | null;
  runAt?: Date;
  maxAttempts?: number;
}) {
  const now = new Date();
  return prisma.backgroundJob.create({
    data: {
      page_id: params.pageId ?? null,
      type: params.type,
      payload: (params.payload ?? null) as unknown as object,
      run_at: params.runAt ?? now,
      max_attempts: params.maxAttempts ?? 3,
      status: "queued",
    },
  });
}

export async function claimDueJobs(limit: number, workerId: string) {
  const now = new Date();
  const candidates = await prisma.backgroundJob.findMany({
    where: { status: "queued", run_at: { lte: now } },
    orderBy: { run_at: "asc" },
    take: limit,
  });

  const claimed: BackgroundJob[] = [];
  for (const job of candidates) {
    const updated = await prisma.backgroundJob.updateMany({
      where: { id: job.id, status: "queued" },
      data: {
        status: "running",
        locked_at: now,
        locked_by: workerId,
        attempts: { increment: 1 },
      },
    });
    if (updated.count === 1) {
      claimed.push({ ...(job as BackgroundJob), status: "running", locked_at: now, locked_by: workerId, attempts: job.attempts + 1 });
    }
  }
  return claimed;
}

export async function completeJob(jobId: string) {
  return prisma.backgroundJob.update({
    where: { id: jobId },
    data: {
      status: "succeeded",
      finished_at: new Date(),
      locked_at: null,
      locked_by: null,
    },
  });
}

export async function failJob(jobId: string, errorMessage: string) {
  const job = await prisma.backgroundJob.findUnique({ where: { id: jobId } });
  if (!job) return null;

  const attempts = job.attempts;
  const maxAttempts = job.max_attempts;
  const retry = attempts < maxAttempts;
  const nextRun = new Date(Date.now() + computeBackoffMs(attempts));

  return prisma.backgroundJob.update({
    where: { id: jobId },
    data: {
      status: retry ? "queued" : "failed",
      run_at: retry ? nextRun : job.run_at,
      finished_at: retry ? null : new Date(),
      last_error: errorMessage.slice(0, 500),
      locked_at: null,
      locked_by: null,
    },
  });
}
