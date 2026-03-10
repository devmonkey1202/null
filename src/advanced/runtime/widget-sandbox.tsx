"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import type { NodeWidget } from "../doc/scene";
import { makeBridgeResponse, parseBridgeRequest, type BridgeResponse } from "./widget-bridge";

const SANDBOX_TOKENS = new Set([
  "allow-forms",
  "allow-modals",
  "allow-orientation-lock",
  "allow-pointer-lock",
  "allow-popups",
  "allow-popups-to-escape-sandbox",
  "allow-presentation",
  "allow-same-origin",
  "allow-scripts",
  "allow-top-navigation",
  "allow-top-navigation-by-user-activation",
]);

const DEFAULT_SANDBOX = "allow-scripts";
const DEFAULT_TIMEOUT_MS = 10000;
const MAX_TIMEOUT_MS = 60000;
const MIN_TIMEOUT_MS = 500;
const DEFAULT_RATE_LIMIT = 30;
const DEFAULT_CACHE_POLICY = "default";

function normalizeHostList(raw?: string | string[]) {
  if (!raw) return [];
  const list = Array.isArray(raw) ? raw : raw.split(/[,\s]+/);
  return list.map((item) => item.trim()).filter(Boolean);
}

function isHostAllowed(host: string, allowedHosts: string[]) {
  if (!allowedHosts.length) return true;
  return allowedHosts.some((rule) => {
    if (rule === "*") return true;
    if (rule.startsWith("*.") && rule.length > 2) {
      const suffix = rule.slice(2);
      return host === suffix || host.endsWith(`.${suffix}`);
    }
    return host === rule;
  });
}

function getHost(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

function isVersionPinned(url: string, version: string) {
  if (!version) return true;
  try {
    const u = new URL(url);
    const v = u.searchParams.get("v") ?? u.searchParams.get("version");
    if (v === version) return true;
  } catch {
    // ignore
  }
  return url.includes(`@${version}`) || url.includes(`/${version}/`) || url.includes(`-${version}`);
}

function clampTimeout(raw?: number) {
  if (!Number.isFinite(raw)) return DEFAULT_TIMEOUT_MS;
  const value = Math.max(MIN_TIMEOUT_MS, Math.min(MAX_TIMEOUT_MS, Number(raw)));
  return value;
}

function normalizeSandbox(raw?: string) {
  const tokens = (raw ?? "")
    .split(/[\s,]+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .filter((t) => SANDBOX_TOKENS.has(t));
  if (!tokens.includes("allow-scripts")) tokens.push("allow-scripts");
  return tokens.length ? tokens.join(" ") : DEFAULT_SANDBOX;
}

function sanitizeUrl(raw?: string): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function WidgetSandbox({
  widget,
  width,
  height,
  pageId,
  interactive,
}: {
  widget: NodeWidget;
  width: number;
  height: number;
  pageId?: string | null;
  interactive?: boolean;
}) {
  const execution = widget.execution ?? "iframe";
  const [expired, setExpired] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const rateRef = useRef<{ windowStart: number; count: number }>({ windowStart: 0, count: 0 });

  const timeoutMs = clampTimeout(widget.timeoutMs);
  const sandboxAttr = useMemo(() => normalizeSandbox(widget.sandbox), [widget.sandbox]);
  const srcBase = useMemo(() => sanitizeUrl(widget.src), [widget.src]);
  const cachePolicy = widget.cachePolicy ?? DEFAULT_CACHE_POLICY;
  const [cacheBust, setCacheBust] = useState<string | null>(null);
  const src = useMemo(() => {
    if (!srcBase) return null;
    if (cachePolicy !== "no-store" || !cacheBust) return srcBase;
    try {
      const url = new URL(srcBase);
      url.searchParams.set("__null_ts", cacheBust);
      return url.toString();
    } catch {
      return srcBase;
    }
  }, [srcBase, cachePolicy, cacheBust]);
  const allowedActions = useMemo(() => new Set(widget.allowedActions ?? []), [widget.allowedActions]);
  const allowedScopes = useMemo(() => new Set(widget.allowedScopes ?? []), [widget.allowedScopes]);
  const actionScopes = widget.actionScopes ?? {};
  const envAllowedHosts = useMemo(() => normalizeHostList(process.env.NEXT_PUBLIC_WIDGET_ALLOWED_HOSTS), []);
  const allowedHosts = useMemo(
    () => (widget.allowedHosts && widget.allowedHosts.length ? widget.allowedHosts : envAllowedHosts),
    [widget.allowedHosts, envAllowedHosts],
  );
  const allowedOrigin = useMemo(() => {
    if (!src) return "null";
    try {
      return new URL(src).origin;
    } catch {
      return "null";
    }
  }, [src]);
  const maxMessagesPerSec = Math.max(1, Number(widget.maxMessagesPerSec ?? DEFAULT_RATE_LIMIT));
  const srcDoc = widget.html ? String(widget.html) : undefined;
  const policyError = useMemo(() => {
    if (!srcBase) {
      if (cachePolicy === "immutable") return "cache_policy_requires_src";
      return null;
    }
    const host = getHost(srcBase);
    if (host && !isHostAllowed(host, allowedHosts)) return "widget_src_blocked";
    if (cachePolicy === "immutable" && !widget.version) return "version_required";
    if (widget.version && !isVersionPinned(srcBase, widget.version)) return "version_not_pinned";
    return null;
  }, [srcBase, allowedHosts, widget.version, cachePolicy]);

  useEffect(() => {
    if (cachePolicy !== "no-store") {
      if (cacheBust !== null) setCacheBust(null);
      return;
    }
    if (cacheBust !== null) return;
    setCacheBust(`${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`);
  }, [cachePolicy, srcBase, cacheBust]);

  useEffect(() => {
    setExpired(false);
    setError(null);
  }, [execution, widget.src, widget.html, widget.script, widget.version, widget.cachePolicy]);

  useEffect(() => {
    if (!timeoutMs) return;
    const timer = window.setTimeout(() => setExpired(true), timeoutMs);
    return () => window.clearTimeout(timer);
  }, [timeoutMs]);

  useEffect(() => {
    if (execution !== "worker") return;
    if (!widget.script) {
      setError("worker_script_required");
      return;
    }
    try {
      const blob = new Blob([String(widget.script)], { type: "text/javascript" });
      const url = URL.createObjectURL(blob);
      const worker = new Worker(url, { name: "null_widget_worker" });
      workerRef.current = worker;
      worker.onerror = () => setError("worker_error");
      worker.onmessage = (event: MessageEvent) => {
        handleBridgeMessage(event.data, (response) => {
          worker.postMessage(response);
        });
      };
      return () => {
        worker.terminate();
        workerRef.current = null;
        URL.revokeObjectURL(url);
      };
    } catch {
      setError("worker_init_failed");
    }
  }, [execution, widget.script, allowedActions, pageId, maxMessagesPerSec]);

  useEffect(() => {
    if (execution !== "iframe") return;
    if (!iframeRef.current) return;
    const handleMessage = (event: MessageEvent) => {
      const iframeWindow = iframeRef.current?.contentWindow;
      if (!iframeWindow || event.source !== iframeWindow) return;
      if (allowedOrigin !== "*" && event.origin !== allowedOrigin && !(allowedOrigin === "null" && event.origin === "null")) return;
      handleBridgeMessage(event.data, (response) => {
        try {
          iframeWindow.postMessage(response, event.origin === "null" ? "*" : event.origin);
        } catch {
          // ignore
        }
      });
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [execution, allowedOrigin, allowedActions, pageId, maxMessagesPerSec]);

  const handleBridgeMessage = (data: unknown, respond: (response: BridgeResponse) => void) => {
    const request = parseBridgeRequest(data);
    if (!request) return;
    if (!enforceRateLimit()) {
      respond(makeBridgeResponse(request.id, "error", null, { code: "rate_limited" }));
      return;
    }
    if (allowedActions.size && !allowedActions.has(request.action)) {
      respond(makeBridgeResponse(request.id, "error", null, { code: "action_not_allowed" }));
      return;
    }
    const requiredScopes = actionScopes[request.action] ?? [];
    if (requiredScopes.length) {
      const missing = requiredScopes.find((scope) => !allowedScopes.has(scope));
      if (missing) {
        respond(makeBridgeResponse(request.id, "error", null, { code: "permission_denied" }));
        return;
      }
    }

    if (request.action === "ping") {
      respond(makeBridgeResponse(request.id, "ok", { ts: Date.now() }));
      return;
    }
    if (request.action === "get_page_id") {
      if (!pageId) {
        respond(makeBridgeResponse(request.id, "error", null, { code: "page_id_unavailable" }));
        return;
      }
      respond(makeBridgeResponse(request.id, "ok", { pageId }));
      return;
    }
    respond(makeBridgeResponse(request.id, "error", null, { code: "action_not_allowed" }));
  };

  const enforceRateLimit = () => {
    const now = Date.now();
    const windowStart = rateRef.current.windowStart;
    if (now - windowStart >= 1000) {
      rateRef.current.windowStart = now;
      rateRef.current.count = 0;
    }
    if (rateRef.current.count >= maxMessagesPerSec) return false;
    rateRef.current.count += 1;
    return true;
  };

  if (policyError) {
    return (
      <div
        style={{
          width,
          height,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#FEF3C7",
          color: "#92400E",
          fontSize: 12,
        }}
      >
        {policyError}
      </div>
    );
  }

  if (expired) {
    return (
      <div
        style={{
          width,
          height,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#FEE2E2",
          color: "#991B1B",
          fontSize: 12,
        }}
      >
        Sandbox timeout
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{
          width,
          height,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#FEF3C7",
          color: "#92400E",
          fontSize: 12,
        }}
      >
        {error}
      </div>
    );
  }

  if (execution === "worker") {
    return (
      <div
        style={{
          width,
          height,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#E0F2FE",
          color: "#075985",
          fontSize: 12,
        }}
      >
        Worker sandbox running
      </div>
    );
  }

  if (!src && !srcDoc) {
    return (
      <div
        style={{
          width,
          height,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#F3F4F6",
          color: "#6B7280",
          fontSize: 12,
        }}
      >
        Missing widget source
      </div>
    );
  }

  return (
    <iframe
      ref={iframeRef}
      title={widget.title ?? "Widget"}
      sandbox={sandboxAttr}
      src={src ?? undefined}
      srcDoc={!src ? srcDoc : undefined}
      allow={widget.allow}
      referrerPolicy={widget.referrerPolicy}
      onError={() => setError("iframe_load_failed")}
      style={{
        width,
        height,
        border: 0,
        display: "block",
        pointerEvents: interactive === false ? "none" : "auto",
      }}
    />
  );
}
