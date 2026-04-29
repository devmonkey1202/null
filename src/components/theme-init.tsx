"use client";

import { useEffect } from "react";

const STORAGE_KEY = "theme";

export default function ThemeInit() {
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "light" || stored === "dark") {
        document.documentElement.setAttribute("data-theme", stored);
        return;
      }
      const system = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
      document.documentElement.setAttribute("data-theme", system);
    } catch {
      // ignore storage access errors
    }
  }, []);

  return null;
}
