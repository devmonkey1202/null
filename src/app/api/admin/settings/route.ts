import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { requireAdmin } from "@/lib/admin";
import { logAdminAudit } from "@/lib/admin-audit";
import { parseJsonObject } from "@/lib/validation";

const SETTINGS_RULES = {
  live_hours: { type: "number", allowed: [12, 24, 48] },
  anon_prefix: { type: "string", max: 32 },
  feed_popular_k: { type: "number", min: 1, max: 24, integer: true },
  allow_noip_fallback: { type: "boolean" },
  witness_cap_minutes: { type: "number", min: 1, max: 120, integer: true },
  spikes_window_hours: { type: "number", min: 1, max: 168, integer: true },
  spikes_bucket_minutes: { type: "number", min: 1, max: 60, integer: true },
  spikes_highlight_minutes: { type: "number", min: 5, max: 180, integer: true },
  spikes_top_k: { type: "number", min: 1, max: 10, integer: true },
  replay_highlight_window_ms: { type: "number", min: 5000, max: 300000, integer: true },
  replay_top_click_windows: { type: "number", min: 1, max: 10, integer: true },
  replay_top_leave_windows: { type: "number", min: 1, max: 10, integer: true },
  replay_top_button_clicks: { type: "number", min: 1, max: 10, integer: true },
} as const;

const ALLOWED_KEYS = Object.keys(SETTINGS_RULES);

type SettingRule =
  | { type: "number"; min?: number; max?: number; integer?: boolean; allowed?: number[] }
  | { type: "string"; max?: number }
  | { type: "boolean" };

export async function GET(req: Request) {
  const gate = await requireAdmin(req, { roles: ["owner", "staff", "viewer"] });
  if (!gate.ok) return gate.response;

  const rows = await prisma.systemSetting.findMany({
    where: { key: { in: [...ALLOWED_KEYS] } },
  });
  const settings: Record<string, unknown> = {};
  for (const row of rows) {
    settings[row.key] = row.value;
  }
  return NextResponse.json({ ok: true, settings });
}

export async function POST(req: Request) {
  const gate = await requireAdmin(req, { roles: ["owner", "staff"] });
  if (!gate.ok) return gate.response;

  const parsed = await parseJsonObject(req);
  if (parsed.error) return parsed.error;
  const body = parsed.data as Record<string, unknown>;

  const updates: { key: string; value: unknown }[] = [];
  for (const key of ALLOWED_KEYS) {
    const rule = SETTINGS_RULES[key as keyof typeof SETTINGS_RULES] as SettingRule;
    const raw = body[key];
    if (raw === undefined) continue;

    if (rule.type === "number") {
      if (typeof raw !== "number" || !Number.isFinite(raw)) continue;
      const next = rule.integer ? Math.round(raw) : raw;
      if (Array.isArray(rule.allowed) && !rule.allowed.includes(next)) continue;
      if (typeof rule.min === "number" && next < rule.min) continue;
      if (typeof rule.max === "number" && next > rule.max) continue;
      updates.push({ key, value: next });
      continue;
    }

    if (rule.type === "string") {
      if (typeof raw !== "string") continue;
      const max = typeof rule.max === "number" ? rule.max : raw.length;
      updates.push({ key, value: raw.slice(0, max) });
      continue;
    }

    if (rule.type === "boolean") {
      if (typeof raw !== "boolean") continue;
      updates.push({ key, value: raw });
    }
  }

  for (const { key, value } of updates) {
    const jsonValue = value as Prisma.InputJsonValue;
    await prisma.systemSetting.upsert({
      where: { key },
      update: { value: jsonValue },
      create: { key, value: jsonValue },
    });
  }

  await logAdminAudit({
    adminId: gate.admin.id,
    action: "settings_update",
    targetType: "system_setting",
    targetId: updates.map((u) => u.key).join(",") || null,
    req,
    meta: { keys: updates.map((u) => u.key) },
  });

  const rows = await prisma.systemSetting.findMany({
    where: { key: { in: [...ALLOWED_KEYS] } },
  });
  const settings: Record<string, unknown> = {};
  for (const row of rows) {
    settings[row.key] = row.value;
  }
  return NextResponse.json({ ok: true, settings });
}
