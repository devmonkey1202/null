import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as unknown;

  return NextResponse.json({
    ok: true,
    phase: "scaffold",
    mode: "plan",
    received: body,
    message: "AI planning scaffold route is live but does not call a model yet.",
  });
}

