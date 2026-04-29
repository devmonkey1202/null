import { Suspense } from "react";

import SignupPageClient from "./signup-page-client";

function SignupFallback() {
  return (
    <div className="min-h-screen bg-[#FFFFFF]">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 py-12">
        <header className="mb-8 text-center">
          <div className="text-2xl font-semibold text-[#111111]">NULL</div>
          <p className="mt-2 text-sm text-[#666666]">
            회원가입 화면을 준비하고 있습니다. 잠시만 기다려 주세요.
          </p>
        </header>

        <section className="rounded-[14px] border border-[#EAEAEA] bg-white p-6 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
          <div className="h-4 w-24 rounded bg-[#F3F4F6]" />
          <div className="mt-5 space-y-4">
            <div className="space-y-2">
              <div className="h-3 w-16 rounded bg-[#F3F4F6]" />
              <div className="h-12 rounded-[14px] bg-[#F8FAFC]" />
            </div>
            <div className="space-y-2">
              <div className="h-3 w-28 rounded bg-[#F3F4F6]" />
              <div className="h-12 rounded-[14px] bg-[#F8FAFC]" />
            </div>
            <div className="space-y-2">
              <div className="h-3 w-24 rounded bg-[#F3F4F6]" />
              <div className="h-12 rounded-[14px] bg-[#F8FAFC]" />
            </div>
            <div className="h-12 rounded-[14px] bg-[#111111]" />
          </div>
        </section>
      </div>
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={<SignupFallback />}>
      <SignupPageClient />
    </Suspense>
  );
}
