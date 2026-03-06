import { NextResponse } from "next/server";
import { runConnectorSchedules } from "@/lib/connector-scheduler";

function checkCronSecret(req: Request) {
  const expected = process.env.CRON_SECRET ?? "";
  if (!expected) return false;
  const header = req.headers.get("x-cron-secret") ?? "";
  return header === expected;
}

export async function POST(req: Request) {
  if (!checkCronSecret(req)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  const results = await runConnectorSchedules(new Date());
  return NextResponse.json({ ok: true, results });
}
