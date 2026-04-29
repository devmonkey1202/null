"use client";

import dynamic from "next/dynamic";

import { NullLoadingScreen } from "@/components/null-spinner";

const WorkView = dynamic(() => import("@/components/work-view"), {
  ssr: false,
  loading: () => <NullLoadingScreen label="페이지를 불러오는 중..." />,
});

export default function PublicWorkView({ pageId }: { pageId: string }) {
  return <WorkView pageId={pageId} standalone />;
}
