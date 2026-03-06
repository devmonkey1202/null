import http from "http";
import next from "next";
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

const hostname = process.env.HOSTNAME ?? "0.0.0.0";
const port = Number(process.env.PORT ?? 3000);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

async function main() {
  // Helpful startup logs (won't affect product UX)
  console.log(`[server] RUN_MODE=${process.env.RUN_MODE ?? "(unset)"} -> ${runMode}`);
  console.log(`[server] NODE_ENV=${process.env.NODE_ENV ?? "(unset)"} dev=${dev}`);
  console.log(`[server] bind http://${hostname}:${port}`);
  registerSystemLogHandlers();
  logSystemEvent("info", "server_start", { runMode, dev, hostname, port }, "server");

  await app.prepare();

  const handleRequest = async (req: http.IncomingMessage, res: http.ServerResponse) => {
    const parsedUrl = parse(req.url ?? "/", true);
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
