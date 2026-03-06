import { NextResponse } from "next/server";
import { join } from "node:path";
import { requireAdminSession } from "@/lib/admin-session";
import { apiErrorJson } from "@/lib/api-error";
import { parseJsonBody } from "@/lib/validation";
import { listSecurityUpdates, recordSecurityUpdate, securityUpdateSchema } from "@/lib/security-update";

const SECURITY_LOG_FILE = join(process.cwd(), "logs", "security.log");

export async function GET(req: Request) {
  const gate = await requireAdminSession();
  if (!gate.ok) return apiErrorJson("admin_required", 403);
  const { searchParams } = new URL(req.url);
  const limit = Number(searchParams.get("limit") ?? 50);
  const safeLimit = Number.isFinite(limit) ? Math.min(200, Math.max(1, Math.floor(limit))) : 50;
  const entries = listSecurityUpdates(safeLimit, SECURITY_LOG_FILE);
  return NextResponse.json({ ok: true, entries });
}

export async function POST(req: Request) {
  const gate = await requireAdminSession();
  if (!gate.ok) return apiErrorJson("admin_required", 403);
  const parsed = await parseJsonBody(req, securityUpdateSchema);
  if (parsed.error) return parsed.error;
  const entry = recordSecurityUpdate(parsed.data, { adminId: gate.ok ? gate.admin.id : null });
  return NextResponse.json({ ok: true, entry });
}
