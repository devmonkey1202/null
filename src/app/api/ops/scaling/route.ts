import { NextResponse } from "next/server";
import { withErrorHandler } from "@/lib/api-handler";
import { requireAdminAccess } from "@/lib/admin-session";
import { recommendInstanceCount, resolveScalingConfig } from "@/lib/scaling";

export const GET = withErrorHandler(async (req: Request) => {
  const gate = await requireAdminAccess(req);
  if (!gate.ok) return NextResponse.json({ error: gate.code }, { status: 401 });

  const config = resolveScalingConfig();
  const url = new URL(req.url);
  const cpu = Number(url.searchParams.get("cpu"));
  const queueDepth = Number(url.searchParams.get("queueDepth"));
  const currentInstances = Number(url.searchParams.get("instances"));

  const hasMetrics =
    Number.isFinite(cpu) && Number.isFinite(queueDepth) && Number.isFinite(currentInstances);
  const recommendation = hasMetrics
    ? recommendInstanceCount(config, { cpuUtilization: cpu, queueDepth, currentInstances })
    : null;

  return NextResponse.json({ config, recommendation });
});
