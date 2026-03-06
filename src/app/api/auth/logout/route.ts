import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { logSecurityEvent } from "@/lib/security-log";

const COOKIE_NAME = "anon_user_id";

export async function POST(req: Request) {
  logSecurityEvent({ action: "user_logout", req });
  const response = NextResponse.json({ ok: true });
  response.cookies.set(COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return response;
}
