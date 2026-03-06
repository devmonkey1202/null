import { NextResponse } from "next/server";
import { requireAdminAccess } from "@/lib/admin-session";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

function readTail(filePath: string, limit: number) {
  if (!existsSync(filePath)) return [];
  const raw = readFileSync(filePath, "utf8");
  const lines = raw.split("\n").filter(Boolean);
  return lines.slice(Math.max(0, lines.length - limit));
}

export async function GET(req: Request) {
  const gate = await requireAdminAccess(req);
  if (!gate.ok) {
    return NextResponse.json({ ok: false, error: gate.code }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const limitRaw = Number(searchParams.get("limit") ?? 200);
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(1000, limitRaw)) : 200;

  const logFile = join(process.cwd(), "logs", "system.log");
  const lines = readTail(logFile, limit);

  const entries = lines
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return { raw: line };
      }
    })
    .reverse();

  return NextResponse.json({ ok: true, entries });
}
