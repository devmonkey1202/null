import http from "http";
import { AsyncLocalStorage } from "node:async_hooks";
import { createReadStream, existsSync, statSync } from "fs";
import path from "path";
import { loadEnvConfig } from "@next/env";
import { parse } from "url";
import { initSocket } from "./src/server/socket";
import { startEventSyncToPg } from "./src/server/eventSync";
import { startInternalWorkflowScheduler } from "./src/server/cron-scheduler";
import { startBackgroundWorker } from "./src/server/background-worker";
import { prisma } from "./src/lib/db";
import { resolveDomainRoute } from "./src/server/domain-router";
import { registerSystemLogHandlers, logSystemEvent } from "./src/lib/system-log";

/**
 * Runtime mode control for the custom Next.js server.
 *
 * RUN_MODE:
 * - dev (default): run without a production build
 * - prod: requires `next build`
 */

type RunMode = "dev" | "prod";

loadEnvConfig(process.cwd());

function resolveRunMode(): RunMode {
  const rm = (process.env.RUN_MODE ?? "").toLowerCase();
  if (rm === "prod" || rm === "production") return "prod";
  if (rm === "dev" || rm === "development") return "dev";

  // fallback: NODE_ENV 기준
  const nodeEnv = (process.env.NODE_ENV ?? "").toLowerCase();
  if (nodeEnv === "production") return "prod";
  return "dev";
}

const runMode = resolveRunMode();
const dev = runMode === "dev";
const nextDistDir = process.env.NULL_NEXT_DIST_DIR?.trim() || ".next";

const hostname = process.env.HOSTNAME ?? "0.0.0.0";
const port = Number(process.env.PORT ?? 3000);

type AsyncLocalStorageGlobal = typeof globalThis & {
  AsyncLocalStorage?: typeof AsyncLocalStorage;
};

const runtimeGlobal = globalThis as AsyncLocalStorageGlobal;
if (!runtimeGlobal.AsyncLocalStorage) {
  runtimeGlobal.AsyncLocalStorage = AsyncLocalStorage;
}

function contentTypeForStaticAsset(assetPath: string) {
  const ext = path.extname(assetPath).toLowerCase();
  switch (ext) {
    case ".css":
      return "text/css; charset=UTF-8";
    case ".js":
      return "application/javascript; charset=UTF-8";
    case ".json":
      return "application/json; charset=UTF-8";
    case ".map":
      return "application/json; charset=UTF-8";
    case ".woff2":
      return "font/woff2";
    case ".woff":
      return "font/woff";
    case ".ttf":
      return "font/ttf";
    case ".svg":
      return "image/svg+xml";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    default:
      return "application/octet-stream";
  }
}

function tryServeNextStaticAsset(
  parsedUrl: ReturnType<typeof parse>,
  res: http.ServerResponse,
): boolean {
  if (dev) return false;

  const pathname = parsedUrl.pathname ?? "/";
  if (!pathname.startsWith("/_next/static/")) return false;

  const staticRoot = path.join(process.cwd(), nextDistDir, "static");
  const relativeAssetPath = pathname.replace(/^\/_next\/static\//, "");
  const candidatePath = path.join(staticRoot, ...relativeAssetPath.split("/"));
  const normalizedRoot = path.normalize(staticRoot);
  const normalizedCandidate = path.normalize(candidatePath);

  if (!normalizedCandidate.startsWith(normalizedRoot)) {
    res.statusCode = 400;
    res.end("invalid_static_asset_path");
    return true;
  }

  if (!existsSync(normalizedCandidate)) return false;

  const stat = statSync(normalizedCandidate);
  if (!stat.isFile()) return false;

  res.statusCode = 200;
  res.setHeader("Content-Type", contentTypeForStaticAsset(normalizedCandidate));
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  res.setHeader("Content-Length", stat.size);
  createReadStream(normalizedCandidate).pipe(res);
  return true;
}

async function main() {
  // Helpful startup logs (won't affect product UX)
  console.log(`[server] RUN_MODE=${process.env.RUN_MODE ?? "(unset)"} -> ${runMode}`);
  console.log(`[server] NODE_ENV=${process.env.NODE_ENV ?? "(unset)"} dev=${dev}`);
  console.log(`[server] bind http://${hostname}:${port}`);
  registerSystemLogHandlers();
  logSystemEvent("info", "server_start", { runMode, dev, hostname, port }, "server");

  const { default: next } = await import("next");
  const app = next({ dev, hostname, port, conf: { distDir: nextDistDir } });
  const handle = app.getRequestHandler();

  await app.prepare();

  const handleRequest = async (req: http.IncomingMessage, res: http.ServerResponse) => {
    const parsedUrl = parse(req.url ?? "/", true);
    if (tryServeNextStaticAsset(parsedUrl, res)) {
      return;
    }
    const decision = await resolveDomainRoute(req, parsedUrl);
    if (decision?.type === "redirect") {
      res.statusCode = decision.status;
      res.setHeader("Location", decision.location);
      res.end();
      return;
    }
    if (decision?.type === "rewrite") {
      const search = parsedUrl.search ?? "";
      const nextUrl = parse(`${decision.url}${search}`, true);
      handle(req, res, nextUrl);
      return;
    }
    handle(req, res, parsedUrl);
  };

  const server = http.createServer((req, res) => {
    void handleRequest(req, res);
  });

  initSocket(server);
  startEventSyncToPg(prisma);
  startInternalWorkflowScheduler();
  startBackgroundWorker();

  server.listen(port, hostname, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
    logSystemEvent("info", "server_ready", { hostname, port }, "server");
  });
}

main().catch((error) => {
  console.error("Failed to start server", error);
  process.exit(1);
});
