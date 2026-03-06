import { cookies } from "next/headers";
import { getAppUserByTokenForPage, type AppUserPublic } from "@/lib/app-auth";

export async function resolveAppUserFromRequest(pageId: string, req: Request): Promise<AppUserPublic | null> {
  const authHeader = req.headers.get("authorization");
  let token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) {
    const cookieStore = await cookies();
    token = cookieStore.get(`app_token_${pageId}`)?.value ?? "";
  }
  if (!token) return null;
  return getAppUserByTokenForPage(pageId, token);
}
