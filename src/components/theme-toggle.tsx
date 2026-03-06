"use client";

import { useEffect, useState } from "react";
import { readStorageKey, subscribeStorageKey, writeStorageKey } from "@/lib/synced-storage";

const STORAGE_KEY = "theme";
type Theme = "light" | "dark";

const parseTheme = (raw: string | null): Theme | null => (raw === "light" || raw === "dark" ? raw : null);

function getStoredTheme(): Theme | null {
  return readStorageKey(STORAGE_KEY, parseTheme, null);
}

function getSystemTheme(): Theme {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export default function ThemeToggle({ className = "" }: { className?: string }) {
  const [mounted, setMounted] = useState(false);
  const initialSystem = typeof window === "undefined" ? "light" : getSystemTheme();
  const storedTheme = typeof window === "undefined" ? null : getStoredTheme();
  const [theme, setTheme] = useState<Theme>(storedTheme ?? initialSystem);
  const [system, setSystem] = useState<Theme>(initialSystem);
  const [isSystem, setIsSystem] = useState(storedTheme == null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = getStoredTheme();
    const systemTheme = getSystemTheme();
    const next = stored ?? systemTheme;
    document.documentElement.setAttribute("data-theme", next);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (!getStoredTheme()) {
        const systemTheme = media.matches ? "dark" : "light";
        setSystem(systemTheme);
        setTheme(systemTheme);
        setIsSystem(true);
      } else {
        setSystem(media.matches ? "dark" : "light");
      }
    };

    if (media.addEventListener) {
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    }
    media.addListener(onChange);
    return () => media.removeListener(onChange);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    return subscribeStorageKey(STORAGE_KEY, parseTheme, (value) => {
      if (value) {
        document.documentElement.setAttribute("data-theme", value);
        setTheme(value);
        setIsSystem(false);
      } else {
        const sys = getSystemTheme();
        document.documentElement.setAttribute("data-theme", sys);
        setSystem(sys);
        setTheme(sys);
        setIsSystem(true);
      }
    });
  }, []);

  const effective = isSystem ? system : theme;
  const label = effective === "dark" ? "다크" : "라이트";

  const toggle = () => {
    const next: Theme = effective === "dark" ? "light" : "dark";
    writeStorageKey(STORAGE_KEY, next, (value) => value);
    document.documentElement.setAttribute("data-theme", next);
    setTheme(next);
    setIsSystem(false);
  };

  const title = `테마 전환 (현재: ${effective === "dark" ? "다크" : "라이트"}${isSystem ? ", 시스템" : ""})`;

  if (!mounted) {
    return (
      <button
        type="button"
        aria-pressed={false}
        title="테마 전환"
        className={`rounded-full border border-[#EAEAEA] bg-white px-3 py-1 text-[11px] font-medium text-[#666666] hover:bg-[#F0F0F0] ${className}`}
      >
        테마
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={effective === "dark"}
      title={title}
      className={`rounded-full border border-[#EAEAEA] bg-white px-3 py-1 text-[11px] font-medium text-[#666666] hover:bg-[#F0F0F0] ${className}`}
    >
      {label}
    </button>
  );
}
