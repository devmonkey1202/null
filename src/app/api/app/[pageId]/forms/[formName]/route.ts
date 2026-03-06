import { NextResponse } from "next/server";
import { withErrorHandler, safeParseBody } from "@/lib/api-handler";
import { triggerWorkflowsForEvent } from "@/lib/app-workflow";
import { resolveAnonUserId } from "@/lib/anon";
import { logAppAudit } from "@/lib/app-audit";

export const POST = withErrorHandler(
  async (req: Request, context: { params: Promise<{ pageId: string; formName: string }> }) => {
    const { pageId, formName } = await context.params;
    const contentType = req.headers.get("content-type") ?? "";
    const anonUserId = await resolveAnonUserId(req);

    const fields: Record<string, unknown> = {};
    const files: Record<string, { name: string; type: string; size: number }> = {};

    if (contentType.includes("multipart/form-data") || contentType.includes("application/x-www-form-urlencoded")) {
      const form = await req.formData();
      form.forEach((value, key) => {
        if (value instanceof File) {
          files[key] = { name: value.name, type: value.type, size: value.size };
        } else {
          fields[key] = value;
        }
      });
    } else {
      const body = (await safeParseBody(req)) as Record<string, unknown> | null;
      if (body) {
        Object.assign(fields, body);
      }
    }

    const triggerData = {
      formName,
      fields,
      files,
      receivedAt: new Date().toISOString(),
    };

    const results = await triggerWorkflowsForEvent(
      pageId,
      "form_submitted",
      { formName },
      triggerData,
    );

    await logAppAudit({
      pageId,
      action: "form_submit",
      targetType: "form",
      targetId: formName,
      meta: { fields: Object.keys(fields), files: Object.keys(files), triggered: results.length },
      actor: { anonId: anonUserId ?? null },
    });

    return NextResponse.json({ ok: true, formName, triggered: results.length, results });
  }
);
