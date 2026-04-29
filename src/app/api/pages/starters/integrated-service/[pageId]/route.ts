import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { apiErrorJson } from "@/lib/api-error";
import { resolveOwnedPageAccess } from "@/lib/owned-page-access";

type Params = { pageId: string };

const ACCOUNTS_KEY = "system.integrated_validation_service.accounts";

type Credential = {
  label: string;
  role: string;
  email: string;
  password: string;
  displayName: string;
};

function parseCredentials(value: unknown): Credential[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const record = entry as Record<string, unknown>;
    if (
      typeof record.label !== "string" ||
      typeof record.role !== "string" ||
      typeof record.email !== "string" ||
      typeof record.password !== "string" ||
      typeof record.displayName !== "string"
    ) {
      return [];
    }
    return [
      {
        label: record.label,
        role: record.role,
        email: record.email,
        password: record.password,
        displayName: record.displayName,
      } satisfies Credential,
    ];
  });
}

export async function GET(req: Request, context: { params: Promise<Params> }) {
  const { pageId } = await context.params;
  if (!pageId) return apiErrorJson("bad_page_id", 400);

  const access = await resolveOwnedPageAccess(req, pageId);
  if (!access.user) return apiErrorJson("user_not_found", 404);
  if (!access.page) return apiErrorJson("not_found", 404);

  const [page, settings] = await Promise.all([
    prisma.page.findUnique({
      where: { id: pageId },
      select: {
        id: true,
        title: true,
        status: true,
        deployed_at: true,
        updated_at: true,
      },
    }),
    prisma.pageSetting.findMany({
      where: {
        page_id: pageId,
        key: {
          in: [ACCOUNTS_KEY],
        },
      },
      select: { key: true, value: true },
    }),
  ]);

  if (!page) return apiErrorJson("not_found", 404);

  const accountSetting = settings.find((setting) => setting.key === ACCOUNTS_KEY);
  const credentials = parseCredentials(accountSetting?.value);

  return NextResponse.json({
    ok: true,
    page: {
      id: page.id,
      title: page.title,
      status: page.status,
      deployedAt: page.deployed_at?.toISOString() ?? null,
      updatedAt: page.updated_at.toISOString(),
    },
    credentials,
    editorUrl: `/editor/advanced?pageId=${pageId}`,
    dashboardUrl: `/dashboard/${pageId}`,
    publicUrl: `/p/${pageId}`,
  });
}
