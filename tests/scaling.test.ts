import { describe, it, expect } from "vitest";
import { recommendInstanceCount, resolveScalingConfig } from "@/lib/scaling";

describe("scaling config", () => {
  it("clamps config values within limits", () => {
    const cfg = resolveScalingConfig({
      minInstances: 0,
      maxInstances: 5000,
      targetCpuUtilization: 2,
      maxQueueDepth: 5,
      workerConcurrency: 0,
    });
    expect(cfg.minInstances).toBe(1);
    expect(cfg.maxInstances).toBeGreaterThanOrEqual(cfg.minInstances);
    expect(cfg.targetCpuUtilization).toBeLessThanOrEqual(0.95);
    expect(cfg.maxQueueDepth).toBeGreaterThanOrEqual(10);
    expect(cfg.workerConcurrency).toBeGreaterThanOrEqual(1);
  });

  it("recommends scaling up under cpu pressure", () => {
    const cfg = resolveScalingConfig({ minInstances: 2, maxInstances: 6, targetCpuUtilization: 0.5 });
    const rec = recommendInstanceCount(cfg, { currentInstances: 2, cpuUtilization: 0.9, queueDepth: 0 });
    expect(rec.desired).toBeGreaterThan(2);
    expect(rec.reason).toBe("cpu_pressure");
  });

  it("recommends scaling up under queue pressure", () => {
    const cfg = resolveScalingConfig({ minInstances: 1, maxInstances: 8, maxQueueDepth: 100 });
    const rec = recommendInstanceCount(cfg, { currentInstances: 2, cpuUtilization: 0.2, queueDepth: 200 });
    expect(rec.desired).toBeGreaterThan(2);
    expect(rec.reason).toBe("queue_pressure");
  });
});
