type ClientErrorPayload = {
  message: string;
  stack?: string | null;
  name?: string | null;
  component_stack?: string | null;
  source?: string | null;
  url?: string | null;
  user_agent?: string | null;
};

function sendPayload(payload: ClientErrorPayload) {
  try {
    const body = JSON.stringify(payload);
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const blob = new Blob([body], { type: "application/json" });
      navigator.sendBeacon("/api/client-errors", blob);
      return;
    }
    fetch("/api/client-errors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    // swallow
  }
}

export function reportClientError(input: {
  error: Error;
  componentStack?: string;
  source?: string;
}) {
  if (typeof window === "undefined") return;
  sendPayload({
    message: input.error.message || "client_error",
    stack: input.error.stack ?? null,
    name: input.error.name ?? null,
    component_stack: input.componentStack ?? null,
    source: input.source ?? null,
    url: window.location?.href ?? null,
    user_agent: navigator?.userAgent ?? null,
  });
}

export function reportUnhandledRejection(reason: unknown) {
  if (typeof window === "undefined") return;
  const error = reason instanceof Error ? reason : new Error(String(reason));
  sendPayload({
    message: error.message || "unhandledrejection",
    stack: error.stack ?? null,
    name: error.name ?? null,
    source: "unhandledrejection",
    url: window.location?.href ?? null,
    user_agent: navigator?.userAgent ?? null,
  });
}

export function reportWindowError(message: string, source?: string, lineno?: number, colno?: number) {
  if (typeof window === "undefined") return;
  sendPayload({
    message: message || "window_error",
    source: source ?? null,
    url: window.location?.href ?? null,
    user_agent: navigator?.userAgent ?? null,
    component_stack:
      typeof lineno === "number" || typeof colno === "number"
        ? `${lineno ?? 0}:${colno ?? 0}`
        : null,
  });
}
