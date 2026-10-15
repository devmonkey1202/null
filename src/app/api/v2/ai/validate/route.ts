import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as unknown;

  return NextResponse.json({
    ok: true,
    phase: "scaffold",
    mode: "validate",
    valid: false,
    received: body,
    issues: [
      {
        code: "SCHEMA_NOT_WIRED",
        severity: "warning",
        message: "Validation schema wiring is not implemented yet.",
      },
    ],
  });
}
