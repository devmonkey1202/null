import { withAnonHeaders } from "@/lib/anon-client";

export type IntegratedServiceProjectClientResult = {
  ok: true;
  created: boolean;
  pageId: string;
  title: string;
  editorUrl: string;
  dashboardUrl: string;
  publicUrl: string;
  validationUrl: string;
  credentials: Array<{
    label: string;
    role: string;
    email: string;
    password: string;
    displayName: string;
  }>;
};

export async function createIntegratedServiceProject() {
  const response = await fetch("/api/pages/starters/integrated-service", {
    method: "POST",
    credentials: "include",
    headers: withAnonHeaders(),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.pageId) {
    throw new Error(payload?.message ?? payload?.error ?? "통합 검증 서비스 프로젝트를 만들지 못했습니다.");
  }

  return payload as IntegratedServiceProjectClientResult;
}
