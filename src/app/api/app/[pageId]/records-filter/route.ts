import { handleAppRecordQuery } from "@/lib/app-record-query";
import { apiErrorJson } from "@/lib/api-error";

type Params = { pageId: string };

export async function POST(req: Request, context: { params: Promise<Params> }) {
  const { pageId } = await context.params;
  if (!pageId) return apiErrorJson("bad_request", 400);
  return handleAppRecordQuery(req, pageId);
}
