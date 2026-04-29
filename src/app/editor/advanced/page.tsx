"use client";

import dynamic from "next/dynamic";
import { NullLoadingScreen } from "@/components/null-spinner";

const AdvancedEditor = dynamic(() => import("@/advanced/ui/AdvancedEditor"), {
  ssr: false,
  loading: () => <NullLoadingScreen label="에디터를 불러오는 중..." />,
});

export default function Page() {
  return <AdvancedEditor />;
}
