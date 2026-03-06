import { NextResponse } from "next/server";
import { resolveAnonUserId } from "@/lib/anon";
import { getPageForAsset } from "@/lib/page-access";
import { apiErrorJson } from "@/lib/api-error";
import {
  searchCalendar,
  searchChat,
  searchComments,
  searchNotes,
  searchTodos,
} from "@/lib/page-search";

type Params = { pageId: string };

type SearchType = "all" | "comments" | "chat" | "todos" | "notes" | "calendar";

export async function GET(req: Request, context: { params: Promise<Params> }) {
  const { pageId } = await context.params;
  if (!pageId) return apiErrorJson("bad_page_id", 400);

  const anonUserId = await resolveAnonUserId(req);
  const user = anonUserId ? await prisma.user.findUnique({ where: { anon_id: anonUserId }, select: { id: true } }) : null;
  const page = await getPageForAsset(pageId, req, user?.id ?? null);
  if (!page) return apiErrorJson("not_found", 404);

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim();
  const typeRaw = (searchParams.get("type") ?? "all").toLowerCase();
  const type: SearchType =
    typeRaw === "comments" || typeRaw === "chat" || typeRaw === "todos" || typeRaw === "notes" || typeRaw === "calendar"
      ? typeRaw
      : "all";

  if (!q || q.length === 0) {
    return NextResponse.json({ results: [] });
  }

  const results: Array<{
    type: string;
    id: string;
    snippet: string;
    createdAt: string;
    meta?: Record<string, unknown>;
  }> = [];

  if (type === "all" || type === "comments") {
    const comments = await searchComments(pageId, q, 20);
    for (const c of comments) {
      results.push({
        type: "comment",
        id: c.id,
        snippet: c.snippet,
        createdAt: c.createdAt.toISOString(),
        meta: c.meta,
      });
    }
  }

  if (type === "all" || type === "chat") {
    const messages = await searchChat(pageId, q, 20);
    for (const m of messages) {
      results.push({
        type: "chat",
        id: m.id,
        snippet: m.snippet,
        createdAt: m.createdAt.toISOString(),
      });
    }
  }

  if (type === "all" || type === "todos") {
    const todos = await searchTodos(pageId, q, 20);
    for (const t of todos) {
      results.push({
        type: "todo",
        id: t.id,
        snippet: t.snippet,
        createdAt: t.createdAt.toISOString(),
        meta: t.meta,
      });
    }
  }

  if (type === "all" || type === "notes") {
    const notes = await searchNotes(pageId, q);
    for (const note of notes) {
      results.push({
        type: "note",
        id: note.id,
        snippet: note.snippet,
        createdAt: note.createdAt.toISOString(),
      });
    }
  }

  if (type === "all" || type === "calendar") {
    const events = await searchCalendar(pageId, q, 20);
    for (const e of events) {
      results.push({
        type: "calendar",
        id: e.id,
        snippet: e.snippet,
        createdAt: e.createdAt.toISOString(),
        meta: e.meta,
      });
    }
  }

  results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const limited = results.slice(0, 50);

  return NextResponse.json({ results: limited });
}
