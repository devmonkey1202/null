import { test, expect, APIRequestContext } from "@playwright/test";

const BASE = process.env.PLAYWRIGHT_TEST_BASE_URL || "http://localhost:3101";

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
      title: "L2 Audit Logs",
      content: { type: "doc", content: [] },
    }),
  });
  if (!res.ok()) return "";
  const body = await res.json();
  return body?.page?.id ?? body?.pageId ?? body?.id ?? "";
}

test.describe.serial("L2 Audit log scenarios", () => {
  let anonId = "";
  let pageId = "";

  test.beforeAll(async ({ request }) => {
    anonId = await initAnon(request);
    if (!anonId) return;

    pageId = await createPage(request, anonId);
    if (!pageId) return;

    const headers = { "x-anon-user-id": anonId, "Content-Type": "application/json" };
    await request.post(`${BASE}/api/pages/${pageId}/publish`, { headers });

    await request.put(`${BASE}/api/app/${pageId}/schema`, {
      headers,
      data: JSON.stringify({
        collections: [
          {
            slug: "items",
            name: "Items",
            strict: true,
            fields: [{ name: "title", type: "string", required: true }],
          },
        ],
      }),
    });
  });

  test("audit logs include key actions", async ({ request }) => {
    test.skip(!pageId || !anonId, "page not ready");
    const headers = { "x-anon-user-id": anonId, "Content-Type": "application/json" };
    const domain = `audit-${Date.now()}.example.com`;

    const email = `audit_user_${Date.now()}@example.com`;
    const password = "Password123!";
    const newPassword = "Password456!";

    const registerRes = await request.post(`${BASE}/api/app/${pageId}/auth/register`, {
      headers: { "Content-Type": "application/json" },
      data: JSON.stringify({ email, password, display_name: "Audit User" }),
    });
    expect(registerRes.ok()).toBeTruthy();
    const registerData = await registerRes.json();
    const appUserId = registerData?.user?.id ?? "";
    const appToken = registerData?.token ?? "";
    expect(appUserId).toBeTruthy();
    expect(appToken).toBeTruthy();

    const loginRes = await request.post(`${BASE}/api/app/${pageId}/auth/login`, {
      headers: { "Content-Type": "application/json" },
      data: JSON.stringify({ email, password }),
    });
    expect(loginRes.ok()).toBeTruthy();

    const profileRes = await request.patch(`${BASE}/api/app/${pageId}/auth/me`, {
      headers: { authorization: `Bearer ${appToken}`, "Content-Type": "application/json" },
      data: JSON.stringify({ display_name: "Audit User v2" }),
    });
    expect(profileRes.ok()).toBeTruthy();

    const passwordRes = await request.put(`${BASE}/api/app/${pageId}/auth/me`, {
      headers: { authorization: `Bearer ${appToken}`, "Content-Type": "application/json" },
      data: JSON.stringify({ current_password: password, new_password: newPassword }),
    });
    expect(passwordRes.ok()).toBeTruthy();

    const logoutRes = await request.post(`${BASE}/api/app/${pageId}/auth/logout`, {
      headers: { cookie: `app_token_${pageId}=${appToken}` },
    });
    expect(logoutRes.ok()).toBeTruthy();

    const roleRes = await request.patch(`${BASE}/api/app/${pageId}/auth/users`, {
      headers,
      data: JSON.stringify({ user_id: appUserId, role: "admin" }),
    });
    expect(roleRes.ok()).toBeTruthy();

    const deleteUserRes = await request.delete(`${BASE}/api/app/${pageId}/auth/users?user_id=${appUserId}`, {
      headers: { "x-anon-user-id": anonId },
    });
    expect(deleteUserRes.ok()).toBeTruthy();

    const createRes = await request.post(`${BASE}/api/app/${pageId}/items`, {
      headers,
      data: JSON.stringify({ title: "Audit Item 1" }),
    });
    expect(createRes.ok()).toBeTruthy();
    const created = await createRes.json();
    const recordId = created?.id ?? "";
    expect(recordId).toBeTruthy();

    const patchRes = await request.patch(`${BASE}/api/app/${pageId}/items/${recordId}`, {
      headers,
      data: JSON.stringify({ title: "Audit Item 1 Updated" }),
    });
    expect(patchRes.ok()).toBeTruthy();

    const recordVersionsRes = await request.get(
      `${BASE}/api/app/${pageId}/items/${recordId}/versions?limit=5`,
      { headers: { "x-anon-user-id": anonId } },
    );
    expect(recordVersionsRes.ok()).toBeTruthy();
    const recordVersions = await recordVersionsRes.json();
    const recordFirst = (recordVersions?.versions ?? [])[recordVersions?.versions?.length - 1];
    if (recordFirst?.id) {
      const restoreRes = await request.post(
        `${BASE}/api/app/${pageId}/items/${recordId}/versions/restore`,
        { headers, data: JSON.stringify({ versionId: recordFirst.id }) },
      );
      expect(restoreRes.ok()).toBeTruthy();
    }

    const delRes = await request.delete(`${BASE}/api/app/${pageId}/items/${recordId}`, { headers });
    expect(delRes.ok()).toBeTruthy();

    const wfCreateRes = await request.post(`${BASE}/api/app/${pageId}/workflows`, {
      headers,
      data: JSON.stringify({
        name: "Audit Flow",
        trigger: { type: "record_created", collection: "items" },
        steps: [{ type: "log", message: "Audit" }],
        enabled: true,
      }),
    });
    expect(wfCreateRes.ok()).toBeTruthy();
    const wfData = await wfCreateRes.json();
    const workflowId = wfData?.workflow?.id ?? "";
    expect(workflowId).toBeTruthy();

    const wfPatchRes = await request.patch(`${BASE}/api/app/${pageId}/workflows`, {
      headers,
      data: JSON.stringify({ id: workflowId, name: "Audit Flow v2" }),
    });
    expect(wfPatchRes.ok()).toBeTruthy();

    const wfVersionsRes = await request.get(
      `${BASE}/api/app/${pageId}/workflows/versions?workflowId=${workflowId}&limit=5`,
      { headers: { "x-anon-user-id": anonId } },
    );
    expect(wfVersionsRes.ok()).toBeTruthy();
    const wfVersions = await wfVersionsRes.json();
    const wfFirst = (wfVersions?.versions ?? [])[wfVersions?.versions?.length - 1];
    if (wfFirst?.id) {
      const wfRestoreRes = await request.post(
        `${BASE}/api/app/${pageId}/workflows/versions/restore`,
        { headers, data: JSON.stringify({ versionId: wfFirst.id }) },
      );
      expect(wfRestoreRes.ok()).toBeTruthy();
    }

    const wfDelRes = await request.delete(`${BASE}/api/app/${pageId}/workflows?id=${workflowId}`, { headers });
    expect(wfDelRes.ok()).toBeTruthy();

    const formRes = await request.post(`${BASE}/api/app/${pageId}/forms/contact`, {
      headers: { "Content-Type": "application/json" },
      data: JSON.stringify({ name: "Audit", message: "Hello" }),
    });
    expect(formRes.ok()).toBeTruthy();

    const webhookRes = await request.post(`${BASE}/api/app/${pageId}/webhooks/events/audit`, {
      headers: { "Content-Type": "application/json" },
      data: JSON.stringify({ event: "audit" }),
    });
    expect(webhookRes.ok()).toBeTruthy();

    const hostingRes = await request.put(`${BASE}/api/app/${pageId}/hosting`, {
      headers,
      data: JSON.stringify({ customDomain: domain, forceHttps: true, redirectWww: false }),
    });
    expect(hostingRes.ok()).toBeTruthy();

    const hostingStatusRes = await request.get(`${BASE}/api/app/${pageId}/hosting/status`, { headers });
    expect(hostingStatusRes.ok()).toBeTruthy();

    const mobileRes = await request.put(`${BASE}/api/app/${pageId}/mobile`, {
      headers,
      data: JSON.stringify({
        appName: "Audit App",
        appId: "com.audit.app",
        serverUrl: BASE,
      }),
    });
    expect(mobileRes.ok()).toBeTruthy();

    const hostConfigRes = await request.get(`${BASE}/api/app/${pageId}/mobile/host-config`, { headers });
    expect(hostConfigRes.ok()).toBeTruthy();

    const mobilePkgRes = await request.get(`${BASE}/api/app/${pageId}/mobile/package?type=capacitor`, { headers });
    expect(mobilePkgRes.ok()).toBeTruthy();

    const webhookSecretRes = await request.put(`${BASE}/api/app/${pageId}/webhooks/secret`, {
      headers,
      data: JSON.stringify({ rotate: true }),
    });
    expect(webhookSecretRes.ok()).toBeTruthy();

    const webhookSecretDelRes = await request.delete(`${BASE}/api/app/${pageId}/webhooks/secret`, { headers });
    expect(webhookSecretDelRes.ok()).toBeTruthy();

    const secretRes = await request.post(`${BASE}/api/app/${pageId}/secrets`, {
      headers,
      data: JSON.stringify({ key: "AUDIT_KEY", value: "secret" }),
    });
    expect(secretRes.ok()).toBeTruthy();

    const secretDelRes = await request.delete(`${BASE}/api/app/${pageId}/secrets?key=AUDIT_KEY`, { headers });
    expect(secretDelRes.ok()).toBeTruthy();

    const plugin = {
      id: "audit-plugin",
      name: "Audit Plugin",
      permissions: ["network"],
      actions: [{ id: "open", label: "Open", type: "openUrl", url: "https://example.com" }],
    };
    const pluginAddRes = await request.post(`${BASE}/api/app/${pageId}/plugins`, {
      headers,
      data: JSON.stringify({ plugin, consent: true }),
    });
    expect(pluginAddRes.ok()).toBeTruthy();

    const pluginDelRes = await request.delete(`${BASE}/api/app/${pageId}/plugins?id=audit-plugin`, { headers });
    expect(pluginDelRes.ok()).toBeTruthy();

    const proxyBlockedRes = await request.post(`${BASE}/api/app/${pageId}/proxy`, {
      headers,
      data: JSON.stringify({ url: "http://127.0.0.1/test", method: "GET" }),
    });
    expect(proxyBlockedRes.status()).toBe(403);

    const uploadRes = await request.post(`${BASE}/api/app/${pageId}/upload`, {
      headers: { "x-anon-user-id": anonId },
      multipart: {
        file: {
          name: "audit.txt",
          mimeType: "text/plain",
          buffer: Buffer.from("audit upload"),
        },
      },
    });
    expect(uploadRes.ok()).toBeTruthy();

    const logsRes = await request.get(`${BASE}/api/app/${pageId}/audit-logs?limit=200`, {
      headers: { "x-anon-user-id": anonId },
    });
    expect(logsRes.ok()).toBeTruthy();
    const logsData = await logsRes.json();
    const actions = (logsData?.logs ?? []).map((l: { action: string }) => l.action);

    expect(actions).toContain("schema_update");
    expect(actions).toContain("app_user_register");
    expect(actions).toContain("app_user_login");
    expect(actions).toContain("app_user_update");
    expect(actions).toContain("app_user_password_change");
    expect(actions).toContain("app_user_logout");
    expect(actions).toContain("app_user_role_set");
    expect(actions).toContain("app_user_delete");
    expect(actions).toContain("record_create");
    expect(actions).toContain("record_update");
    expect(actions).toContain("record_restore");
    expect(actions).toContain("record_delete");
    expect(actions).toContain("workflow_create");
    expect(actions).toContain("workflow_update");
    expect(actions).toContain("workflow_restore");
    expect(actions).toContain("workflow_delete");
    expect(actions).toContain("form_submit");
    expect(actions).toContain("webhook_received");
    expect(actions).toContain("hosting_update");
    expect(actions).toContain("hosting_status_check");
    expect(actions).toContain("mobile_settings_update");
    expect(actions).toContain("mobile_host_config");
    expect(actions).toContain("mobile_package");
    expect(actions).toContain("webhook_secret_set");
    expect(actions).toContain("webhook_secret_delete");
    expect(actions).toContain("secret_set");
    expect(actions).toContain("secret_delete");
    expect(actions).toContain("plugin_add");
    expect(actions).toContain("plugin_remove");
    expect(actions).toContain("proxy_blocked");
    expect(actions).toContain("upload_file");
  });
});
