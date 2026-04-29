"use client";

import { useEffect, useState } from "react";

type PlanInfo = {
  id: string;
  name: string;
  price: string;
  summary: string;
  features: string[];
};

const plans: PlanInfo[] = [
  {
    id: "standard",
    name: "스탠다드",
    price: "월 19,900원",
    summary: "작은 팀이나 개인 운영에 맞는 기본형 구성입니다.",
    features: ["동시 공개 2개", "리플레이 24시간", "기본 분석", "기본 운영 알림"],
  },
  {
    id: "pro",
    name: "프로",
    price: "월 39,000원",
    summary: "검증, 운영, 분석을 더 자주 돌리는 프로젝트용입니다.",
    features: ["동시 공개 4개", "리플레이 24시간", "확장 분석", "운영용 기능 확장"],
  },
  {
    id: "enterprise",
    name: "엔터프라이즈",
    price: "문의",
    summary: "전용 운영과 맞춤 구성이 필요한 팀을 위한 플랜입니다.",
    features: ["대규모 계정", "전용 기능", "맞춤 리포트", "운영 지원 협의"],
  },
];

export default function UpgradeView() {
  const [currentPlan, setCurrentPlan] = useState("free");
  const [message, setMessage] = useState<string | null>(null);
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/me", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.plan?.id) setCurrentPlan(data.plan.id);
      })
      .catch(() => null);
  }, []);

  async function upgrade(targetPlan: string) {
    setLoadingPlan(targetPlan);
    setMessage(null);
    try {
      const res = await fetch("/api/billing/upgrade", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetPlan }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok) {
        if (data?.redirectUrl) {
          window.location.assign(data.redirectUrl);
          return;
        }
        setMessage("플랜이 변경되었습니다.");
        setCurrentPlan(data?.plan ?? targetPlan);
        return;
      }
      setMessage(data?.message ?? data?.error ?? "업그레이드에 실패했습니다.");
    } finally {
      setLoadingPlan(null);
    }
  }

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f7f3eb_0%,#f4efe5_35%,#fbfaf8_100%)] text-[#161616]">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
        <header className="rounded-[28px] border border-black/8 bg-[#161616] px-6 py-6 text-white shadow-[0_24px_90px_rgba(0,0,0,0.14)]">
          <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-[#f4c46a]">Plans</div>
          <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <h1 className="text-3xl font-semibold tracking-[-0.04em]">플랜 업그레이드</h1>
              <p className="mt-3 text-sm leading-7 text-white/72">
                현재 플랜과 다음 단계에서 열리는 기능을 한 번에 비교합니다. 결제 연결이 있으면 외부 결제 화면으로, 모의
                모드면 즉시 반영됩니다.
              </p>
            </div>
            <div className="rounded-full border border-white/12 bg-white/8 px-4 py-2 text-sm font-medium text-white/88">
              현재 플랜: {currentPlan.toUpperCase()}
            </div>
          </div>
        </header>

        {message ? (
          <div className="rounded-[22px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {message}
          </div>
        ) : null}

        <section className="grid gap-4 lg:grid-cols-3">
          {plans.map((plan) => {
            const active = plan.id === currentPlan;
            const busy = loadingPlan === plan.id;
            return (
              <article
                key={plan.id}
                className={`rounded-[28px] border p-6 shadow-[0_20px_70px_rgba(17,17,17,0.05)] ${
                  active ? "border-[#161616] bg-[#161616] text-white" : "border-black/8 bg-white text-[#161616]"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className={`text-[11px] font-semibold uppercase tracking-[0.24em] ${active ? "text-[#f4c46a]" : "text-[#8f7b5a]"}`}>
                      {plan.id}
                    </div>
                    <h2 className="mt-3 text-2xl font-semibold tracking-[-0.04em]">{plan.name}</h2>
                  </div>
                  {active ? (
                    <span className="rounded-full bg-white/12 px-3 py-1 text-[11px] font-semibold text-white">현재 사용 중</span>
                  ) : null}
                </div>

                <div className={`mt-4 text-sm ${active ? "text-white/88" : "text-[#5c5851]"}`}>{plan.summary}</div>
                <div className={`mt-5 text-3xl font-semibold tracking-[-0.04em] ${active ? "text-white" : "text-[#161616]"}`}>
                  {plan.price}
                </div>

                <ul className={`mt-5 space-y-3 text-sm leading-6 ${active ? "text-white/78" : "text-[#5c5851]"}`}>
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2">
                      <span className={`mt-2 h-1.5 w-1.5 rounded-full ${active ? "bg-[#f4c46a]" : "bg-[#8f7b5a]"}`} />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                <button
                  type="button"
                  onClick={() => upgrade(plan.id)}
                  disabled={active || Boolean(loadingPlan)}
                  className={`mt-6 w-full rounded-full px-4 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                    active
                      ? "bg-white/12 text-white"
                      : "bg-[#161616] text-white hover:bg-black"
                  }`}
                >
                  {active ? "현재 사용 중" : busy ? "처리 중" : "이 플랜 선택"}
                </button>
              </article>
            );
          })}
        </section>

        <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <article className="rounded-[28px] border border-black/8 bg-white p-6 shadow-[0_20px_70px_rgba(17,17,17,0.05)]">
            <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#8f7b5a]">Decision Notes</div>
            <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-[#161616]">업그레이드 전에 보는 기준</h2>
            <ul className="mt-5 space-y-3 text-sm leading-6 text-[#5c5851]">
              <li>현재 운영에서 동시 공개 수가 부족한지 먼저 확인합니다.</li>
              <li>리플레이, 분석, 운영 기능이 실제로 필요한 프로젝트인지 판단합니다.</li>
              <li>결제 화면으로 넘어간 뒤에는 적용 시점과 후속 이동 화면을 함께 확인합니다.</li>
            </ul>
          </article>

          <article className="rounded-[28px] border border-black/8 bg-white p-6 shadow-[0_20px_70px_rgba(17,17,17,0.05)]">
            <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#8f7b5a]">Billing Notes</div>
            <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-[#161616]">결제 흐름</h2>
            <p className="mt-4 text-sm leading-6 text-[#5c5851]">
              외부 결제 연결이 있는 환경에서는 결제 페이지로 이동하고, 모의 모드에서는 바로 플랜 상태가 반영됩니다.
              결제 성공과 취소 화면도 함께 정리되어 있어 후속 이동이 끊기지 않습니다.
            </p>
          </article>
        </section>
      </div>
    </div>
  );
}
