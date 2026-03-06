// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import ErrorBoundary from "@/components/error-boundary";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function setupFetch() {
  const mockFetch = vi.fn().mockResolvedValue({ ok: true });
  Object.defineProperty(globalThis, "fetch", {
    value: mockFetch,
    writable: true,
  });
}

describe("error boundary", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    setupFetch();
  });

  it("renders fallback then recovers on reset", async () => {
    let shouldThrow = true;
    const Flaky = () => {
      if (shouldThrow) throw new Error("boom");
      return <div>ok</div>;
    };

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await act(async () => {
      root.render(
        <ErrorBoundary>
          <Flaky />
        </ErrorBoundary>
      );
    });

    expect(container.textContent).toContain("문제가 발생했습니다.");

    const button = container.querySelector("button");
    expect(button).toBeTruthy();

    shouldThrow = false;
    await act(async () => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container.textContent).toContain("ok");

    errorSpy.mockRestore();
  });
});
