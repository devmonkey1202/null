"use client";

import { useEffect } from "react";
import { reportUnhandledRejection, reportWindowError } from "@/lib/client-errors";

export default function ClientErrorTracker() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      reportWindowError(
        event.message || "window_error",
        event.filename,
        event.lineno,
        event.colno
      );
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      reportUnhandledRejection(event.reason);
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}
