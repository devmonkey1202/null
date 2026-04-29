import { hydrateDoc, serializeDoc, type Doc, type SerializableDoc } from "@/advanced/doc/scene";
import { buildEditorDocOperation, type EditorDocOperation } from "@/lib/collab";

export type ExternalCollabEvent = {
  adapterId: string;
  snapshot: SerializableDoc;
  ts?: number;
  opId?: string;
  source?: "remote" | "sync";
};

export type ExternalCollabPushInput = {
  pageId: string;
  snapshot: SerializableDoc;
  operation: EditorDocOperation;
  origin: "local" | "recovery";
};

export type ExternalCollabConnectInput = {
  pageId: string;
  initialSnapshot: SerializableDoc;
};

export type ExternalCollabAdapter = {
  id: string;
  connect?(input: ExternalCollabConnectInput): void | Promise<void>;
  disconnect?(): void | Promise<void>;
  pullSnapshot?(): SerializableDoc | null | Promise<SerializableDoc | null>;
  pushSnapshot?(input: ExternalCollabPushInput): void | Promise<void>;
  subscribe?(listener: (event: ExternalCollabEvent) => void): (() => void) | void;
};

export type ExternalCollabAdapterFactory = (input: { pageId: string }) => ExternalCollabAdapter | null;

const externalCollabFactories = new Map<string, ExternalCollabAdapterFactory>();

declare global {
  interface Window {
    __NULL_EXTERNAL_COLLAB_ADAPTERS__?: Record<string, ExternalCollabAdapterFactory>;
  }
}

export function registerExternalCollabAdapter(name: string, factory: ExternalCollabAdapterFactory) {
  externalCollabFactories.set(name, factory);
}

export function unregisterExternalCollabAdapter(name: string) {
  externalCollabFactories.delete(name);
}

export function getRegisteredExternalCollabAdapterNames() {
  const names = new Set<string>(externalCollabFactories.keys());
  if (typeof window !== "undefined") {
    Object.keys(window.__NULL_EXTERNAL_COLLAB_ADAPTERS__ ?? {}).forEach((name) => names.add(name));
  }
  return Array.from(names).sort();
}

export function createExternalCollabAdapter(name: string, input: { pageId: string }) {
  const localFactory = externalCollabFactories.get(name);
  if (localFactory) return localFactory(input);
  if (typeof window !== "undefined") {
    const browserFactory = window.__NULL_EXTERNAL_COLLAB_ADAPTERS__?.[name];
    if (browserFactory) return browserFactory(input);
  }
  return null;
}

export function getConfiguredExternalCollabAdapterName() {
  const raw = process.env.NEXT_PUBLIC_NULL_EXTERNAL_COLLAB_ADAPTER;
  const value = raw?.trim();
  return value ? value : null;
}

export function buildExternalCollabOperation(event: ExternalCollabEvent) {
  return buildEditorDocOperation({
    doc: event.snapshot,
    ts: event.ts ?? Date.now(),
    opId: event.opId,
    senderId: `external:${event.adapterId}`,
    source: "recovery",
  });
}

export async function pullExternalCollabDoc(adapter: ExternalCollabAdapter | null | undefined) {
  if (!adapter?.pullSnapshot) return null;
  const snapshot = await adapter.pullSnapshot();
  return snapshot ? hydrateDoc(snapshot) : null;
}

export async function pushExternalCollabDoc(
  adapter: ExternalCollabAdapter | null | undefined,
  pageId: string,
  doc: Doc,
  operation: EditorDocOperation,
  origin: "local" | "recovery",
) {
  if (!adapter?.pushSnapshot) return;
  await adapter.pushSnapshot({
    pageId,
    snapshot: serializeDoc(doc),
    operation,
    origin,
  });
}
