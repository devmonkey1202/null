import { headers } from "next/headers";

function isLocalHostname(hostname: string) {
  const normalized = hostname.replace(/^\[|\]$/g, "").split(":")[0].toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
}

function extractHost(req: Request) {
  const forwardedHost = req.headers.get("x-forwarded-host");
  const hostHeader = req.headers.get("host");
  if (forwardedHost) return forwardedHost;
  if (hostHeader) return hostHeader;
  try {
    return new URL(req.url).host;
  } catch {
    return "";
  }
}

export function shouldUseSecureCookies(req: Request) {
  if (process.env.NODE_ENV !== "production") return false;
  const forwardedProto = req.headers.get("x-forwarded-proto");
  if (forwardedProto?.toLowerCase() === "https") return true;
  return !isLocalHostname(extractHost(req));
}

export async function shouldUseSecureCookiesFromHeaders() {
  if (process.env.NODE_ENV !== "production") return false;
  const requestHeaders = await headers();
  const forwardedProto = requestHeaders.get("x-forwarded-proto");
  if (forwardedProto?.toLowerCase() === "https") return true;
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "";
  return !isLocalHostname(host);
}
