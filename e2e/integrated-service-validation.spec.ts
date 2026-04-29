import { expect, test } from "@playwright/test";

const BASE_URL = process.env.PLAYWRIGHT_TEST_BASE_URL ?? "http://127.0.0.1:3101";
const BASE_ORIGIN = new URL(BASE_URL);
const REQUEST_TIMEOUT_MS = 120_000;

type StarterResponse = {
  ok: true;
  pageId: string;
  publicUrl: string;
  validationUrl: string;
};

type ValidationResponse = {
  ok: true;
  state: {
    consumer: {
      chatMessages: Array<{ id: string; content: string }>;
      notifications: Array<{ id: string; title?: string | null; body?: string | null }>;
      todos: Array<{ id: string; title: string; done: boolean }>;
      note: { id: string; content: string } | null;
    };
    partner: {
      resources: Array<{ id: string }>;
      reservations: Array<{ id: string; title?: string; state?: string }>;
      tickets: Array<{ id: string; title?: string }>;
      ticketMessages: Array<{ id: string; ticket_id?: string; body?: string }>;
      leads: Array<{ id: string; stage_id?: string }>;
      stages: Array<{ id: string; order?: number }>;
    };
    ops: {
      overview: {
        deployment?: {
          currentVersionId?: string | null;
          deployedAt?: string | null;
        };
      };
      billing: {
        accounts?: Array<{ id: string }>;
        invoices?: Array<{ id: string; status?: string }>;
      };
    };
  };
  evaluation?: { decision?: string };
};

type MetaResponse = {
  ok: true;
  page: {
    deployedAt: string | null;
  };
  publicUrl: string;
};

function ownerHeaders(anonId: string) {
  return {
    "x-anon-user-id": anonId,
    "Content-Type": "application/json",
  };
}

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

async function createIntegratedServiceProject(request: import("@playwright/test").APIRequestContext, anonId: string) {
  const response = await request.post("/api/pages/starters/integrated-service", {
    headers: ownerHeaders(anonId),
    timeout: REQUEST_TIMEOUT_MS,
  });
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as StarterResponse;
  expect(body.pageId).toBeTruthy();
  expect(body.publicUrl).toBeTruthy();
  expect(body.validationUrl).toBeTruthy();
  return body;
}

async function fetchValidationState(
  request: import("@playwright/test").APIRequestContext,
  pageId: string,
  anonId: string,
) {
  const response = await request.get(`/api/pages/starters/integrated-service/${pageId}/validate`, {
    headers: ownerHeaders(anonId),
    timeout: REQUEST_TIMEOUT_MS,
  });
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as ValidationResponse;
}

async function postValidationAction(
  request: import("@playwright/test").APIRequestContext,
  pageId: string,
  anonId: string,
  payload: Record<string, unknown>,
) {
  const response = await request.post(`/api/pages/starters/integrated-service/${pageId}/validate`, {
    headers: ownerHeaders(anonId),
    data: JSON.stringify(payload),
    timeout: REQUEST_TIMEOUT_MS,
  });
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as ValidationResponse;
}

async function attachOwnerIdentity(page: import("@playwright/test").Page, anonId: string) {
  await page.context().addCookies([
    {
      name: "anon_user_id",
      value: anonId,
      domain: BASE_ORIGIN.hostname,
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
      secure: BASE_ORIGIN.protocol === "https:",
    },
  ]);
  await page.addInitScript((value) => {
    window.localStorage.setItem("anon_user_id", value);
  }, anonId);
}

test.describe.serial("integrated service validation", () => {
  test.setTimeout(180_000);

  test("consumer flow stays interactive", async ({ request }) => {
    const anonId = `anon_integrated_consumer_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const starter = await createIntegratedServiceProject(request, anonId);
    let state = await fetchValidationState(request, starter.pageId, anonId);

    const chatContent = `E2E consumer chat ${Date.now()}`;
    state = await postValidationAction(request, starter.pageId, anonId, {
      action: "consumer.chat.send",
      content: chatContent,
      senderLabel: "E2E Consumer",
    });
    expect(state.state.consumer.chatMessages.some((message) => message.content === chatContent)).toBe(true);

    state = await postValidationAction(request, starter.pageId, anonId, {
      action: "consumer.todo.create",
      title: "E2E consumer todo",
    });
    const createdTodo = state.state.consumer.todos.find((todo) => todo.title === "E2E consumer todo");
    expect(createdTodo?.id).toBeTruthy();

    state = await postValidationAction(request, starter.pageId, anonId, {
      action: "consumer.todo.toggle",
      todoId: createdTodo?.id,
      done: true,
    });
    expect(state.state.consumer.todos.find((todo) => todo.id === createdTodo?.id)?.done).toBe(true);

    state = await postValidationAction(request, starter.pageId, anonId, {
      action: "consumer.note.save",
      content: "E2E consumer note body",
    });
    expect(state.state.consumer.note?.content).toContain("E2E consumer note body");

    const resourceId = state.state.partner.resources[0]?.id;
    expect(resourceId).toBeTruthy();
    state = await postValidationAction(request, starter.pageId, anonId, {
      action: "consumer.reservation.request",
      resourceId,
      title: "E2E consumer reservation",
      notes: "Created from automated consumer validation",
      customerKey: "member:e2e-consumer",
    });
    expect(state.state.partner.reservations.some((reservation) => reservation.title === "E2E consumer reservation")).toBe(true);

    state = await postValidationAction(request, starter.pageId, anonId, {
      action: "consumer.ticket.create",
      title: "E2E consumer ticket",
      message: "Need help from automated validation",
      requesterKey: "member:e2e-consumer",
    });
    expect(state.state.partner.tickets.some((ticket) => ticket.title === "E2E consumer ticket")).toBe(true);
    expect(state.state.consumer.notifications.length).toBeGreaterThan(0);
  });

  test("partner flow advances reservation, ticket, and CRM state", async ({ request }) => {
    const anonId = `anon_integrated_partner_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const starter = await createIntegratedServiceProject(request, anonId);
    let state = await postValidationAction(request, starter.pageId, anonId, {
      action: "consumer.reservation.request",
      resourceId: (await fetchValidationState(request, starter.pageId, anonId)).state.partner.resources[0]?.id,
      title: "E2E partner reservation",
      notes: "Reservation for partner validation",
      customerKey: "member:e2e-partner",
    });

    state = await postValidationAction(request, starter.pageId, anonId, {
      action: "consumer.ticket.create",
      title: "E2E partner ticket",
      message: "Ticket that will receive a partner reply",
      requesterKey: "member:e2e-partner",
    });

    const reservation = state.state.partner.reservations.find((item) => item.title === "E2E partner reservation");
    expect(reservation?.id).toBeTruthy();
    state = await postValidationAction(request, starter.pageId, anonId, {
      action: "partner.reservation.advance",
      reservationId: reservation?.id,
      eventType: "reservation.confirm",
    });
    expect(state.state.partner.reservations.find((item) => item.id === reservation?.id)?.state).toBe("confirmed");

    const ticket = state.state.partner.tickets.find((item) => item.title === "E2E partner ticket");
    expect(ticket?.id).toBeTruthy();
    state = await postValidationAction(request, starter.pageId, anonId, {
      action: "partner.ticket.reply",
      ticketId: ticket?.id,
      message: "Partner reply from automated validation",
      authorKey: "partner:e2e",
    });
    expect(
      state.state.partner.ticketMessages.some(
        (message) =>
          asString(message.ticket_id) === ticket?.id &&
          asString(message.body).includes("Partner reply from automated validation"),
      ),
    ).toBe(true);

    const lead = state.state.partner.leads[0];
    expect(lead?.id).toBeTruthy();
    const beforeStageId = asString(lead?.stage_id);
    state = await postValidationAction(request, starter.pageId, anonId, {
      action: "partner.crm.advance",
      leadId: lead?.id,
    });
    const afterLead = state.state.partner.leads.find((item) => item.id === lead?.id);
    expect(asString(afterLead?.stage_id)).not.toBe(beforeStageId);
  });

  test("ops state is visible on the deployed public URL", async ({ page, request }) => {
    const anonId = `anon_integrated_ops_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const starter = await createIntegratedServiceProject(request, anonId);

    const metaResponse = await request.get(`/api/pages/starters/integrated-service/${starter.pageId}`, {
      headers: ownerHeaders(anonId),
      timeout: REQUEST_TIMEOUT_MS,
    });
    expect(metaResponse.ok()).toBeTruthy();
    const meta = (await metaResponse.json()) as MetaResponse;
    expect(meta.page.deployedAt).toBeTruthy();

    const releaseNote = `E2E ops release ${Date.now()}`;
    const releaseResponse = await request.post(`/api/app/${starter.pageId}/operations`, {
      headers: ownerHeaders(anonId),
      data: JSON.stringify({
        action: "release.record",
        environmentKey: "prod",
        deployed: true,
        deployUrl: `${BASE_URL}${starter.publicUrl}`,
        note: releaseNote,
      }),
      timeout: REQUEST_TIMEOUT_MS,
    });
    expect(releaseResponse.ok()).toBeTruthy();

    const runbookResponse = await request.post(`/api/app/${starter.pageId}/operations`, {
      headers: ownerHeaders(anonId),
      data: JSON.stringify({ action: "runbook.generate" }),
      timeout: REQUEST_TIMEOUT_MS,
    });
    expect(runbookResponse.ok()).toBeTruthy();

    const billingStateResponse = await request.get(`/api/app/${starter.pageId}/billing`, {
      headers: ownerHeaders(anonId),
      timeout: REQUEST_TIMEOUT_MS,
    });
    expect(billingStateResponse.ok()).toBeTruthy();
    const billingState = (await billingStateResponse.json()) as { accounts?: Array<{ id: string }> };
    const accountId = billingState.accounts?.[0]?.id;
    expect(accountId).toBeTruthy();

    const chargeResponse = await request.post(`/api/app/${starter.pageId}/billing`, {
      headers: ownerHeaders(anonId),
      data: JSON.stringify({
        action: "charge.create",
        accountId,
        description: "E2E ops charge",
        quantity: 1,
        unitAmountCents: 2500,
        currency: "KRW",
        kind: "addon",
      }),
      timeout: REQUEST_TIMEOUT_MS,
    });
    expect(chargeResponse.ok()).toBeTruthy();

    const invoiceGenerateResponse = await request.post(`/api/app/${starter.pageId}/billing`, {
      headers: ownerHeaders(anonId),
      data: JSON.stringify({
        action: "invoice.generate",
        accountId,
      }),
      timeout: REQUEST_TIMEOUT_MS,
    });
    expect(invoiceGenerateResponse.ok()).toBeTruthy();

    const validationState = await fetchValidationState(request, starter.pageId, anonId);
    const latestInvoiceId = validationState.state.ops.billing.invoices?.[0]?.id;
    expect(latestInvoiceId).toBeTruthy();
    expect(validationState.state.ops.overview.deployment?.deployedAt).toBeTruthy();

    const policyResponse = await request.post(`/api/pages/starters/integrated-service/${starter.pageId}/validate`, {
      headers: ownerHeaders(anonId),
      data: JSON.stringify({
        action: "ops.policy.evaluate",
        subjectKey: "ops-e2e@example.com",
        actionKey: "document.publish",
        resourceType: "document",
      }),
      timeout: REQUEST_TIMEOUT_MS,
    });
    expect(policyResponse.ok()).toBeTruthy();
    const policyPayload = (await policyResponse.json()) as ValidationResponse;
    expect(policyPayload.evaluation?.decision).toBeTruthy();

    await attachOwnerIdentity(page, anonId);
    await page.goto(starter.publicUrl);
    await expect(page.locator("body")).toContainText("NULL 통합 검증 서비스");

    await page.getByText("운영 콘솔").first().click();
    await expect(page.locator("body")).toContainText("운영 텔레메트리");
    await expect(page.locator("body")).toContainText("감사 로그");
    await expect(page.locator("body")).toContainText(releaseNote);
    await expect(page.locator("body")).toContainText(latestInvoiceId!);
  });
});
