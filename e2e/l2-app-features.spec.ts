import { test, expect, APIRequestContext } from "@playwright/test";
import { createHmac } from "crypto";

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
      title: "L2 App Features",
      content: { type: "doc", content: [] },
    }),
  });
  if (!res.ok()) return "";
  const body = await res.json();
  return body?.page?.id ?? body?.pageId ?? body?.id ?? "";
}

function signWebhook(secret: string, timestamp: string, body: string) {
  const base = `${timestamp}.${body}`;
  return createHmac("sha256", secret).update(base).digest("hex");
}

test.describe.serial("L2 App feature scenarios", () => {
  let anonId = "";
  let pageId = "";
  let formWorkflowId = "";
  let webhookWorkflowId = "";
  let appToken = "";
  let appUserId = "";
  const webhookSecret = "l2_webhook_secret_123456";

  test.beforeAll(async ({ request }) => {
    anonId = await initAnon(request);
    if (!anonId) return;

    pageId = await createPage(request, anonId);
    if (!pageId) return;

    const headers = { "x-anon-user-id": anonId, "Content-Type": "application/json" };
    await request.post(`${BASE}/api/pages/${pageId}/publish`, { headers });

    const formWorkflowRes = await request.post(`${BASE}/api/app/${pageId}/workflows`, {
      headers,
      data: JSON.stringify({
        name: "Form Flow",
        trigger: { type: "form_submitted", formName: "contact" },
        steps: [{ type: "log", message: "Form {{trigger.formName}}" }],
        enabled: true,
      }),
    });
    if (formWorkflowRes.ok()) {
      const data = await formWorkflowRes.json();
      formWorkflowId = data?.workflow?.id ?? "";
    }

    const webhookWorkflowRes = await request.post(`${BASE}/api/app/${pageId}/workflows`, {
      headers,
      data: JSON.stringify({
        name: "Webhook Flow",
        trigger: { type: "webhook", path: "events/order" },
        steps: [{ type: "log", message: "Webhook received" }],
        enabled: true,
      }),
    });
    if (webhookWorkflowRes.ok()) {
      const data = await webhookWorkflowRes.json();
      webhookWorkflowId = data?.workflow?.id ?? "";
    }

    await request.put(`${BASE}/api/app/${pageId}/webhooks/secret`, {
      headers,
      data: JSON.stringify({ secret: webhookSecret }),
    });
  });

  test("app auth register/login/me/password", async ({ request }) => {
    test.skip(!pageId, "page not ready");

    const email = `l2_user_${Date.now()}@example.com`;
    const password = "Password123!";
    const newPassword = "Password456!";

    const registerRes = await request.post(`${BASE}/api/app/${pageId}/auth/register`, {
      data: JSON.stringify({ email, password, display_name: "L2 User" }),
      headers: { "Content-Type": "application/json" },
    });
    expect(registerRes.ok()).toBeTruthy();
    const registerData = await registerRes.json();
    appToken = registerData?.token ?? "";
    appUserId = registerData?.user?.id ?? "";
    expect(appToken).toBeTruthy();

    const loginRes = await request.post(`${BASE}/api/app/${pageId}/auth/login`, {
      data: JSON.stringify({ email, password }),
      headers: { "Content-Type": "application/json" },
    });
    expect(loginRes.ok()).toBeTruthy();

    const meRes = await request.get(`${BASE}/api/app/${pageId}/auth/me`, {
      headers: { authorization: `Bearer ${appToken}` },
    });
    expect(meRes.ok()).toBeTruthy();

    const patchRes = await request.patch(`${BASE}/api/app/${pageId}/auth/me`, {
      headers: { authorization: `Bearer ${appToken}`, "Content-Type": "application/json" },
      data: JSON.stringify({ display_name: "L2 User Updated" }),
    });
    expect(patchRes.ok()).toBeTruthy();

    const changeRes = await request.put(`${BASE}/api/app/${pageId}/auth/me`, {
      headers: { authorization: `Bearer ${appToken}`, "Content-Type": "application/json" },
      data: JSON.stringify({ current_password: password, new_password: newPassword }),
    });
    expect(changeRes.ok()).toBeTruthy();

    const reloginRes = await request.post(`${BASE}/api/app/${pageId}/auth/login`, {
      data: JSON.stringify({ email, password: newPassword }),
      headers: { "Content-Type": "application/json" },
    });
    expect(reloginRes.ok()).toBeTruthy();
  });

  test("app users list via owner", async ({ request }) => {
    test.skip(!pageId || !anonId, "page not ready");
    const res = await request.get(`${BASE}/api/app/${pageId}/auth/users?limit=10`, {
      headers: { "x-anon-user-id": anonId },
    });
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(Array.isArray(data?.users)).toBeTruthy();
  });

  test("secrets CRUD + proxy", async ({ request }) => {
    test.skip(!pageId || !anonId, "page not ready");
    const headers = { "x-anon-user-id": anonId, "Content-Type": "application/json" };

    const createRes = await request.post(`${BASE}/api/app/${pageId}/secrets`, {
      headers,
      data: JSON.stringify({ key: "API_KEY", value: "hello" }),
    });
    expect(createRes.ok()).toBeTruthy();

    const listRes = await request.get(`${BASE}/api/app/${pageId}/secrets`, { headers });
    expect(listRes.ok()).toBeTruthy();

    const proxyRes = await request.post(`${BASE}/api/app/${pageId}/proxy`, {
      headers,
      data: JSON.stringify({
        url: "https://httpbin.org/get?token={{secrets.API_KEY}}",
        method: "GET",
      }),
    });

    if (proxyRes.ok()) {
      const proxyData = await proxyRes.json();
      expect(proxyData?.ok).toBe(true);
      return;
    }

    expect(proxyRes.status()).toBe(502);
    const errorData = await proxyRes.json();
    expect(errorData?.error).toBe("proxy_failed");
  });

  test("plugins CRUD", async ({ request }) => {
    test.skip(!pageId || !anonId, "page not ready");
    const headers = { "x-anon-user-id": anonId, "Content-Type": "application/json" };

    const plugin = {
      id: "l2-plugin",
      name: "L2 Plugin",
      actions: [
        { id: "open-home", label: "Open Home", type: "openUrl", url: "https://example.com" },
      ],
    };

    const addRes = await request.post(`${BASE}/api/app/${pageId}/plugins`, {
      headers,
      data: JSON.stringify({ plugin }),
    });
    expect(addRes.ok()).toBeTruthy();

    const listRes = await request.get(`${BASE}/api/app/${pageId}/plugins`, { headers });
    expect(listRes.ok()).toBeTruthy();
    const listData = await listRes.json();
    const ids = (listData?.plugins ?? []).map((p: { id: string }) => p.id);
    expect(ids).toContain("l2-plugin");

    const updateRes = await request.put(`${BASE}/api/app/${pageId}/plugins`, {
      headers,
      data: JSON.stringify({
        plugins: [
          {
            ...plugin,
            name: "L2 Plugin Updated",
          },
        ],
      }),
    });
    expect(updateRes.ok()).toBeTruthy();

    const updatedRes = await request.get(`${BASE}/api/app/${pageId}/plugins`, { headers });
    expect(updatedRes.ok()).toBeTruthy();
    const updatedData = await updatedRes.json();
    const updated = (updatedData?.plugins ?? []).find((p: { id: string }) => p.id === "l2-plugin");
    expect(updated?.name).toBe("L2 Plugin Updated");

    const delRes = await request.delete(`${BASE}/api/app/${pageId}/plugins?id=l2-plugin`, { headers });
    expect(delRes.ok()).toBeTruthy();
  });

  test("form submit + workflow log", async ({ request }) => {
    test.skip(!pageId || !formWorkflowId, "workflow not ready");

    const formRes = await request.post(`${BASE}/api/app/${pageId}/forms/contact`, {
      headers: { "Content-Type": "application/json" },
      data: JSON.stringify({ message: "Hello L2" }),
    });
    expect(formRes.ok()).toBeTruthy();

    const logsRes = await request.get(`${BASE}/api/app/${pageId}/workflows/logs?workflowId=${formWorkflowId}&limit=10`, {
      headers: { "x-anon-user-id": anonId },
    });
    expect(logsRes.ok()).toBeTruthy();
    const logsData = await logsRes.json();
    expect(Array.isArray(logsData?.logs)).toBeTruthy();
  });

  test("webhook signed trigger + workflow log", async ({ request }) => {
    test.skip(!pageId || !webhookWorkflowId, "workflow not ready");

    const body = JSON.stringify({ orderId: "order-1" });
    const timestamp = Date.now().toString();
    const signature = signWebhook(webhookSecret, timestamp, body);

    const hookRes = await request.post(`${BASE}/api/app/${pageId}/webhooks/events/order`, {
      headers: {
        "Content-Type": "application/json",
        "x-null-timestamp": timestamp,
        "x-null-signature": signature,
      },
      data: body,
    });
    expect(hookRes.ok()).toBeTruthy();
    const hookData = await hookRes.json();
    expect(hookData?.signatureVerified).toBe(true);

    const logsRes = await request.get(`${BASE}/api/app/${pageId}/workflows/logs?workflowId=${webhookWorkflowId}&limit=10`, {
      headers: { "x-anon-user-id": anonId },
    });
    expect(logsRes.ok()).toBeTruthy();
    const logsData = await logsRes.json();
    expect(Array.isArray(logsData?.logs)).toBeTruthy();
  });

  test("upload file", async ({ request }) => {
    test.skip(!pageId || !anonId, "page not ready");

    const uploadRes = await request.post(`${BASE}/api/app/${pageId}/upload`, {
      headers: { "x-anon-user-id": anonId },
      multipart: {
        file: {
          name: "l2.txt",
          mimeType: "text/plain",
          buffer: Buffer.from("hello l2"),
        },
      },
    });
    expect(uploadRes.ok()).toBeTruthy();
    const data = await uploadRes.json();
    expect(data?.ok).toBe(true);
    expect(typeof data?.url).toBe("string");
  });

  test("logout endpoint responds", async ({ request }) => {
    test.skip(!pageId, "page not ready");
    const res = await request.post(`${BASE}/api/app/${pageId}/auth/logout`);
    expect(res.ok()).toBeTruthy();
  });
});
