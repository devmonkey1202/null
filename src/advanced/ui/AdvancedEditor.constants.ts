import type { AutoLayout, GridAutoLayout, NodeType } from "../doc/scene";
import type { Tool } from "./AdvancedEditor.types";

export const GRID = 8;
export const DEFAULT_FONT_FAMILY =
  "Space Grotesk, 'Noto Sans KR', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif";

export const DEFAULT_AUTO_LAYOUT: AutoLayout = {
  mode: "auto" as const,
  dir: "row" as const,
  gap: 8,
  gapMode: "fixed" as const,
  justify: "start" as const,
  padding: { t: 16, r: 16, b: 16, l: 16 },
  align: "start" as const,
  wrap: false,
  wrapGap: 8,
  wrapAlign: "start" as const,
};

export const DEFAULT_GRID_LAYOUT: GridAutoLayout = {
  mode: "grid" as const,
  columns: 2,
  rows: 2,
  columnGap: 16,
  rowGap: 16,
  padding: { t: 16, r: 16, b: 16, l: 16 },
  columnsSizing: [{ type: "flex" as const, value: 1 }, { type: "flex" as const, value: 1 }],
  rowsSizing: [{ type: "hug" as const }, { type: "hug" as const }],
};

export const NODE_TYPE_LABELS: Partial<Record<NodeType, string>> = {
  frame: "프레임",
  group: "그룹",
  rect: "사각형",
  ellipse: "원",
  line: "선",
  arrow: "화살표",
  polygon: "다각형",
  star: "별",
  path: "패스",
  text: "텍스트",
  image: "이미지",
  video: "비디오",
  section: "섹션",
  slice: "슬라이스",
  component: "컴포넌트",
  instance: "인스턴스",
  hotspot: "핫스팟",
  table: "테이블",
};

export const MESSAGE_LABELS: Record<string, string> = {
  save_failed: "저장에 실패했습니다.",
  restore_failed: "복구에 실패했습니다.",
  publish_failed: "배포에 실패했습니다.",
  comment_failed: "댓글 저장에 실패했습니다. 잠시 후 다시 시도해 주세요.",
  comment_action_failed: "댓글 처리에 실패했습니다.",
  missing_page_id: "페이지 ID를 찾을 수 없습니다.",
  page_added: "페이지가 추가되었습니다.",
  page_duplicated: "페이지가 복제되었습니다.",
  page_deleted: "페이지가 삭제되었습니다.",
  page_delete_blocked: "페이지는 최소 1개 이상 유지되어야 합니다.",
  page_action_failed: "페이지 작업에 실패했습니다.",
  selection_required: "선택된 대상이 없습니다.",
  page_from_selection: "선택한 영역으로 새 페이지가 생성되었습니다.",
  form_step_added: "폼 단계가 추가되었습니다.",
  form_step_failed: "폼 단계 추가에 실패했습니다.",
  snap_done: "스냅이 적용되었습니다.",
  mode_added: "모드가 추가되었습니다.",
  mode_removed: "모드가 삭제되었습니다.",
  mode_renamed: "모드 이름이 변경되었습니다.",
  lock_applied: "선택한 레이어가 잠겼습니다.",
  unlock_applied: "선택한 레이어 잠금이 해제되었습니다.",
  hide_applied: "선택한 레이어가 숨겨졌습니다.",
  show_applied: "숨긴 레이어가 표시되었습니다.",
  fit_content_done: "내용에 맞게 정리했습니다.",
  tidy_parent_required: "부모 레이어를 선택해 주세요.",
  tidy_done: "정렬 완료.",
  zoom_no_selection: "선택된 노드가 없습니다.",
  preset_added: "프리셋이 추가되었습니다.",
  preset_failed: "프리셋 추가에 실패했습니다.",
  component_pushed: "컴포넌트가 업데이트되었습니다.",
  vector_conversion_unavailable: "선택한 도형은 현재 아웃라인 또는 오프셋 패스 변환을 지원하지 않습니다.",
  export_pdf_unsupported: "PDF 내보내기는 지원되지 않습니다. jspdf 설정을 확인하세요.",
  figma_token_required:
    "Figma Access Token이 필요합니다. Figma > Personal access tokens에서 생성 후 .env의 FIGMA_ACCESS_TOKEN에 등록하세요.",
  image_upload_failed: "이미지 업로드에 실패했습니다.",
};

export type MessageType = "success" | "error" | "info";

const ERROR_KEYS = new Set([
  "save_failed", "restore_failed", "publish_failed", "comment_failed",
  "comment_action_failed", "missing_page_id", "page_action_failed",
  "form_step_failed", "preset_failed", "export_pdf_unsupported",
  "figma_token_required", "image_upload_failed",
]);

const INFO_KEYS = new Set([
  "page_delete_blocked", "selection_required", "tidy_parent_required",
  "zoom_no_selection", "vector_conversion_unavailable",
]);

export function resolveMessageType(key: string): MessageType {
  if (ERROR_KEYS.has(key)) return "error";
  if (INFO_KEYS.has(key)) return "info";
  if (key.includes("fail") || key.includes("error")) return "error";
  return "success";
}

export const TOOL_OPTIONS: Array<{ id: Tool; label: string }> = [
  { id: "select", label: "선택" },
  { id: "hand", label: "손" },
  { id: "frame", label: "프레임" },
  { id: "section", label: "섹션" },
  { id: "slice", label: "슬라이스" },
  { id: "table", label: "테이블" },
  { id: "rect", label: "사각형" },
  { id: "ellipse", label: "원" },
  { id: "line", label: "선" },
  { id: "arrow", label: "화살표" },
  { id: "polygon", label: "다각형" },
  { id: "star", label: "별" },
  { id: "path", label: "패스" },
  { id: "text", label: "텍스트" },
  { id: "image", label: "이미지" },
  { id: "video", label: "비디오" },
  { id: "comment", label: "댓글" },
];

/** 툴바 그룹: 선택·손·코멘트 | 프레임·섹션·슬라이스 | 도형 | 텍스트·미디어 */
export const TOOL_GROUPS: Array<{ ids: Tool[] }> = [
  { ids: ["select", "hand", "comment"] },
  { ids: ["frame", "section", "slice", "table"] },
  { ids: ["rect", "ellipse", "line", "arrow", "polygon", "star", "path"] },
  { ids: ["text", "image", "video"] },
];
