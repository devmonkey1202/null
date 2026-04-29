import { prisma } from "@/lib/db";
import { getCollabInviteFromRequest, isCollabInviteValid } from "@/lib/collab";

export type PageForAsset = {
  id: string;
  owner_id: string;
  is_hidden: boolean;
  status: string;
  live_expires_at: Date | null;
  deployed_at: Date | null;
  collab_invite_code: string | null;
  collab_invite_enabled: boolean;
};

export type PublishedPageState = Pick<
  PageForAsset,
  "is_hidden" | "status" | "live_expires_at" | "deployed_at"
>;

export function isPublishedPageAccessible(page: PublishedPageState): boolean {
  if (page.is_hidden) return false;
  const isLive = page.status === "live";
  const isDeployed = page.deployed_at != null;
  if (!isLive && !isDeployed) return false;
  if (isLive && page.live_expires_at && page.live_expires_at <= new Date()) return false;
  return true;
}

export function canAccessPublishedPage(page: PublishedPageState, isOwner: boolean): boolean {
  if (isOwner) return true;
  return isPublishedPageAccessible(page);
}

/**
 * 페이지가 "참여 가능"(채팅/할일 등 자산 기능 사용)인지 판단.
 * - 소유자: 항상 허용
 * - 협업 초대 유효: 허용
 * - 그 외: live 또는 deployed 이고, 숨김 아니고, live 만료 전이면 허용
 */
export function canParticipateOnPage(
  page: PageForAsset,
  viewerUserId: string | null,
  allowInvite: boolean
): boolean {
  if (allowInvite) return true;
  if (page.owner_id === viewerUserId) return true;
  return isPublishedPageAccessible(page);
}

const pageSelect = {
  id: true,
  owner_id: true,
  is_hidden: true,
  status: true,
  live_expires_at: true,
  deployed_at: true,
  collab_invite_code: true,
  collab_invite_enabled: true,
} as const;

/**
 * 페이지 조회 + 참여 가능 여부. 없으면 null.
 */
export async function getPageForAsset(
  pageId: string,
  req: Request,
  viewerUserId: string | null
): Promise<PageForAsset | null> {
  const page = await prisma.page.findFirst({
    where: { id: pageId, is_deleted: false },
    select: pageSelect,
  });
  if (!page) return null;
  const collabInvite = getCollabInviteFromRequest(req);
  const allowInvite = isCollabInviteValid(collabInvite, {
    collab_invite_code: page.collab_invite_code ?? null,
    collab_invite_enabled: page.collab_invite_enabled ?? false,
  });
  if (!canParticipateOnPage(page, viewerUserId, allowInvite)) return null;
  return page;
}
