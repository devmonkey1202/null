import { readFileSync } from "node:fs";
import { resolve } from "node:path";

type HostConfig = {
  appId?: string;
  appName?: string;
  serverUrl?: string;
  allowCleartext?: boolean;
  statusBarStyle?: "default" | "light" | "dark";
  statusBarColor?: string;
};

function loadHostConfig(): HostConfig {
  try {
    const raw = readFileSync(resolve(__dirname, "host.config.json"), "utf8");
    return JSON.parse(raw) as HostConfig;
  } catch {
    return {};
  }
}

const host = loadHostConfig();
const serverUrl =
  typeof host.serverUrl === "string" && host.serverUrl.trim()
    ? host.serverUrl.trim()
    : "https://your-null-host.example";
const allowCleartext =
  typeof host.allowCleartext === "boolean" ? host.allowCleartext : serverUrl.startsWith("http://");

const config = {
  appId: host.appId?.trim() || "com.null.host",
  appName: host.appName?.trim() || "NULL Host",
  webDir: "www",
  server: {
    url: serverUrl,
    cleartext: allowCleartext,
  },
  ...(host.statusBarStyle || host.statusBarColor
    ? {
        plugins: {
          StatusBar: {
            style: host.statusBarStyle ?? "default",
            backgroundColor: host.statusBarColor || undefined,
          },
        },
      }
    : {}),
};

export default config;
