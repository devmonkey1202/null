const STORAGE_KEY = "anon_user_id";

export function readAnonUserId() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(STORAGE_KEY);
}

export function withAnonHeaders(headers?: HeadersInit) {
  const anonUserId = readAnonUserId();
  if (!anonUserId) return headers;

  const nextHeaders = new Headers(headers);
  nextHeaders.set("x-anon-user-id", anonUserId);
  return nextHeaders;
}
