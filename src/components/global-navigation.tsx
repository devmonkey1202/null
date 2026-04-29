"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = {
  href: string;
  label: string;
  active: boolean;
};

function shouldHideNavigation(pathname: string | null) {
  if (!pathname) return false;
  return (
    pathname.startsWith("/editor") ||
    pathname.startsWith("/p/") ||
    pathname.startsWith("/live/") ||
    pathname.startsWith("/replay/")
  );
}

function getOpsRoot(pathname: string) {
  const parts = pathname.split("/").filter(Boolean);
  return parts.length >= 2 ? `/${parts[0]}/${parts[1]}` : "/ops";
}

function buildItems(pathname: string | null): NavItem[] {
  const items: NavItem[] = [
    { href: "/", label: "홈", active: pathname === "/" },
    {
      href: "/library",
      label: "프로젝트",
      active: pathname === "/library" || pathname?.startsWith("/p/") === true,
    },
    {
      href: "/dashboard",
      label: "대시보드",
      active: pathname === "/dashboard" || pathname?.startsWith("/dashboard/") === true,
    },
    {
      href: "/plugins/store",
      label: "마켓",
      active: pathname?.startsWith("/plugins/store") === true || pathname?.startsWith("/widgets/store") === true,
    },
    {
      href: "/account",
      label: "내 계정",
      active: pathname === "/account" || pathname === "/upgrade" || pathname?.startsWith("/billing/") === true,
    },
    {
      href: "/settings",
      label: "설정",
      active: pathname === "/settings" || pathname === "/login" || pathname === "/signup",
    },
  ];

  if (pathname?.startsWith("/ops/")) {
    items.splice(3, 0, {
      href: getOpsRoot(pathname),
      label: "관리자",
      active: true,
    });
  }

  return items;
}

export default function GlobalNavigation() {
  const pathname = usePathname();
  if (shouldHideNavigation(pathname)) return null;

  const items = buildItems(pathname);

  return (
    <header className="sticky top-0 z-50 bg-white/45 px-3 py-3 backdrop-blur-[30px]">
      <div className="app-glass-shell mx-auto flex h-14 max-w-[1440px] items-center justify-between gap-4 rounded-full border border-white/80 bg-white/[0.58] px-4 ring-1 ring-black/[0.035] sm:px-5 lg:px-6">
        <div className="flex min-w-0 items-center gap-5">
          <Link href="/" className="shrink-0 text-[15px] font-semibold tracking-[0.01em] text-[#111111]">
            NULL
          </Link>
          <nav className="hidden flex-wrap items-center gap-1 md:flex" aria-label="주요 메뉴">
            {items.map((item) => (
              <Link
                key={`${item.href}:${item.label}`}
                href={item.href}
                className={`relative rounded-full px-3.5 py-2 text-[13px] font-medium transition duration-200 ${
                  item.active
                    ? "bg-black/[0.045] text-[#111111] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.055),inset_0_1px_0_rgba(255,255,255,0.9)] after:absolute after:left-1/2 after:top-[calc(100%+12px)] after:h-px after:w-5 after:-translate-x-1/2 after:bg-[#111111]"
                    : "text-[#50545c] hover:bg-black/[0.035] hover:text-[#111111]"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/editor/advanced"
            className="hidden rounded-full border border-[#111111] bg-[#111111] px-4 py-2 text-[13px] font-semibold text-white shadow-[0_12px_32px_rgba(17,17,17,0.18)] transition hover:bg-[#252525] sm:inline-flex"
          >
            새 프로젝트
          </Link>
          <Link
            href="/library"
            className="rounded-full border border-black/[0.08] bg-white/65 px-4 py-2 text-[13px] font-medium text-[#111111] shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_8px_24px_rgba(15,23,42,0.06)] transition hover:bg-white"
          >
            작업 보기
          </Link>
        </div>
      </div>

      <nav className="app-glass-shell mx-auto mt-2 flex max-w-[1440px] gap-1 overflow-x-auto rounded-full border border-white/80 bg-white/[0.62] px-2 py-2 md:hidden" aria-label="모바일 주요 메뉴">
        {items.map((item) => (
          <Link
            key={`mobile:${item.href}:${item.label}`}
            href={item.href}
            className={`whitespace-nowrap rounded-full px-3 py-2 text-[13px] font-medium transition ${
              item.active
                ? "bg-black/[0.055] text-[#111111] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.06)]"
                : "text-[#50545c] hover:bg-black/[0.035] hover:text-[#111111]"
            }`}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
