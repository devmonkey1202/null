import { NextResponse } from "next/server";
import { logSecurityEvent } from "@/lib/security-log";
import { shouldUseSecureCookies } from "@/lib/cookie-security";

const COOKIE_NAME = "anon_user_id";

export async function POST(req: Request) {
  logSecurityEvent({ action: "user_logout", req });
  const response = NextResponse.json({ ok: true });
  response.cookies.set(COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: shouldUseSecureCookies(req),
    path: "/",
    maxAge: 0,
  });
  return response;
}
