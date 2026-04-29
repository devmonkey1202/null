"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function BillingSuccessPage() {
  const [plan, setPlan] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/me", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.plan?.id) setPlan(data.plan.id);
      })
      .catch(() => null);
  }, []);

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f7f3eb_0%,#f4efe5_35%,#fbfaf8_100%)] text-[#161616]">
      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-12 sm:px-6">
        <section className="rounded-[28px] border border-black/8 bg-[#161616] px-6 py-8 text-white shadow-[0_24px_90px_rgba(0,0,0,0.14)]">
          <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-[#f4c46a]">Billing</div>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em]">구독이 완료되었습니다</h1>
          <p className="mt-3 text-sm leading-7 text-white/72">
            결제 흐름이 정상적으로 끝났습니다. 지금 바로 작업 화면으로 돌아가거나 플랜 화면에서 상태를 다시 확인할 수 있습니다.
          </p>
          <div className="mt-5 inline-flex rounded-full border border-white/12 bg-white/8 px-4 py-2 text-sm font-medium text-white/88">
            {plan ? `현재 플랜: ${plan.toUpperCase()}` : "플랜 정보를 확인하는 중"}
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-3">
          <Link
            href="/library"
            className="rounded-[24px] border border-black/8 bg-white px-5 py-5 shadow-[0_16px_40px_rgba(17,17,17,0.05)] transition hover:-translate-y-0.5 hover:shadow-[0_18px_44px_rgba(17,17,17,0.08)]"
          >
            <div className="text-sm font-semibold text-[#161616]">라이브러리로</div>
            <p className="mt-2 text-sm leading-6 text-[#6b665f]">프로젝트 목록과 초안, 히스토리를 다시 확인합니다.</p>
          </Link>
          <Link
            href="/upgrade"
            className="rounded-[24px] border border-black/8 bg-white px-5 py-5 shadow-[0_16px_40px_rgba(17,17,17,0.05)] transition hover:-translate-y-0.5 hover:shadow-[0_18px_44px_rgba(17,17,17,0.08)]"
          >
            <div className="text-sm font-semibold text-[#161616]">플랜 다시 보기</div>
            <p className="mt-2 text-sm leading-6 text-[#6b665f]">현재 적용된 플랜과 다른 옵션을 다시 비교합니다.</p>
          </Link>
          <Link
            href="/"
            className="rounded-[24px] border border-black/8 bg-white px-5 py-5 shadow-[0_16px_40px_rgba(17,17,17,0.05)] transition hover:-translate-y-0.5 hover:shadow-[0_18px_44px_rgba(17,17,17,0.08)]"
          >
            <div className="text-sm font-semibold text-[#161616]">홈으로</div>
            <p className="mt-2 text-sm leading-6 text-[#6b665f]">공개 화면과 시작 지점으로 돌아갑니다.</p>
          </Link>
        </section>
      </div>
    </div>
  );
}
