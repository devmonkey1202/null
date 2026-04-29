import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";

import { hashPassword, normalizeEmail, verifyPassword } from "@/lib/auth";
import { shouldUseSecureCookies } from "@/lib/cookie-security";
import { prisma } from "@/lib/db";

type Context = { params: Promise<{ path?: string[] }> };

const COOKIE_NAME = "null_messenger_session";
const SESSION_DAYS = 30;
const DEFAULT_ACCENTS = ["#111827", "#2563eb", "#7c3aed", "#0891b2", "#059669", "#dc2626"];

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  displayName: z.string().min(1).max(40),
  handle: z.string().min(2).max(28).optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const profileSchema = z.object({
  displayName: z.string().min(1).max(40).optional(),
  statusMessage: z.string().max(80).optional().nullable(),
  avatarUrl: z.string().max(500).optional().nullable(),
  accent: z.string().max(24).optional(),
});

const friendRequestSchema = z.object({
  query: z.string().min(1).max(120).optional(),
  userId: z.string().min(1).optional(),
});

const conversationSchema = z.object({
  memberIds: z.array(z.string().min(1)).min(1).max(12),
  title: z.string().max(80).optional().nullable(),
  type: z.enum(["direct", "group"]).optional(),
});

const messageSchema = z.object({
  body: z.string().min(1).max(2000),
  kind: z.string().max(40).optional(),
  meta: z.unknown().optional(),
});

const callStartSchema = z.object({
  conversationId: z.string().min(1),
  receiverId: z.string().min(1).optional().nullable(),
});

const callPatchSchema = z.object({
  action: z.enum(["offer", "answer", "active", "end"]),
  offer: z.unknown().optional(),
  answer: z.unknown().optional(),
});

function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

function error(code: string, status = 400, message?: string) {
  return json({ ok: false, error: code, message: message ?? code }, { status });
}

async function parseBody(req: Request) {
  return (await req.json().catch(() => ({}))) as Record<string, unknown>;
}

function readCookie(req: Request, name: string) {
  const header = req.headers.get("cookie") ?? "";
  const token = header
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  return token ? decodeURIComponent(token.slice(name.length + 1)) : "";
}

function issueToken() {
  return randomBytes(32).toString("hex");
}

function normalizeHandleValue(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 28);
}

function fallbackHandle(email: string) {
  const [name] = email.split("@");
  return normalizeHandleValue(name || "user");
}

function sortedPair(a: string, b: string) {
  return [a, b].sort((left, right) => left.localeCompare(right));
}

function publicUser(user: {
  id: string;
  email: string;
  handle: string;
  display_name: string;
  avatar_url: string | null;
  status_message: string | null;
  accent: string;
  created_at?: Date;
}) {
  return {
    id: user.id,
    email: user.email,
    handle: user.handle,
    displayName: user.display_name,
    avatarUrl: user.avatar_url,
    statusMessage: user.status_message,
    accent: user.accent,
    createdAt: user.created_at?.toISOString?.() ?? null,
  };
}

function serializeNotification(item: any) {
  return {
    id: item.id,
    type: item.type,
    title: item.title,
    body: item.body,
    conversationId: item.conversation_id,
    messageId: item.message_id,
    callId: item.call_id,
    readAt: item.read_at?.toISOString?.() ?? null,
    createdAt: item.created_at.toISOString(),
  };
}

function serializeMessage(message: any) {
  return {
    id: message.id,
    conversationId: message.conversation_id,
    senderId: message.sender_id,
    sender: message.sender ? publicUser(message.sender) : null,
    body: message.body,
    kind: message.kind,
    meta: message.meta,
    createdAt: message.created_at.toISOString(),
    editedAt: message.edited_at?.toISOString?.() ?? null,
    deletedAt: message.deleted_at?.toISOString?.() ?? null,
  };
}

function serializeCall(call: any) {
  return {
    id: call.id,
    conversationId: call.conversation_id,
    callerId: call.caller_id,
    caller: call.caller ? publicUser(call.caller) : null,
    receiverId: call.receiver_id,
    receiver: call.receiver ? publicUser(call.receiver) : null,
    status: call.status,
    offer: call.offer,
    answer: call.answer,
    startedAt: call.started_at.toISOString(),
    answeredAt: call.answered_at?.toISOString?.() ?? null,
    endedAt: call.ended_at?.toISOString?.() ?? null,
  };
}

async function createSession(userId: string) {
  const token = issueToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await prisma.messengerSession.create({
    data: {
      token,
      user_id: userId,
      expires_at: expiresAt,
    },
  });
  return { token, expiresAt };
}

function attachSessionCookie(res: NextResponse, req: Request, token: string) {
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: shouldUseSecureCookies(req),
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
  return res;
}

function clearSessionCookie(res: NextResponse) {
  res.cookies.set(COOKIE_NAME, "", { path: "/", maxAge: 0 });
  return res;
}

async function getSessionUser(req: Request) {
  const token = readCookie(req, COOKIE_NAME);
  if (!token) return null;
  const session = await prisma.messengerSession.findUnique({
    where: { token },
    include: { user: true },
  });
  if (!session) return null;
  if (session.expires_at.getTime() < Date.now()) {
    await prisma.messengerSession.delete({ where: { id: session.id } }).catch(() => null);
    return null;
  }
  return session.user;
}

async function requireUser(req: Request) {
  const user = await getSessionUser(req);
  if (!user) return { user: null, response: error("auth_required", 401, "로그인이 필요합니다.") };
  return { user, response: null };
}

async function createNotification(input: {
  userId: string;
  type: string;
  title: string;
  body?: string | null;
  conversationId?: string | null;
  messageId?: string | null;
  callId?: string | null;
}) {
  return prisma.messengerNotification.create({
    data: {
      user_id: input.userId,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      conversation_id: input.conversationId ?? null,
      message_id: input.messageId ?? null,
      call_id: input.callId ?? null,
    },
  });
}

async function friendshipBetween(userId: string, targetId: string) {
  const [userA, userB] = sortedPair(userId, targetId);
  return prisma.messengerFriendship.findUnique({
    where: { user_a_id_user_b_id: { user_a_id: userA, user_b_id: userB } },
  });
}

async function relationStatus(userId: string, targetId: string) {
  if (userId === targetId) return "self";
  const friendship = await friendshipBetween(userId, targetId);
  if (friendship) return "friend";
  const outgoing = await prisma.messengerFriendRequest.findUnique({
    where: { requester_id_receiver_id: { requester_id: userId, receiver_id: targetId } },
  });
  if (outgoing?.status === "pending") return "pending_out";
  const incoming = await prisma.messengerFriendRequest.findUnique({
    where: { requester_id_receiver_id: { requester_id: targetId, receiver_id: userId } },
  });
  if (incoming?.status === "pending") return "pending_in";
  return "none";
}

async function ensureConversationMember(conversationId: string, userId: string) {
  return prisma.messengerConversationMember.findUnique({
    where: { conversation_id_user_id: { conversation_id: conversationId, user_id: userId } },
  });
}

async function loadConversationForUser(conversationId: string, userId: string) {
  const member = await ensureConversationMember(conversationId, userId);
  if (!member) return null;
  return prisma.messengerConversation.findUnique({
    where: { id: conversationId },
    include: {
      members: { include: { user: true } },
      messages: { take: 1, orderBy: { created_at: "desc" }, include: { sender: true } },
      calls: {
        where: { status: { in: ["ringing", "active"] } },
        take: 1,
        orderBy: { created_at: "desc" },
        include: { caller: true, receiver: true },
      },
    },
  });
}

async function serializeConversation(conversation: any, userId: string) {
  const selfMember = conversation.members.find((member: any) => member.user_id === userId);
  const otherMembers = conversation.members.filter((member: any) => member.user_id !== userId);
  const lastMessage = conversation.messages[0] ?? null;
  const unreadCount = await prisma.messengerMessage.count({
    where: {
      conversation_id: conversation.id,
      sender_id: { not: userId },
      ...(selfMember?.last_read_at ? { created_at: { gt: selfMember.last_read_at } } : {}),
    },
  });

  return {
    id: conversation.id,
    type: conversation.type,
    title:
      conversation.title ||
      (conversation.type === "direct"
        ? otherMembers[0]?.nickname || otherMembers[0]?.user?.display_name || "대화"
        : "그룹 대화"),
    avatarUrl: conversation.avatar_url,
    createdById: conversation.created_by_id,
    lastMessageAt: conversation.last_message_at?.toISOString?.() ?? null,
    createdAt: conversation.created_at.toISOString(),
    members: conversation.members.map((member: any) => ({
      id: member.id,
      userId: member.user_id,
      role: member.role,
      nickname: member.nickname,
      lastReadAt: member.last_read_at?.toISOString?.() ?? null,
      user: publicUser(member.user),
    })),
    lastMessage: lastMessage ? serializeMessage(lastMessage) : null,
    unreadCount,
    activeCall: conversation.calls[0] ? serializeCall(conversation.calls[0]) : null,
  };
}

async function findExistingDirectConversation(userId: string, friendId: string) {
  const rows = await prisma.messengerConversationMember.findMany({
    where: {
      user_id: userId,
      conversation: {
        type: "direct",
        members: { some: { user_id: friendId } },
      },
    },
    include: {
      conversation: {
        include: {
          members: true,
        },
      },
    },
  });
  return rows.map((row) => row.conversation).find((conversation) => conversation.members.length === 2) ?? null;
}

async function handleRegister(req: Request) {
  const parsed = registerSchema.safeParse(await parseBody(req));
  if (!parsed.success) return error("invalid_register_payload", 400, "이메일, 이름, 6자 이상 비밀번호가 필요합니다.");
  const email = normalizeEmail(parsed.data.email);
  const handle = normalizeHandleValue(parsed.data.handle ?? fallbackHandle(email));
  if (!handle || handle.length < 2) return error("invalid_handle", 400, "핸들은 영문, 숫자, 밑줄로 2자 이상이어야 합니다.");

  const existing = await prisma.messengerUser.findFirst({
    where: { OR: [{ email }, { handle }] },
    select: { email: true, handle: true },
  });
  if (existing?.email === email) return error("email_in_use", 409, "이미 가입된 이메일입니다.");
  if (existing?.handle === handle) return error("handle_in_use", 409, "이미 사용 중인 핸들입니다.");

  const user = await prisma.messengerUser.create({
    data: {
      email,
      handle,
      password_hash: hashPassword(parsed.data.password),
      display_name: parsed.data.displayName.trim(),
      accent: DEFAULT_ACCENTS[Math.floor(Math.random() * DEFAULT_ACCENTS.length)],
    },
  });
  const session = await createSession(user.id);
  return attachSessionCookie(json({ ok: true, user: publicUser(user) }), req, session.token);
}

async function handleLogin(req: Request) {
  const parsed = loginSchema.safeParse(await parseBody(req));
  if (!parsed.success) return error("invalid_login_payload", 400, "이메일과 비밀번호를 입력해 주세요.");
  const email = normalizeEmail(parsed.data.email);
  const user = await prisma.messengerUser.findUnique({ where: { email } });
  if (!user || !verifyPassword(parsed.data.password, user.password_hash)) {
    return error("invalid_credentials", 401, "이메일 또는 비밀번호가 맞지 않습니다.");
  }
  const session = await createSession(user.id);
  return attachSessionCookie(json({ ok: true, user: publicUser(user) }), req, session.token);
}

async function handleLogout(req: Request) {
  const token = readCookie(req, COOKIE_NAME);
  if (token) await prisma.messengerSession.deleteMany({ where: { token } });
  return clearSessionCookie(json({ ok: true }));
}

async function handleMe(req: Request) {
  const gate = await requireUser(req);
  if (!gate.user) return gate.response;
  const [unreadNotifications, conversations] = await Promise.all([
    prisma.messengerNotification.count({ where: { user_id: gate.user.id, read_at: null } }),
    prisma.messengerConversationMember.count({ where: { user_id: gate.user.id } }),
  ]);
  return json({ ok: true, user: publicUser(gate.user), unreadNotifications, conversations });
}

async function handleProfile(req: Request) {
  const gate = await requireUser(req);
  if (!gate.user) return gate.response;
  const parsed = profileSchema.safeParse(await parseBody(req));
  if (!parsed.success) return error("invalid_profile_payload", 400);
  const user = await prisma.messengerUser.update({
    where: { id: gate.user.id },
    data: {
      ...(parsed.data.displayName !== undefined && { display_name: parsed.data.displayName.trim() }),
      ...(parsed.data.statusMessage !== undefined && { status_message: parsed.data.statusMessage?.trim() || null }),
      ...(parsed.data.avatarUrl !== undefined && { avatar_url: parsed.data.avatarUrl?.trim() || null }),
      ...(parsed.data.accent !== undefined && { accent: parsed.data.accent.trim() || "#111827" }),
    },
  });
  return json({ ok: true, user: publicUser(user) });
}

async function handleUserSearch(req: Request) {
  const gate = await requireUser(req);
  if (!gate.user) return gate.response;
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return json({ ok: true, users: [] });
  const normalized = normalizeHandleValue(q);
  const users = await prisma.messengerUser.findMany({
    where: {
      id: { not: gate.user.id },
      OR: [
        { handle: { contains: normalized || q, mode: "insensitive" } },
        { display_name: { contains: q, mode: "insensitive" } },
        { email: { contains: q.toLowerCase(), mode: "insensitive" } },
      ],
    },
    take: 10,
    orderBy: { created_at: "desc" },
  });
  const result = await Promise.all(
    users.map(async (user) => ({ ...publicUser(user), relation: await relationStatus(gate.user!.id, user.id) }))
  );
  return json({ ok: true, users: result });
}

async function handleFriends(req: Request) {
  const gate = await requireUser(req);
  if (!gate.user) return gate.response;
  const [friendships, incoming, outgoing] = await Promise.all([
    prisma.messengerFriendship.findMany({
      where: { OR: [{ user_a_id: gate.user.id }, { user_b_id: gate.user.id }] },
      include: { user_a: true, user_b: true },
      orderBy: { updated_at: "desc" },
    }),
    prisma.messengerFriendRequest.findMany({
      where: { receiver_id: gate.user.id, status: "pending" },
      include: { requester: true },
      orderBy: { created_at: "desc" },
    }),
    prisma.messengerFriendRequest.findMany({
      where: { requester_id: gate.user.id, status: "pending" },
      include: { receiver: true },
      orderBy: { created_at: "desc" },
    }),
  ]);
  const friends = friendships.map((friendship) => {
    const isA = friendship.user_a_id === gate.user!.id;
    return {
      id: friendship.id,
      user: publicUser(isA ? friendship.user_b : friendship.user_a),
      nickname: isA ? friendship.nickname_a : friendship.nickname_b,
      createdAt: friendship.created_at.toISOString(),
    };
  });
  return json({
    ok: true,
    friends,
    incoming: incoming.map((item) => ({
      id: item.id,
      requester: publicUser(item.requester),
      createdAt: item.created_at.toISOString(),
    })),
    outgoing: outgoing.map((item) => ({
      id: item.id,
      receiver: publicUser(item.receiver),
      createdAt: item.created_at.toISOString(),
    })),
  });
}

async function handleFriendRequest(req: Request) {
  const gate = await requireUser(req);
  if (!gate.user) return gate.response;
  const parsed = friendRequestSchema.safeParse(await parseBody(req));
  if (!parsed.success) return error("invalid_friend_payload", 400);
  const query = parsed.data.query?.trim();
  const target = await prisma.messengerUser.findFirst({
    where: parsed.data.userId
      ? { id: parsed.data.userId }
      : {
          OR: [
            { handle: normalizeHandleValue(query ?? "") },
            { email: query ? normalizeEmail(query) : "" },
            { display_name: { equals: query ?? "", mode: "insensitive" } },
          ],
        },
  });
  if (!target) return error("user_not_found", 404, "사용자를 찾을 수 없습니다.");
  if (target.id === gate.user.id) return error("cannot_friend_self", 400, "자기 자신은 친구로 추가할 수 없습니다.");
  if (await friendshipBetween(gate.user.id, target.id)) {
    return json({ ok: true, status: "friend", user: publicUser(target) });
  }
  const incoming = await prisma.messengerFriendRequest.findUnique({
    where: { requester_id_receiver_id: { requester_id: target.id, receiver_id: gate.user.id } },
  });
  if (incoming?.status === "pending") {
    const [a, b] = sortedPair(gate.user.id, target.id);
    await prisma.$transaction([
      prisma.messengerFriendRequest.update({ where: { id: incoming.id }, data: { status: "accepted" } }),
      prisma.messengerFriendship.upsert({
        where: { user_a_id_user_b_id: { user_a_id: a, user_b_id: b } },
        create: { user_a_id: a, user_b_id: b },
        update: {},
      }),
    ]);
    await createNotification({
      userId: target.id,
      type: "friend_accept",
      title: `${gate.user.display_name}님과 친구가 되었습니다.`,
      body: "이제 1:1 대화를 시작할 수 있습니다.",
    });
    return json({ ok: true, status: "friend", user: publicUser(target) });
  }

  const request = await prisma.messengerFriendRequest.upsert({
    where: { requester_id_receiver_id: { requester_id: gate.user.id, receiver_id: target.id } },
    create: { requester_id: gate.user.id, receiver_id: target.id },
    update: { status: "pending" },
  });
  await createNotification({
    userId: target.id,
    type: "friend_request",
    title: `${gate.user.display_name}님의 친구 요청`,
    body: `@${gate.user.handle}님이 친구 추가를 요청했습니다.`,
  });
  return json({ ok: true, status: "pending_out", requestId: request.id, user: publicUser(target) });
}

async function handleFriendRequestAction(req: Request, requestId: string) {
  const gate = await requireUser(req);
  if (!gate.user) return gate.response;
  const body = await parseBody(req);
  const action = String(body.action ?? "");
  const request = await prisma.messengerFriendRequest.findFirst({
    where: { id: requestId, receiver_id: gate.user.id, status: "pending" },
    include: { requester: true },
  });
  if (!request) return error("request_not_found", 404);
  if (action === "decline") {
    await prisma.messengerFriendRequest.update({ where: { id: request.id }, data: { status: "declined" } });
    return json({ ok: true, status: "declined" });
  }
  if (action !== "accept") return error("invalid_action", 400);
  const [a, b] = sortedPair(gate.user.id, request.requester_id);
  await prisma.$transaction([
    prisma.messengerFriendRequest.update({ where: { id: request.id }, data: { status: "accepted" } }),
    prisma.messengerFriendship.upsert({
      where: { user_a_id_user_b_id: { user_a_id: a, user_b_id: b } },
      create: { user_a_id: a, user_b_id: b },
      update: {},
    }),
  ]);
  await createNotification({
    userId: request.requester_id,
    type: "friend_accept",
    title: `${gate.user.display_name}님이 친구 요청을 수락했습니다.`,
    body: "대화방을 열어 메시지를 보낼 수 있습니다.",
  });
  return json({ ok: true, status: "accepted", friend: publicUser(request.requester) });
}

async function handleConversationList(req: Request) {
  const gate = await requireUser(req);
  if (!gate.user) return gate.response;
  const memberships = await prisma.messengerConversationMember.findMany({
    where: { user_id: gate.user.id },
    include: {
      conversation: {
        include: {
          members: { include: { user: true } },
          messages: { take: 1, orderBy: { created_at: "desc" }, include: { sender: true } },
          calls: {
            where: { status: { in: ["ringing", "active"] } },
            take: 1,
            orderBy: { created_at: "desc" },
            include: { caller: true, receiver: true },
          },
        },
      },
    },
  });
  const conversations = await Promise.all(
    memberships
      .map((membership) => membership.conversation)
      .sort((a, b) => {
        const left = a.last_message_at?.getTime?.() ?? a.updated_at.getTime();
        const right = b.last_message_at?.getTime?.() ?? b.updated_at.getTime();
        return right - left;
      })
      .map((conversation) => serializeConversation(conversation, gate.user!.id))
  );
  return json({ ok: true, conversations });
}

async function handleConversationCreate(req: Request) {
  const gate = await requireUser(req);
  if (!gate.user) return gate.response;
  const parsed = conversationSchema.safeParse(await parseBody(req));
  if (!parsed.success) return error("invalid_conversation_payload", 400);
  const memberIds = Array.from(new Set([gate.user.id, ...parsed.data.memberIds])).slice(0, 13);
  if (memberIds.length < 2) return error("conversation_needs_members", 400);
  if (memberIds.length === 2 && (parsed.data.type ?? "direct") === "direct") {
    const otherId = memberIds.find((id) => id !== gate.user!.id)!;
    const existing = await findExistingDirectConversation(gate.user.id, otherId);
    if (existing) {
      const loaded = await loadConversationForUser(existing.id, gate.user.id);
      return json({ ok: true, conversation: await serializeConversation(loaded, gate.user.id) });
    }
  }

  const users = await prisma.messengerUser.findMany({ where: { id: { in: memberIds } }, select: { id: true } });
  if (users.length !== memberIds.length) return error("member_not_found", 404);
  const conversation = await prisma.messengerConversation.create({
    data: {
      type: memberIds.length === 2 && (parsed.data.type ?? "direct") === "direct" ? "direct" : "group",
      title: parsed.data.title?.trim() || null,
      created_by_id: gate.user.id,
      members: {
        create: memberIds.map((id) => ({
          user_id: id,
          role: id === gate.user!.id ? "owner" : "member",
          last_read_at: id === gate.user!.id ? new Date() : null,
        })),
      },
    },
    include: {
      members: { include: { user: true } },
      messages: { take: 1, orderBy: { created_at: "desc" }, include: { sender: true } },
      calls: { take: 1, include: { caller: true, receiver: true } },
    },
  });
  await Promise.all(
    memberIds
      .filter((id) => id !== gate.user!.id)
      .map((id) =>
        createNotification({
          userId: id,
          type: "conversation_invite",
          title: `${gate.user!.display_name}님이 대화방에 초대했습니다.`,
          body: conversation.title || "새 대화가 시작되었습니다.",
          conversationId: conversation.id,
        })
      )
  );
  return json({ ok: true, conversation: await serializeConversation(conversation, gate.user.id) });
}

async function handleMessages(req: Request, conversationId: string) {
  const gate = await requireUser(req);
  if (!gate.user) return gate.response;
  const member = await ensureConversationMember(conversationId, gate.user.id);
  if (!member) return error("conversation_not_found", 404);
  const { searchParams } = new URL(req.url);
  const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit")) || 60));
  const messages = await prisma.messengerMessage.findMany({
    where: { conversation_id: conversationId },
    take: limit,
    orderBy: { created_at: "asc" },
    include: { sender: true },
  });
  const last = messages[messages.length - 1];
  if (last) {
    await prisma.messengerConversationMember.update({
      where: { id: member.id },
      data: { last_read_message_id: last.id, last_read_at: new Date() },
    });
  }
  return json({ ok: true, messages: messages.map(serializeMessage) });
}

async function handleMessageCreate(req: Request, conversationId: string) {
  const gate = await requireUser(req);
  if (!gate.user) return gate.response;
  const parsed = messageSchema.safeParse(await parseBody(req));
  if (!parsed.success) return error("invalid_message_payload", 400, "메시지를 입력해 주세요.");
  const member = await ensureConversationMember(conversationId, gate.user.id);
  if (!member) return error("conversation_not_found", 404);
  const message = await prisma.messengerMessage.create({
    data: {
      conversation_id: conversationId,
      sender_id: gate.user.id,
      body: parsed.data.body.trim(),
      kind: parsed.data.kind ?? "text",
      meta: parsed.data.meta === undefined ? undefined : (parsed.data.meta as object),
    },
    include: { sender: true },
  });
  await prisma.messengerConversation.update({
    where: { id: conversationId },
    data: { last_message_at: message.created_at },
  });
  await prisma.messengerConversationMember.update({
    where: { id: member.id },
    data: { last_read_message_id: message.id, last_read_at: new Date() },
  });
  const recipients = await prisma.messengerConversationMember.findMany({
    where: { conversation_id: conversationId, user_id: { not: gate.user.id }, muted_at: null },
    select: { user_id: true },
  });
  await Promise.all(
    recipients.map((recipient) =>
      createNotification({
        userId: recipient.user_id,
        type: "message",
        title: `${gate.user!.display_name}님의 새 메시지`,
        body: message.body.slice(0, 120),
        conversationId,
        messageId: message.id,
      })
    )
  );
  return json({ ok: true, message: serializeMessage(message) });
}

async function handleNotifications(req: Request) {
  const gate = await requireUser(req);
  if (!gate.user) return gate.response;
  const items = await prisma.messengerNotification.findMany({
    where: { user_id: gate.user.id },
    take: 40,
    orderBy: { created_at: "desc" },
  });
  return json({ ok: true, notifications: items.map(serializeNotification) });
}

async function handleNotificationPatch(req: Request) {
  const gate = await requireUser(req);
  if (!gate.user) return gate.response;
  const body = await parseBody(req);
  const id = typeof body.id === "string" ? body.id : "";
  if (id) {
    await prisma.messengerNotification.updateMany({
      where: { id, user_id: gate.user.id },
      data: { read_at: new Date() },
    });
  } else {
    await prisma.messengerNotification.updateMany({
      where: { user_id: gate.user.id, read_at: null },
      data: { read_at: new Date() },
    });
  }
  return json({ ok: true });
}

async function handleCalls(req: Request) {
  const gate = await requireUser(req);
  if (!gate.user) return gate.response;
  const { searchParams } = new URL(req.url);
  const conversationId = searchParams.get("conversationId");
  const calls = await prisma.messengerCall.findMany({
    where: {
      status: { in: ["ringing", "active"] },
      conversation: {
        members: { some: { user_id: gate.user.id } },
      },
      ...(conversationId ? { conversation_id: conversationId } : {}),
    },
    take: 8,
    orderBy: { created_at: "desc" },
    include: { caller: true, receiver: true },
  });
  return json({ ok: true, calls: calls.map(serializeCall) });
}

async function handleCallStart(req: Request) {
  const gate = await requireUser(req);
  if (!gate.user) return gate.response;
  const parsed = callStartSchema.safeParse(await parseBody(req));
  if (!parsed.success) return error("invalid_call_payload", 400);
  const conversation = await loadConversationForUser(parsed.data.conversationId, gate.user.id);
  if (!conversation) return error("conversation_not_found", 404);
  const otherMembers = conversation.members.filter((member: any) => member.user_id !== gate.user!.id);
  const receiverId = parsed.data.receiverId || (conversation.type === "direct" ? otherMembers[0]?.user_id : null);
  const call = await prisma.messengerCall.create({
    data: {
      conversation_id: conversation.id,
      caller_id: gate.user.id,
      receiver_id: receiverId ?? null,
      status: "ringing",
    },
    include: { caller: true, receiver: true },
  });
  await Promise.all(
    otherMembers
      .filter((member: any) => !receiverId || member.user_id === receiverId)
      .map((member: any) =>
        createNotification({
          userId: member.user_id,
          type: "voice_call",
          title: `${gate.user!.display_name}님의 보이스톡`,
          body: "브라우저에서 마이크 권한을 허용하면 통화를 받을 수 있습니다.",
          conversationId: conversation.id,
          callId: call.id,
        })
      )
  );
  return json({ ok: true, call: serializeCall(call) });
}

async function handleCallGet(req: Request, callId: string) {
  const gate = await requireUser(req);
  if (!gate.user) return gate.response;
  const call = await prisma.messengerCall.findFirst({
    where: {
      id: callId,
      conversation: { members: { some: { user_id: gate.user.id } } },
    },
    include: { caller: true, receiver: true },
  });
  if (!call) return error("call_not_found", 404);
  return json({ ok: true, call: serializeCall(call) });
}

async function handleCallPatch(req: Request, callId: string) {
  const gate = await requireUser(req);
  if (!gate.user) return gate.response;
  const parsed = callPatchSchema.safeParse(await parseBody(req));
  if (!parsed.success) return error("invalid_call_patch", 400);
  const call = await prisma.messengerCall.findFirst({
    where: {
      id: callId,
      conversation: { members: { some: { user_id: gate.user.id } } },
    },
    include: { conversation: { include: { members: true } } },
  });
  if (!call) return error("call_not_found", 404);

  let update: Record<string, unknown> = {};
  if (parsed.data.action === "offer") {
    if (call.caller_id !== gate.user.id) return error("forbidden", 403);
    update = { offer: parsed.data.offer ?? null };
  }
  if (parsed.data.action === "answer") {
    if (call.caller_id === gate.user.id) return error("forbidden", 403);
    update = { answer: parsed.data.answer ?? null, status: "active", answered_at: new Date() };
  }
  if (parsed.data.action === "active") update = { status: "active", answered_at: call.answered_at ?? new Date() };
  if (parsed.data.action === "end") update = { status: "ended", ended_at: new Date() };

  const updated = await prisma.messengerCall.update({
    where: { id: call.id },
    data: update,
    include: { caller: true, receiver: true },
  });
  if (parsed.data.action === "end") {
    await Promise.all(
      call.conversation.members
        .filter((member) => member.user_id !== gate.user!.id)
        .map((member) =>
          createNotification({
            userId: member.user_id,
            type: "voice_call_end",
            title: "보이스톡이 종료되었습니다.",
            body: `${gate.user!.display_name}님이 통화를 종료했습니다.`,
            conversationId: call.conversation_id,
            callId: call.id,
          })
        )
    );
  }
  return json({ ok: true, call: serializeCall(updated) });
}

function routePath(contextPath: string[] | undefined) {
  return contextPath ?? [];
}

export async function GET(req: Request, context: Context) {
  const path = routePath((await context.params).path);
  if (path[0] === "me") return handleMe(req);
  if (path[0] === "users" && path[1] === "search") return handleUserSearch(req);
  if (path[0] === "friends") return handleFriends(req);
  if (path[0] === "conversations" && path.length === 1) return handleConversationList(req);
  if (path[0] === "conversations" && path[2] === "messages") return handleMessages(req, path[1]);
  if (path[0] === "notifications") return handleNotifications(req);
  if (path[0] === "calls" && path.length === 1) return handleCalls(req);
  if (path[0] === "calls" && path[1]) return handleCallGet(req, path[1]);
  return error("not_found", 404);
}

export async function POST(req: Request, context: Context) {
  const path = routePath((await context.params).path);
  if (path[0] === "auth" && path[1] === "register") return handleRegister(req);
  if (path[0] === "auth" && path[1] === "login") return handleLogin(req);
  if (path[0] === "auth" && path[1] === "logout") return handleLogout(req);
  if (path[0] === "friends") return handleFriendRequest(req);
  if (path[0] === "conversations" && path.length === 1) return handleConversationCreate(req);
  if (path[0] === "conversations" && path[2] === "messages") return handleMessageCreate(req, path[1]);
  if (path[0] === "calls") return handleCallStart(req);
  return error("not_found", 404);
}

export async function PATCH(req: Request, context: Context) {
  const path = routePath((await context.params).path);
  if (path[0] === "me") return handleProfile(req);
  if (path[0] === "friend-requests" && path[1]) return handleFriendRequestAction(req, path[1]);
  if (path[0] === "notifications") return handleNotificationPatch(req);
  if (path[0] === "calls" && path[1]) return handleCallPatch(req, path[1]);
  return error("not_found", 404);
}
