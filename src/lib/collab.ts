import { hydrateDoc, serializeDoc, type Doc, type DocPage, type SerializableDoc } from "@/advanced/doc/scene";

export function getCollabInviteFromRequest(req: Request) {
  const raw = req.headers.get("x-collab-invite");
  const value = raw?.trim();
  return value ? value : null;
}

export function isCollabInviteValid(
  invite: string | null,
  page: { collab_invite_code: string | null; collab_invite_enabled: boolean },
) {
  if (!invite) return false;
  if (!page.collab_invite_enabled) return false;
  return page.collab_invite_code === invite;
}

export type EditorRoomChannel = "presence" | "doc";

export function getEditorRoom(pageId: string, channel: EditorRoomChannel) {
  return `editor:${pageId}:${channel}`;
}

export type EditorDocOperationSource = "commit" | "preview" | "recovery" | "legacy";

export type EditorDocOperation = {
  kind: "snapshot";
  opId: string;
  ts: number;
  sessionId?: string;
  senderId?: string;
  source?: EditorDocOperationSource;
  content: SerializableDoc;
  deletedNodeIds: string[];
  deletedPageIds: string[];
};

export type EditorDocOperationEnvelope = {
  operation: EditorDocOperation;
};

export type EditorDocMergeStrategy = "remote-wins" | "local-wins";

export type EditorDocMergeConflict = {
  strategy: EditorDocMergeStrategy;
  nodeConflicts: string[];
  pageConflicts: string[];
  rebroadcast: boolean;
};

export type EditorDocMergeResult = {
  doc: Doc;
  operation: EditorDocOperation;
  conflict: EditorDocMergeConflict;
};

function makeEditorOpId() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `op_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function toStringList(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function mergeById<T extends { id: string }>(local: T[] | undefined, remote: T[] | undefined, preferLocal: boolean) {
  const ordered = preferLocal ? [...(remote ?? []), ...(local ?? [])] : [...(local ?? []), ...(remote ?? [])];
  const map = new Map<string, T>();
  ordered.forEach((item) => map.set(item.id, item));
  return Array.from(map.values());
}

function mergePages(local: DocPage[], remote: DocPage[], preferLocal: boolean) {
  const ordered = preferLocal ? [...remote, ...local] : [...local, ...remote];
  const map = new Map<string, DocPage>();
  ordered.forEach((page) => map.set(page.id, page));
  return Array.from(map.values());
}

function hasDifferentValue(a: unknown, b: unknown) {
  return JSON.stringify(a) !== JSON.stringify(b);
}

function collectNodeConflicts(local: Doc, remote: Doc) {
  return Object.keys(local.nodes).filter((id) => remote.nodes[id] && hasDifferentValue(local.nodes[id], remote.nodes[id]));
}

function collectPageConflicts(local: Doc, remote: Doc) {
  const remoteById = new Map(remote.pages.map((page) => [page.id, page]));
  return local.pages
    .filter((page) => {
      const incoming = remoteById.get(page.id);
      return incoming && hasDifferentValue(page, incoming);
    })
    .map((page) => page.id);
}

function pickScalar<T>(local: T | undefined, remote: T | undefined, preferLocal: boolean) {
  return preferLocal ? (local ?? remote) : (remote ?? local);
}

export function buildEditorDocOperation(input: {
  doc: Doc | SerializableDoc;
  deletedNodeIds?: string[];
  deletedPageIds?: string[];
  ts?: number;
  opId?: string;
  sessionId?: string;
  senderId?: string;
  source?: EditorDocOperationSource;
}): EditorDocOperation {
  const content =
    input.doc && input.doc.schema === "null_advanced_v1" && input.doc.selection instanceof Set
      ? serializeDoc(input.doc as Doc)
      : (input.doc as SerializableDoc);
  return {
    kind: "snapshot",
    opId: input.opId ?? makeEditorOpId(),
    ts: typeof input.ts === "number" ? input.ts : Date.now(),
    sessionId: input.sessionId,
    senderId: input.senderId,
    source: input.source ?? "commit",
    content,
    deletedNodeIds: toStringList(input.deletedNodeIds),
    deletedPageIds: toStringList(input.deletedPageIds),
  };
}

export function normalizeEditorDocOperation(payload: unknown): EditorDocOperation | null {
  if (!payload || typeof payload !== "object") return null;
  const container = payload as Record<string, unknown>;
  const raw = container.operation && typeof container.operation === "object" ? (container.operation as Record<string, unknown>) : container;
  const content = raw.content;
  if (!content || typeof content !== "object") return null;
  if ((content as { schema?: string }).schema !== "null_advanced_v1") return null;
  return {
    kind: "snapshot",
    opId: typeof raw.opId === "string" && raw.opId.trim() ? raw.opId.trim() : makeEditorOpId(),
    ts: typeof raw.ts === "number" ? raw.ts : Date.now(),
    sessionId: typeof raw.sessionId === "string" ? raw.sessionId : undefined,
    senderId: typeof raw.senderId === "string" ? raw.senderId : undefined,
    source:
      raw.source === "preview" || raw.source === "recovery" || raw.source === "legacy" || raw.source === "commit"
        ? raw.source
        : "legacy",
    content: content as SerializableDoc,
    deletedNodeIds: toStringList(raw.deletedNodeIds),
    deletedPageIds: toStringList(raw.deletedPageIds),
  };
}

export function wrapEditorDocOperation(operation: EditorDocOperation): EditorDocOperationEnvelope {
  return { operation };
}

export function isEditorDocOperationFromIdentity(
  operation: EditorDocOperation,
  identity: { sessionId?: string; presenceId?: string } | null | undefined,
) {
  if (!identity) return false;
  if (operation.senderId && identity.presenceId === operation.senderId) return true;
  if (operation.sessionId && identity.sessionId === operation.sessionId) return true;
  return false;
}

export function rememberEditorDocOperation(
  history: EditorDocOperation[] | undefined,
  operation: EditorDocOperation,
  maxHistory = 64,
) {
  const next = [...(history ?? []).filter((entry) => entry.opId !== operation.opId), operation];
  if (next.length <= maxHistory) return next;
  return next.slice(next.length - maxHistory);
}

export function getLatestEditorDocOperation(history: EditorDocOperation[] | undefined) {
  if (!history?.length) return null;
  return history[history.length - 1] ?? null;
}

export function shouldPreferLocalCollabState(
  latestLocalOperation: Pick<EditorDocOperation, "ts"> | null | undefined,
  incomingOperation: Pick<EditorDocOperation, "ts">,
  ttlMs = 4000,
) {
  if (!latestLocalOperation) return false;
  if (Date.now() - latestLocalOperation.ts > ttlMs) return false;
  return latestLocalOperation.ts > incomingOperation.ts;
}

export function applyEditorDocOperation(
  base: Doc,
  operation: EditorDocOperation,
  options?: { preferLocal?: boolean },
): EditorDocMergeResult {
  const preferLocal = options?.preferLocal === true;
  const incoming = hydrateDoc(operation.content);
  const nodeConflicts = collectNodeConflicts(base, incoming);
  const pageConflicts = collectPageConflicts(base, incoming);
  const merged: Doc = {
    ...(preferLocal ? incoming : base),
    ...(preferLocal ? base : incoming),
    nodes: preferLocal ? { ...incoming.nodes, ...base.nodes } : { ...base.nodes, ...incoming.nodes },
    pages: mergePages(base.pages, incoming.pages, preferLocal),
    styles: mergeById(base.styles, incoming.styles, preferLocal),
    variables: mergeById(base.variables, incoming.variables, preferLocal),
    components: preferLocal ? { ...incoming.components, ...base.components } : { ...base.components, ...incoming.components },
    componentVersions: preferLocal
      ? { ...(incoming.componentVersions ?? {}), ...(base.componentVersions ?? {}) }
      : { ...(base.componentVersions ?? {}), ...(incoming.componentVersions ?? {}) },
    branches: preferLocal ? { ...(incoming.branches ?? {}), ...(base.branches ?? {}) } : { ...(base.branches ?? {}), ...(incoming.branches ?? {}) },
    branchReviews: mergeById(base.branchReviews, incoming.branchReviews, preferLocal),
    libraries: mergeById(base.libraries, incoming.libraries, preferLocal),
    imports: pickScalar(base.imports, incoming.imports, preferLocal),
    variableModes: pickScalar(base.variableModes, incoming.variableModes, preferLocal),
    variableMode: pickScalar(base.variableMode, incoming.variableMode, preferLocal),
    globalState: mergeById(base.globalState, incoming.globalState, preferLocal),
    prototype: pickScalar(base.prototype, incoming.prototype, preferLocal),
    selection: base.selection,
    view: base.view,
  };

  operation.deletedNodeIds.forEach((id) => {
    delete merged.nodes[id];
  });
  if (operation.deletedPageIds.length) {
    merged.pages = merged.pages.filter((page) => !operation.deletedPageIds.includes(page.id));
  }

  return {
    doc: merged,
    operation,
    conflict: {
      strategy: preferLocal ? "local-wins" : "remote-wins",
      nodeConflicts,
      pageConflicts,
      rebroadcast: preferLocal && (nodeConflicts.length > 0 || pageConflicts.length > 0),
    },
  };
}
