import { NextResponse } from "next/server";

type Context = { params: Promise<{ documentId: string }> };

export async function POST(_req: Request, context: Context) {
  const { documentId } = await context.params;
  return NextResponse.json(
    {
      ok: false,
      code: "NOT_IMPLEMENTED",
      documentId,
      message: "Document restore is scaffolded but not implemented.",
    },
    { status: 501 },
  );
}

