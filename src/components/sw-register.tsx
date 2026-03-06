"use client";

import { useEffect } from "react";

export default function SwRegister() {
  useEffect(() => {
    const allowInDev = process.env.NEXT_PUBLIC_E2E === "1";
    if (process.env.NODE_ENV === "development" && !allowInDev) return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => null);
  }, []);
  return null;
}
