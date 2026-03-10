"use client";

import { usePathname } from "next/navigation";
import ThemeToggle from "@/components/theme-toggle";

/** 배포 URL(/p/...)에서는 하단 푸터를 숨기고 편집 화면에서만 보여줍니다. */
export default function ConditionalFooter() {
  const pathname = usePathname();
  if (pathname?.startsWith("/p/")) return null;
  return (
    <footer className="border-t border-[#EAEAEA] bg-white py-4 text-center text-xs text-[#666666]">
      <div className="flex flex-wrap items-center justify-center gap-2">
        <a href="/account" className="hover:underline" aria-label="계정">
          계정
        </a>
        <span className="mx-2" aria-hidden>{"\u00B7"}</span>
        <a href="/settings" className="hover:underline" aria-label="설정">
          설정
        </a>
        <span className="mx-2" aria-hidden>{"\u00B7"}</span>
        <a href="/terms" className="hover:underline" aria-label="이용약관">
          이용약관
        </a>
        <span className="mx-2" aria-hidden>{"\u00B7"}</span>
        <a href="/privacy" className="hover:underline" aria-label="개인정보처리방침">
          개인정보처리방침
        </a>
        <span className="mx-2" aria-hidden>{"\u00B7"}</span>
        <a href="mailto:?subject=NULL%20문의" className="hover:underline" aria-label="문의">
          문의
        </a>
        <span className="mx-2" aria-hidden>{"\u00B7"}</span>
        <ThemeToggle />
      </div>
    </footer>
  );
}
