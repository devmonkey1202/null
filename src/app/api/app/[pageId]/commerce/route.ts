import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { resolveAnonUserId } from "@/lib/anon";
import { resolveAppUserFromRequest } from "@/lib/app-request";
import { apiErrorJson } from "@/lib/api-error";
import { parseJsonBody } from "@/lib/validation";
import { isAppActionAllowedWithContext } from "@/lib/app-permissions";
import {
  ensureCommerceSchema,
  getCommerceCatalog,
  addItemToCart,
  updateCartItem,
  removeCartItem,
  rebuildCartTotals,
  applyCouponToCart,
  createOrderFromCart,
  createPaymentForOrder,
  createRefund,
  adjustInventory,
  updateShipment,
  getCartSnapshot,
} from "@/lib/commerce";

type Params = { pageId: string };

async function getAccess(pageId: string, req: Request) {
  const page = await prisma.page.findUnique({
    where: { id: pageId, is_deleted: false },
    select: { id: true, owner_id: true, status: true, is_hidden: true },
  });
  if (!page) return { page: null as null, isOwner: false, appUser: null as null, anonId: null as string | null, userId: null as string | null };
  const anonId = await resolveAnonUserId(req);
  const user = anonId ? await prisma.user.findUnique({ where: { anon_id: anonId }, select: { id: true } }) : null;
  const isOwner = Boolean(user && user.id === page.owner_id);
  const appUser = await resolveAppUserFromRequest(pageId, req);
  return { page, isOwner, appUser, anonId, userId: user?.id ?? null };
}

function ensureAppAccess(role: string | undefined | null, action: "read" | "create" | "update" | "delete", context: { isOwner: boolean; appUserId?: string | null }) {
  if (context.isOwner) return null;
  if (!role) return apiErrorJson("auth_required", 401);
  if (!isAppActionAllowedWithContext(role, action, { isOwner: context.isOwner, appUserId: context.appUserId })) {
    return apiErrorJson("permission_denied", 403);
  }
  return null;
}

export async function GET(req: Request, context: { params: Promise<Params> }) {
  const { pageId } = await context.params;
  const url = new URL(req.url);
  const action = url.searchParams.get("action") ?? "catalog";
  const { page, isOwner, appUser } = await getAccess(pageId, req);
  if (!page) return apiErrorJson("not_found", 404);

  if (!isOwner && (page.is_hidden || page.status !== "live")) return apiErrorJson("not_found", 404);

  if (action === "catalog") {
    const catalog = await getCommerceCatalog(pageId);
    return NextResponse.json({ items: catalog });
  }

  if (action === "cart") {
    const targetAppUserId = isOwner ? url.searchParams.get("app_user_id") ?? appUser?.id ?? "" : appUser?.id ?? "";
    if (!targetAppUserId) return apiErrorJson("auth_required", 401);
    const perm = ensureAppAccess(appUser?.role, "read", { isOwner, appUserId: appUser?.id });
    if (perm) return perm;
    const snapshot = await getCartSnapshot(pageId, targetAppUserId);
    return NextResponse.json({ cart: snapshot.cart, items: snapshot.items });
  }

  return apiErrorJson("invalid_action", 400);
}

export async function POST(req: Request, context: { params: Promise<Params> }) {
  const { pageId } = await context.params;
  const { page, isOwner, appUser, anonId, userId } = await getAccess(pageId, req);
  if (!page) return apiErrorJson("not_found", 404);

  const parsed = await parseJsonBody(
    req,
    z
      .object({
        action: z.string().optional(),
      })
      .passthrough(),
  );
  if (parsed.error) return parsed.error;
  const body = parsed.data;
  const url = new URL(req.url);
  const action = (body.action ?? url.searchParams.get("action") ?? "").trim();

  const actor = { userId: userId ?? undefined, appUserId: appUser?.id, anonId: anonId ?? undefined };

  if (action === "bootstrap") {
    if (!isOwner) return apiErrorJson("owner_required", 403);
    const mode = (body.mode ?? url.searchParams.get("mode")) as "preserve" | "prune" | undefined;
    await ensureCommerceSchema(pageId, { mode: mode === "prune" ? "prune" : "preserve" });
    return NextResponse.json({ ok: true });
  }

  if (action === "inventory.adjust") {
    if (!isOwner) return apiErrorJson("owner_required", 403);
    const productId = typeof body.product_id === "string" ? body.product_id : "";
    if (!productId) return apiErrorJson("product_id_required", 400);
    const delta = typeof body.delta === "number" ? body.delta : undefined;
    const stock = typeof body.stock === "number" ? body.stock : undefined;
    const result = await adjustInventory(pageId, productId, { delta, stock });
    if (!result.ok) return apiErrorJson(result.error, 400);
    return NextResponse.json({ ok: true, stock: result.stock });
  }

  if (action === "cart.add") {
    const perm = ensureAppAccess(appUser?.role, "create", { isOwner, appUserId: appUser?.id });
    if (perm) return perm;
    const productId = typeof body.product_id === "string" ? body.product_id : "";
    const quantity = typeof body.quantity === "number" ? body.quantity : Number(body.quantity ?? 1);
    if (!productId) return apiErrorJson("product_id_required", 400);
    const targetAppUserId = appUser?.id ?? (typeof body.app_user_id === "string" ? body.app_user_id : "");
    if (!targetAppUserId && !isOwner) return apiErrorJson("auth_required", 401);
    if (!targetAppUserId) return apiErrorJson("app_user_id_required", 400);
    const result = await addItemToCart(pageId, targetAppUserId, productId, quantity, actor);
    if (!result.ok) return apiErrorJson(result.error, 400);
    await rebuildCartTotals(pageId, result.cartId);
    return NextResponse.json({ ok: true, cart_id: result.cartId });
  }

  if (action === "cart.update") {
    const perm = ensureAppAccess(appUser?.role, "update", { isOwner, appUserId: appUser?.id });
    if (perm) return perm;
    const cartItemId = typeof body.cart_item_id === "string" ? body.cart_item_id : "";
    const quantity = typeof body.quantity === "number" ? body.quantity : Number(body.quantity ?? 1);
    if (!cartItemId) return apiErrorJson("cart_item_id_required", 400);
    const result = await updateCartItem(pageId, cartItemId, quantity, actor);
    if (!result.ok) return apiErrorJson(result.error, 400);
    return NextResponse.json({ ok: true });
  }

  if (action === "cart.remove") {
    const perm = ensureAppAccess(appUser?.role, "delete", { isOwner, appUserId: appUser?.id });
    if (perm) return perm;
    const cartItemId = typeof body.cart_item_id === "string" ? body.cart_item_id : "";
    if (!cartItemId) return apiErrorJson("cart_item_id_required", 400);
    await removeCartItem(pageId, cartItemId);
    return NextResponse.json({ ok: true });
  }

  if (action === "cart.apply_coupon") {
    const perm = ensureAppAccess(appUser?.role, "update", { isOwner, appUserId: appUser?.id });
    if (perm) return perm;
    const cartId = typeof body.cart_id === "string" ? body.cart_id : "";
    const code = typeof body.code === "string" ? body.code : "";
    if (!cartId) return apiErrorJson("cart_id_required", 400);
    const result = await applyCouponToCart(pageId, cartId, code);
    if (!result.ok) return apiErrorJson(result.error, 400);
    await rebuildCartTotals(pageId, cartId);
    return NextResponse.json({ ok: true, coupon_id: result.couponId });
  }

  if (action === "cart.recalc") {
    const perm = ensureAppAccess(appUser?.role, "update", { isOwner, appUserId: appUser?.id });
    if (perm) return perm;
    const cartId = typeof body.cart_id === "string" ? body.cart_id : "";
    if (!cartId) return apiErrorJson("cart_id_required", 400);
    const result = await rebuildCartTotals(pageId, cartId);
    if (!result.ok) return apiErrorJson(result.error, 400);
    return NextResponse.json({ ok: true, totals: result.totals });
  }

  if (action === "order.create") {
    const perm = ensureAppAccess(appUser?.role, "create", { isOwner, appUserId: appUser?.id });
    if (perm) return perm;
    const cartId = typeof body.cart_id === "string" ? body.cart_id : "";
    if (!cartId) return apiErrorJson("cart_id_required", 400);
    const result = await createOrderFromCart(pageId, cartId, actor);
    if (!result.ok) return apiErrorJson(result.error, 400, (result as any).detail ?? undefined);
    return NextResponse.json({ ok: true, order_id: result.orderId });
  }

  if (action === "payment.create") {
    const perm = ensureAppAccess(appUser?.role, "create", { isOwner, appUserId: appUser?.id });
    if (perm) return perm;
    const orderId = typeof body.order_id === "string" ? body.order_id : "";
    const provider = typeof body.provider === "string" ? body.provider : undefined;
    if (!orderId) return apiErrorJson("order_id_required", 400);
    const result = await createPaymentForOrder(pageId, orderId, provider);
    if (!result.ok) return apiErrorJson("payment_failed", 400);
    return NextResponse.json({ ok: true, payment_id: result.paymentId, status: result.status });
  }

  if (action === "refund.create") {
    if (!isOwner) return apiErrorJson("owner_required", 403);
    const paymentId = typeof body.payment_id === "string" ? body.payment_id : "";
    const amount = typeof body.amount_cents === "number" ? body.amount_cents : Number(body.amount_cents ?? 0);
    if (!paymentId || !amount) return apiErrorJson("payment_id_required", 400);
    const result = await createRefund(pageId, paymentId, amount, typeof body.reason === "string" ? body.reason : undefined);
    if (!result.ok) return apiErrorJson("refund_failed", 400);
    return NextResponse.json({ ok: true, refund_id: result.refundId, status: result.status });
  }

  if (action === "shipment.update") {
    if (!isOwner) return apiErrorJson("owner_required", 403);
    const orderId = typeof body.order_id === "string" ? body.order_id : "";
    const status = typeof body.status === "string" ? body.status : "pending";
    if (!orderId) return apiErrorJson("order_id_required", 400);
    const result = await updateShipment(pageId, orderId, status, {
      carrier: typeof body.carrier === "string" ? body.carrier : undefined,
      tracking_number: typeof body.tracking_number === "string" ? body.tracking_number : undefined,
    });
    if (!result.ok) return apiErrorJson(result.error, 400);
    return NextResponse.json({ ok: true, status: result.status });
  }

  return apiErrorJson("invalid_action", 400);
}
