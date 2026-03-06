import { mkdirSync, writeFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { buildPublicCacheHeaders, buildNoStoreHeaders } from "@/lib/cache-policy";
import { resolveScalingConfig, recommendInstanceCount } from "@/lib/scaling";
import { recordSecurityUpdate, listSecurityUpdates } from "@/lib/security-update";
import { buildAppStoreArtifacts } from "@/lib/app-store-pipeline";
import { enqueueJob, claimDueJobs, completeJob, failJob } from "@/lib/background-jobs";
import { prisma } from "@/lib/db";

const LOG_DIR = join(process.cwd(), "logs");

function ensureLogDir() {
  if (!existsSync(LOG_DIR)) {
    mkdirSync(LOG_DIR, { recursive: true });
  }
}

function writeLog(name: string, lines: string[]) {
  ensureLogDir();
  const file = join(LOG_DIR, name);
  writeFileSync(file, `${lines.join("\n")}\n`, "utf8");
  return file;
}

async function runBackgroundJobsScenario() {
  const lines: string[] = [];
  lines.push("# L2 Background Jobs Scenario");
  lines.push(`ts=${new Date().toISOString()}`);

  const job1 = await enqueueJob({ type: "log", payload: { message: "l2-background-job" } });
  const job2 = await enqueueJob({ type: "noop" });
  lines.push(`enqueue job1=${job1.id} type=${job1.type}`);
  lines.push(`enqueue job2=${job2.id} type=${job2.type}`);

  const claimed = await claimDueJobs(5, "l2-worker");
  lines.push(`claimed=${claimed.length}`);
  for (const job of claimed) {
    if (job.type === "log" || job.type === "noop") {
      await completeJob(job.id);
      lines.push(`complete job=${job.id} type=${job.type}`);
    } else {
      await failJob(job.id, "unsupported_type");
      lines.push(`fail job=${job.id} type=${job.type}`);
    }
  }

  const job3 = await enqueueJob({ type: "log", payload: { message: "l2-failure" }, maxAttempts: 1 });
  const claimed2 = await claimDueJobs(2, "l2-worker");
  lines.push(`claimed_retry=${claimed2.length}`);
  for (const job of claimed2) {
    if (job.id === job3.id) {
      await failJob(job.id, "forced_fail");
      lines.push(`force_fail job=${job.id}`);
    }
  }

  await prisma.backgroundJob.deleteMany({ where: { id: { in: [job1.id, job2.id, job3.id] } } });
  return writeLog("l2-background-jobs.log", lines);
}

function runCachePolicyScenario() {
  const lines: string[] = [];
  lines.push("# L2 Cache Policy Scenario (simulation)");
  lines.push(`ts=${new Date().toISOString()}`);
  lines.push("note=simulated cache hit/miss using in-memory map");

  const cache = new Map<string, { headers: Record<string, string>; hits: number }>();

  function simulateFetch(key: string, headers: Record<string, string>) {
    const existing = cache.get(key);
    if (existing) {
      existing.hits += 1;
      return { hit: true, headers: existing.headers };
    }
    cache.set(key, { headers, hits: 1 });
    return { hit: false, headers };
  }

  const publicHeaders = buildPublicCacheHeaders({ maxAgeSeconds: 60, staleWhileRevalidateSeconds: 600, tags: ["plugin-store"] });
  const noStoreHeaders = buildNoStoreHeaders();

  const miss = simulateFetch("/api/plugins/store", publicHeaders);
  const hit = simulateFetch("/api/plugins/store", publicHeaders);
  const apiMiss = simulateFetch("/api/app/data", noStoreHeaders);

  lines.push(`public miss: hit=${miss.hit} cache-control=${miss.headers["Cache-Control"]}`);
  lines.push(`public hit: hit=${hit.hit} surrogate-key=${hit.headers["Surrogate-Key"] ?? "none"}`);
  lines.push(`no-store: hit=${apiMiss.hit} cache-control=${apiMiss.headers["Cache-Control"]}`);

  return writeLog("l2-cache-policy.log", lines);
}

function runScalingScenario() {
  const lines: string[] = [];
  lines.push("# L2 Scaling Scenario Report (simulation)");
  lines.push(`ts=${new Date().toISOString()}`);
  lines.push("note=simulated metrics for sizing guidance");

  const config = resolveScalingConfig({
    minInstances: 2,
    maxInstances: 12,
    targetCpuUtilization: 0.6,
    maxQueueDepth: 200,
    queueBackend: "redis",
    sessionStore: "redis",
    cacheStore: "redis",
    workerConcurrency: 12,
  });

  const scenarios = [
    { label: "low", currentInstances: 2, cpuUtilization: 0.25, queueDepth: 10 },
    { label: "medium", currentInstances: 3, cpuUtilization: 0.6, queueDepth: 90 },
    { label: "cpu_spike", currentInstances: 4, cpuUtilization: 0.92, queueDepth: 40 },
    { label: "queue_spike", currentInstances: 4, cpuUtilization: 0.4, queueDepth: 180 },
  ];

  lines.push(`config=${JSON.stringify(config)}`);
  scenarios.forEach((metrics) => {
    const result = recommendInstanceCount(config, metrics);
    lines.push(`${metrics.label}: cpu=${metrics.cpuUtilization} queue=${metrics.queueDepth} -> desired=${result.desired} reason=${result.reason}`);
  });

  return writeLog("l2-scaling-report.log", lines);
}

function runSecurityUpdatesScenario() {
  const lines: string[] = [];
  lines.push("# L2 Security Updates Scenario");
  lines.push(`ts=${new Date().toISOString()}`);

  const patch = recordSecurityUpdate(
    {
      version: "2026.03.06-1",
      severity: "high",
      summary: "L2 patch: dependency bump + policy refresh",
      appliedAt: new Date().toISOString(),
      references: ["local-l2"],
    },
    { adminId: "l2-admin" }
  );
  const rollback = recordSecurityUpdate(
    {
      version: "2026.03.06-rollback",
      severity: "medium",
      summary: "L2 rollback: revert patch 2026.03.06-1",
      appliedAt: new Date().toISOString(),
      metadata: { rollbackOf: patch.version },
    },
    { adminId: "l2-admin" }
  );

  const entries = listSecurityUpdates(5, join(LOG_DIR, "security.log"));
  lines.push(`recorded patch=${patch.version} rollback=${rollback.version}`);
  lines.push(`log_entries=${entries.length}`);
  entries.slice(-2).forEach((entry) => {
    lines.push(`entry version=${entry.version} severity=${entry.severity} summary=${entry.summary}`);
  });

  return writeLog("l2-security-updates.log", lines);
}

function runAppStorePipelineScenario() {
  const lines: string[] = [];
  lines.push("# L2 App Store Pipeline Scenario");
  lines.push(`ts=${new Date().toISOString()}`);

  const baseDir = join(process.cwd(), "dist", "app-store-l2");
  const ios = buildAppStoreArtifacts({
    platform: "ios",
    hostType: "capacitor",
    version: "1.0.0",
    buildNumber: 100,
    outputDir: baseDir,
    settings: { appName: "NULL L2", appId: "com.null.l2", serverUrl: "https://example.local" },
    notes: "L2 dry run",
    dryRun: true,
  });
  const android = buildAppStoreArtifacts({
    platform: "android",
    hostType: "react-native",
    version: "1.0.0",
    buildNumber: 101,
    outputDir: baseDir,
    settings: { appName: "NULL L2", appId: "com.null.l2", serverUrl: "https://example.local" },
    notes: "L2 dry run",
    dryRun: true,
  });

  const iosSize = statSync(ios.packagePath).size;
  const androidSize = statSync(android.packagePath).size;
  lines.push(`ios output=${ios.outputDir} package_bytes=${iosSize}`);
  lines.push(`android output=${android.outputDir} package_bytes=${androidSize}`);
  lines.push(`ios checklist=${ios.checklistPath}`);
  lines.push(`ios signing=${ios.signingGuidePath}`);
  lines.push(`android checklist=${android.checklistPath}`);
  lines.push(`android signing=${android.signingGuidePath}`);

  return writeLog("l2-app-store-pipeline.log", lines);
}

async function main() {
  const outputs: string[] = [];
  outputs.push(await runBackgroundJobsScenario());
  outputs.push(runCachePolicyScenario());
  outputs.push(runScalingScenario());
  outputs.push(runSecurityUpdatesScenario());
  outputs.push(runAppStorePipelineScenario());
  console.log("L2 scenario logs:");
  outputs.forEach((file) => console.log(`- ${file}`));
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
