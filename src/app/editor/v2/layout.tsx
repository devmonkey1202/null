import type { ReactNode } from "react";
import "./editor-v2.css";

export default function V2EditorLayout({ children }: { children: ReactNode }) {
  return <div className="v2-editor-root min-h-screen bg-[#eef1f6] text-slate-950">{children}</div>;
}
