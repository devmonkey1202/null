export type PermissionAction = {
  type: string;
  steps?: PermissionAction[];
};

const PERMISSION_LABELS: Record<string, string> = {
  editor: "편집기 조작",
  export: "내보내기",
  network: "외부 네트워크",
  ui: "UI 변경",
  data_read: "데이터 읽기",
  data_write: "데이터 쓰기",
  workflow: "워크플로우 실행",
  secrets_read: "비밀키 접근",
};

function actionPermissionLabel(type: string): string | null {
  switch (type) {
    case "align":
    case "distribute":
      return "편집기 조작";
    case "exportTokens":
    case "exportSelectionPng":
    case "exportSelectionSvg":
      return "내보내기";
    case "toggleGrid":
    case "togglePixelGrid":
    case "toggleAudit":
    case "togglePerformance":
      return "UI 변경";
    case "openUrl":
      return "외부 네트워크";
    default:
      return null;
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
      const label = actionPermissionLabel(action.type);
      if (label) {
        const key = Object.entries(PERMISSION_LABELS).find(([, value]) => value === label)?.[0];
        if (key) permissions.add(key);
      }
    });
  };
  walk(actions);

  return Array.from(permissions);
}

export function describePermissions(actions: PermissionAction[], declared?: string[]) {
  const keys = summarizePermissions(actions, declared);
  return keys.map((key) => ({ key, label: PERMISSION_LABELS[key] ?? key }));
}
