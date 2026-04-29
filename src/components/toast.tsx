"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

type ToastItem = { id: number; message: string; kind: "ok" | "err" };

const ToastContext = createContext<{
  show: (message: string, kind?: "ok" | "err") => void;
} | null>(null);

const AUTO_CLOSE_MS = 2500;

const DEDUPE_MS = 1500;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const lastShownRef = useRef<{ message: string; at: number }>({ message: "", at: 0 });

  const show = useCallback((message: string, kind: "ok" | "err" = "ok") => {
    const now = Date.now();
    const last = lastShownRef.current;
    if (last.message === message && now - last.at < DEDUPE_MS) return;
    lastShownRef.current = { message, at: now };

    const id = now;
    setItems((prev) => [...prev, { id, message, kind }]);
    setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id));
    }, AUTO_CLOSE_MS);
  }, []);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div
        className="fixed left-1/2 top-6 z-[100] flex -translate-x-1/2 flex-col gap-2"
        role="region"
        aria-label="알림"
      >
        {items.map((t) => (
          <div
            key={t.id}
            className={`rounded-[14px] border px-4 py-3 text-sm font-medium shadow-lg ${
              t.kind === "ok"
                ? "border-[#EAEAEA] bg-white text-[#111111]"
                : "border-rose-200 bg-rose-50 text-rose-800"
            }`}
            role="status"
            aria-live="polite"
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) return { show: () => {} };
  return ctx;
}
