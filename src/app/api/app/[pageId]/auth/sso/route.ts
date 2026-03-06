import { NextResponse } from "next/server";
import { withErrorHandler, safeParseBody } from "@/lib/api-handler";
import { apiErrorJson } from "@/lib/api-error";
import { loginWithSso } from "@/lib/app-sso";

export const POST = withErrorHandler(
  async (req: Request, context: { params: Promise<{ pageId: string }> }) => {
    const { pageId } = await context.params;
    const body = (await safeParseBody(req)) as Record<string, unknown> | null;
    if (!body) return apiErrorJson("body_required", 400);

    const provider = body.provider ?? body.type ?? body.sso_provider;
    const connectionName = typeof body.connectionName === "string" ? body.connectionName : undefined;
    const payload =
      body.payload ??
      body.assertion ??
      {
        email: body.email,
        subject: body.subject,
        displayName: body.displayName,
      };

    if (!provider) return apiErrorJson("sso_provider_required", 400);

    const result = await loginWithSso(pageId, {
      provider: String(provider) as "oauth" | "saml",
      connectionName,
      payload,
    });

    return NextResponse.json({
      ok: true,
      created: result.created,
      user: result.user,
      token: result.token,
    });
  }
);
