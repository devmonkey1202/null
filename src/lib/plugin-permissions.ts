export type PermissionAction = {
  type: string;
  steps?: PermissionAction[];
};

export const PERMISSION_LABELS: Record<string, string> = {
  editor: "편집기 조작",
  export: "내보내기",
  network: "외부 네트워크",
  ui: "UI 변경",
  data_read: "데이터 읽기",
  data_write: "데이터 쓰기",
  workflow: "워크플로우 실행",
  secrets_read: "비밀키 접근",
};

export const ALL_PLUGIN_PERMISSION_KEYS = Object.keys(PERMISSION_LABELS);

function actionPermissionKeys(type: string): string[] {
  switch (type) {
    case "align":
    case "distribute":
      return ["editor"];
    case "exportTokens":
    case "exportSelectionPng":
    case "exportSelectionSvg":
      return ["export"];
    case "toggleGrid":
    case "togglePixelGrid":
    case "toggleAudit":
    case "togglePerformance":
      return ["ui"];
    case "openUrl":
      return ["network"];
    case "importWeb":
      return ["editor", "network"];
    default:
      return [];
  }
}

function summarizePermissions(actions: PermissionAction[], declared?: string[]) {
  const permissions = new Set<string>();
  if (Array.isArray(declared)) {
    declared.forEach((p) => {
      if (PERMISSION_LABELS[p]) permissions.add(p);
    });
  }

  const walk = (list: PermissionAction[]) => {
    list.forEach((action) => {
      if (action.type === "macro" && Array.isArray(action.steps)) {
        walk(action.steps);
        return;
      }
      actionPermissionKeys(action.type).forEach((key) => {
        if (PERMISSION_LABELS[key]) permissions.add(key);
      });
    });
  };
  walk(actions);

  return Array.from(permissions);
}

export function describePermissions(actions: PermissionAction[], declared?: string[]) {
  const keys = summarizePermissions(actions, declared);
  return keys.map((key) => ({ key, label: PERMISSION_LABELS[key] ?? key }));
}
