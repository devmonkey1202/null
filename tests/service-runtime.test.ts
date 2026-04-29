import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "crypto";

const prismaMock = vi.hoisted(() => ({
  appSecret: {
    findMany: vi.fn(),
  },
}));

const executeServerlessNodeMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({ prisma: prismaMock }));
vi.mock("@/lib/serverless-executor", () => ({
  executeServerlessNode: executeServerlessNodeMock,
}));

import {
  executeBackgroundJob,
  executeServiceAction,
  parseServiceWebhookJson,
  registerBackgroundJobHandler,
  serviceRuntimeErrorJson,
  verifyServiceWebhookSignature,
} from "@/lib/service-runtime";

describe("service runtime", () => {
  beforeEach(() => {
    prismaMock.appSecret.findMany.mockReset();
    executeServerlessNodeMock.mockReset();
    vi.unstubAllGlobals();
  });

  it("blocks localhost targets by default", async () => {
    const result = await executeServiceAction({
      type: "http_request",
      url: "http://localhost:3000/internal",
    });

    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("blocked_host");
  });

  it("resolves secrets, injects idempotency key, and retries retryable responses", async () => {
    prismaMock.appSecret.findMany.mockResolvedValue([{ key: "token", value: "secret-token" }]);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "busy" }), {
          status: 503,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await executeServiceAction(
      {
        type: "http_request",
        url: "https://api.example.com/items?token={{secrets.token}}",
        method: "POST",
        headers: { Authorization: "Bearer {{secrets.token}}" },
        body: { message: "{{secrets.token}}" },
        retries: 1,
        retryOn: [503],
      },
      {
        pageId: "page_1",
        idempotencyKey: "idem_123",
      },
    );

    expect(result.ok).toBe(true);
    expect(result.statusCode).toBe(200);
    expect(result.data).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const firstCall = fetchMock.mock.calls[0];
    expect(firstCall?.[0]).toBe("https://api.example.com/items?token=secret-token");
    expect(firstCall?.[1]).toMatchObject({
      method: "POST",
      headers: expect.objectContaining({
        Authorization: "Bearer secret-token",
        "Idempotency-Key": "idem_123",
      }),
    });
    expect(String(firstCall?.[1]?.body)).toContain("secret-token");
  });

  it("wraps serverless execution in the common runtime result format", async () => {
    executeServerlessNodeMock.mockResolvedValue({
      ok: true,
      result: { answer: 42 },
      logs: ["done"],
    });

    const result = await executeServiceAction(
      {
        type: "serverless_node",
        code: "return 42;",
        inputs: { x: 1 },
      },
      {
        pageId: "page_1",
        variables: { a: 1 },
        triggerData: { b: 2 },
      },
    );

    expect(result.ok).toBe(true);
    expect(result.kind).toBe("serverless_node");
    expect(result.data).toEqual({ answer: 42 });
    expect(result.logs).toEqual(["done"]);
  });

  it("executes registered background job handlers", async () => {
    registerBackgroundJobHandler("unit-test-job", async (job) => ({
      ok: true,
      kind: "background_job",
      logs: [`done:${job.id}`],
      meta: { pageId: job.pageId },
    }));

    const result = await executeBackgroundJob({
      id: "job_1",
      type: "unit-test-job",
      payload: { sample: true },
      pageId: "page_1",
    });

    expect(result.ok).toBe(true);
    expect(result.logs).toEqual(["done:job_1"]);
    expect(result.meta).toEqual({ pageId: "page_1" });
  });

  it("returns a structured error for unknown background job types", async () => {
    const result = await executeBackgroundJob({
      id: "job_2",
      type: "missing-handler",
      payload: null,
      pageId: null,
    });

    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("unknown_job_type");
  });

  it("verifies webhook signatures and parses webhook payloads", async () => {
    const timestamp = "1711111111";
    const rawBody = JSON.stringify({ ok: true });
    const signature = createHmac("sha256", "secret").update(`${timestamp}.${rawBody}`).digest("hex");

    const verified = verifyServiceWebhookSignature({
      secret: "secret",
      timestamp,
      rawBody,
      signature,
      now: 1711111111 * 1000,
    });
    expect(verified).toEqual({ ok: true });
    expect(parseServiceWebhookJson(rawBody)).toEqual({ ok: true });
    expect(parseServiceWebhookJson("not-json")).toBeNull();
  });

  it("wraps runtime api errors in a stable envelope", async () => {
    const response = serviceRuntimeErrorJson("proxy_failed", 502, {
      runtimeKind: "http_request",
      stage: "proxy.execute",
      extra: { detail: "boom" },
    });
    const payload = await response.json();

    expect(payload.ok).toBe(false);
    expect(payload.error).toBe("proxy_failed");
    expect(payload.runtime).toBe(true);
    expect(payload.runtime_kind).toBe("http_request");
    expect(payload.runtime_stage).toBe("proxy.execute");
    expect(payload.detail).toBe("boom");
  });
});
