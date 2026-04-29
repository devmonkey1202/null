"use client";

import Link from "next/link";

export default function BillingCancelPage() {
  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f7f3eb_0%,#f4efe5_35%,#fbfaf8_100%)] text-[#161616]">
      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-12 sm:px-6">
        <section className="rounded-[28px] border border-black/8 bg-[#161616] px-6 py-8 text-white shadow-[0_24px_90px_rgba(0,0,0,0.14)]">
          <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-[#f4c46a]">Billing</div>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em]">결제가 취소되었습니다</h1>
          <p className="mt-3 text-sm leading-7 text-white/72">
            결제를 중단했거나 진행 중 오류가 있었습니다. 다시 시도하거나 플랜 화면으로 돌아가 다른 옵션을 확인할 수 있습니다.
          </p>
        </section>

        <section className="grid gap-4 sm:grid-cols-3">
          <Link
            href="/upgrade"
            className="rounded-[24px] border border-black/8 bg-white px-5 py-5 shadow-[0_16px_40px_rgba(17,17,17,0.05)] transition hover:-translate-y-0.5 hover:shadow-[0_18px_44px_rgba(17,17,17,0.08)]"
          >
            <div className="text-sm font-semibold text-[#161616]">플랜 선택으로 돌아가기</div>
            <p className="mt-2 text-sm leading-6 text-[#6b665f]">업그레이드 옵션을 다시 비교하고 결제를 다시 시작합니다.</p>
          </Link>
          <Link
            href="/upgrade"
            className="rounded-[24px] border border-black/8 bg-white px-5 py-5 shadow-[0_16px_40px_rgba(17,17,17,0.05)] transition hover:-translate-y-0.5 hover:shadow-[0_18px_44px_rgba(17,17,17,0.08)]"
          >
            <div className="text-sm font-semibold text-[#161616]">다시 시도</div>
            <p className="mt-2 text-sm leading-6 text-[#6b665f]">같은 플랜 또는 다른 플랜으로 결제를 다시 진행합니다.</p>
          </Link>
          <Link
            href="/"
            className="rounded-[24px] border border-black/8 bg-white px-5 py-5 shadow-[0_16px_40px_rgba(17,17,17,0.05)] transition hover:-translate-y-0.5 hover:shadow-[0_18px_44px_rgba(17,17,17,0.08)]"
          >
            <div className="text-sm font-semibold text-[#161616]">홈으로</div>
            <p className="mt-2 text-sm leading-6 text-[#6b665f]">일단 홈이나 라이브러리로 돌아가 현재 작업을 이어갑니다.</p>
          </Link>
        </section>
      </div>
    </div>
  );
}
