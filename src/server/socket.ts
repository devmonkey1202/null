import { randomUUID } from "crypto";

import type { Server as HttpServer } from "http";

import { Server, type Socket } from "socket.io";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getRedis, pushEvent } from "@/lib/redis";
import { storeGhostTrace, getGhostTraces } from "@/lib/ghost";
import { getPageState, removeSession, type SessionBuffer } from "@/server/liveState";
import {
  getEditorRoom,
  getLatestEditorDocOperation,
  normalizeEditorDocOperation,
  rememberEditorDocOperation,
  wrapEditorDocOperation,
  type EditorDocOperation,
} from "@/lib/collab";
import {
  ackServiceRealtimeMessage,
  getServiceRealtimeRoom,
  getServiceRealtimeSnapshot,
  leaveServiceRealtimeChannel,
  listServiceRealtimePresence,
  publishServiceRealtimeMessage,
  replayServiceRealtimeMessages,
  upsertServiceRealtimePresence,
} from "@/lib/service-realtime";
import { resolvePlanFeatures } from "@/lib/plan";
import { logWithThrottle } from "@/lib/logger";

type PageWithOwner = Prisma.PageGetPayload<{
  include: { owner: { include: { plan: true } } };
}>;


/** §5.1 move 샘플링: 10~15Hz(66~100ms), 속도 기반 적응(느리면 6Hz 166ms, 빠르면 15Hz 66ms) */

const MOVE_THROTTLE_MIN_MS = 66;

const MOVE_THROTTLE_MAX_MS = 166;

const MOVE_THROTTLE_DEFAULT_MS = 100;

const MAX_BUFFER_POINTS = 500;

const MAX_BUFFER_CLICKS = 200;

const BOUNCE_THRESHOLD_MS = 5000;

const SPEED_SLOW_PER_MS = 0.0005;

const SPEED_FAST_PER_MS = 0.005;



function clamp01(value: unknown) {

  if (typeof value !== "number" || Number.isNaN(value)) {

    return null;

  }

  return Math.min(1, Math.max(0, value));

}



/** §31.9 민감정보 마스킹: payload 내 이메일·전화 패턴을 [email]/[phone]으로 치환 후 저장 */

const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
const PHONE_RE = /(\+?[\d\s\-()]{10,20}|\d{3}[-.\s]?\d{3,4}[-.\s]?\d{4})/g;

type EditorPresence = {
  id: string;
  name: string;
  color: string;
  x: number;
  y: number;
  pageId: string | null;
  selection: string[];
  ts: number;
  sessionId?: string;
};

const editorPresenceBySocket = new Map<string, { pageId: string; presence: EditorPresence }>();
const editorDocHistoryByPage = new Map<string, EditorDocOperation[]>();


function maskSensitivePayload(value: unknown): unknown {

  if (typeof value === "string") {

    return value.replace(EMAIL_RE, "[email]").replace(PHONE_RE, "[phone]");

  }

  if (Array.isArray(value)) {

    return value.map(maskSensitivePayload);

  }

  if (value !== null && typeof value === "object") {

    const out: Record<string, unknown> = {};

    for (const [k, v] of Object.entries(value)) {

      out[k] = maskSensitivePayload(v);

    }

    return out;

  }

  return value;

}



function resolvePageId(socket: { handshake: { query: Record<string, unknown> } }) {
  const raw = socket.handshake.query.pageId;
  return typeof raw === "string" && raw.length > 0 ? raw : null;
}

function resolveEditorMode(socket: { handshake: { query: Record<string, unknown> } }) {
  const raw = socket.handshake.query.editor ?? socket.handshake.query.mode;
  if (raw === "1" || raw === "true" || raw === "editor") return true;
  return false;
}

function resolveEditorInvite(socket: { handshake: { query: Record<string, unknown> } }) {
  const raw = socket.handshake.query.invite;
  return typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : null;
}

function resolveEditorAnonId(socket: { handshake: { query: Record<string, unknown> } }) {
  const raw = socket.handshake.query.anon;
  return typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : null;
}


let ioInstance: Server | null = null;

export function getSocketIO(): Server | null {
  return ioInstance ?? null;
}

export function initSocket(server: HttpServer) {
  const io = new Server(server, {
    path: "/socket.io",
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

  ioInstance = io;

  io.on("connection", (socket) => {
    void handleConnection(io, socket);
  });

  return io;
}

async function handleEditorConnection(io: Server, socket: Socket, pageId: string | null) {
  if (!pageId) {
    socket.disconnect();
    return;
  }

  const page = await prisma.page.findUnique({
    where: { id: pageId },
    select: {
      id: true,
      collab_invite_code: true,
      collab_invite_enabled: true,
      owner: { select: { anon_id: true } },
    },
  });

  if (!page) {
    socket.disconnect();
    return;
  }

  const invite = resolveEditorInvite(socket);
  const anonId = resolveEditorAnonId(socket);
  const allowInvite =
    page.collab_invite_enabled && invite && page.collab_invite_code && invite === page.collab_invite_code;
  const isOwner = anonId && page.owner?.anon_id === anonId;
  if (!allowInvite && !isOwner) {
    socket.disconnect();
    return;
  }

  const presenceRoom = getEditorRoom(pageId, "presence");
  const docRoom = getEditorRoom(pageId, "doc");
  socket.join(presenceRoom);
  socket.join(docRoom);

  const peers = Array.from(editorPresenceBySocket.values())
    .filter((entry) => entry.pageId === pageId)
    .map((entry) => entry.presence);

  socket.emit("editor:peers", { peers });
  const latestOperation = getLatestEditorDocOperation(editorDocHistoryByPage.get(pageId));
  if (latestOperation) {
    socket.emit("editor:op:sync", wrapEditorDocOperation(latestOperation));
  }

  socket.on("editor:presence", (payload) => {
    if (!payload || typeof payload !== "object") return;
    const raw = payload as Record<string, unknown>;
    if (typeof raw.id !== "string" || raw.id.length === 0) return;
    const presence: EditorPresence = {
      id: raw.id,
      name: typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : "User",
      color: typeof raw.color === "string" && raw.color ? raw.color : "#2563EB",
      x: typeof raw.x === "number" ? raw.x : 0,
      y: typeof raw.y === "number" ? raw.y : 0,
      pageId,
      selection: Array.isArray(raw.selection) ? raw.selection.filter((v): v is string => typeof v === "string") : [],
      ts: typeof raw.ts === "number" ? raw.ts : Date.now(),
      sessionId: typeof raw.sessionId === "string" ? raw.sessionId : undefined,
    };

    editorPresenceBySocket.set(socket.id, { pageId, presence });
    socket.to(presenceRoom).emit("editor:presence", presence);
  });

  const broadcastEditorOperation = (payload: unknown) => {
    const operation = normalizeEditorDocOperation(payload);
    if (!operation) return;
    const history = editorDocHistoryByPage.get(pageId) ?? [];
    editorDocHistoryByPage.set(pageId, rememberEditorDocOperation(history, operation, 96));
    socket.to(docRoom).emit("editor:op", wrapEditorDocOperation(operation));
  };

  socket.on("editor:op", broadcastEditorOperation);
  socket.on("editor:doc", broadcastEditorOperation);

  socket.on("disconnect", () => {
    const entry = editorPresenceBySocket.get(socket.id);
    editorPresenceBySocket.delete(socket.id);
    if (entry?.presence?.id) {
      socket.to(presenceRoom).emit("editor:leave", { id: entry.presence.id });
    }
    const remainingPresence = io.sockets.adapter.rooms.get(presenceRoom)?.size ?? 0;
    const remainingDoc = io.sockets.adapter.rooms.get(docRoom)?.size ?? 0;
    if (remainingPresence === 0 && remainingDoc === 0) {
      editorDocHistoryByPage.delete(pageId);
    }
  });
}

async function handleConnection(io: Server, socket: Socket) {
  const pageId = resolvePageId(socket);
  if (!pageId) {
    socket.disconnect();
    return;
  }

  if (resolveEditorMode(socket)) {
    await handleEditorConnection(io, socket, pageId);
    return;
  }

  let page: PageWithOwner | null = null;
  try {
    page = await prisma.page.findUnique({
      where: { id: pageId },
      include: {
        owner: { include: { plan: true } },
      },
    });
  } catch (err) {
    console.warn("[socket] page lookup failed", pageId, err);
  }

  if (!page) {
    socket.emit("page:closed");
    socket.disconnect();
    return;
  }

  const isExpired = page.live_expires_at && page.live_expires_at <= new Date();
  const isLive = page.status === "live";
  if (!isLive && !isExpired) {
    console.log(`[socket] page ${pageId} status="${page.status}" — allowing socket for chat`);
  }
  if (isExpired) {
    socket.emit("page:closed");
    socket.disconnect();
    return;
  }



  const features = resolvePlanFeatures(page.owner.plan);

  const replayEnabled = features.replayEnabled;



  const room = `page:${pageId}`;

  socket.join(room);



  const redis = getRedis();

  const state = getPageState(pageId);

  state.viewers.add(socket.id);



  const ua = typeof socket.handshake.headers["user-agent"] === "string" ? socket.handshake.headers["user-agent"] : "";

  const isBot = /bot|crawler|spider|slurp|headless|phantom|selenium/i.test(ua);



  const sessionId = `sess_${randomUUID()}`;

  const startedAt = Date.now();

  const session: SessionBuffer = {
    sessionId,
    pageId,
    startedAt,
    points: [],
    clicks: [],

    lastMoveAt: 0,

    throttleMs: MOVE_THROTTLE_DEFAULT_MS,

  };
  state.sessions.set(socket.id, session);

  const logSocketWarn = (
    key: string,
    message: string,
    error: unknown,
    extra?: Record<string, unknown>
  ) => {
    logWithThrottle("warn", key, message, {
      error: String(error),
      page_id: pageId,
      session_id: sessionId,
      live_session_id: session.liveSessionId ?? null,
      ...(extra ?? {}),
    });
  };

  type ServiceRealtimeBinding = {
    channelKey: string;
    memberKey: string;
    sessionId?: string | null;
    socketId: string;
  };

  const serviceBindings: ServiceRealtimeBinding[] = [];

  const rememberServiceBinding = (binding: ServiceRealtimeBinding) => {
    const existing = serviceBindings.find(
      (entry) =>
        entry.channelKey === binding.channelKey &&
        entry.memberKey === binding.memberKey &&
        (entry.sessionId ?? null) === (binding.sessionId ?? null),
    );
    if (existing) {
      existing.socketId = binding.socketId;
      existing.sessionId = binding.sessionId;
      return;
    }
    serviceBindings.push(binding);
  };

  const forgetServiceBinding = (binding: Pick<ServiceRealtimeBinding, "channelKey" | "memberKey" | "sessionId">) => {
    const index = serviceBindings.findIndex(
      (entry) =>
        entry.channelKey === binding.channelKey &&
        entry.memberKey === binding.memberKey &&
        (entry.sessionId ?? null) === (binding.sessionId ?? null),
    );
    if (index >= 0) {
      serviceBindings.splice(index, 1);
    }
  };

  const emitServiceError = (action: string, error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    socket.emit("service:error", { action, message });
    logSocketWarn(`socket:${action}`, `socket ${action} failed`, error);
  };

  if (!isBot) {
    try {
      const created = await prisma.liveSession.create({
        data: {
          session_id: sessionId,
          page_id: pageId,
          started_at: new Date(startedAt),
        },
      });
      session.liveSessionId = created.id;
    } catch (error) {
      logSocketWarn("socket:live-session:create", "socket liveSession create failed", error);
    }

    try {
      await prisma.page.update({
        where: { id: pageId },
        data: {
          total_visits: { increment: 1 },
          unique_sessions: { increment: 1 },
        },
      });
    } catch (error) {
      logSocketWarn("socket:page:metrics", "socket page metrics update failed", error);
    }
  }


  if (replayEnabled && session.liveSessionId) {

    const referrer = typeof socket.handshake.headers.referer === "string" ? socket.handshake.headers.referer : null;

    const vwRaw = Number(socket.handshake.query.vw);

    const vhRaw = Number(socket.handshake.query.vh);

    const viewportW = Number.isFinite(vwRaw) ? vwRaw : null;

    const viewportH = Number.isFinite(vhRaw) ? vhRaw : null;

    let utm: Record<string, string> | null = null;

    try {

      const raw = socket.handshake.query.utm;

      if (typeof raw === "string" && raw) utm = JSON.parse(raw) as Record<string, string>;

    } catch {

      // ignore

    }

    const payload: Record<string, unknown> = {

      referrer,

      viewport_w: viewportW,

      viewport_h: viewportH,

    };

    if (ua) payload.ua = ua.slice(0, 512);

    if (utm && Object.keys(utm).length) payload.utm = utm;

    if (redis) {

      pushEvent(redis, {

        event_id: `ev_${randomUUID()}`,

        page_id: pageId,

        live_session_id: session.liveSessionId,

        type: "enter",

        ts: 0,

        payload,

      });

    } else {

      void prisma.event

        .create({

          data: {

            event_id: `ev_${randomUUID()}`,

            page_id: pageId,

            live_session_id: session.liveSessionId,

            type: "enter",

            payload: { ts: 0, ...payload },

          },

        })
        .catch((error) => logSocketWarn("socket:event:create", "socket event create failed", error, { type: "enter" }));
    }

  }



  io.to(room).emit("presence", { count: state.viewers.size });

  socket.on("chat:notify", () => {
    socket.to(room).emit("chat:message", {});
  });

  socket.on("service:join", (payload) => {
    void (async () => {
      const raw = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
      const channelKey =
        typeof raw.channel === "string"
          ? raw.channel
          : typeof raw.channelKey === "string"
            ? raw.channelKey
            : "";
      const memberKey = typeof raw.memberKey === "string" ? raw.memberKey.trim() : "";
      if (!channelKey || !memberKey) {
        emitServiceError("service:join", "service_channel_or_member_required");
        return;
      }

      const serviceRoom = getServiceRealtimeRoom(pageId, channelKey);
      socket.join(serviceRoom);
      const result = await upsertServiceRealtimePresence({
        pageId,
        channelKey,
        topic: typeof raw.topic === "string" ? raw.topic : undefined,
        kind: raw.kind === "generic" || raw.kind === "chat" || raw.kind === "stream" || raw.kind === "presence" ? raw.kind : undefined,
        memberKey,
        sessionId: typeof raw.sessionId === "string" ? raw.sessionId : sessionId,
        socketId: socket.id,
        name: typeof raw.name === "string" ? raw.name : null,
        status:
          raw.status === "online" || raw.status === "away" || raw.status === "busy" || raw.status === "offline"
            ? raw.status
            : "online",
        meta: raw.meta && typeof raw.meta === "object" && !Array.isArray(raw.meta) ? (raw.meta as Record<string, unknown>) : null,
      });
      rememberServiceBinding({
        channelKey: result.channel.key,
        memberKey,
        sessionId: typeof raw.sessionId === "string" ? raw.sessionId : sessionId,
        socketId: socket.id,
      });
      const snapshot = await getServiceRealtimeSnapshot({
        pageId,
        channelKey: result.channel.key,
        messageLimit: typeof raw.limit === "number" ? raw.limit : undefined,
      });
      socket.emit("service:sync", { channelKey: result.channel.key, snapshot });
      socket.to(serviceRoom).emit("service:presence", {
        channelKey: result.channel.key,
        event: "upsert",
        presence: result.presence,
      });
    })().catch((error) => emitServiceError("service:join", error));
  });

  socket.on("service:presence", (payload) => {
    void (async () => {
      const raw = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
      const channelKey =
        typeof raw.channel === "string"
          ? raw.channel
          : typeof raw.channelKey === "string"
            ? raw.channelKey
            : "";
      const memberKey = typeof raw.memberKey === "string" ? raw.memberKey.trim() : "";
      if (!channelKey || !memberKey) {
        emitServiceError("service:presence", "service_channel_or_member_required");
        return;
      }
      const serviceRoom = getServiceRealtimeRoom(pageId, channelKey);
      socket.join(serviceRoom);
      const result = await upsertServiceRealtimePresence({
        pageId,
        channelKey,
        topic: typeof raw.topic === "string" ? raw.topic : undefined,
        kind: raw.kind === "generic" || raw.kind === "chat" || raw.kind === "stream" || raw.kind === "presence" ? raw.kind : undefined,
        memberKey,
        sessionId: typeof raw.sessionId === "string" ? raw.sessionId : sessionId,
        socketId: socket.id,
        name: typeof raw.name === "string" ? raw.name : null,
        status:
          raw.status === "online" || raw.status === "away" || raw.status === "busy" || raw.status === "offline"
            ? raw.status
            : "online",
        meta: raw.meta && typeof raw.meta === "object" && !Array.isArray(raw.meta) ? (raw.meta as Record<string, unknown>) : null,
      });
      rememberServiceBinding({
        channelKey: result.channel.key,
        memberKey,
        sessionId: typeof raw.sessionId === "string" ? raw.sessionId : sessionId,
        socketId: socket.id,
      });
      socket.to(serviceRoom).emit("service:presence", {
        channelKey: result.channel.key,
        event: "upsert",
        presence: result.presence,
      });
    })().catch((error) => emitServiceError("service:presence", error));
  });

  socket.on("service:message", (payload) => {
    void (async () => {
      const raw = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
      const channelKey =
        typeof raw.channel === "string"
          ? raw.channel
          : typeof raw.channelKey === "string"
            ? raw.channelKey
            : "";
      const senderKey = typeof raw.senderKey === "string" ? raw.senderKey.trim() : "";
      if (!channelKey || !senderKey) {
        emitServiceError("service:message", "service_channel_or_sender_required");
        return;
      }
      const serviceRoom = getServiceRealtimeRoom(pageId, channelKey);
      socket.join(serviceRoom);
      if (typeof raw.sessionId === "string" || typeof raw.name === "string") {
        await upsertServiceRealtimePresence({
          pageId,
          channelKey,
          topic: typeof raw.topic === "string" ? raw.topic : undefined,
          kind: raw.kind === "generic" || raw.kind === "chat" || raw.kind === "stream" || raw.kind === "presence" ? raw.kind : "chat",
          memberKey: senderKey,
          sessionId: typeof raw.sessionId === "string" ? raw.sessionId : sessionId,
          socketId: socket.id,
          name: typeof raw.name === "string" ? raw.name : null,
          status: "online",
        });
        rememberServiceBinding({
          channelKey,
          memberKey: senderKey,
          sessionId: typeof raw.sessionId === "string" ? raw.sessionId : sessionId,
          socketId: socket.id,
        });
      }
      const result = await publishServiceRealtimeMessage({
        pageId,
        channelKey,
        topic: typeof raw.topic === "string" ? raw.topic : undefined,
        kind: raw.kind === "generic" || raw.kind === "chat" || raw.kind === "stream" || raw.kind === "presence" ? raw.kind : "chat",
        senderKey,
        senderName: typeof raw.name === "string" ? raw.name : null,
        messageKey: typeof raw.messageKey === "string" ? raw.messageKey : null,
        type: typeof raw.type === "string" ? raw.type : "message",
        body: raw.body,
        meta: raw.meta && typeof raw.meta === "object" && !Array.isArray(raw.meta) ? (raw.meta as Record<string, unknown>) : null,
      });
      io.to(serviceRoom).emit("service:message", {
        channelKey: result.channel.key,
        message: result.message,
        deduped: result.deduped,
      });
    })().catch((error) => emitServiceError("service:message", error));
  });

  socket.on("service:ack", (payload) => {
    void (async () => {
      const raw = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
      const channelKey =
        typeof raw.channel === "string"
          ? raw.channel
          : typeof raw.channelKey === "string"
            ? raw.channelKey
            : "";
      const messageId = typeof raw.messageId === "string" ? raw.messageId : "";
      const recipientKey = typeof raw.recipientKey === "string" ? raw.recipientKey.trim() : "";
      const state = raw.state === "read" ? "read" : "delivered";
      if (!channelKey || !messageId || !recipientKey) {
        emitServiceError("service:ack", "service_ack_invalid");
        return;
      }
      const receipt = await ackServiceRealtimeMessage({
        pageId,
        channelKey,
        messageId,
        recipientKey,
        state,
      });
      io.to(getServiceRealtimeRoom(pageId, channelKey)).emit("service:ack", {
        channelKey,
        messageId,
        receipt,
      });
    })().catch((error) => emitServiceError("service:ack", error));
  });

  socket.on("service:sync", (payload) => {
    void (async () => {
      const raw = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
      const channelKey =
        typeof raw.channel === "string"
          ? raw.channel
          : typeof raw.channelKey === "string"
            ? raw.channelKey
            : "";
      if (!channelKey) {
        emitServiceError("service:sync", "service_channel_required");
        return;
      }
      const afterId = typeof raw.afterId === "string" ? raw.afterId : null;
      if (afterId) {
        const [messages, presence] = await Promise.all([
          replayServiceRealtimeMessages({
            pageId,
            channelKey,
            afterId,
            limit: typeof raw.limit === "number" ? raw.limit : undefined,
          }),
          listServiceRealtimePresence({
            pageId,
            channelKey,
          }),
        ]);
        socket.emit("service:sync", { channelKey, messages, presence, mode: "delta" });
        return;
      }
      const snapshot = await getServiceRealtimeSnapshot({
        pageId,
        channelKey,
        messageLimit: typeof raw.limit === "number" ? raw.limit : undefined,
      });
      socket.emit("service:sync", { channelKey: snapshot.channel.key, snapshot, mode: "full" });
    })().catch((error) => emitServiceError("service:sync", error));
  });

  socket.on("service:leave", (payload) => {
    void (async () => {
      const raw = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
      const channelKey =
        typeof raw.channel === "string"
          ? raw.channel
          : typeof raw.channelKey === "string"
            ? raw.channelKey
            : "";
      const memberKey = typeof raw.memberKey === "string" ? raw.memberKey.trim() : "";
      if (!channelKey || !memberKey) {
        emitServiceError("service:leave", "service_channel_or_member_required");
        return;
      }
      const serviceRoom = getServiceRealtimeRoom(pageId, channelKey);
      const result = await leaveServiceRealtimeChannel({
        pageId,
        channelKey,
        memberKey,
        sessionId: typeof raw.sessionId === "string" ? raw.sessionId : sessionId,
        socketId: socket.id,
      });
      forgetServiceBinding({
        channelKey,
        memberKey,
        sessionId: typeof raw.sessionId === "string" ? raw.sessionId : sessionId,
      });
      socket.leave(serviceRoom);
      socket.to(serviceRoom).emit("service:presence", {
        channelKey,
        event: "leave",
        memberKey,
        connectionKey: result.connectionKey,
      });
    })().catch((error) => emitServiceError("service:leave", error));
  });

  socket.on("move", (payload) => {

    const now = Date.now();

    if (now - session.lastMoveAt < session.throttleMs) {

      return;

    }



    const x = clamp01(payload?.x);

    const y = clamp01(payload?.y);

    if (x === null || y === null) {

      return;

    }



    const dt = (now - session.lastMoveAt) / 1000;

    if (dt > 0 && session.lastX != null && session.lastY != null) {

      const dx = x - session.lastX;

      const dy = y - session.lastY;

      const speed = Math.sqrt(dx * dx + dy * dy) / (dt * 1000);

      session.throttleMs =

        speed < SPEED_SLOW_PER_MS ? MOVE_THROTTLE_MAX_MS : speed > SPEED_FAST_PER_MS ? MOVE_THROTTLE_MIN_MS : MOVE_THROTTLE_DEFAULT_MS;

    }

    session.lastMoveAt = now;



    const t = (now - session.startedAt) / 1000;

    const point = { t, x, y };

    session.points.push(point);

    if (session.points.length > MAX_BUFFER_POINTS) {

      session.points.shift();

    }



    session.lastX = x;

    session.lastY = y;



    if (replayEnabled && session.liveSessionId) {

      if (redis) {

        pushEvent(redis, {

          page_id: pageId,

          live_session_id: session.liveSessionId,

          type: "move",

          ts: t,

          x,

          y,

        });

      } else {

        void prisma.event
          .create({
            data: {
              event_id: `ev_${randomUUID()}`,
              page_id: pageId,
              live_session_id: session.liveSessionId,
              type: "move",
              x,
              y,

              payload: { ts: t },

            },

            })
            .catch((error) => logSocketWarn("socket:event:create", "socket event create failed", error, { type: "move" }));
      }

    }



    socket.to(room).emit("live:move", { x, y });

  });



  socket.on("click", (payload) => {

    const x = clamp01(payload?.x);

    const y = clamp01(payload?.y);

    if (x === null || y === null) {

      return;

    }



    const elementId = typeof payload?.elementId === "string" ? payload.elementId : undefined;

    const elementType = typeof payload?.elementType === "string" ? payload.elementType : undefined;

    const elementLabelHash = typeof payload?.elementLabelHash === "string" ? payload.elementLabelHash : undefined;

    const t = (Date.now() - session.startedAt) / 1000;

    const click = { t, x, y, el: elementId };

    session.clicks.push(click);

    if (session.clicks.length > MAX_BUFFER_CLICKS) {

      session.clicks.shift();

    }



    if (replayEnabled && session.liveSessionId) {

      if (redis) {

        pushEvent(redis, {

          page_id: pageId,

          live_session_id: session.liveSessionId,

          type: "click",

          ts: t,

          x,

          y,

          element_id: elementId ?? null,

          element_type: elementType ?? null,

          element_label_hash: elementLabelHash ?? null,

        });

      } else {

        void prisma.event
          .create({
            data: {
              event_id: `ev_${randomUUID()}`,
              page_id: pageId,
              live_session_id: session.liveSessionId,
              type: "click",
              x,
              y,

              element_id: elementId ?? null,

              element_type: elementType ?? null,

              element_label_hash: elementLabelHash ?? null,

              payload: { ts: t },

            },

            })
            .catch((error) => logSocketWarn("socket:event:create", "socket event create failed", error, { type: "click" }));
      }

    }



    void prisma.page

      .update({

        where: { id: pageId },

        data: { total_clicks: { increment: 1 } },

      })
      .catch((error) => logSocketWarn("socket:page:clicks", "socket page clicks update failed", error));


    socket.to(room).emit("live:click", { x, y });

  });



  socket.on("scroll", (payload) => {

    const depth = clamp01(payload?.depth);

    if (depth === null || !replayEnabled || !session.liveSessionId) return;

    const t = (Date.now() - session.startedAt) / 1000;

    if (redis) {

      pushEvent(redis, {

        event_id: `ev_${randomUUID()}`,

        page_id: pageId,

        live_session_id: session.liveSessionId,

        type: "scroll",

        ts: t,

        x: depth,

        y: null,

        payload: { depth },

      });

    } else {

      void prisma.event

        .create({

          data: {

            event_id: `ev_${randomUUID()}`,

            page_id: pageId,

            live_session_id: session.liveSessionId,

            type: "scroll",

            x: depth,

            y: null,

            payload: { ts: t, depth },

          },

        })
        .catch((error) => logSocketWarn("socket:event:create", "socket event create failed", error, { type: "scroll" }));
    }

  });



  const MAX_PAYLOAD_JSON = 2000;

  const truncatePayload = (obj: Record<string, unknown>) => {

    const s = JSON.stringify(obj);

    if (s.length <= MAX_PAYLOAD_JSON) return obj;

    const msg = String(obj.message ?? "").slice(0, 500);

    const stack = String(obj.stack ?? "").slice(0, 1200);

    return { message: msg, source: obj.source, lineno: obj.lineno, colno: obj.colno, stack };

  };



  socket.on("error", (payload: unknown) => {

    if (!replayEnabled || !session.liveSessionId) return;

    const msg = typeof payload === "object" && payload !== null && "message" in payload ? String((payload as { message: unknown }).message) : String(payload);

    const source = typeof payload === "object" && payload !== null && "source" in payload ? (payload as { source: unknown }).source : null;

    const lineno = typeof payload === "object" && payload !== null && "lineno" in payload ? (payload as { lineno: unknown }).lineno : null;

    const colno = typeof payload === "object" && payload !== null && "colno" in payload ? (payload as { colno: unknown }).colno : null;

    const stack = typeof payload === "object" && payload !== null && "stack" in payload ? (payload as { stack: unknown }).stack : null;

    const plRaw = truncatePayload({ message: msg, source, lineno, colno, stack });

    const pl = maskSensitivePayload(plRaw) as Record<string, unknown>;

    if (redis) {

      pushEvent(redis, {

        event_id: `ev_${randomUUID()}`,

        page_id: pageId,

        live_session_id: session.liveSessionId,

        type: "error",

        ts: (Date.now() - session.startedAt) / 1000,

        x: null,

        y: null,

        payload: pl,

      });

    } else {

      void prisma.event

        .create({

          data: {

            event_id: `ev_${randomUUID()}`,

            page_id: pageId,

            live_session_id: session.liveSessionId,

            type: "error",

            payload: pl as Prisma.InputJsonValue,
          },

        })
        .catch((error) => logSocketWarn("socket:event:create", "socket event create failed", error, { type: "error" }));
    }

  });



  socket.on("track", (payload: unknown) => {

    if (!replayEnabled || !session.liveSessionId) return;

    const rawName = typeof payload === "object" && payload !== null && "name" in payload ? String((payload as { name: unknown }).name) : "";

    const name = rawName.trim().slice(0, 128) || "custom";

    const props = typeof payload === "object" && payload !== null ? { ...(payload as Record<string, unknown>) } : {};

    let pl: Record<string, unknown> = { name, ...props };

    if (JSON.stringify(pl).length > MAX_PAYLOAD_JSON) {

      pl = { name, _truncated: true, keys: Object.keys(pl).slice(0, 20) };

    }

    pl = maskSensitivePayload(pl) as Record<string, unknown>;

    if (redis) {

      pushEvent(redis, {

        event_id: `ev_${randomUUID()}`,

        page_id: pageId,

        live_session_id: session.liveSessionId,

        type: "custom",

        ts: (Date.now() - session.startedAt) / 1000,

        x: null,

        y: null,

        payload: pl,

      });

    } else {

      void prisma.event

        .create({

          data: {

            event_id: `ev_${randomUUID()}`,

            page_id: pageId,

            live_session_id: session.liveSessionId,

            type: "custom",

            payload: pl as Prisma.InputJsonValue,
          },

        })
        .catch((error) => logSocketWarn("socket:event:create", "socket event create failed", error, { type: "custom" }));
    }

  });



  socket.on("disconnect", async () => {

    for (const binding of [...serviceBindings]) {
      try {
        const serviceRoom = getServiceRealtimeRoom(pageId, binding.channelKey);
        const result = await leaveServiceRealtimeChannel({
          pageId,
          channelKey: binding.channelKey,
          memberKey: binding.memberKey,
          sessionId: binding.sessionId,
          socketId: socket.id,
        });
        socket.to(serviceRoom).emit("service:presence", {
          channelKey: binding.channelKey,
          event: "leave",
          memberKey: binding.memberKey,
          connectionKey: result.connectionKey,
        });
      } catch (error) {
        logSocketWarn("socket:service:disconnect", "socket service disconnect cleanup failed", error, {
          channel_key: binding.channelKey,
          member_key: binding.memberKey,
        });
      }
    }

    const remaining = removeSession(pageId, socket.id);

    io.to(room).emit("presence", { count: remaining });



    const durationMs = Date.now() - session.startedAt;

    try {

      if (session.liveSessionId) {

        await prisma.liveSession.update({

          where: { id: session.liveSessionId },

          data: {

            ended_at: new Date(),

            duration_ms: Math.max(durationMs, 0),

            last_x: session.lastX,

            last_y: session.lastY,

          },

        });

      }

    } catch (error) {
      logSocketWarn("socket:live-session:update", "socket liveSession update failed", error);
    }


    try {

      await prisma.$transaction(async (tx) => {

        const current = await tx.page.findUnique({

          where: { id: pageId },

          select: { total_visits: true, total_duration_ms: true, bounce_count: true },

        });



        if (!current) return;



        const bounce = durationMs < BOUNCE_THRESHOLD_MS;

        const totalDuration = current.total_duration_ms + Math.max(durationMs, 0);

        const bounceCount = current.bounce_count + (bounce ? 1 : 0);

        const avg = current.total_visits > 0 ? totalDuration / current.total_visits : 0;

        const bounceRate = current.total_visits > 0 ? bounceCount / current.total_visits : 0;



        await tx.page.update({

          where: { id: pageId },

          data: {

            total_duration_ms: totalDuration,

            avg_duration_ms: avg,

            bounce_count: bounceCount,

            bounce_rate: bounceRate,

          },

        });

      });

    } catch (error) {
      logSocketWarn("socket:page:metrics", "socket page metrics update failed", error);
    }


    const leaveTs = durationMs / 1000;

    if (replayEnabled && session.liveSessionId) {

      if (redis) {

        pushEvent(redis, {

          page_id: pageId,

          live_session_id: session.liveSessionId,

          type: "leave",

          ts: leaveTs,

          payload: {

            duration_ms: Math.max(durationMs, 0),

            last_x: session.lastX ?? null,

            last_y: session.lastY ?? null,

          },

        });

      } else {

        void prisma.event
          .create({
            data: {
              event_id: `ev_${randomUUID()}`,
              page_id: pageId,
              live_session_id: session.liveSessionId,
              type: "leave",
              payload: {
                ts: leaveTs,

                duration_ms: Math.max(durationMs, 0),

                last_x: session.lastX ?? null,

                last_y: session.lastY ?? null,

              },

            },

          })
          .catch((error) => logSocketWarn("socket:event:create", "socket event create failed", error, { type: "leave" }));
      }

    }



    const stored = await storeGhostTrace({

      pageId,

      points: session.points,

      clicks: session.clicks,

      durationMs,

    });



    if (stored) {

      const traces = await getGhostTraces(pageId);

      io.to(room).emit("ghost:update", { traces });

    }

  });

}
