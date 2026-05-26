import type { ReactNode } from "react";

export default function V2EditorLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-screen bg-[#eef1f6] text-slate-950">{children}</div>;
}

