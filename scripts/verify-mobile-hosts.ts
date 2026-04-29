import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

type JsonRecord = Record<string, unknown>;

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function readJson(path: string): JsonRecord {
  invariant(existsSync(path), `missing_file:${path}`);
  const raw = readFileSync(path, "utf8").replace(/^\uFEFF/, "");
  return JSON.parse(raw) as JsonRecord;
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function validateOptionalString(value: unknown, field: string) {
  invariant(value === undefined || isString(value), `invalid_string:${field}`);
}

function validateOptionalBoolean(value: unknown, field: string) {
  invariant(value === undefined || typeof value === "boolean", `invalid_boolean:${field}`);
}

function validateHostConfig(path: string, hostLabel: string) {
  const config = readJson(path);
  validateOptionalString(config.appId, `${hostLabel}.appId`);
  validateOptionalString(config.appName, `${hostLabel}.appName`);
  validateOptionalString(config.serverUrl, `${hostLabel}.serverUrl`);
  validateOptionalBoolean(config.allowCleartext, `${hostLabel}.allowCleartext`);
  validateOptionalString(config.statusBarStyle, `${hostLabel}.statusBarStyle`);
  validateOptionalString(config.statusBarColor, `${hostLabel}.statusBarColor`);
}

async function validateCapacitorHost(root: string) {
  const dir = resolve(root, "mobile", "capacitor-host");
  const packageJson = readJson(resolve(dir, "package.json"));
  invariant(packageJson.name === "null-capacitor-host", "invalid_package:capacitor-host");
  validateHostConfig(resolve(dir, "host.config.json"), "capacitor");

  const capacitorConfigSource = readFileSync(resolve(dir, "capacitor.config.ts"), "utf8");
  invariant(capacitorConfigSource.includes("appId"), "invalid_capacitor_config:missing_appId");
  invariant(capacitorConfigSource.includes("appName"), "invalid_capacitor_config:missing_appName");
  invariant(capacitorConfigSource.includes('webDir: "www"'), "invalid_capacitor_config:webDir");
  invariant(capacitorConfigSource.includes("server:"), "invalid_capacitor_config:missing_server");
}

function validateReactNativeHost(root: string) {
  const dir = resolve(root, "mobile", "react-native-host");
  const packageJson = readJson(resolve(dir, "package.json"));
  invariant(packageJson.name === "null-react-native-host", "invalid_package:react-native-host");
  validateHostConfig(resolve(dir, "host.config.json"), "react-native");

  const appSource = readFileSync(resolve(dir, "App.tsx"), "utf8");
  invariant(appSource.includes("WebView"), "invalid_react_native_host:missing_webview");
  invariant(appSource.includes("host.config.json"), "invalid_react_native_host:missing_host_config");
  invariant(appSource.includes("APP_URL"), "invalid_react_native_host:missing_app_url");
}

async function main() {
  const root = process.cwd();
  await validateCapacitorHost(root);
  validateReactNativeHost(root);
  console.log("mobile host verification passed");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
