import { NextResponse } from "next/server";
import { apiErrorJson } from "./api-error";
import { logError } from "./logger";
import { checkWaf } from "./waf";
import { withNoStore } from "./cache-policy";

/**
 * Wraps an API route handler with:
 * - try/catch around the entire handler (returns 500 on unhandled errors)
 * - Structured JSON logging for errors via logger
 */
export function withErrorHandler<T extends unknown[]>(
  handler: (...args: T) => Promise<Response>
) {
  return async (...args: T): Promise<Response> => {
    try {
      const req = args[0];
      if (req instanceof Request) {
        const decision = await checkWaf(req);
        if (!decision.allowed) {
          return apiErrorJson(decision.error, decision.status, {
            message: decision.message,
            detail: decision.detail,
          });
        }
      }
      const res = await handler(...args);
      if (!res.headers.get("Cache-Control")) {
        return withNoStore(res);
      }
      return res;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : undefined;
      const req = args[0];
      const path = req instanceof Request ? (() => { try { return new URL(req.url).pathname; } catch { return req.url; } })() : "unknown";
      logError("unhandled API error", { path, error: message, stack });
      return apiErrorJson("internal_error", 500, message);
    }
  };
}

/**
 * Safely parse request JSON body.
 * Returns `null` if the body is missing or invalid JSON (instead of silently returning {}).
 */
export async function safeParseBody(req: Request): Promise<unknown | null> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}
