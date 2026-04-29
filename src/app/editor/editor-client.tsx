"use client";

import dynamic from "next/dynamic";
import { NullLoadingScreen } from "@/components/null-spinner";

const EditorView = dynamic(() => import("@/components/editor-view"), {
  ssr: false,
  loading: () => <NullLoadingScreen label="에디터를 불러오는 중..." />,
});

export default function EditorClient() {
  return <EditorView />;
}
