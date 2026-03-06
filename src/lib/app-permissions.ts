export type AppRole = "admin" | "editor" | "viewer" | "user";
export type AppAction = "read" | "create" | "update" | "delete" | "manage_users";

const ROLE_PERMISSIONS: Record<AppRole, Set<AppAction>> = {
  admin: new Set(["read", "create", "update", "delete", "manage_users"]),
  editor: new Set(["read", "create", "update"]),
  viewer: new Set(["read"]),
  user: new Set(["read", "create", "update", "delete"]),
};

export function normalizeAppRole(role?: string | null): AppRole {
  const value = typeof role === "string" ? role.trim().toLowerCase() : "";
  if (value === "admin" || value === "editor" || value === "viewer" || value === "user") return value;
  return "user";
}

export function isAppActionAllowed(role: string | null | undefined, action: AppAction) {
  const normalized = normalizeAppRole(role);
  return ROLE_PERMISSIONS[normalized].has(action);
}

export type AppActionContext = {
  isOwner?: boolean;
  appUserId?: string | null;
  recordAppUserId?: string | null;
};

export function isAppActionAllowedWithContext(
  role: string | null | undefined,
  action: AppAction,
  context?: AppActionContext
) {
  if (context?.isOwner) return true;
  if (!isAppActionAllowed(role, action)) return false;
  const normalized = normalizeAppRole(role);
  if (normalized === "admin") return true;

  if (context?.recordAppUserId) {
    if (!context.appUserId) return false;
    return context.recordAppUserId === context.appUserId;
  }
  return true;
}
