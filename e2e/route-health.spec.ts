import { test, expect } from "@playwright/test";
import path from "path";
import fs from "fs";

type RouteEntry = { kind: "page" | "api"; route: string };

const ROOT = process.cwd();
const APP_DIR = path.join(ROOT, "src", "app");
const API_DIR = path.join(APP_DIR, "api");

const API_SKIP_PREFIXES = ["/api/cron/", "/api/admin/"];

function walk(dir: string, matcher: RegExp): string[] {
  const out: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(full, matcher));
    } else if (matcher.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

function normalizeRoute(filePath: string, root: string): string {
  const relative = path.relative(root, filePath).replace(/\\/g, "/");
  const withoutFile = relative.replace(/\/page\.tsx$/, "").replace(/\/route\.ts$/, "");
  if (!withoutFile) return "/";
  const parts = withoutFile
    .split("/")
    .filter((segment) => !/^\(.*\)$/.test(segment))
    .map((segment) => segment.replace(/\[(\.\.\.)?[^/]+\]/g, "test"));
  return `/${parts.join("/")}`;
}

function collectRoutes(): RouteEntry[] {
  const pageFiles = walk(APP_DIR, /^page\.tsx$/).filter((file) => !file.includes(`${path.sep}api${path.sep}`));
  const apiFiles = walk(API_DIR, /^route\.ts$/);
  const pages = pageFiles.map((file) => ({ kind: "page" as const, route: normalizeRoute(file, APP_DIR) }));
  const apis = apiFiles.map((file) => ({ kind: "api" as const, route: `/api${normalizeRoute(file, API_DIR)}` }));
  return [...pages, ...apis];
}

const ROUTES = collectRoutes();

test.describe("route health", () => {
  test.describe.configure({ mode: "serial" });
  const REQUEST_TIMEOUT_MS = 20_000;

  for (const entry of ROUTES) {
    const title = `${entry.kind.toUpperCase()} ${entry.route}`;
    test(title, async ({ request }) => {
      if (entry.kind === "api" && API_SKIP_PREFIXES.some((prefix) => entry.route.startsWith(prefix))) {
        test.skip(true, "destructive admin/cron endpoint skipped");
      }
      const res = await request.get(entry.route, { timeout: REQUEST_TIMEOUT_MS });
      const status = res.status();
      if (entry.kind === "api" && status === 405) return;
      expect(status, `unexpected status for ${entry.route}`).toBeLessThan(500);
    });
  }
});
