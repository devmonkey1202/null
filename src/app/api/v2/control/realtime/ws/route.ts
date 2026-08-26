import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    {
      ok: false,
      code: "WEBSOCKET_NOT_WIRED",
      message: "The v2 realtime WebSocket endpoint exists as a namespace scaffold only.",
    },
    { status: 501 },
  );
}

