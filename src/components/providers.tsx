"use client";

import { type ReactNode } from "react";
import ErrorBoundary from "@/components/error-boundary";
import ClientErrorTracker from "@/components/client-error-tracker";
import OfflineBanner from "@/components/offline-banner";
import ThemeInit from "@/components/theme-init";
import { ToastProvider } from "@/components/toast";

/** 공통 UX: 에러 바운더리 + 오프라인 메시지. */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <ClientErrorTracker />
        <ThemeInit />
        <OfflineBanner />
        {children}
      </ToastProvider>
    </ErrorBoundary>
  );
}
