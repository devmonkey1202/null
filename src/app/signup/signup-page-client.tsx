"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function getSafeNext(raw: string | null) {
  if (!raw) return "/";
  if (!raw.startsWith("/")) return "/";
  if (raw.startsWith("//")) return "/";
  return raw;
}

export default function SignupPageClient() {
  const searchParams = useSearchParams();
  const next = getSafeNext(searchParams.get("next"));

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);
  const [termsAgreed, setTermsAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim()) {
      setError("이메일을 입력해 주세요.");
      return;
    }
    if (!password) {
      setError("비밀번호를 입력해 주세요.");
      return;
    }
    if (!passwordConfirm) {
      setError("비밀번호 확인을 입력해 주세요.");
      return;
    }
    if (!termsAgreed) {
      setError("이용약관 및 개인정보처리방침에 동의해 주세요.");
      return;
    }
    if (password !== passwordConfirm) {
      setError("비밀번호가 일치하지 않습니다.");
      return;
    }
    if (password.length < 8) {
      setError("비밀번호는 8자 이상이어야 합니다.");
      return;
    }
    setLoading(true);
    try {
      const anonId = typeof localStorage !== "undefined" ? localStorage.getItem("anon_user_id") : null;
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(anonId ? { "x-anon-user-id": anonId } : {}),
        },
        body: JSON.stringify({
          email: normalizeEmail(email),
          password,
          passwordConfirm,
        }),
        credentials: "include",
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        const msg =
          payload?.error === "email_in_use"
            ? "이미 사용 중인 이메일입니다."
            : payload?.error === "password_too_short"
                ? "비밀번호는 8자 이상이며 대/소문자, 숫자, 특수문자를 포함해야 합니다."
              : payload?.error === "password_mismatch"
                ? "비밀번호가 일치하지 않습니다."
                : res.status === 429
                  ? payload?.message ?? "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요."
                  : res.status >= 500
                    ? "일시적인 오류입니다. 잠시 후 다시 시도해 주세요."
                    : "회원가입에 실패했습니다.";
        setError(msg);
        return;
      }
      if (payload?.anonUserId && typeof localStorage !== "undefined") {
        localStorage.setItem("anon_user_id", payload.anonUserId);
      }
      window.location.href = next;
    } catch {
      setError("회원가입에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FFFFFF]">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 py-12">
        <header className="mb-8 text-center">
          <Link href="/" className="text-2xl font-semibold text-[#111111]">
            NULL
          </Link>
          <p className="mt-2 text-sm text-[#666666]">계정을 만들고 작품을 공개하세요.</p>
        </header>

        <section className="rounded-[14px] border border-[#EAEAEA] bg-white p-6 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
          <h2 className="mb-4 text-sm font-semibold text-[#111111]">회원가입</h2>
          <form
            onSubmit={handleSubmit}
            onKeyDown={(e) => e.key === "Escape" && setError(null)}
            className="flex flex-col gap-4"
          >
            {error ? (
              <div
                className="rounded-[14px] border border-[#EAEAEA] bg-rose-50 px-4 py-3 text-sm text-rose-700"
                role="alert"
                aria-live="polite"
              >
                {error}
              </div>
            ) : null}
            <div>
              <label htmlFor="signup-email" className="mb-1 block text-xs font-medium text-[#666666]">
                이메일
              </label>
              <input
                id="signup-email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                maxLength={255}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-[14px] border border-[#EAEAEA] bg-white px-4 py-3 text-sm text-[#111111]"
                required
              />
            </div>
            <div>
              <label htmlFor="signup-password" className="mb-1 block text-xs font-medium text-[#666666]">
                비밀번호 (8자 이상)
              </label>
              <div className="relative">
                <input
                  id="signup-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="********"
                  maxLength={128}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-[14px] border border-[#EAEAEA] bg-white px-4 py-3 pr-10 text-sm text-[#111111]"
                  required
                  minLength={8}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-[11px] text-[#666666] hover:bg-[#EAEAEA]"
                  aria-label={showPassword ? "비밀번호 숨기기" : "비밀번호 보기"}
                >
                  {showPassword ? "숨기기" : "보기"}
                </button>
              </div>
            </div>
            <div>
              <label htmlFor="signup-password-confirm" className="mb-1 block text-xs font-medium text-[#666666]">
                비밀번호 확인
              </label>
              <div className="relative">
                <input
                  id="signup-password-confirm"
                  type={showPasswordConfirm ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="********"
                  maxLength={128}
                  value={passwordConfirm}
                  onChange={(e) => setPasswordConfirm(e.target.value)}
                  className="w-full rounded-[14px] border border-[#EAEAEA] bg-white px-4 py-3 pr-10 text-sm text-[#111111]"
                  required
                  minLength={8}
                />
                <button
                  type="button"
                  onClick={() => setShowPasswordConfirm((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-[11px] text-[#666666] hover:bg-[#EAEAEA]"
                  aria-label={showPasswordConfirm ? "비밀번호 숨기기" : "비밀번호 보기"}
                >
                  {showPasswordConfirm ? "숨기기" : "보기"}
                </button>
              </div>
            </div>
            <label className="flex cursor-pointer items-start gap-2 text-xs text-[#666666]" id="signup-terms-label">
              <input
                type="checkbox"
                checked={termsAgreed}
                onChange={(e) => setTermsAgreed(e.target.checked)}
                className="mt-0.5 rounded border-[#EAEAEA]"
                aria-describedby="signup-terms-label"
              />
              <span>
                이용약관 및 개인정보처리방침에 동의합니다.
              </span>
            </label>
            <button
              type="submit"
              disabled={loading}
              aria-busy={loading}
              className="rounded-[14px] bg-[#111111] px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
            >
              {loading ? "처리 중..." : "가입하기"}
            </button>
          </form>
        </section>

        <p className="mt-8 text-center text-xs text-[#666666]">
          이미 계정이 있으신가요?{" "}
          <Link href="/login" className="underline">
            로그인
          </Link>
        </p>
      </div>
    </div>
  );
}
