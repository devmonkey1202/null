import { describe, expect, it } from "vitest";

import type { PrototypeAction } from "../src/advanced/doc/scene";
import { buildServiceActionRequest, resolveServiceFieldMeta } from "../src/advanced/runtime/serviceActionRuntime";

describe("service action runtime", () => {
  it("prefers explicit service field binding over inferred labels", () => {
    const meta = resolveServiceFieldMeta(
      {
        field: {
          key: "reservation.notes",
          valueType: "message",
          required: true,
          fallbackValue: "hello",
        },
      },
      "Notes",
      { key: "notes" },
    );

    expect(meta.key).toBe("reservation.notes");
    expect(meta.valueType).toBe("message");
    expect(meta.required).toBe(true);
    expect(meta.fallbackValue).toBe("hello");
  });

  it("builds auth login requests from field bindings", () => {
    const action: Extract<PrototypeAction, { type: "service" }> = {
      type: "service",
      action: "auth.login",
      bindings: [
        { target: "email", source: "field", fieldKey: "email", required: true },
        { target: "password", source: "field", fieldKey: "password", required: true },
      ],
    };

    const request = buildServiceActionRequest({
      pageId: "page_1",
      action,
      fields: { email: "demo@null.local", password: "secret" },
      variables: {},
      globalState: {},
    });

    if ("error" in request) throw new Error(request.error);

    expect(request.endpoint).toBe("/api/app/page_1/auth/login");
    expect(request.body).toEqual({ email: "demo@null.local", password: "secret" });
  });

  it("builds reservation transition requests from explicit state transition metadata", () => {
    const action: Extract<PrototypeAction, { type: "service" }> = {
      type: "service",
      action: "reservation.transition",
      stateTransition: {
        machine: "reservation",
        to: "confirmed",
        recordIdField: "reservationId",
      },
    };

    const request = buildServiceActionRequest({
      pageId: "page_1",
      action,
      fields: { reservationId: "res_1" },
      variables: {},
      globalState: {},
    });

    if ("error" in request) throw new Error(request.error);

    expect(request.endpoint).toBe("/api/app/page_1/domains");
    expect(request.body).toMatchObject({
      action: "reservations.transition",
      reservationId: "res_1",
      eventType: "reservation.confirm",
    });
  });

  it("uses nested policy bindings and reports missing required fields", () => {
    const action: Extract<PrototypeAction, { type: "service" }> = {
      type: "service",
      action: "policy.evaluate",
      bindings: [
        { target: "subjectKey", source: "field", fieldKey: "subjectKey", required: true },
        { target: "context.reservationId", source: "field", fieldKey: "reservationId", required: true },
      ],
    };

    const ok = buildServiceActionRequest({
      pageId: "page_1",
      action,
      fields: { subjectKey: "partner:1", reservationId: "res_2" },
      variables: {},
      globalState: {},
    });

    if ("error" in ok) throw new Error(ok.error);

    expect(ok.endpoint).toBe("/api/app/page_1/policy");
    expect(ok.body).toEqual({
      action: "evaluate",
      subjectKey: "partner:1",
      reservationId: "res_2",
      context: { reservationId: "res_2" },
    });

    const missing = buildServiceActionRequest({
      pageId: "page_1",
      action,
      fields: { subjectKey: "partner:1" },
      variables: {},
      globalState: {},
    });

    expect(missing).toEqual({ error: "required_binding_missing:context.reservationId" });
  });

  it("routes todo.create to the page todo api", () => {
    const action: Extract<PrototypeAction, { type: "service" }> = {
      type: "service",
      action: "todo.create",
      bindings: [{ target: "title", source: "field", fieldKey: "title", required: true }],
    };

    const request = buildServiceActionRequest({
      pageId: "page_1",
      action,
      fields: { title: "Review deployment checklist" },
      variables: {},
      globalState: {},
    });

    if ("error" in request) throw new Error(request.error);

    expect(request.endpoint).toBe("/api/pages/page_1/todos");
    expect(request.method).toBe("POST");
    expect(request.body).toEqual({ title: "Review deployment checklist", sort_order: undefined });
  });

  it("routes note.save to the page note api with PUT", () => {
    const action: Extract<PrototypeAction, { type: "service" }> = {
      type: "service",
      action: "note.save",
      bindings: [{ target: "content", source: "field", fieldKey: "content", required: true }],
    };

    const request = buildServiceActionRequest({
      pageId: "page_1",
      action,
      fields: { content: "Remember to verify the public flow." },
      variables: {},
      globalState: {},
    });

    if ("error" in request) throw new Error(request.error);

    expect(request.endpoint).toBe("/api/pages/page_1/note");
    expect(request.method).toBe("PUT");
    expect(request.body).toEqual({ content: "Remember to verify the public flow." });
  });

  it("routes kanban.column.create to the page kanban api", () => {
    const action: Extract<PrototypeAction, { type: "service" }> = {
      type: "service",
      action: "kanban.column.create",
      bindings: [{ target: "title", source: "field", fieldKey: "title", required: true }],
    };

    const request = buildServiceActionRequest({
      pageId: "page_1",
      action,
      fields: { title: "QA review" },
      variables: {},
      globalState: {},
    });

    if ("error" in request) throw new Error(request.error);

    expect(request.endpoint).toBe("/api/pages/page_1/kanban/columns");
    expect(request.method).toBe("POST");
    expect(request.body).toEqual({ title: "QA review", sort_order: undefined });
  });

  it("routes operations.release.record to the operations api", () => {
    const action: Extract<PrototypeAction, { type: "service" }> = {
      type: "service",
      action: "operations.release.record",
      bindings: [
        { target: "note", source: "field", fieldKey: "note", required: true },
        { target: "deployUrl", source: "field", fieldKey: "deployUrl" },
      ],
    };

    const request = buildServiceActionRequest({
      pageId: "page_1",
      action,
      fields: { note: "Deploy hotfix", deployUrl: "https://app.null.local" },
      variables: {},
      globalState: {},
    });

    if ("error" in request) throw new Error(request.error);

    expect(request.endpoint).toBe("/api/app/page_1/operations");
    expect(request.method).toBe("POST");
    expect(request.body).toEqual({
      action: "release.record",
      note: "Deploy hotfix",
      deployUrl: "https://app.null.local",
      environmentKey: "prod",
      deployed: true,
    });
  });

  it("routes billing.invoice.pay to the billing api", () => {
    const action: Extract<PrototypeAction, { type: "service" }> = {
      type: "service",
      action: "billing.invoice.pay",
      bindings: [
        { target: "invoiceId", source: "variable", variableId: "var_billing_latest_invoice_id", required: true },
        { target: "amountPaidCents", source: "variable", variableId: "var_billing_latest_invoice_total_cents", required: true },
      ],
    };

    const request = buildServiceActionRequest({
      pageId: "page_1",
      action,
      fields: {},
      variables: {
        var_billing_latest_invoice_id: "inv_1",
        var_billing_latest_invoice_total_cents: 12900,
      },
      globalState: {},
    });

    if ("error" in request) throw new Error(request.error);

    expect(request.endpoint).toBe("/api/app/page_1/billing");
    expect(request.method).toBe("POST");
    expect(request.body).toEqual({
      action: "invoice.pay",
      invoiceId: "inv_1",
      amountPaidCents: 12900,
    });
  });
});
