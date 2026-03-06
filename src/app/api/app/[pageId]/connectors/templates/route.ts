import { NextResponse } from "next/server";
import { withErrorHandler } from "@/lib/api-handler";
import { listConnectorTemplates } from "@/lib/connectors";

export const GET = withErrorHandler(async () => {
  const templates = listConnectorTemplates();
  return NextResponse.json({ templates });
});
