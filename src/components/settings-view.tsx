"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import ThemeToggle from "@/components/theme-toggle";

export default function SettingsView() {
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = useCallback(() => {
    setLoggingOut(true);
    fetch("/api/auth/logout", { method: "POST", credentials: "include" })
      .then(() => {
        if (typeof localStorage !== "undefined") {
          localStorage.removeItem("anon_user_id");
        }
        window.location.href = "/";
      })
      .finally(() => setLoggingOut(false));
  }, []);

  return (
    <div className="min-h-screen bg-white text-[#151515]">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-[14px] border border-black/[0.08] bg-white/90 p-5 shadow-[0_18px_48px_rgba(15,23,42,0.04)] backdrop-blur-xl sm:p-6">
            <div className="text-[12px] font-semibold uppercase tracking-[0.24em] text-[#8a7550]">Settings</div>
            <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-[#111111] sm:text-[40px]">설정</h1>
            <p className="sr-only">
              계정 이동, 플랜과 결제 확인, 도움말, 법률 문서와 같은 실제 설정 흐름만 남겼습니다. 지금 이
              화면의 목적은 옵션을 늘리는 것이 아니라 필요한 곳으로 빠르게 연결하는 것입니다.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/account"
                className="rounded-full bg-[#111111] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#2a2a2a]"
              >
                내 계정 열기
              </Link>
              <Link
                href="/upgrade"
                className="rounded-full border border-black/10 bg-[#f7f4ed] px-5 py-3 text-sm font-medium text-[#111111] transition hover:bg-[#ede7da]"
              >
                플랜과 결제 보기
              </Link>
              <button
                type="button"
                onClick={handleLogout}
                disabled={loggingOut}
                className="rounded-full border border-black/10 bg-white px-5 py-3 text-sm font-medium text-[#111111] transition hover:bg-[#f6f3ec] disabled:opacity-60"
              >
                {loggingOut ? "로그아웃 중" : "로그아웃"}
              </button>
            </div>
          </div>

          <aside className="rounded-[14px] border border-black/[0.08] bg-white/75 p-5 shadow-[0_18px_48px_rgba(15,23,42,0.035)] backdrop-blur-xl sm:p-6">
            <div className="text-[12px] font-semibold uppercase tracking-[0.24em] text-[#8a7550]">Quick Access</div>
            <div className="mt-5 grid gap-2">
              <Link href="/account" className="flex items-center justify-between rounded-[18px] border border-black/8 bg-white/70 px-4 py-3 text-sm font-semibold text-[#111111] transition hover:bg-black/[0.035]">
                <span>계정</span>
                <span className="text-xs font-medium text-[#525866]">상태</span>
              </Link>
              <Link href="/upgrade" className="flex items-center justify-between rounded-[18px] border border-black/8 bg-white/70 px-4 py-3 text-sm font-semibold text-[#111111] transition hover:bg-black/[0.035]">
                <span>플랜</span>
                <span className="text-xs font-medium text-[#525866]">결제</span>
              </Link>
              <Link href="/plugins/store" className="flex items-center justify-between rounded-[18px] border border-black/8 bg-white/70 px-4 py-3 text-sm font-semibold text-[#111111] transition hover:bg-black/[0.035]">
                <span>플러그인</span>
                <span className="text-xs font-medium text-[#525866]">마켓</span>
              </Link>
              <Link href="/widgets/store" className="flex items-center justify-between rounded-[18px] border border-black/8 bg-white/70 px-4 py-3 text-sm font-semibold text-[#111111] transition hover:bg-black/[0.035]">
                <span>위젯</span>
                <span className="text-xs font-medium text-[#525866]">마켓</span>
              </Link>
              <Link href="/terms" className="flex items-center justify-between rounded-[18px] border border-black/8 bg-white/70 px-4 py-3 text-sm font-semibold text-[#111111] transition hover:bg-black/[0.035]">
                <span>문서</span>
                <span className="text-xs font-medium text-[#525866]">정책</span>
              </Link>
            </div>
          </aside>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <AppearanceCard />
          <SettingsCard
            label="계정"
            title="프로필과 로그인 상태"
            description="현재 계정 상태, 익명 세션 연결, 사용 가능 기능을 봅니다."
            href="/account"
            action="내 계정 보기"
          />
          <SettingsCard
            label="플랜"
            title="업그레이드와 결제"
            description="현재 플랜, 제한, 업그레이드 옵션과 결제 흐름으로 이동합니다."
            href="/upgrade"
            action="플랜 보기"
          />
          <SettingsCard
            label="작업"
            title="프로젝트 운영"
            description="대시보드와 라이브러리로 이동해 공개 흐름과 상태를 관리합니다."
            href="/dashboard"
            action="대시보드 열기"
          />
          <SettingsCard
            label="마켓"
            title="플러그인과 위젯"
            description="에디터 확장과 삽입형 위젯 카탈로그를 확인합니다."
            href="/plugins/store"
            action="마켓 열기"
          />
          <SettingsCard
            label="지원"
            title="문서와 문의"
            description="이용약관, 개인정보처리방침, 문의 메일로 바로 이동합니다."
            href="/terms"
            action="문서 보기"
          />
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <article className="rounded-[28px] border border-black/8 bg-white p-6 shadow-[0_18px_60px_rgba(17,17,17,0.05)]">
            <div className="text-[12px] font-semibold uppercase tracking-[0.24em] text-[#8a7550]">Support</div>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[#111111]">도움이 필요할 때</h2>
            <div className="mt-5 grid gap-3">
              <SupportLink
                href="/dashboard"
                title="프로젝트 운영"
                description="프로젝트 상태와 공개 흐름을 다시 확인합니다."
              />
              <SupportLink
                href="/library"
                title="라이브러리"
                description="초안, 라이브, 보관 프로젝트를 정리합니다."
              />
              <a
                href="mailto:support@null.local"
                className="rounded-[22px] border border-black/8 bg-[#fbfaf7] px-4 py-4 transition hover:border-black/12 hover:bg-[#f5efdf]"
              >
                <div className="text-sm font-semibold text-[#111111]">문의 메일</div>
                <p className="sr-only">직접 지원 요청을 보낼 수 있는 기본 경로입니다.</p>
              </a>
            </div>
          </article>

          <article className="rounded-[28px] border border-black/8 bg-white p-6 shadow-[0_18px_60px_rgba(17,17,17,0.05)]">
            <div className="text-[12px] font-semibold uppercase tracking-[0.24em] text-[#8a7550]">Legal</div>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[#111111]">문서와 정책</h2>
            <div className="mt-5 grid gap-3">
              <SupportLink
                href="/terms"
                title="이용약관"
                description="서비스 이용 조건과 기본 정책을 확인합니다."
              />
              <SupportLink
                href="/privacy"
                title="개인정보처리방침"
                description="수집과 처리 방식, 보관 기준을 확인합니다."
              />
              <SupportLink href="/" title="홈으로" description="공개 피드와 시작 화면으로 돌아갑니다." />
            </div>
          </article>
        </section>
      </div>
    </div>
  );
}

function SettingsCard({
  label,
  title,
  description,
  href,
  action,
}: {
  label: string;
  title: string;
  description: string;
  href: string;
  action: string;
}) {
  return (
    <article className="rounded-[24px] border border-black/8 bg-white px-5 py-5 shadow-[0_14px_44px_rgba(17,17,17,0.05)]">
      <div className="text-[12px] font-semibold uppercase tracking-[0.22em] text-[#8a7550]">{label}</div>
      <h2 className="mt-3 text-xl font-semibold tracking-[-0.03em] text-[#111111]">{title}</h2>
      <p className="mt-2 min-h-10 text-sm leading-5 text-[#635e56]">{description}</p>
      <Link
        href={href}
        className="mt-5 inline-flex rounded-full border border-black/10 bg-[#f7f4ed] px-4 py-2 text-sm font-semibold text-[#111111] transition hover:bg-[#ede7da]"
      >
        {action}
      </Link>
    </article>
  );
}

function AppearanceCard() {
  return (
    <article className="rounded-[24px] border border-black/8 bg-white px-5 py-5 shadow-[0_14px_44px_rgba(17,17,17,0.05)]">
      <div className="text-[12px] font-semibold uppercase tracking-[0.22em] text-[#8a7550]">화면</div>
      <h2 className="mt-3 text-xl font-semibold tracking-[-0.03em] text-[#111111]">라이트 / 다크 모드</h2>
      <p className="mt-2 min-h-10 text-sm leading-5 text-[#635e56]">전체 서비스와 에디터 화면의 표시 모드를 전환합니다.</p>
      <div className="mt-5">
        <ThemeToggle />
      </div>
    </article>
  );
}

function SupportLink({
  href,
  title,
  description,
}: {
  href: string;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-[22px] border border-black/8 bg-[#fbfaf7] px-4 py-4 transition hover:border-black/12 hover:bg-[#f5efdf]"
    >
      <div className="text-sm font-semibold text-[#111111]">{title}</div>
      <p className="mt-1 text-sm leading-5 text-[#635e56]">{description}</p>
    </Link>
  );
}
