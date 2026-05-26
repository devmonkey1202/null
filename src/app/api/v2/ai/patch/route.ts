import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as unknown;

  return NextResponse.json({
    ok: true,
    phase: "scaffold",
    mode: "patch",
    received: body,
    requiresApproval: true,
    message: "AI patch scaffold route is live but does not generate structural patches yet.",
  });
}

