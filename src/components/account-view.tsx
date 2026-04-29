"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type AccountData = {
  anonUserId?: string;
  email?: string | null;
  isLoggedIn?: boolean;
  plan?: { id: string; name: string };
  features?: Record<string, boolean>;
  error?: string;
};

type FormState = {
  email: string;
  password: string;
  passwordConfirm: string;
};

const STORAGE_KEY = "anon_user_id";

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function labelFeature(key: string) {
  const map: Record<string, string> = {
    replayEnabled: "리플레이",
    analyticsEnabled: "분석",
    collabEnabled: "협업",
    exportEnabled: "내보내기",
    appUsersEnabled: "앱 사용자",
    notificationsEnabled: "알림",
  };
  return map[key] ?? key;
}

export default function AccountView() {
  const [account, setAccount] = useState<AccountData | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [login, setLogin] = useState<FormState>({ email: "", password: "", passwordConfirm: "" });
  const [signup, setSignup] = useState<FormState>({ email: "", password: "", passwordConfirm: "" });

  const featureList = useMemo(() => {
    const entries = account?.features ? Object.entries(account.features) : [];
    return entries.filter(([, enabled]) => Boolean(enabled)).map(([key]) => labelFeature(key));
  }, [account?.features]);

  const ensureAnonSession = useCallback(async () => {
    const existing = typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    if (existing) return existing;
    const res = await fetch("/api/anon/init", { method: "POST" });
    if (!res.ok) return null;
    const payload = await res.json().catch(() => null);
    const anonId = payload?.anonUserId ?? payload?.anon_id ?? null;
    if (anonId && typeof localStorage !== "undefined") {
      localStorage.setItem(STORAGE_KEY, anonId);
    }
    return anonId;
  }, []);

  const loadAccount = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await ensureAnonSession();
      const anonId = typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
      const res = await fetch("/api/me", {
        credentials: "include",
        headers: anonId ? { "x-anon-user-id": anonId } : undefined,
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        setAccount({ error: payload?.error ?? "account_fetch_failed" });
        setError("계정 정보를 불러오지 못했습니다.");
        return;
      }
      setAccount(payload ?? {});
    } catch {
      setError("계정 정보를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [ensureAnonSession]);

  useEffect(() => {
    void loadAccount();
  }, [loadAccount]);

  const handleLogin = async () => {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      await ensureAnonSession();
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          email: normalizeEmail(login.email),
          password: login.password,
        }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        setError(payload?.message ?? "로그인에 실패했습니다.");
        return;
      }
      if (payload?.anonUserId && typeof localStorage !== "undefined") {
        localStorage.setItem(STORAGE_KEY, payload.anonUserId);
      }
      setMessage("로그인되었습니다.");
      await loadAccount();
    } catch {
      setError("로그인에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async () => {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      await ensureAnonSession();
      const anonId = typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(anonId ? { "x-anon-user-id": anonId } : {}),
        },
        credentials: "include",
        body: JSON.stringify({
          email: normalizeEmail(signup.email),
          password: signup.password,
          passwordConfirm: signup.passwordConfirm,
        }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        setError(payload?.message ?? "회원가입에 실패했습니다.");
        return;
      }
      if (payload?.anonUserId && typeof localStorage !== "undefined") {
        localStorage.setItem(STORAGE_KEY, payload.anonUserId);
      }
      setMessage("회원가입이 완료되었습니다.");
      await loadAccount();
    } catch {
      setError("회원가입에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
      if (typeof localStorage !== "undefined") {
        localStorage.removeItem(STORAGE_KEY);
      }
      setMessage("로그아웃되었습니다.");
      await loadAccount();
    } catch {
      setError("로그아웃에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white text-[#151515]">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-[14px] border border-black/[0.08] bg-white/90 p-5 shadow-[0_18px_48px_rgba(15,23,42,0.04)] backdrop-blur-xl sm:p-6">
            <div className="text-[12px] font-semibold uppercase tracking-[0.24em] text-[#8a7550]">Account</div>
            <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-[#111111] sm:text-[40px]">내 계정</h1>
            <p className="sr-only">
              로그인 상태, 플랜, 현재 사용 권한, 익명 세션 연결 상태를 한곳에서 확인하고 이어서 설정이나 결제
              화면으로 넘어갈 수 있는 계정 센터입니다.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void loadAccount()}
                disabled={loading}
                className="rounded-full border border-black/10 bg-white px-5 py-3 text-sm font-semibold text-[#111111] transition hover:bg-black/[0.04] disabled:opacity-60"
              >
                새로고침
              </button>
              <Link
                href="/settings"
                className="rounded-full bg-[#111111] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#2a2a2a]"
              >
                설정 열기
              </Link>
              <Link
                href="/upgrade"
                className="rounded-full border border-black/10 bg-[#f7f4ed] px-5 py-3 text-sm font-medium text-[#111111] transition hover:bg-[#ede7da]"
              >
                플랜 보기
              </Link>
              <Link
                href="/dashboard"
                className="rounded-full border border-black/10 bg-white px-5 py-3 text-sm font-medium text-[#111111] transition hover:bg-[#f6f3ec]"
              >
                대시보드로 이동
              </Link>
            </div>
          </div>

          <aside className="rounded-[14px] border border-black/[0.08] bg-white/75 p-5 shadow-[0_18px_48px_rgba(15,23,42,0.035)] backdrop-blur-xl sm:p-6">
            <div className="text-[12px] font-semibold uppercase tracking-[0.24em] text-[#8a7550]">Current Status</div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <StatusCard label="로그인 상태" value={account?.isLoggedIn ? "연결됨" : "미로그인"} />
              <StatusCard label="현재 플랜" value={account?.plan?.name ?? "무료"} />
              <StatusCard label="익명 세션" value={account?.anonUserId ? "연결됨" : "없음"} />
              <StatusCard label="사용 가능 기능" value={featureList.length ? `${featureList.length}개` : "기본"} />
            </div>
          </aside>
        </section>

        {loading ? (
          <div className="rounded-[22px] border border-black/8 bg-white px-4 py-4 text-sm text-[#5b5852]">
            계정 정보를 불러오고 있습니다.
          </div>
        ) : null}
        {message ? (
          <div className="rounded-[22px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            {message}
          </div>
        ) : null}
        {error ? (
          <div className="rounded-[22px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        ) : null}

        <section className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
          <article className="rounded-[28px] border border-black/8 bg-white p-6 shadow-[0_18px_60px_rgba(17,17,17,0.05)]">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-[12px] font-semibold uppercase tracking-[0.24em] text-[#8a7550]">Overview</div>
                <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[#111111]">계정 요약</h2>
              </div>
              {account?.isLoggedIn ? (
                <button
                  type="button"
                  onClick={handleLogout}
                  disabled={loading}
                  className="rounded-full border border-black/10 bg-[#f7f4ed] px-4 py-2 text-sm font-semibold text-[#111111] transition hover:bg-[#ede7da] disabled:opacity-60"
                >
                  로그아웃
                </button>
              ) : null}
            </div>

            <dl className="mt-5 grid gap-3 sm:grid-cols-2">
              <SummaryRow label="이메일" value={account?.email ?? "-"} />
              <SummaryRow label="로그인 여부" value={account?.isLoggedIn ? "로그인됨" : "비로그인"} />
              <SummaryRow label="익명 사용자 ID" value={account?.anonUserId ?? "-"} />
              <SummaryRow label="플랜" value={account?.plan?.name ?? "무료"} />
            </dl>

            <div className="mt-6">
              <div className="text-sm font-semibold text-[#111111]">현재 사용 가능한 기능</div>
              {featureList.length ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {featureList.map((feature) => (
                    <span
                      key={feature}
                      className="rounded-full border border-black/8 bg-[#f7f4ed] px-3 py-1.5 text-xs font-semibold text-[#6d5b3a]"
                    >
                      {feature}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-sm text-[#635e56]">현재는 기본 기능만 활성화되어 있습니다.</p>
              )}
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <QuickLink href="/dashboard" title="프로젝트 운영" description="대시보드와 공개 흐름으로 이동" />
              <QuickLink href="/upgrade" title="플랜과 결제" description="현재 플랜과 업그레이드 옵션 확인" />
              <QuickLink href="/settings" title="설정과 지원" description="보안, 지원, 연결 정보 관리" />
            </div>
          </article>

          <div className="grid gap-6">
            {!account?.isLoggedIn ? (
              <>
                <AuthCard
                  title="로그인"
                  description="기존 계정으로 들어와 현재 익명 세션과 작업 흐름을 이어서 사용합니다."
                >
                  <div className="grid gap-3">
                    <input
                      type="email"
                      placeholder="이메일"
                      autoComplete="email"
                      value={login.email}
                      onChange={(event) => setLogin((prev) => ({ ...prev, email: event.target.value }))}
                      className="rounded-[16px] border border-black/10 bg-[#fbfaf7] px-4 py-3 text-sm text-[#161616] outline-none transition focus:border-black/25"
                    />
                    <input
                      type="password"
                      placeholder="비밀번호"
                      autoComplete="current-password"
                      value={login.password}
                      onChange={(event) => setLogin((prev) => ({ ...prev, password: event.target.value }))}
                      className="rounded-[16px] border border-black/10 bg-[#fbfaf7] px-4 py-3 text-sm text-[#161616] outline-none transition focus:border-black/25"
                    />
                    <button
                      type="button"
                      onClick={handleLogin}
                      disabled={loading}
                      className="rounded-full bg-[#111111] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#2a2a2a] disabled:opacity-60"
                    >
                      로그인
                    </button>
                  </div>
                </AuthCard>

                <AuthCard
                  title="회원가입"
                  description="새 계정을 만들고 현재 익명 세션과 연결합니다."
                >
                  <div className="grid gap-3">
                    <input
                      type="email"
                      placeholder="이메일"
                      autoComplete="email"
                      value={signup.email}
                      onChange={(event) => setSignup((prev) => ({ ...prev, email: event.target.value }))}
                      className="rounded-[16px] border border-black/10 bg-[#fbfaf7] px-4 py-3 text-sm text-[#161616] outline-none transition focus:border-black/25"
                    />
                    <input
                      type="password"
                      placeholder="비밀번호"
                      autoComplete="new-password"
                      value={signup.password}
                      onChange={(event) => setSignup((prev) => ({ ...prev, password: event.target.value }))}
                      className="rounded-[16px] border border-black/10 bg-[#fbfaf7] px-4 py-3 text-sm text-[#161616] outline-none transition focus:border-black/25"
                    />
                    <input
                      type="password"
                      placeholder="비밀번호 확인"
                      autoComplete="new-password"
                      value={signup.passwordConfirm}
                      onChange={(event) => setSignup((prev) => ({ ...prev, passwordConfirm: event.target.value }))}
                      className="rounded-[16px] border border-black/10 bg-[#fbfaf7] px-4 py-3 text-sm text-[#161616] outline-none transition focus:border-black/25"
                    />
                    <button
                      type="button"
                      onClick={handleSignup}
                      disabled={loading}
                      className="rounded-full bg-[#111111] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#2a2a2a] disabled:opacity-60"
                    >
                      회원가입
                    </button>
                  </div>
                </AuthCard>
              </>
            ) : (
              <AuthCard
                title="현재 로그인 상태"
                description="계정 연결은 정상입니다. 보안과 결제 설정은 아래 링크에서 계속 관리할 수 있습니다."
              >
                <div className="grid gap-3">
                  <QuickLink href="/settings" title="설정 열기" description="계정, 지원, 문서 링크를 관리합니다." />
                  <QuickLink href="/upgrade" title="플랜 확인" description="현재 플랜과 업그레이드 옵션을 확인합니다." />
                </div>
              </AuthCard>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function StatusCard({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-[22px] border border-black/8 bg-white px-4 py-4">
      <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#8a7550]">{label}</div>
      <div className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-[#111111]">{value}</div>
    </article>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[18px] border border-black/8 bg-[#fbfaf7] px-4 py-3">
      <dt className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#8a7550]">{label}</dt>
      <dd className="mt-2 break-all text-sm text-[#111111]">{value}</dd>
    </div>
  );
}

function QuickLink({
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
      className="rounded-[20px] border border-black/8 bg-[#fbfaf7] px-4 py-4 transition hover:border-black/12 hover:bg-[#f5efdf]"
    >
      <div className="text-sm font-semibold text-[#111111]">{title}</div>
      <p className="mt-2 text-sm leading-6 text-[#635e56]">{description}</p>
    </Link>
  );
}

function AuthCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[28px] border border-black/8 bg-white p-6 shadow-[0_18px_60px_rgba(17,17,17,0.05)]">
      <div className="text-[12px] font-semibold uppercase tracking-[0.24em] text-[#8a7550]">Access</div>
      <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[#111111]">{title}</h2>
      <p className="mt-3 text-sm leading-6 text-[#635e56]">{description}</p>
      <div className="mt-5">{children}</div>
    </section>
  );
}
