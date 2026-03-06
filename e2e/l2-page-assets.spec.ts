import { test, expect, APIRequestContext } from "@playwright/test";

const BASE = process.env.PLAYWRIGHT_TEST_BASE_URL || "http://localhost:3100";

async function initAnon(request: APIRequestContext): Promise<string> {
  const ip = `127.0.0.${Math.floor(Math.random() * 200) + 20}`;
  const res = await request.post(`${BASE}/api/anon/init`, {
    headers: { "x-forwarded-for": ip },
  });
  const data = await res.json();
  return data?.anonUserId ?? data?.anon_user_id ?? "";
}

async function createPage(request: APIRequestContext, anonId: string): Promise<string> {
  const headers = { "x-anon-user-id": anonId, "Content-Type": "application/json" };
  const res = await request.post(`${BASE}/api/pages`, {
    headers,
    data: JSON.stringify({
      title: "L2 Page Assets",
      content: { type: "doc", content: [] },
    }),
  });
  if (!res.ok()) return "";
  const body = await res.json();
  return body?.page?.id ?? body?.pageId ?? body?.id ?? "";
}

test.describe.serial("L2 Page asset scenarios", () => {
  let anonId = "";
  let pageId = "";

  test.beforeAll(async ({ request }) => {
    anonId = await initAnon(request);
    if (!anonId) return;
    pageId = await createPage(request, anonId);
    if (!pageId) return;

    const headers = { "x-anon-user-id": anonId, "Content-Type": "application/json" };
    await request.post(`${BASE}/api/pages/${pageId}/publish`, { headers });
  });

  test("comments create + reply", async ({ request }) => {
    test.skip(!pageId || !anonId, "page not ready");
    const headers = { "x-anon-user-id": anonId, "Content-Type": "application/json" };

    const createRes = await request.post(`${BASE}/api/pages/${pageId}/comments`, {
      headers,
      data: JSON.stringify({ content: "First comment", x: 10, y: 20 }),
    });
    expect(createRes.ok()).toBeTruthy();
    const created = await createRes.json();
    const commentId = created?.comment?.id ?? "";
    expect(commentId).toBeTruthy();

    const replyRes = await request.post(`${BASE}/api/pages/${pageId}/comments`, {
      headers,
      data: JSON.stringify({ content: "Reply", parentId: commentId }),
    });
    expect(replyRes.ok()).toBeTruthy();

    const listRes = await request.get(`${BASE}/api/pages/${pageId}/comments`, { headers });
    expect(listRes.ok()).toBeTruthy();
    const listData = await listRes.json();
    expect(Array.isArray(listData?.comments)).toBeTruthy();
  });

  test("todos CRUD", async ({ request }) => {
    test.skip(!pageId || !anonId, "page not ready");
    const headers = { "x-anon-user-id": anonId, "Content-Type": "application/json" };

    const createRes = await request.post(`${BASE}/api/pages/${pageId}/todos`, {
      headers,
      data: JSON.stringify({ title: "Todo 1" }),
    });
    expect(createRes.ok()).toBeTruthy();
    const created = await createRes.json();
    const todoId = created?.todo?.id ?? "";
    expect(todoId).toBeTruthy();

    const patchRes = await request.patch(`${BASE}/api/pages/${pageId}/todos/${todoId}`, {
      headers,
      data: JSON.stringify({ done: true }),
    });
    expect(patchRes.ok()).toBeTruthy();

    const delRes = await request.delete(`${BASE}/api/pages/${pageId}/todos/${todoId}`, { headers });
    expect(delRes.ok()).toBeTruthy();
  });

  test("kanban CRUD", async ({ request }) => {
    test.skip(!pageId || !anonId, "page not ready");
    const headers = { "x-anon-user-id": anonId, "Content-Type": "application/json" };

    const colRes = await request.post(`${BASE}/api/pages/${pageId}/kanban/columns`, {
      headers,
      data: JSON.stringify({ title: "Backlog" }),
    });
    expect(colRes.ok()).toBeTruthy();
    const colData = await colRes.json();
    const columnId = colData?.column?.id ?? "";
    expect(columnId).toBeTruthy();

    const cardRes = await request.post(`${BASE}/api/pages/${pageId}/kanban/cards`, {
      headers,
      data: JSON.stringify({ column_id: columnId, title: "Task 1", body: "Details" }),
    });
    expect(cardRes.ok()).toBeTruthy();
    const cardData = await cardRes.json();
    const cardId = cardData?.card?.id ?? "";
    expect(cardId).toBeTruthy();

    const patchCard = await request.patch(`${BASE}/api/pages/${pageId}/kanban/cards/${cardId}`, {
      headers,
      data: JSON.stringify({ title: "Task 1 updated" }),
    });
    expect(patchCard.ok()).toBeTruthy();

    const delCard = await request.delete(`${BASE}/api/pages/${pageId}/kanban/cards/${cardId}`, { headers });
    expect(delCard.ok()).toBeTruthy();

    const delCol = await request.delete(`${BASE}/api/pages/${pageId}/kanban/columns/${columnId}`, { headers });
    expect(delCol.ok()).toBeTruthy();
  });

  test("calendar CRUD", async ({ request }) => {
    test.skip(!pageId || !anonId, "page not ready");
    const headers = { "x-anon-user-id": anonId, "Content-Type": "application/json" };
    const startAt = new Date(Date.now() + 60_000).toISOString();

    const createRes = await request.post(`${BASE}/api/pages/${pageId}/calendar`, {
      headers,
      data: JSON.stringify({ title: "Event 1", start_at: startAt }),
    });
    expect(createRes.ok()).toBeTruthy();
    const created = await createRes.json();
    const eventId = created?.event?.id ?? "";
    expect(eventId).toBeTruthy();

    const patchRes = await request.patch(`${BASE}/api/pages/${pageId}/calendar/${eventId}`, {
      headers,
      data: JSON.stringify({ title: "Event 1 updated" }),
    });
    expect(patchRes.ok()).toBeTruthy();

    const delRes = await request.delete(`${BASE}/api/pages/${pageId}/calendar/${eventId}`, { headers });
    expect(delRes.ok()).toBeTruthy();
  });

  test("note + settings + notifications", async ({ request }) => {
    test.skip(!pageId || !anonId, "page not ready");
    const headers = { "x-anon-user-id": anonId, "Content-Type": "application/json" };

    const noteRes = await request.put(`${BASE}/api/pages/${pageId}/note`, {
      headers,
      data: JSON.stringify({ content: "Note content" }),
    });
    expect(noteRes.ok()).toBeTruthy();

    const getNote = await request.get(`${BASE}/api/pages/${pageId}/note`, { headers });
    expect(getNote.ok()).toBeTruthy();

    const setRes = await request.put(`${BASE}/api/pages/${pageId}/settings`, {
      headers,
      data: JSON.stringify({ key: "l2_setting", value: { enabled: true } }),
    });
    expect(setRes.ok()).toBeTruthy();

    const getRes = await request.get(`${BASE}/api/pages/${pageId}/settings?key=l2_setting`, { headers });
    expect(getRes.ok()).toBeTruthy();

    const notifRes = await request.get(`${BASE}/api/pages/${pageId}/notifications?limit=5`, { headers });
    expect(notifRes.ok()).toBeTruthy();
    const notifData = await notifRes.json();
    expect(Array.isArray(notifData?.notifications)).toBeTruthy();
  });

  test("page audit logs capture asset actions", async ({ request }) => {
    test.skip(!pageId || !anonId, "page not ready");
    const headers = { "x-anon-user-id": anonId };

    const logsRes = await request.get(`${BASE}/api/pages/${pageId}/audit-logs?limit=200`, { headers });
    expect(logsRes.ok()).toBeTruthy();
    const data = await logsRes.json();
    const actions = (data?.logs ?? []).map((l: { action: string }) => l.action);

    expect(actions).toContain("page_publish");
    expect(actions).toContain("comment_create");
    expect(actions).toContain("todo_create");
    expect(actions).toContain("todo_update");
    expect(actions).toContain("todo_delete");
    expect(actions).toContain("kanban_column_create");
    expect(actions).toContain("kanban_column_delete");
    expect(actions).toContain("kanban_card_create");
    expect(actions).toContain("kanban_card_update");
    expect(actions).toContain("kanban_card_delete");
    expect(actions).toContain("calendar_create");
    expect(actions).toContain("calendar_update");
    expect(actions).toContain("calendar_delete");
    expect(actions).toContain("note_upsert");
    expect(actions).toContain("settings_update");
  });
});
