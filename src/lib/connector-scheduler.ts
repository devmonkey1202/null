import { prisma } from "@/lib/db";
import { matchesCron } from "@/lib/cron";
import { getConnectorTemplate, type ConnectorConfig, type ConnectorTemplate } from "@/lib/connectors";
import { executeServiceAction } from "@/lib/service-runtime";

type SchedulerDeps = {
  db?: typeof prisma;
};

type SyncResult = {
  connectorId: string;
  status: "success" | "error";
  message?: string;
};

const CONNECTOR_SETTING_KEY = "app_connectors";

export function isConnectorDue(connector: ConnectorConfig, now: Date) {
  if (!connector.schedule?.enabled || !connector.schedule.cron) return false;
  const match = matchesCron(connector.schedule.cron, now);
  if (!match.ok || !match.matches) return false;
  if (!connector.lastSyncedAt) return true;
  const last = new Date(connector.lastSyncedAt).getTime();
  const nowMs = now.getTime();
  return nowMs - last >= 60_000;
}

async function performSync(
  pageId: string,
  connector: ConnectorConfig,
  template: ConnectorTemplate | null,
): Promise<SyncResult> {
  if (!template?.sync?.endpoint || !connector.config?.baseUrl) {
    return { connectorId: connector.id, status: "success" };
  }
  const endpoint = template.sync.endpoint.replace("{baseUrl}", connector.config.baseUrl);
  try {
    const result = await executeServiceAction(
      {
        type: "http_request",
        url: endpoint,
        method: "GET",
        timeoutMs: 15_000,
        retries: 1,
        retryOn: [429, 500, 502, 503, 504],
      },
      {
        pageId,
        metadata: { connectorId: connector.id, templateId: template.id },
      },
    );
    if (!result.ok) {
      return { connectorId: connector.id, status: "error", message: result.error ?? "sync_failed" };
    }
    return { connectorId: connector.id, status: "success" };
  } catch (err) {
    return { connectorId: connector.id, status: "error", message: err instanceof Error ? err.message : String(err) };
  }
}

export async function runConnectorSchedules(now: Date, deps: SchedulerDeps = {}) {
  const db = deps.db ?? prisma;
  const rows = await db.pageSetting.findMany({
    where: { key: CONNECTOR_SETTING_KEY },
    select: { page_id: true, value: true },
  });
  const results: Array<{ pageId: string; results: SyncResult[] }> = [];

  for (const row of rows) {
    const list = Array.isArray(row.value) ? (row.value as ConnectorConfig[]) : [];
    let changed = false;
    const pageResults: SyncResult[] = [];
    const nextList = [];
    for (const connector of list) {
      const template = getConnectorTemplate(connector.templateId);
      if (isConnectorDue(connector, now)) {
        const result = await performSync(row.page_id, connector, template);
        pageResults.push(result);
        connector.lastSyncedAt = now.toISOString();
        connector.lastSyncStatus = result.status;
        changed = true;
      }
      nextList.push(connector);
    }

    if (changed) {
      await db.pageSetting.upsert({
        where: { page_id_key: { page_id: row.page_id, key: CONNECTOR_SETTING_KEY } },
        update: { value: nextList as unknown as object },
        create: { page_id: row.page_id, key: CONNECTOR_SETTING_KEY, value: nextList as unknown as object },
      });
    }
    if (pageResults.length) {
      results.push({ pageId: row.page_id, results: pageResults });
    }
  }

  return results;
}

export async function runConnectorSyncForPage(pageId: string, deps: SchedulerDeps = {}) {
  const db = deps.db ?? prisma;
  const row = await db.pageSetting.findUnique({
    where: { page_id_key: { page_id: pageId, key: CONNECTOR_SETTING_KEY } },
    select: { value: true },
  });
  const list = Array.isArray(row?.value) ? (row?.value as ConnectorConfig[]) : [];
  const now = new Date();
  let changed = false;
  const results: SyncResult[] = [];
  const nextList = [];

  for (const connector of list) {
    const template = getConnectorTemplate(connector.templateId);
    const result = await performSync(pageId, connector, template);
    connector.lastSyncedAt = now.toISOString();
    connector.lastSyncStatus = result.status;
    results.push(result);
    changed = true;
    nextList.push(connector);
  }

  if (changed) {
    await db.pageSetting.upsert({
      where: { page_id_key: { page_id: pageId, key: CONNECTOR_SETTING_KEY } },
      update: { value: nextList as unknown as object },
      create: { page_id: pageId, key: CONNECTOR_SETTING_KEY, value: nextList as unknown as object },
    });
  }

  return results;
}
