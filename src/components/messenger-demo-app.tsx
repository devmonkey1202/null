"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

type MessengerUser = {
  id: string;
  email: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  statusMessage: string | null;
  accent: string;
};

type Friend = {
  id: string;
  user: MessengerUser;
  nickname: string | null;
  createdAt: string;
};

type FriendRequest = {
  id: string;
  requester?: MessengerUser;
  receiver?: MessengerUser;
  createdAt: string;
};

type MessengerMessage = {
  id: string;
  conversationId: string;
  senderId: string;
  sender: MessengerUser | null;
  body: string;
  kind: string;
  createdAt: string;
};

type MessengerCall = {
  id: string;
  conversationId: string;
  callerId: string;
  caller: MessengerUser | null;
  receiverId: string | null;
  receiver: MessengerUser | null;
  status: "ringing" | "active" | "ended" | string;
  offer: RTCSessionDescriptionInit | null;
  answer: RTCSessionDescriptionInit | null;
  startedAt: string;
  answeredAt: string | null;
  endedAt: string | null;
};

type ConversationMember = {
  id: string;
  userId: string;
  role: string;
  nickname: string | null;
  lastReadAt: string | null;
  user: MessengerUser;
};

type Conversation = {
  id: string;
  type: "direct" | "group" | string;
  title: string;
  avatarUrl: string | null;
  members: ConversationMember[];
  lastMessage: MessengerMessage | null;
  unreadCount: number;
  activeCall: MessengerCall | null;
  lastMessageAt: string | null;
};

type NotificationItem = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  conversationId: string | null;
  callId: string | null;
  readAt: string | null;
  createdAt: string;
};

type SearchUser = MessengerUser & { relation: "self" | "friend" | "pending_out" | "pending_in" | "none" };

type ApiError = { error?: string; message?: string };

type Tab = "chats" | "friends" | "alerts" | "settings";

const API_BASE = "/api/messenger";

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
    credentials: "include",
  });
  const data = (await res.json().catch(() => ({}))) as ApiError;
  if (!res.ok) throw new Error(data.message || data.error || "요청에 실패했습니다.");
  return data as T;
}

function initials(user?: MessengerUser | null) {
  const source = user?.displayName || user?.handle || "N";
  return source.trim().slice(0, 2).toUpperCase();
}

function relativeTime(value?: string | null) {
  if (!value) return "";
  const diff = Date.now() - new Date(value).getTime();
  if (diff < 60_000) return "방금";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}분 전`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}시간 전`;
  return `${Math.floor(diff / 86_400_000)}일 전`;
}

function Avatar({ user, size = 42 }: { user?: MessengerUser | null; size?: number }) {
  return (
    <span
      className="messenger-demo-avatar"
      style={{ width: size, height: size, background: user?.accent || "#07111f", fontSize: Math.max(11, size / 3.2) }}
    >
      {initials(user)}
    </span>
  );
}

export default function MessengerDemoApp() {
  const [user, setUser] = useState<MessengerUser | null>(null);
  const [authMode, setAuthMode] = useState<"login" | "register">("register");
  const [tab, setTab] = useState<Tab>("chats");
  const [friends, setFriends] = useState<Friend[]>([]);
  const [incoming, setIncoming] = useState<FriendRequest[]>([]);
  const [outgoing, setOutgoing] = useState<FriendRequest[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [calls, setCalls] = useState<MessengerCall[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string>("");
  const [messages, setMessages] = useState<MessengerMessage[]>([]);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchUser[]>([]);
  const [messageDraft, setMessageDraft] = useState("");
  const [groupOpen, setGroupOpen] = useState(false);
  const [groupTitle, setGroupTitle] = useState("");
  const [groupMembers, setGroupMembers] = useState<Record<string, boolean>>({});
  const [callState, setCallState] = useState<{ call: MessengerCall | null; status: string; muted: boolean }>({
    call: null,
    status: "대기 중",
    muted: false,
  });

  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const activeConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === activeConversationId) ?? null,
    [activeConversationId, conversations]
  );
  const incomingCall = useMemo(
    () => calls.find((call) => call.status === "ringing" && call.callerId !== user?.id) ?? null,
    [calls, user?.id]
  );
  const unreadNotifications = notifications.filter((item) => !item.readAt).length;

  const loadMe = useCallback(async () => {
    try {
      const data = await api<{ ok: boolean; user: MessengerUser }>("/me");
      setUser(data.user);
    } catch {
      setUser(null);
    }
  }, []);

  const loadFriends = useCallback(async () => {
    if (!user) return;
    const data = await api<{ ok: boolean; friends: Friend[]; incoming: FriendRequest[]; outgoing: FriendRequest[] }>("/friends");
    setFriends(data.friends);
    setIncoming(data.incoming);
    setOutgoing(data.outgoing);
  }, [user]);

  const loadConversations = useCallback(async () => {
    if (!user) return;
    const data = await api<{ ok: boolean; conversations: Conversation[] }>("/conversations");
    setConversations(data.conversations);
    setCalls(data.conversations.flatMap((conversation) => (conversation.activeCall ? [conversation.activeCall] : [])));
    if (!activeConversationId && data.conversations[0]) setActiveConversationId(data.conversations[0].id);
  }, [activeConversationId, user]);

  const loadNotifications = useCallback(async () => {
    if (!user) return;
    const data = await api<{ ok: boolean; notifications: NotificationItem[] }>("/notifications");
    setNotifications(data.notifications);
  }, [user]);

  const loadCalls = useCallback(async () => {
    if (!user) return;
    const data = await api<{ ok: boolean; calls: MessengerCall[] }>("/calls");
    setCalls(data.calls);
  }, [user]);

  const loadMessages = useCallback(
    async (conversationId: string) => {
      if (!user || !conversationId) return;
      const data = await api<{ ok: boolean; messages: MessengerMessage[] }>(`/conversations/${conversationId}/messages`);
      setMessages(data.messages);
    },
    [user]
  );

  const refreshAll = useCallback(async () => {
    if (!user) return;
    await Promise.all([loadFriends(), loadConversations(), loadNotifications(), loadCalls()]);
  }, [loadCalls, loadConversations, loadFriends, loadNotifications, user]);

  useEffect(() => {
    void loadMe();
  }, [loadMe]);

  useEffect(() => {
    if (!user) return;
    void refreshAll();
  }, [refreshAll, user]);

  useEffect(() => {
    if (!activeConversationId || !user) return;
    void loadMessages(activeConversationId);
  }, [activeConversationId, loadMessages, user]);

  useEffect(() => {
    if (!user) return;
    const timer = window.setInterval(() => {
      void refreshAll();
      if (activeConversationId) void loadMessages(activeConversationId);
    }, 3000);
    return () => window.clearInterval(timer);
  }, [activeConversationId, loadMessages, refreshAll, user]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  useEffect(() => {
    if (!callState.call || callState.call.status === "ended") return;
    const timer = window.setInterval(async () => {
      try {
        const data = await api<{ ok: boolean; call: MessengerCall }>(`/calls/${callState.call!.id}`);
        setCallState((prev) => ({ ...prev, call: data.call, status: data.call.status === "active" ? "연결됨" : prev.status }));
        if (data.call.status === "ended") stopLocalCall("통화 종료");
        if (data.call.answer && peerRef.current && callState.call?.callerId === user?.id && !peerRef.current.currentRemoteDescription) {
          await peerRef.current.setRemoteDescription(data.call.answer);
          setCallState((prev) => ({ ...prev, status: "상대와 음성 연결됨" }));
        }
      } catch {
        return;
      }
    }, 1600);
    return () => window.clearInterval(timer);
  }, [callState.call, user?.id]);

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setNotice("");
    const form = new FormData(event.currentTarget);
    try {
      const endpoint = authMode === "register" ? "/auth/register" : "/auth/login";
      const payload =
        authMode === "register"
          ? {
              email: String(form.get("email") ?? ""),
              password: String(form.get("password") ?? ""),
              displayName: String(form.get("displayName") ?? ""),
              handle: String(form.get("handle") ?? ""),
            }
          : {
              email: String(form.get("email") ?? ""),
              password: String(form.get("password") ?? ""),
            };
      const data = await api<{ ok: boolean; user: MessengerUser }>(endpoint, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setUser(data.user);
      setNotice("");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "처리하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await api("/auth/logout", { method: "POST" }).catch(() => null);
    setUser(null);
    setFriends([]);
    setConversations([]);
    setNotifications([]);
    setMessages([]);
    setActiveConversationId("");
    stopLocalCall("로그아웃");
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const data = await api<{ ok: boolean; user: MessengerUser }>("/me", {
        method: "PATCH",
        body: JSON.stringify({
          displayName: String(form.get("displayName") ?? ""),
          statusMessage: String(form.get("statusMessage") ?? ""),
          avatarUrl: String(form.get("avatarUrl") ?? ""),
          accent: String(form.get("accent") ?? "#111827"),
        }),
      });
      setUser(data.user);
      setNotice("프로필이 저장되었습니다.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "프로필 저장 실패");
    }
  }

  async function searchUsers(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (searchQuery.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    const data = await api<{ ok: boolean; users: SearchUser[] }>(`/users/search?q=${encodeURIComponent(searchQuery.trim())}`);
    setSearchResults(data.users);
  }

  async function requestFriend(target: SearchUser) {
    try {
      await api("/friends", { method: "POST", body: JSON.stringify({ userId: target.id }) });
      setSearchResults((prev) => prev.map((item) => (item.id === target.id ? { ...item, relation: "pending_out" } : item)));
      await loadFriends();
      setNotice(`${target.displayName}님에게 친구 요청을 보냈습니다.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "친구 요청 실패");
    }
  }

  async function respondRequest(id: string, action: "accept" | "decline") {
    await api(`/friend-requests/${id}`, { method: "PATCH", body: JSON.stringify({ action }) });
    await refreshAll();
  }

  async function openDirect(friend: Friend) {
    const data = await api<{ ok: boolean; conversation: Conversation }>("/conversations", {
      method: "POST",
      body: JSON.stringify({ memberIds: [friend.user.id], type: "direct" }),
    });
    await loadConversations();
    setActiveConversationId(data.conversation.id);
    setTab("chats");
  }

  async function createGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const memberIds = Object.entries(groupMembers)
      .filter(([, selected]) => selected)
      .map(([id]) => id);
    if (!memberIds.length) {
      setNotice("초대할 친구를 선택해 주세요.");
      return;
    }
    const data = await api<{ ok: boolean; conversation: Conversation }>("/conversations", {
      method: "POST",
      body: JSON.stringify({ memberIds, type: "group", title: groupTitle || "새 그룹 대화" }),
    });
    setGroupOpen(false);
    setGroupMembers({});
    setGroupTitle("");
    await loadConversations();
    setActiveConversationId(data.conversation.id);
    setTab("chats");
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeConversationId || !messageDraft.trim()) return;
    const body = messageDraft.trim();
    setMessageDraft("");
    const data = await api<{ ok: boolean; message: MessengerMessage }>(`/conversations/${activeConversationId}/messages`, {
      method: "POST",
      body: JSON.stringify({ body }),
    });
    setMessages((prev) => [...prev, data.message]);
    await loadConversations();
  }

  async function markNotificationsRead() {
    await api("/notifications", { method: "PATCH", body: JSON.stringify({}) });
    await loadNotifications();
  }

  async function waitForIce(pc: RTCPeerConnection) {
    if (pc.iceGatheringState === "complete") return;
    await new Promise<void>((resolve) => {
      const timeout = window.setTimeout(resolve, 2600);
      pc.addEventListener(
        "icegatheringstatechange",
        () => {
          if (pc.iceGatheringState === "complete") {
            window.clearTimeout(timeout);
            resolve();
          }
        },
        { once: false }
      );
    });
  }

  async function createPeer(stream: MediaStream) {
    const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
    stream.getTracks().forEach((track) => pc.addTrack(track, stream));
    pc.ontrack = (event) => {
      const [remote] = event.streams;
      if (remoteAudioRef.current && remote) {
        remoteAudioRef.current.srcObject = remote;
        void remoteAudioRef.current.play().catch(() => null);
      }
    };
    peerRef.current = pc;
    return pc;
  }

  async function ensureMic() {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("이 브라우저는 마이크 통화를 지원하지 않습니다.");
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    localStreamRef.current = stream;
    return stream;
  }

  async function startVoiceCall() {
    if (!activeConversation) return;
    try {
      setNotice("");
      setCallState({ call: null, status: "마이크 권한 요청 중", muted: false });
      const created = await api<{ ok: boolean; call: MessengerCall }>("/calls", {
        method: "POST",
        body: JSON.stringify({ conversationId: activeConversation.id }),
      });
      const stream = await ensureMic();
      const pc = await createPeer(stream);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await waitForIce(pc);
      const patched = await api<{ ok: boolean; call: MessengerCall }>(`/calls/${created.call.id}`, {
        method: "PATCH",
        body: JSON.stringify({ action: "offer", offer: pc.localDescription }),
      });
      setCallState({ call: patched.call, status: "상대 응답 대기 중", muted: false });
      await refreshAll();
    } catch (error) {
      stopLocalCall("통화 실패");
      setNotice(error instanceof Error ? error.message : "통화를 시작하지 못했습니다.");
    }
  }

  async function acceptVoiceCall(call: MessengerCall) {
    try {
      if (!call.offer) {
        setNotice("상대의 통화 신호를 기다리고 있습니다. 잠시 후 다시 눌러 주세요.");
        return;
      }
      setCallState({ call, status: "마이크 권한 요청 중", muted: false });
      const stream = await ensureMic();
      const pc = await createPeer(stream);
      await pc.setRemoteDescription(call.offer);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await waitForIce(pc);
      const patched = await api<{ ok: boolean; call: MessengerCall }>(`/calls/${call.id}`, {
        method: "PATCH",
        body: JSON.stringify({ action: "answer", answer: pc.localDescription }),
      });
      setCallState({ call: patched.call, status: "상대와 음성 연결됨", muted: false });
      await refreshAll();
    } catch (error) {
      stopLocalCall("통화 실패");
      setNotice(error instanceof Error ? error.message : "통화를 받을 수 없습니다.");
    }
  }

  async function endVoiceCall() {
    const call = callState.call ?? incomingCall;
    if (call) {
      await api(`/calls/${call.id}`, { method: "PATCH", body: JSON.stringify({ action: "end" }) }).catch(() => null);
    }
    stopLocalCall("통화 종료");
    await refreshAll();
  }

  function stopLocalCall(status: string) {
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    peerRef.current?.close();
    peerRef.current = null;
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
    setCallState((prev) => ({ ...prev, call: null, status }));
  }

  function toggleMute() {
    const next = !callState.muted;
    localStreamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = !next;
    });
    setCallState((prev) => ({ ...prev, muted: next }));
  }

  if (!user) {
    return (
      <div className="messenger-demo-shell relative flex min-h-screen items-center px-6 py-10">
        <div className="messenger-demo-orb left-[10%] top-[12%] h-40 w-40 rounded-full bg-cyan-300/40" />
        <div className="messenger-demo-orb bottom-[14%] right-[12%] h-56 w-56 rounded-full bg-violet-300/35" />
        <div className="mx-auto grid w-full max-w-6xl gap-6 lg:grid-cols-[1.05fr_0.95fr]">
          <section className="messenger-demo-dark-glass rounded-[36px] p-8 lg:p-10">
            <div className="text-xs font-bold uppercase text-cyan-100">NULL Messenger Lab</div>
            <h1 className="mt-5 max-w-2xl text-5xl font-black leading-[1.02] tracking-tight lg:text-6xl">
              친구, 대화, 알림, 보이스톡까지 한 화면에서 검증합니다.
            </h1>
            <p className="mt-6 max-w-2xl text-sm leading-7 text-white/78">
              이 데모는 NULL 본체 계정과 분리된 샘플 메신저입니다. 회원가입 후 다른 계정을 하나 더 만들어 친구 요청,
              1:1 대화, 그룹방, 알림, 브라우저 음성 통화를 직접 확인할 수 있습니다.
            </p>
            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              {["친구 요청", "대화 기록", "보이스톡"].map((label, index) => (
                <div key={label} className="rounded-[24px] border border-white/15 bg-white/10 p-4">
                  <div className="text-3xl font-black">{index + 1}</div>
                  <div className="mt-3 text-sm font-bold text-white">{label}</div>
                  <div className="mt-1 text-xs text-white/62">실제 DB 저장</div>
                </div>
              ))}
            </div>
          </section>

          <section className="messenger-demo-glass rounded-[36px] p-6">
            <div className="mb-5 flex rounded-full border border-slate-200 bg-white/60 p-1 text-sm font-bold">
              <button
                type="button"
                onClick={() => setAuthMode("register")}
                className={`flex-1 rounded-full px-4 py-2 ${authMode === "register" ? "bg-[#07111f] text-white" : "text-slate-500"}`}
              >
                회원가입
              </button>
              <button
                type="button"
                onClick={() => setAuthMode("login")}
                className={`flex-1 rounded-full px-4 py-2 ${authMode === "login" ? "bg-[#07111f] text-white" : "text-slate-500"}`}
              >
                로그인
              </button>
            </div>
            <form className="space-y-3" onSubmit={submitAuth}>
              {authMode === "register" ? (
                <>
                  <input className="messenger-demo-field" name="displayName" placeholder="표시 이름" />
                  <input className="messenger-demo-field" name="handle" placeholder="핸들 예: null_user" />
                </>
              ) : null}
              <input className="messenger-demo-field" name="email" type="email" placeholder="이메일" />
              <input className="messenger-demo-field" name="password" type="password" placeholder="비밀번호, 6자 이상" />
              {notice ? <p className="rounded-[18px] bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{notice}</p> : null}
              <button className="messenger-demo-button messenger-demo-button-primary w-full" disabled={busy}>
                {busy ? "처리 중" : authMode === "register" ? "데모 계정 만들기" : "로그인"}
              </button>
            </form>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="messenger-demo-shell relative min-h-screen px-4 py-5 lg:px-6">
      <audio ref={remoteAudioRef} autoPlay playsInline />
      <div className="mx-auto grid h-[calc(100vh-40px)] max-w-[1500px] grid-cols-1 gap-4 lg:grid-cols-[290px_360px_1fr]">
        <aside className="messenger-demo-glass flex min-h-0 flex-col rounded-[32px] p-4">
          <div className="messenger-demo-dark-glass rounded-[28px] p-4">
            <div className="flex items-center gap-3">
              <Avatar user={user} size={52} />
              <div className="min-w-0">
                <div className="truncate text-lg font-black">{user.displayName}</div>
                <div className="truncate text-xs text-white/66">@{user.handle}</div>
              </div>
            </div>
            <p className="mt-4 min-h-10 text-sm leading-5 text-white/78">{user.statusMessage || "상태 메시지를 설정해 보세요."}</p>
          </div>

          <nav className="mt-4 grid gap-2">
            {[
              ["chats", "대화", conversations.reduce((sum, item) => sum + item.unreadCount, 0)],
              ["friends", "친구", incoming.length],
              ["alerts", "알림", unreadNotifications],
              ["settings", "설정", 0],
            ].map(([key, label, badge]) => (
              <button
                key={String(key)}
                type="button"
                onClick={() => setTab(key as Tab)}
                className={`flex items-center justify-between rounded-[20px] px-4 py-3 text-sm font-bold transition ${
                  tab === key ? "bg-[#07111f] text-white shadow-[0_16px_36px_rgba(7,17,31,0.16)]" : "bg-white/62 text-slate-600 hover:bg-white"
                }`}
              >
                <span>{String(label)}</span>
                {Number(badge) > 0 ? (
                  <span className={`rounded-full px-2 py-0.5 text-[11px] ${tab === key ? "bg-white text-[#07111f]" : "bg-[#07111f] text-white"}`}>
                    {String(badge)}
                  </span>
                ) : null}
              </button>
            ))}
          </nav>

          <div className="mt-auto rounded-[24px] border border-slate-200 bg-white/60 p-4">
            <div className="text-xs font-bold uppercase text-slate-400">Call State</div>
            <div className="mt-2 text-sm font-black text-slate-950">{callState.call ? callState.status : incomingCall ? "수신 통화 있음" : "통화 대기"}</div>
            <div className="mt-3 flex gap-2">
              {callState.call ? (
                <>
                  <button className="messenger-demo-button messenger-demo-button-soft h-9 min-h-9 flex-1 px-3" onClick={toggleMute}>
                    {callState.muted ? "마이크 켜기" : "음소거"}
                  </button>
                  <button className="messenger-demo-button messenger-demo-button-danger h-9 min-h-9 flex-1 px-3" onClick={endVoiceCall}>
                    종료
                  </button>
                </>
              ) : incomingCall ? (
                <>
                  <button className="messenger-demo-button messenger-demo-button-primary h-9 min-h-9 flex-1 px-3" onClick={() => acceptVoiceCall(incomingCall)}>
                    받기
                  </button>
                  <button className="messenger-demo-button messenger-demo-button-danger h-9 min-h-9 flex-1 px-3" onClick={endVoiceCall}>
                    거절
                  </button>
                </>
              ) : (
                <span className="text-xs leading-5 text-slate-500">대화방에서 보이스톡을 시작할 수 있습니다.</span>
              )}
            </div>
          </div>

          {notice ? <div className="mt-3 rounded-[18px] bg-slate-950 px-4 py-3 text-xs font-bold text-white">{notice}</div> : null}
        </aside>

        <section className="messenger-demo-glass flex min-h-0 flex-col rounded-[32px] p-4">
          {tab === "chats" ? (
            <ConversationList
              conversations={conversations}
              activeConversationId={activeConversationId}
              onSelect={setActiveConversationId}
              onOpenGroup={() => setGroupOpen(true)}
              userId={user.id}
            />
          ) : null}
          {tab === "friends" ? (
            <FriendsPanel
              friends={friends}
              incoming={incoming}
              outgoing={outgoing}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              searchResults={searchResults}
              onSearch={searchUsers}
              onRequest={requestFriend}
              onRespond={respondRequest}
              onOpenDirect={openDirect}
            />
          ) : null}
          {tab === "alerts" ? <AlertsPanel notifications={notifications} onReadAll={markNotificationsRead} /> : null}
          {tab === "settings" ? <SettingsPanel user={user} onSave={saveProfile} onLogout={logout} /> : null}
        </section>

        <main className="messenger-demo-glass flex min-h-0 flex-col overflow-hidden rounded-[32px]">
          {activeConversation ? (
            <>
              <header className="flex items-center justify-between border-b border-slate-200/80 bg-white/54 px-5 py-4">
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar user={activeConversation.members.find((member) => member.userId !== user.id)?.user ?? user} size={46} />
                  <div className="min-w-0">
                    <h2 className="truncate text-lg font-black text-slate-950">{activeConversation.title}</h2>
                    <p className="truncate text-xs font-semibold text-slate-500">
                      {activeConversation.members.map((member) => member.user.displayName).join(", ")}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button className="messenger-demo-button messenger-demo-button-soft" onClick={startVoiceCall}>
                    보이스톡
                  </button>
                  <button className="messenger-demo-button messenger-demo-button-soft" onClick={() => void loadMessages(activeConversation.id)}>
                    새로고침
                  </button>
                </div>
              </header>

              <div className="messenger-demo-thread min-h-0 flex-1 overflow-y-auto px-5 py-5">
                {messages.length ? (
                  <div className="space-y-4">
                    {messages.map((message) => {
                      const mine = message.senderId === user.id;
                      return (
                        <div key={message.id} className={`flex gap-3 ${mine ? "justify-end" : "justify-start"}`}>
                          {!mine ? <Avatar user={message.sender} size={34} /> : null}
                          <div className={`flex max-w-[78%] flex-col ${mine ? "items-end" : "items-start"}`}>
                            {!mine ? <span className="mb-1 text-xs font-bold text-slate-500">{message.sender?.displayName ?? "상대"}</span> : null}
                            <div className={`messenger-demo-bubble ${mine ? "messenger-demo-bubble-me" : "messenger-demo-bubble-other"}`}>
                              {message.body}
                            </div>
                            <span className="mt-1 text-[11px] font-semibold text-slate-400">{relativeTime(message.createdAt)}</span>
                          </div>
                        </div>
                      );
                    })}
                    <div ref={messagesEndRef} />
                  </div>
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <div className="max-w-sm text-center">
                      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[24px] bg-slate-950 text-xl font-black text-white">N</div>
                      <h3 className="mt-4 text-xl font-black text-slate-950">첫 메시지를 보내세요</h3>
                      <p className="mt-2 text-sm leading-6 text-slate-500">메시지는 DB에 저장되고 상대 계정의 알림과 대화 목록에 바로 반영됩니다.</p>
                    </div>
                  </div>
                )}
              </div>

              <form className="border-t border-slate-200/80 bg-white/72 p-4" onSubmit={sendMessage}>
                <div className="flex gap-3">
                  <input
                    className="messenger-demo-field"
                    value={messageDraft}
                    onChange={(event) => setMessageDraft(event.target.value)}
                    placeholder="메시지를 입력하세요"
                  />
                  <button className="messenger-demo-button messenger-demo-button-primary shrink-0">전송</button>
                </div>
              </form>
            </>
          ) : (
            <div className="flex h-full items-center justify-center p-8 text-center">
              <div>
                <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-[30px] bg-slate-950 text-2xl font-black text-white">N</div>
                <h2 className="mt-5 text-2xl font-black text-slate-950">대화가 아직 없습니다</h2>
                <p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">친구를 추가한 뒤 1:1 대화를 열거나 그룹방을 만들어 보세요.</p>
              </div>
            </div>
          )}
        </main>
      </div>

      {groupOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/34 px-4 backdrop-blur-sm">
          <form className="messenger-demo-glass w-full max-w-lg rounded-[32px] p-5" onSubmit={createGroup}>
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-black text-slate-950">그룹방 만들기</h2>
              <button type="button" className="messenger-demo-button messenger-demo-button-soft" onClick={() => setGroupOpen(false)}>
                닫기
              </button>
            </div>
            <input className="messenger-demo-field mt-4" value={groupTitle} onChange={(event) => setGroupTitle(event.target.value)} placeholder="그룹방 이름" />
            <div className="mt-4 max-h-72 space-y-2 overflow-y-auto">
              {friends.map((friend) => (
                <label key={friend.user.id} className="flex items-center gap-3 rounded-[20px] border border-slate-200 bg-white/70 p-3">
                  <input
                    type="checkbox"
                    checked={!!groupMembers[friend.user.id]}
                    onChange={(event) => setGroupMembers((prev) => ({ ...prev, [friend.user.id]: event.target.checked }))}
                  />
                  <Avatar user={friend.user} size={36} />
                  <span className="font-bold text-slate-950">{friend.user.displayName}</span>
                </label>
              ))}
            </div>
            <button className="messenger-demo-button messenger-demo-button-primary mt-5 w-full">그룹방 생성</button>
          </form>
        </div>
      ) : null}
    </div>
  );
}

function ConversationList({
  conversations,
  activeConversationId,
  onSelect,
  onOpenGroup,
  userId,
}: {
  conversations: Conversation[];
  activeConversationId: string;
  onSelect: (id: string) => void;
  onOpenGroup: () => void;
  userId: string;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs font-bold uppercase text-slate-400">Messages</div>
          <h2 className="text-2xl font-black text-slate-950">대화</h2>
        </div>
        <button className="messenger-demo-button messenger-demo-button-primary" onClick={onOpenGroup}>
          그룹
        </button>
      </div>
      <div className="mt-4 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
        {conversations.length ? (
          conversations.map((conversation) => {
            const peer = conversation.members.find((member) => member.userId !== userId)?.user;
            const active = conversation.id === activeConversationId;
            return (
              <button
                key={conversation.id}
                type="button"
                onClick={() => onSelect(conversation.id)}
                className={`w-full rounded-[24px] border p-4 text-left transition ${
                  active ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 bg-white/70 text-slate-950 hover:bg-white"
                }`}
              >
                <div className="flex items-center gap-3">
                  <Avatar user={peer} size={42} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="truncate text-sm font-black">{conversation.title}</div>
                      <div className={`text-[11px] ${active ? "text-white/58" : "text-slate-400"}`}>
                        {relativeTime(conversation.lastMessageAt || conversation.lastMessage?.createdAt)}
                      </div>
                    </div>
                    <div className={`mt-1 truncate text-xs ${active ? "text-white/64" : "text-slate-500"}`}>
                      {conversation.lastMessage?.body || `${conversation.members.length}명 참여 중`}
                    </div>
                  </div>
                  {conversation.unreadCount > 0 ? (
                    <span className={`rounded-full px-2 py-1 text-[11px] font-black ${active ? "bg-white text-slate-950" : "bg-slate-950 text-white"}`}>
                      {conversation.unreadCount}
                    </span>
                  ) : null}
                </div>
              </button>
            );
          })
        ) : (
          <EmptyState title="아직 대화가 없습니다" body="친구 탭에서 대화를 시작하세요." />
        )}
      </div>
    </div>
  );
}

function FriendsPanel({
  friends,
  incoming,
  outgoing,
  searchQuery,
  setSearchQuery,
  searchResults,
  onSearch,
  onRequest,
  onRespond,
  onOpenDirect,
}: {
  friends: Friend[];
  incoming: FriendRequest[];
  outgoing: FriendRequest[];
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  searchResults: SearchUser[];
  onSearch: (event?: FormEvent<HTMLFormElement>) => void;
  onRequest: (user: SearchUser) => void;
  onRespond: (id: string, action: "accept" | "decline") => void;
  onOpenDirect: (friend: Friend) => void;
}) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto pr-1">
      <div className="text-xs font-bold uppercase text-slate-400">People</div>
      <h2 className="text-2xl font-black text-slate-950">친구</h2>
      <form className="mt-4 flex gap-2" onSubmit={onSearch}>
        <input className="messenger-demo-field" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="핸들, 이름, 이메일 검색" />
        <button className="messenger-demo-button messenger-demo-button-primary shrink-0">검색</button>
      </form>
      <div className="mt-3 space-y-2">
        {searchResults.map((item) => (
          <div key={item.id} className="messenger-demo-card rounded-[22px] p-3">
            <div className="flex items-center gap-3">
              <Avatar user={item} size={38} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-black">{item.displayName}</div>
                <div className="truncate text-xs text-slate-500">@{item.handle}</div>
              </div>
              <button
                className="messenger-demo-button messenger-demo-button-soft h-9 min-h-9 px-3"
                disabled={item.relation !== "none"}
                onClick={() => onRequest(item)}
              >
                {item.relation === "friend" ? "친구" : item.relation === "pending_out" ? "요청됨" : item.relation === "pending_in" ? "수락 대기" : "추가"}
              </button>
            </div>
          </div>
        ))}
      </div>

      {incoming.length ? (
        <section className="mt-5">
          <h3 className="text-sm font-black text-slate-950">받은 요청</h3>
          <div className="mt-2 space-y-2">
            {incoming.map((request) => (
              <div key={request.id} className="messenger-demo-card rounded-[22px] p-3">
                <div className="flex items-center gap-3">
                  <Avatar user={request.requester} size={38} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-black">{request.requester?.displayName}</div>
                    <div className="text-xs text-slate-500">@{request.requester?.handle}</div>
                  </div>
                </div>
                <div className="mt-3 flex gap-2">
                  <button className="messenger-demo-button messenger-demo-button-primary h-9 min-h-9 flex-1" onClick={() => onRespond(request.id, "accept")}>
                    수락
                  </button>
                  <button className="messenger-demo-button messenger-demo-button-soft h-9 min-h-9 flex-1" onClick={() => onRespond(request.id, "decline")}>
                    거절
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="mt-5">
        <div className="flex items-end justify-between">
          <h3 className="text-sm font-black text-slate-950">친구 목록</h3>
          <span className="text-xs font-bold text-slate-400">{friends.length}명</span>
        </div>
        <div className="mt-2 space-y-2">
          {friends.length ? (
            friends.map((friend) => (
              <div key={friend.id} className="messenger-demo-card rounded-[22px] p-3">
                <div className="flex items-center gap-3">
                  <Avatar user={friend.user} size={40} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-black">{friend.user.displayName}</div>
                    <div className="truncate text-xs text-slate-500">{friend.user.statusMessage || `@${friend.user.handle}`}</div>
                  </div>
                  <button className="messenger-demo-button messenger-demo-button-primary h-9 min-h-9 px-3" onClick={() => onOpenDirect(friend)}>
                    대화
                  </button>
                </div>
              </div>
            ))
          ) : (
            <EmptyState title="친구가 없습니다" body="검색으로 다른 데모 계정을 추가하세요." />
          )}
        </div>
        {outgoing.length ? <p className="mt-3 text-xs font-semibold text-slate-500">보낸 요청 {outgoing.length}개가 대기 중입니다.</p> : null}
      </section>
    </div>
  );
}

function AlertsPanel({ notifications, onReadAll }: { notifications: NotificationItem[]; onReadAll: () => void }) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto pr-1">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs font-bold uppercase text-slate-400">Inbox</div>
          <h2 className="text-2xl font-black text-slate-950">알림</h2>
        </div>
        <button className="messenger-demo-button messenger-demo-button-soft" onClick={onReadAll}>
          모두 읽음
        </button>
      </div>
      <div className="mt-4 space-y-2">
        {notifications.length ? (
          notifications.map((item) => (
            <div key={item.id} className={`rounded-[24px] border p-4 ${item.readAt ? "border-slate-200 bg-white/58" : "border-slate-950 bg-slate-950 text-white"}`}>
              <div className="text-sm font-black">{item.title}</div>
              {item.body ? <div className={`mt-1 text-xs leading-5 ${item.readAt ? "text-slate-500" : "text-white/68"}`}>{item.body}</div> : null}
              <div className={`mt-3 text-[11px] font-bold ${item.readAt ? "text-slate-400" : "text-white/50"}`}>{relativeTime(item.createdAt)}</div>
            </div>
          ))
        ) : (
          <EmptyState title="알림 없음" body="친구 요청, 메시지, 보이스톡 알림이 여기에 쌓입니다." />
        )}
      </div>
    </div>
  );
}

function SettingsPanel({
  user,
  onSave,
  onLogout,
}: {
  user: MessengerUser;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
  onLogout: () => void;
}) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto pr-1">
      <div className="text-xs font-bold uppercase text-slate-400">Profile</div>
      <h2 className="text-2xl font-black text-slate-950">설정</h2>
      <form className="mt-4 space-y-3" onSubmit={onSave}>
        <input className="messenger-demo-field" name="displayName" defaultValue={user.displayName} placeholder="표시 이름" />
        <input className="messenger-demo-field" name="statusMessage" defaultValue={user.statusMessage ?? ""} placeholder="상태 메시지" />
        <input className="messenger-demo-field" name="avatarUrl" defaultValue={user.avatarUrl ?? ""} placeholder="아바타 URL" />
        <div className="grid grid-cols-6 gap-2">
          {["#111827", "#2563eb", "#7c3aed", "#0891b2", "#059669", "#dc2626"].map((color) => (
            <label key={color} className="cursor-pointer">
              <input className="sr-only" type="radio" name="accent" value={color} defaultChecked={user.accent === color} />
              <span className="block h-10 rounded-[16px] border border-white shadow-sm" style={{ background: color }} />
            </label>
          ))}
        </div>
        <button className="messenger-demo-button messenger-demo-button-primary w-full">프로필 저장</button>
      </form>
      <div className="messenger-demo-card mt-5 rounded-[24px] p-4">
        <div className="text-sm font-black text-slate-950">계정</div>
        <p className="mt-1 text-xs leading-5 text-slate-500">{user.email}</p>
        <button className="messenger-demo-button messenger-demo-button-danger mt-4 w-full" onClick={onLogout}>
          로그아웃
        </button>
      </div>
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-[24px] border border-dashed border-slate-300 bg-white/44 p-6 text-center">
      <div className="text-sm font-black text-slate-950">{title}</div>
      <p className="mt-2 text-xs leading-5 text-slate-500">{body}</p>
    </div>
  );
}
