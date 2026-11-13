import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    ok: true,
    area: "v2-control",
    phase: "scaffold",
    ts: new Date().toISOString(),
  });
}

