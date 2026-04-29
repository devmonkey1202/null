import { NextResponse } from "next/server";
import { requireAdminAccess } from "@/lib/admin-session";
import { listQueueTelemetry } from "@/lib/background-jobs";

export async function GET(req: Request) {
  const gate = await requireAdminAccess(req);
  if (!gate.ok) {
    return NextResponse.json({ ok: false, error: gate.code }, { status: 401 });
  }

  const telemetry = await listQueueTelemetry();
  return NextResponse.json({ ok: true, telemetry });
}
