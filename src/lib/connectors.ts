import { prisma } from "@/lib/db";
import { randomUUID } from "crypto";
import { z } from "zod";

export type ConnectorAuthType = "oauth" | "apiKey" | "custom";

export type ConnectorTemplate = {
  id: string;
  name: string;
  type: ConnectorAuthType;
  description?: string;
  authorizeUrl?: string;
  tokenUrl?: string;
  scopes?: string[];
  sync?: {
    supportsPull: boolean;
    supportsPush: boolean;
    defaultCron?: string;
    endpoint?: string;
  };
  schema?: {
    source: string;
    defaultMappings: Array<{ source: string; target: string; type: string }>;
  };
};

export type ConnectorSchedule = {
  enabled: boolean;
  cron: string;
};

export type ConnectorMapping = {
  source: string;
  target: string;
  type: string;
  transform?: string;
};

export type ConnectorConfig = {
  id: string;
  templateId: string;
  name: string;
  status: "active" | "disabled";
  schedule?: ConnectorSchedule;
  mapping?: ConnectorMapping[];
  config?: {
    baseUrl?: string;
    secretKeyRef?: string;
    oauth?: {
      clientId?: string;
      scopes?: string[];
    };
  };
  lastSyncedAt?: string | null;
  lastSyncStatus?: "success" | "error" | null;
};

const CONNECTOR_SETTING_KEY = "app_connectors";

const TEMPLATE_CATALOG: ConnectorTemplate[] = [
  {
    id: "github-issues",
    name: "GitHub Issues",
    type: "oauth",
    description: "Sync issues from GitHub repositories.",
    authorizeUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    scopes: ["repo", "read:org"],
    sync: {
      supportsPull: true,
      supportsPush: false,
      defaultCron: "*/15 * * * *",
      endpoint: "https://api.github.com/repos/{owner}/{repo}/issues",
    },
    schema: {
      source: "issue",
      defaultMappings: [
        { source: "title", target: "title", type: "string" },
        { source: "body", target: "body", type: "string" },
        { source: "state", target: "status", type: "string" },
      ],
    },
  },
  {
    id: "notion-database",
    name: "Notion Database",
    type: "oauth",
    description: "Sync pages from Notion databases.",
    authorizeUrl: "https://api.notion.com/v1/oauth/authorize",
    tokenUrl: "https://api.notion.com/v1/oauth/token",
    scopes: ["databases.read", "pages.read"],
    sync: {
      supportsPull: true,
      supportsPush: false,
      defaultCron: "*/30 * * * *",
      endpoint: "https://api.notion.com/v1/databases/{databaseId}/query",
    },
    schema: {
      source: "page",
      defaultMappings: [
        { source: "properties.Name", target: "title", type: "string" },
        { source: "properties.Status", target: "status", type: "string" },
      ],
    },
  },
  {
    id: "custom-webhook",
    name: "Custom Webhook",
    type: "apiKey",
    description: "Pull data from a custom API endpoint.",
    sync: {
      supportsPull: true,
      supportsPush: false,
      defaultCron: "*/10 * * * *",
    },
    schema: {
      source: "record",
      defaultMappings: [
        { source: "id", target: "external_id", type: "string" },
        { source: "payload", target: "payload", type: "json" },
      ],
    },
  },
];

const mappingSchema = z.object({
  source: z.string().min(1),
  target: z.string().min(1),
  type: z.string().min(1),
  transform: z.string().optional(),
});

const scheduleSchema = z.object({
  enabled: z.boolean(),
  cron: z.string().min(1),
});

const connectorSchema = z.object({
  id: z.string().min(1).optional(),
  templateId: z.string().min(1),
  name: z.string().min(1),
  status: z.enum(["active", "disabled"]).optional(),
  schedule: scheduleSchema.optional(),
  mapping: z.array(mappingSchema).optional(),
  config: z.object({
    baseUrl: z.string().url().optional(),
    secretKeyRef: z.string().min(1).optional(),
    oauth: z.object({
      clientId: z.string().min(1).optional(),
      scopes: z.array(z.string()).optional(),
    }).optional(),
  }).optional(),
});

export function listConnectorTemplates() {
  return TEMPLATE_CATALOG;
}

export function getConnectorTemplate(id: string) {
  return TEMPLATE_CATALOG.find((t) => t.id === id) ?? null;
}

export function validateConnectorConfig(input: unknown) {
  return connectorSchema.safeParse(input);
}

function normalizeConnector(input: unknown): ConnectorConfig | null {
  const parsed = connectorSchema.safeParse(input);
  if (!parsed.success) return null;
  const data = parsed.data;
  const template = getConnectorTemplate(data.templateId);
  if (!template) return null;
  const id = data.id ?? `conn_${randomUUID()}`;
  return {
    id,
    templateId: data.templateId,
    name: data.name,
    status: data.status ?? "active",
    schedule: data.schedule,
    mapping: data.mapping,
    config: data.config,
  };
}

function normalizeConnectorList(raw: unknown): ConnectorConfig[] {
  const list = Array.isArray(raw) ? raw : [];
  const map = new Map<string, ConnectorConfig>();
  for (const item of list) {
    const normalized = normalizeConnector(item);
    if (normalized) map.set(normalized.id, normalized);
  }
  return Array.from(map.values());
}

export async function getConnectors(pageId: string) {
  const row = await prisma.pageSetting.findUnique({
    where: { page_id_key: { page_id: pageId, key: CONNECTOR_SETTING_KEY } },
    select: { value: true },
  });
  return normalizeConnectorList(row?.value ?? []);
}

export async function setConnectors(pageId: string, connectors: ConnectorConfig[]) {
  const normalized = normalizeConnectorList(connectors);
  await prisma.pageSetting.upsert({
    where: { page_id_key: { page_id: pageId, key: CONNECTOR_SETTING_KEY } },
    update: { value: normalized as unknown as object },
    create: { page_id: pageId, key: CONNECTOR_SETTING_KEY, value: normalized as unknown as object },
  });
  return normalized;
}

export async function addConnector(pageId: string, connector: ConnectorConfig) {
  const normalized = normalizeConnector(connector);
  if (!normalized) return null;
  const current = await getConnectors(pageId);
  const map = new Map(current.map((c) => [c.id, c]));
  map.set(normalized.id, normalized);
  await setConnectors(pageId, Array.from(map.values()));
  return normalized;
}

export async function updateConnector(pageId: string, connector: ConnectorConfig) {
  if (!connector.id) return null;
  const current = await getConnectors(pageId);
  const map = new Map(current.map((c) => [c.id, c]));
  if (!map.has(connector.id)) return null;
  const normalized = normalizeConnector(connector);
  if (!normalized) return null;
  map.set(normalized.id, { ...map.get(normalized.id)!, ...normalized });
  await setConnectors(pageId, Array.from(map.values()));
  return map.get(normalized.id) ?? null;
}

export async function removeConnector(pageId: string, connectorId: string) {
  const current = await getConnectors(pageId);
  const next = current.filter((c) => c.id !== connectorId);
  await setConnectors(pageId, next);
  return next;
}
