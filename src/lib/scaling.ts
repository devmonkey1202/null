export type ScalingConfig = {
  minInstances: number;
  maxInstances: number;
  targetCpuUtilization: number;
  maxQueueDepth: number;
  queueBackend: "memory" | "redis";
  sessionStore: "cookie" | "redis";
  cacheStore: "memory" | "redis";
  workerConcurrency: number;
};

export type ScalingMetrics = {
  currentInstances: number;
  cpuUtilization: number;
  queueDepth: number;
};

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function readNumberEnv(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
}

export function resolveScalingConfig(input?: Partial<ScalingConfig>): ScalingConfig {
  const minInstances = clamp(input?.minInstances ?? readNumberEnv("SCALING_MIN_INSTANCES", 1), 1, 1000);
  const maxInstances = clamp(input?.maxInstances ?? readNumberEnv("SCALING_MAX_INSTANCES", 10), minInstances, 2000);
  const targetCpuUtilization = clamp(
    input?.targetCpuUtilization ?? readNumberEnv("SCALING_TARGET_CPU", 0.65),
    0.2,
    0.95,
  );
  const maxQueueDepth = clamp(input?.maxQueueDepth ?? readNumberEnv("SCALING_MAX_QUEUE_DEPTH", 250), 10, 100000);
  const workerConcurrency = clamp(input?.workerConcurrency ?? readNumberEnv("SCALING_WORKER_CONCURRENCY", 8), 1, 1000);

  const queueBackend = input?.queueBackend === "redis" ? "redis" : "memory";
  const sessionStore = input?.sessionStore === "redis" ? "redis" : "cookie";
  const cacheStore = input?.cacheStore === "redis" ? "redis" : "memory";

  return {
    minInstances,
    maxInstances,
    targetCpuUtilization,
    maxQueueDepth,
    queueBackend,
    sessionStore,
    cacheStore,
    workerConcurrency,
  };
}

export function recommendInstanceCount(config: ScalingConfig, metrics: ScalingMetrics) {
  const current = clamp(metrics.currentInstances ?? config.minInstances, config.minInstances, config.maxInstances);
  const cpu = clamp(metrics.cpuUtilization ?? 0, 0, 1);
  const queue = Math.max(0, Math.floor(metrics.queueDepth ?? 0));

  const cpuFactor = cpu / config.targetCpuUtilization;
  const queueFactor = queue / config.maxQueueDepth;
  const pressure = Math.max(cpuFactor, queueFactor);

  let desired = Math.ceil(current * Math.max(1, pressure));
  desired = clamp(desired, config.minInstances, config.maxInstances);

  const reason =
    pressure <= 1
      ? "stable"
      : cpuFactor >= queueFactor
        ? "cpu_pressure"
        : "queue_pressure";

  return { desired, reason };
}
