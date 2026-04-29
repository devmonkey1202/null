"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import ThemeToggle from "@/components/theme-toggle";

export default function ConditionalFooter() {
  const pathname = usePathname();
  if (pathname?.startsWith("/editor")) return null;

  return (
    <footer className="border-t border-black/[0.06] bg-white py-5 text-center text-xs text-[#666666]">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-2 px-4">
        <Link href="/library" className="hover:text-[#111111]" aria-label="프로젝트">
          프로젝트
        </Link>
        <span className="mx-2" aria-hidden>
          {"\u00B7"}
        </span>
        <Link href="/dashboard" className="hover:text-[#111111]" aria-label="대시보드">
          대시보드
        </Link>
        <span className="mx-2" aria-hidden>
          {"\u00B7"}
        </span>
        <Link href="/account" className="hover:text-[#111111]" aria-label="내 계정">
          내 계정
        </Link>
        <span className="mx-2" aria-hidden>
          {"\u00B7"}
        </span>
        <Link href="/settings" className="hover:text-[#111111]" aria-label="설정">
          설정
        </Link>
        <span className="mx-2" aria-hidden>
          {"\u00B7"}
        </span>
        <Link href="/terms" className="hover:text-[#111111]" aria-label="이용약관">
          이용약관
        </Link>
        <span className="mx-2" aria-hidden>
          {"\u00B7"}
        </span>
        <Link href="/privacy" className="hover:text-[#111111]" aria-label="개인정보처리방침">
          개인정보처리방침
        </Link>
        <span className="mx-2" aria-hidden>
          {"\u00B7"}
        </span>
        <a href="mailto:support@null.local" className="hover:text-[#111111]" aria-label="문의">
          문의
        </a>
        <span className="mx-2" aria-hidden>
          {"\u00B7"}
        </span>
        <ThemeToggle />
      </div>
    </footer>
  );
}
