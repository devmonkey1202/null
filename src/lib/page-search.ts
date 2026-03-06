import { prisma } from "@/lib/db";

type SearchRow = {
  id: string;
  snippet: string;
  createdAt: Date;
  meta?: Record<string, unknown>;
};

async function queryWithFallback<T>(
  primary: () => Promise<T>,
  fallback: () => Promise<T>
) {
  try {
    return await primary();
  } catch {
    return await fallback();
  }
}

function escapeLike(value: string) {
  return value.replace(/[%_]/g, "\\$&");
}

export async function searchComments(pageId: string, q: string, limit = 20): Promise<SearchRow[]> {
  return queryWithFallback(
    async () => {
      const rows = await prisma.$queryRaw<
        Array<{ id: string; content: string; created_at: Date; node_id: string | null }>
      >`
        SELECT id, content, created_at, node_id
        FROM "Comment"
        WHERE page_id = ${pageId}
          AND to_tsvector('simple', content) @@ plainto_tsquery('simple', ${q})
        ORDER BY created_at DESC
        LIMIT ${limit}
      `;
      return rows.map((row) => ({
        id: row.id,
        snippet: row.content.slice(0, 200),
        createdAt: row.created_at,
        meta: row.node_id ? { nodeId: row.node_id } : undefined,
      }));
    },
    async () => {
      const pattern = escapeLike(q);
      const rows = await prisma.comment.findMany({
        where: { page_id: pageId, content: { contains: pattern, mode: "insensitive" } },
        take: limit,
        orderBy: { created_at: "desc" },
        select: { id: true, content: true, created_at: true, node_id: true },
      });
      return rows.map((row) => ({
        id: row.id,
        snippet: row.content.slice(0, 200),
        createdAt: row.created_at,
        meta: row.node_id ? { nodeId: row.node_id } : undefined,
      }));
    }
  );
}

export async function searchChat(pageId: string, q: string, limit = 20): Promise<SearchRow[]> {
  return queryWithFallback(
    async () => {
      const rows = await prisma.$queryRaw<Array<{ id: string; content: string; created_at: Date }>>`
        SELECT id, content, created_at
        FROM "ChatMessage"
        WHERE page_id = ${pageId}
          AND to_tsvector('simple', content) @@ plainto_tsquery('simple', ${q})
        ORDER BY created_at DESC
        LIMIT ${limit}
      `;
      return rows.map((row) => ({
        id: row.id,
        snippet: row.content.slice(0, 200),
        createdAt: row.created_at,
      }));
    },
    async () => {
      const pattern = escapeLike(q);
      const rows = await prisma.chatMessage.findMany({
        where: { page_id: pageId, content: { contains: pattern, mode: "insensitive" } },
        take: limit,
        orderBy: { created_at: "desc" },
        select: { id: true, content: true, created_at: true },
      });
      return rows.map((row) => ({
        id: row.id,
        snippet: row.content.slice(0, 200),
        createdAt: row.created_at,
      }));
    }
  );
}

export async function searchTodos(pageId: string, q: string, limit = 20): Promise<SearchRow[]> {
  return queryWithFallback(
    async () => {
      const rows = await prisma.$queryRaw<
        Array<{ id: string; title: string; done: boolean; created_at: Date }>
      >`
        SELECT id, title, done, created_at
        FROM "Todo"
        WHERE page_id = ${pageId}
          AND to_tsvector('simple', title) @@ plainto_tsquery('simple', ${q})
        ORDER BY updated_at DESC
        LIMIT ${limit}
      `;
      return rows.map((row) => ({
        id: row.id,
        snippet: row.title,
        createdAt: row.created_at,
        meta: { done: row.done },
      }));
    },
    async () => {
      const pattern = escapeLike(q);
      const rows = await prisma.todo.findMany({
        where: { page_id: pageId, title: { contains: pattern, mode: "insensitive" } },
        take: limit,
        orderBy: { updated_at: "desc" },
        select: { id: true, title: true, done: true, created_at: true },
      });
      return rows.map((row) => ({
        id: row.id,
        snippet: row.title,
        createdAt: row.created_at,
        meta: { done: row.done },
      }));
    }
  );
}

export async function searchNotes(pageId: string, q: string): Promise<SearchRow[]> {
  return queryWithFallback(
    async () => {
      const rows = await prisma.$queryRaw<Array<{ id: string; content: string; updated_at: Date }>>`
        SELECT id, content, updated_at
        FROM "Note"
        WHERE page_id = ${pageId}
          AND to_tsvector('simple', content) @@ plainto_tsquery('simple', ${q})
        LIMIT 1
      `;
      const row = rows[0];
      if (!row) return [];
      return [
        {
          id: row.id,
          snippet: row.content.slice(0, 200),
          createdAt: row.updated_at,
        },
      ];
    },
    async () => {
      const note = await prisma.note.findUnique({
        where: { page_id: pageId },
        select: { id: true, content: true, updated_at: true },
      });
      if (!note) return [];
      const contentLower = note.content.toLowerCase();
      const qLower = q.toLowerCase();
      if (!contentLower.includes(qLower)) return [];
      const idx = contentLower.indexOf(qLower);
      const start = Math.max(0, idx - 50);
      return [
        {
          id: note.id,
          snippet: note.content.slice(start, start + 200),
          createdAt: note.updated_at,
        },
      ];
    }
  );
}

export async function searchCalendar(pageId: string, q: string, limit = 20): Promise<SearchRow[]> {
  return queryWithFallback(
    async () => {
      const rows = await prisma.$queryRaw<
        Array<{ id: string; title: string; start_at: Date }>
      >`
        SELECT id, title, start_at
        FROM "CalendarEvent"
        WHERE page_id = ${pageId}
          AND to_tsvector('simple', title) @@ plainto_tsquery('simple', ${q})
        ORDER BY start_at DESC
        LIMIT ${limit}
      `;
      return rows.map((row) => ({
        id: row.id,
        snippet: row.title,
        createdAt: row.start_at,
        meta: { startAt: row.start_at.toISOString() },
      }));
    },
    async () => {
      const pattern = escapeLike(q);
      const rows = await prisma.calendarEvent.findMany({
        where: { page_id: pageId, title: { contains: pattern, mode: "insensitive" } },
        take: limit,
        orderBy: { start_at: "desc" },
        select: { id: true, title: true, start_at: true },
      });
      return rows.map((row) => ({
        id: row.id,
        snippet: row.title,
        createdAt: row.start_at,
        meta: { startAt: row.start_at.toISOString() },
      }));
    }
  );
}
