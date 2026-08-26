import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    ok: true,
    phase: "scaffold",
    projects: [],
  });
}

export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      code: "NOT_IMPLEMENTED",
      message: "v2 project creation is not implemented yet. This route exists as a scaffold.",
    },
    { status: 501 },
  );
}

