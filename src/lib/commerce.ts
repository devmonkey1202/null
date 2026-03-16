import Stripe from "stripe";
import { prisma } from "@/lib/db";
import {
  type AppCollectionDef,
  type AppFieldDef,
  type AppRecordActor,
  createRecord,
  updateRecord,
  getRecord,
  setSchema,
} from "@/lib/app-data";

export const COMMERCE_COLLECTIONS = {
  products: "commerce_products",
  categories: "commerce_categories",
  inventory: "commerce_inventory",
  carts: "commerce_carts",
  cartItems: "commerce_cart_items",
  orders: "commerce_orders",
  orderItems: "commerce_order_items",
  payments: "commerce_payments",
  refunds: "commerce_refunds",
  coupons: "commerce_coupons",
  promotions: "commerce_promotions",
  shipments: "commerce_shipments",
  taxRates: "commerce_tax_rates",
} as const;

const STATUS_ENUM = {
  cart: ["open", "checked_out", "abandoned"],
  order: ["pending", "paid", "fulfilled", "cancelled", "refunded"],
  payment: ["pending", "succeeded", "failed"],
  refund: ["pending", "succeeded", "failed"],
  shipping: ["pending", "packed", "shipped", "delivered"],
  discount: ["percent", "fixed"],
} as const;

const DEFAULT_CURRENCY = "KRW";

function asString(value: unknown, fallback = "") {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return fallback;
  return String(value);
}

function asNumber(value: unknown, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function asBoolean(value: unknown, fallback = false) {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}

function normalizeCode(value: unknown) {
  return asString(value, "").trim().toLowerCase();
}

function isActiveWindow(now: Date, start?: unknown, end?: unknown) {
  const startTs = start ? new Date(String(start)).getTime() : null;
  const endTs = end ? new Date(String(end)).getTime() : null;
  if (startTs && Number.isFinite(startTs) && now.getTime() < startTs) return false;
  if (endTs && Number.isFinite(endTs) && now.getTime() > endTs) return false;
  return true;
}

function commerceField(name: string, type: AppFieldDef["type"], extra?: Partial<AppFieldDef>): AppFieldDef {
  return { name, type, ...extra };
}

export function getCommerceSchema(): AppCollectionDef[] {
  return [
    {
      slug: COMMERCE_COLLECTIONS.categories,
      name: "Product Categories",
      strict: true,
      fields: [
        commerceField("name", "string", { required: true, minLength: 1, maxLength: 120 }),
        commerceField("slug", "string", { required: true, pattern: "^[a-z0-9\\-]+$" }),
        commerceField("description", "string", { maxLength: 800 }),
      ],
    },
    {
      slug: COMMERCE_COLLECTIONS.products,
      name: "Products",
      strict: true,
      fields: [
        commerceField("name", "string", { required: true, minLength: 1, maxLength: 160 }),
        commerceField("sku", "string", { maxLength: 80 }),
        commerceField("description", "string", { maxLength: 2000 }),
        commerceField("price_cents", "number", { required: true, min: 0 }),
        commerceField("currency", "string", { default: DEFAULT_CURRENCY, minLength: 3, maxLength: 6 }),
        commerceField("active", "boolean", { default: true }),
        commerceField("category_id", "relation"),
        commerceField("image_url", "string", { maxLength: 2000 }),
        commerceField("tax_category", "string", { maxLength: 80 }),
        commerceField("metadata", "json"),
      ],
    },
    {
      slug: COMMERCE_COLLECTIONS.inventory,
      name: "Inventory",
      strict: true,
      fields: [
        commerceField("product_id", "relation", { required: true }),
        commerceField("stock", "number", { required: true, min: 0, default: 0 }),
        commerceField("reserved", "number", { min: 0, default: 0 }),
        commerceField("allow_backorder", "boolean", { default: false }),
        commerceField("warehouse", "string", { maxLength: 120 }),
      ],
    },
    {
      slug: COMMERCE_COLLECTIONS.carts,
      name: "Carts",
      strict: true,
      fields: [
        commerceField("app_user_id", "string", { required: true }),
        commerceField("status", "string", { default: "open", enum: [...STATUS_ENUM.cart] }),
        commerceField("currency", "string", { default: DEFAULT_CURRENCY }),
        commerceField("subtotal_cents", "number", { default: 0, min: 0 }),
        commerceField("discount_cents", "number", { default: 0, min: 0 }),
        commerceField("tax_cents", "number", { default: 0, min: 0 }),
        commerceField("shipping_cents", "number", { default: 0, min: 0 }),
        commerceField("total_cents", "number", { default: 0, min: 0 }),
        commerceField("coupon_code", "string", { maxLength: 80 }),
        commerceField("promotion_id", "relation"),
        commerceField("shipping_address", "json"),
        commerceField("tax_context", "json"),
        commerceField("notes", "string", { maxLength: 1000 }),
      ],
    },
    {
      slug: COMMERCE_COLLECTIONS.cartItems,
      name: "Cart Items",
      strict: true,
      fields: [
        commerceField("cart_id", "relation", { required: true }),
        commerceField("product_id", "relation", { required: true }),
        commerceField("quantity", "number", { required: true, min: 1 }),
        commerceField("unit_price_cents", "number", { required: true, min: 0 }),
        commerceField("line_total_cents", "number", { required: true, min: 0 }),
      ],
    },
    {
      slug: COMMERCE_COLLECTIONS.orders,
      name: "Orders",
      strict: true,
      fields: [
        commerceField("app_user_id", "string", { required: true }),
        commerceField("status", "string", { default: "pending", enum: [...STATUS_ENUM.order] }),
        commerceField("payment_status", "string", { default: "pending", enum: [...STATUS_ENUM.payment, "refunded"] }),
        commerceField("shipping_status", "string", { default: "pending", enum: [...STATUS_ENUM.shipping] }),
        commerceField("currency", "string", { default: DEFAULT_CURRENCY }),
        commerceField("subtotal_cents", "number", { default: 0, min: 0 }),
        commerceField("discount_cents", "number", { default: 0, min: 0 }),
        commerceField("tax_cents", "number", { default: 0, min: 0 }),
        commerceField("shipping_cents", "number", { default: 0, min: 0 }),
        commerceField("total_cents", "number", { default: 0, min: 0 }),
        commerceField("coupon_code", "string", { maxLength: 80 }),
        commerceField("promotion_id", "relation"),
        commerceField("shipping_address", "json"),
        commerceField("billing_address", "json"),
        commerceField("stock_adjusted", "boolean", { default: false }),
        commerceField("notes", "string", { maxLength: 1000 }),
      ],
    },
    {
      slug: COMMERCE_COLLECTIONS.orderItems,
      name: "Order Items",
      strict: true,
      fields: [
        commerceField("order_id", "relation", { required: true }),
        commerceField("product_id", "relation", { required: true }),
        commerceField("quantity", "number", { required: true, min: 1 }),
        commerceField("unit_price_cents", "number", { required: true, min: 0 }),
        commerceField("line_total_cents", "number", { required: true, min: 0 }),
        commerceField("tax_cents", "number", { min: 0, default: 0 }),
      ],
    },
    {
      slug: COMMERCE_COLLECTIONS.payments,
      name: "Payments",
      strict: true,
      fields: [
        commerceField("order_id", "relation", { required: true }),
        commerceField("provider", "string", { default: "mock" }),
        commerceField("provider_ref", "string", { maxLength: 120 }),
        commerceField("status", "string", { default: "pending", enum: [...STATUS_ENUM.payment] }),
        commerceField("amount_cents", "number", { required: true, min: 0 }),
        commerceField("currency", "string", { default: DEFAULT_CURRENCY }),
        commerceField("captured", "boolean", { default: false }),
        commerceField("failure_reason", "string", { maxLength: 200 }),
      ],
    },
    {
      slug: COMMERCE_COLLECTIONS.refunds,
      name: "Refunds",
      strict: true,
      fields: [
        commerceField("payment_id", "relation", { required: true }),
        commerceField("order_id", "relation", { required: true }),
        commerceField("status", "string", { default: "pending", enum: [...STATUS_ENUM.refund] }),
        commerceField("amount_cents", "number", { required: true, min: 0 }),
        commerceField("reason", "string", { maxLength: 200 }),
      ],
    },
    {
      slug: COMMERCE_COLLECTIONS.coupons,
      name: "Coupons",
      strict: true,
      fields: [
        commerceField("code", "string", { required: true, minLength: 2, maxLength: 40 }),
        commerceField("type", "string", { required: true, enum: [...STATUS_ENUM.discount] }),
        commerceField("value", "number", { required: true, min: 0 }),
        commerceField("min_subtotal_cents", "number", { min: 0 }),
        commerceField("max_redemptions", "number", { min: 1 }),
        commerceField("used_count", "number", { min: 0, default: 0 }),
        commerceField("starts_at", "date"),
        commerceField("expires_at", "date"),
        commerceField("active", "boolean", { default: true }),
      ],
    },
    {
      slug: COMMERCE_COLLECTIONS.promotions,
      name: "Promotions",
      strict: true,
      fields: [
        commerceField("name", "string", { required: true, minLength: 2, maxLength: 120 }),
        commerceField("type", "string", { required: true, enum: [...STATUS_ENUM.discount] }),
        commerceField("value", "number", { required: true, min: 0 }),
        commerceField("active", "boolean", { default: true }),
        commerceField("starts_at", "date"),
        commerceField("ends_at", "date"),
        commerceField("rule", "json"),
      ],
    },
    {
      slug: COMMERCE_COLLECTIONS.shipments,
      name: "Shipments",
      strict: true,
      fields: [
        commerceField("order_id", "relation", { required: true }),
        commerceField("carrier", "string", { maxLength: 80 }),
        commerceField("tracking_number", "string", { maxLength: 120 }),
        commerceField("status", "string", { default: "pending", enum: [...STATUS_ENUM.shipping] }),
        commerceField("shipped_at", "date"),
        commerceField("delivered_at", "date"),
        commerceField("meta", "json"),
      ],
    },
    {
      slug: COMMERCE_COLLECTIONS.taxRates,
      name: "Tax Rates",
      strict: true,
      fields: [
        commerceField("name", "string", { required: true, minLength: 2, maxLength: 120 }),
        commerceField("rate", "number", { required: true, min: 0 }),
        commerceField("country", "string", { maxLength: 2 }),
        commerceField("region", "string", { maxLength: 64 }),
        commerceField("active", "boolean", { default: true }),
      ],
    },
  ];
}

export async function ensureCommerceSchema(pageId: string, options?: { mode?: "preserve" | "prune" }) {
  return setSchema(pageId, getCommerceSchema(), { mode: options?.mode ?? "preserve" });
}

export type CartTotals = {
  subtotalCents: number;
  discountCents: number;
  taxCents: number;
  shippingCents: number;
  totalCents: number;
};

export function computeCartTotals(args: {
  items: Array<{ quantity: number; unitPriceCents: number }>;
  discountCents?: number;
  taxRate?: number;
  shippingCents?: number;
}): CartTotals {
  const subtotal = args.items.reduce((acc, item) => acc + Math.max(0, item.quantity) * Math.max(0, item.unitPriceCents), 0);
  const discount = Math.min(Math.max(args.discountCents ?? 0, 0), subtotal);
  const base = Math.max(subtotal - discount, 0);
  const tax = Math.round(base * Math.max(args.taxRate ?? 0, 0));
  const shipping = Math.max(args.shippingCents ?? 0, 0);
  return {
    subtotalCents: subtotal,
    discountCents: discount,
    taxCents: tax,
    shippingCents: shipping,
    totalCents: Math.max(base + tax + shipping, 0),
  };
}

async function loadRecords(pageId: string, slug: string, limit = 500) {
  return prisma.appRecord.findMany({
    where: { page_id: pageId, collection_slug: slug },
    orderBy: { created_at: "desc" },
    take: limit,
  });
}

async function findRecordByField(pageId: string, slug: string, field: string, value: string) {
  const records = await loadRecords(pageId, slug);
  return records.find((record) => asString((record.data as Record<string, unknown>)?.[field]) === value) ?? null;
}

async function getOpenCart(pageId: string, appUserId: string) {
  const carts = await prisma.appRecord.findMany({
    where: { page_id: pageId, collection_slug: COMMERCE_COLLECTIONS.carts, app_user_id: appUserId },
    orderBy: { created_at: "desc" },
    take: 10,
  });
  return carts.find((cart) => {
    const status = asString((cart.data as Record<string, unknown>)?.status, "open");
    return status === "open";
  }) ?? null;
}

async function getCartItems(pageId: string, cartId: string) {
  const items = await loadRecords(pageId, COMMERCE_COLLECTIONS.cartItems);
  return items.filter((item) => asString((item.data as Record<string, unknown>)?.cart_id) === cartId);
}

async function getOrderItems(pageId: string, orderId: string) {
  const items = await loadRecords(pageId, COMMERCE_COLLECTIONS.orderItems);
  return items.filter((item) => asString((item.data as Record<string, unknown>)?.order_id) === orderId);
}

async function resolveCoupon(pageId: string, code: string) {
  if (!code) return null;
  const records = await loadRecords(pageId, COMMERCE_COLLECTIONS.coupons);
  const normalized = normalizeCode(code);
  const now = new Date();
  const match = records.find((record) => normalizeCode((record.data as Record<string, unknown>)?.code) === normalized);
  if (!match) return null;
  const data = match.data as Record<string, unknown>;
  if (!asBoolean(data.active, true)) return null;
  if (!isActiveWindow(now, data.starts_at, data.expires_at)) return null;
  const maxRedemptions = asNumber(data.max_redemptions, 0);
  const usedCount = asNumber(data.used_count, 0);
  if (maxRedemptions > 0 && usedCount >= maxRedemptions) return null;
  return match;
}

async function resolvePromotion(pageId: string, subtotalCents: number) {
  const records = await loadRecords(pageId, COMMERCE_COLLECTIONS.promotions);
  const now = new Date();
  const active = records.filter((record) => {
    const data = record.data as Record<string, unknown>;
    if (!asBoolean(data.active, true)) return false;
    return isActiveWindow(now, data.starts_at, data.ends_at);
  });
  let best: { record: typeof records[number]; discount: number } | null = null;
  for (const record of active) {
    const data = record.data as Record<string, unknown>;
    const type = asString(data.type);
    const value = asNumber(data.value, 0);
    const discount = type === "percent" ? Math.round(subtotalCents * (value / 100)) : value;
    if (!best || discount > best.discount) {
      best = { record, discount };
    }
  }
  return best;
}

async function resolveTaxRate(pageId: string, context?: Record<string, unknown>) {
  const records = await loadRecords(pageId, COMMERCE_COLLECTIONS.taxRates);
  const country = asString(context?.country).toUpperCase();
  const region = asString(context?.region).toLowerCase();
  const active = records.filter((record) => asBoolean((record.data as Record<string, unknown>)?.active, true));
  const match = active.find((record) => {
    const data = record.data as Record<string, unknown>;
    const rcountry = asString(data.country).toUpperCase();
    const rregion = asString(data.region).toLowerCase();
    if (country && rcountry && country !== rcountry) return false;
    if (region && rregion && region !== rregion) return false;
    return true;
  });
  if (!match) return null;
  const rate = asNumber((match.data as Record<string, unknown>)?.rate, 0);
  return { record: match, rate };
}

function buildCartTotalsFromItems(
  items: Array<{ quantity: number; unitPriceCents: number }>,
  couponDiscount: number,
  promotionDiscount: number,
  taxRate: number,
  shippingCents: number,
) {
  const discount = Math.max(couponDiscount, promotionDiscount);
  return computeCartTotals({ items, discountCents: discount, taxRate, shippingCents });
}

export async function getCommerceCatalog(pageId: string) {
  const [products, categories, inventory] = await Promise.all([
    loadRecords(pageId, COMMERCE_COLLECTIONS.products),
    loadRecords(pageId, COMMERCE_COLLECTIONS.categories),
    loadRecords(pageId, COMMERCE_COLLECTIONS.inventory),
  ]);
  const categoryMap = new Map(categories.map((c) => [c.id, c]));
  const inventoryMap = new Map<string, typeof inventory[number]>();
  for (const inv of inventory) {
    const productId = asString((inv.data as Record<string, unknown>)?.product_id);
    if (productId) inventoryMap.set(productId, inv);
  }
  return products
    .filter((p) => asBoolean((p.data as Record<string, unknown>)?.active, true))
    .map((product) => {
      const data = product.data as Record<string, unknown>;
      const categoryId = asString(data.category_id);
      const inv = inventoryMap.get(product.id);
      return {
        id: product.id,
        ...data,
        category: categoryId ? categoryMap.get(categoryId)?.data ?? null : null,
        inventory: inv ? inv.data : null,
      };
    });
}

export async function addItemToCart(pageId: string, appUserId: string, productId: string, quantity: number, actor?: AppRecordActor) {
  const product = await getRecord(pageId, COMMERCE_COLLECTIONS.products, productId);
  if (!product) return { ok: false, error: "product_not_found" } as const;
  if (!asBoolean((product.data as Record<string, unknown>)?.active, true)) return { ok: false, error: "product_inactive" } as const;

  let cart = await getOpenCart(pageId, appUserId);
  if (!cart) {
    cart = await createRecord(
      pageId,
      COMMERCE_COLLECTIONS.carts,
      {
        app_user_id: appUserId,
        status: "open",
        currency: asString((product.data as Record<string, unknown>)?.currency, DEFAULT_CURRENCY),
        subtotal_cents: 0,
        discount_cents: 0,
        tax_cents: 0,
        shipping_cents: 0,
        total_cents: 0,
      },
      actor,
      { appUserId: appUserId },
    );
  }

  const items = await getCartItems(pageId, cart.id);
  const existing = items.find((item) => asString((item.data as Record<string, unknown>)?.product_id) === productId) ?? null;
  const unitPrice = asNumber((product.data as Record<string, unknown>)?.price_cents, 0);
  const nextQuantity = Math.max(1, Math.floor(quantity));
  if (existing) {
    await updateRecord(
      pageId,
      COMMERCE_COLLECTIONS.cartItems,
      existing.id,
      {
        quantity: nextQuantity,
        unit_price_cents: unitPrice,
        line_total_cents: unitPrice * nextQuantity,
      },
      undefined,
      actor,
    );
  } else {
    await createRecord(
      pageId,
      COMMERCE_COLLECTIONS.cartItems,
      {
        cart_id: cart.id,
        product_id: productId,
        quantity: nextQuantity,
        unit_price_cents: unitPrice,
        line_total_cents: unitPrice * nextQuantity,
      },
      actor,
    );
  }
  return { ok: true, cartId: cart.id } as const;
}

export async function updateCartItem(pageId: string, cartItemId: string, quantity: number, actor?: AppRecordActor) {
  const item = await getRecord(pageId, COMMERCE_COLLECTIONS.cartItems, cartItemId);
  if (!item) return { ok: false, error: "cart_item_not_found" } as const;
  const unitPrice = asNumber((item.data as Record<string, unknown>)?.unit_price_cents, 0);
  const nextQuantity = Math.max(1, Math.floor(quantity));
  await updateRecord(
    pageId,
    COMMERCE_COLLECTIONS.cartItems,
    cartItemId,
    {
      quantity: nextQuantity,
      line_total_cents: unitPrice * nextQuantity,
    },
    undefined,
    actor,
  );
  return { ok: true } as const;
}

export async function removeCartItem(pageId: string, cartItemId: string) {
  await prisma.appRecord.delete({ where: { id: cartItemId } });
  return { ok: true } as const;
}

export async function rebuildCartTotals(pageId: string, cartId: string) {
  const cart = await getRecord(pageId, COMMERCE_COLLECTIONS.carts, cartId);
  if (!cart) return { ok: false, error: "cart_not_found" } as const;
  const items = await getCartItems(pageId, cartId);
  const itemModels = items.map((item) => ({
    quantity: asNumber((item.data as Record<string, unknown>)?.quantity, 0),
    unitPriceCents: asNumber((item.data as Record<string, unknown>)?.unit_price_cents, 0),
  }));
  const couponCode = asString((cart.data as Record<string, unknown>)?.coupon_code);
  const coupon = await resolveCoupon(pageId, couponCode);
  const couponData = coupon?.data as Record<string, unknown> | undefined;
  const couponDiscount = couponData
    ? couponData.type === "percent"
      ? Math.round((asNumber(couponData.value, 0) / 100) * itemModels.reduce((acc, cur) => acc + cur.quantity * cur.unitPriceCents, 0))
      : asNumber(couponData.value, 0)
    : 0;
  const subtotal = itemModels.reduce((acc, cur) => acc + cur.quantity * cur.unitPriceCents, 0);
  const minSubtotal = couponData ? asNumber(couponData.min_subtotal_cents, 0) : 0;
  const effectiveCouponDiscount = couponData && minSubtotal > 0 && subtotal < minSubtotal ? 0 : couponDiscount;
  const promotion = await resolvePromotion(pageId, subtotal);
  const promotionDiscount = promotion?.discount ?? 0;
  const taxContext = (cart.data as Record<string, unknown>)?.tax_context as Record<string, unknown> | undefined;
  const taxRate = (await resolveTaxRate(pageId, taxContext))?.rate ?? 0;
  const shipping = asNumber((cart.data as Record<string, unknown>)?.shipping_cents, 0);
  const totals = buildCartTotalsFromItems(itemModels, effectiveCouponDiscount, promotionDiscount, taxRate, shipping);
  await updateRecord(pageId, COMMERCE_COLLECTIONS.carts, cartId, {
    subtotal_cents: totals.subtotalCents,
    discount_cents: totals.discountCents,
    tax_cents: totals.taxCents,
    shipping_cents: totals.shippingCents,
    total_cents: totals.totalCents,
    promotion_id: promotion?.record.id ?? null,
  });
  return { ok: true, totals, couponId: coupon?.id ?? null, promotionId: promotion?.record.id ?? null } as const;
}

export async function applyCouponToCart(pageId: string, cartId: string, code: string) {
  const normalized = normalizeCode(code);
  if (!normalized) return { ok: false, error: "coupon_required" } as const;
  const coupon = await resolveCoupon(pageId, normalized);
  if (!coupon) return { ok: false, error: "coupon_invalid" } as const;
  await updateRecord(pageId, COMMERCE_COLLECTIONS.carts, cartId, {
    coupon_code: normalized,
  });
  return { ok: true, couponId: coupon.id } as const;
}

export async function createOrderFromCart(pageId: string, cartId: string, actor?: AppRecordActor) {
  const cart = await getRecord(pageId, COMMERCE_COLLECTIONS.carts, cartId);
  if (!cart) return { ok: false, error: "cart_not_found" } as const;
  const cartData = cart.data as Record<string, unknown>;
  if (asString(cartData.status, "open") !== "open") return { ok: false, error: "cart_not_open" } as const;

  const items = await getCartItems(pageId, cartId);
  if (!items.length) return { ok: false, error: "cart_empty" } as const;

  const totals = await rebuildCartTotals(pageId, cartId);
  if (!totals.ok) return totals;

  const order = await createRecord(
    pageId,
    COMMERCE_COLLECTIONS.orders,
    {
      app_user_id: asString(cartData.app_user_id),
      status: "pending",
      payment_status: "pending",
      shipping_status: "pending",
      currency: asString(cartData.currency, DEFAULT_CURRENCY),
      subtotal_cents: totals.totals.subtotalCents,
      discount_cents: totals.totals.discountCents,
      tax_cents: totals.totals.taxCents,
      shipping_cents: totals.totals.shippingCents,
      total_cents: totals.totals.totalCents,
      coupon_code: asString(cartData.coupon_code),
      promotion_id: cartData.promotion_id ?? null,
      shipping_address: cartData.shipping_address ?? null,
      billing_address: cartData.billing_address ?? null,
      stock_adjusted: false,
      notes: cartData.notes ?? null,
    },
    actor,
    { appUserId: asString(cartData.app_user_id) },
  );

  for (const item of items) {
    const data = item.data as Record<string, unknown>;
    const productId = asString(data.product_id);
    const quantity = asNumber(data.quantity, 0);
    const unitPrice = asNumber(data.unit_price_cents, 0);
    const lineTotal = asNumber(data.line_total_cents, unitPrice * quantity);

    await createRecord(
      pageId,
      COMMERCE_COLLECTIONS.orderItems,
      {
        order_id: order.id,
        product_id: productId,
        quantity,
        unit_price_cents: unitPrice,
        line_total_cents: lineTotal,
        tax_cents: 0,
      },
      actor,
    );

    const inventory = await findRecordByField(pageId, COMMERCE_COLLECTIONS.inventory, "product_id", productId);
    if (inventory) {
      const invData = inventory.data as Record<string, unknown>;
      const stock = asNumber(invData.stock, 0);
      const reserved = asNumber(invData.reserved, 0);
      const allowBackorder = asBoolean(invData.allow_backorder, false);
      const available = stock - reserved;
      if (!allowBackorder && available < quantity) {
        return { ok: false, error: "out_of_stock", detail: { productId } } as const;
      }
      await updateRecord(pageId, COMMERCE_COLLECTIONS.inventory, inventory.id, {
        reserved: Math.max(reserved + quantity, 0),
      });
    }
  }

  await updateRecord(pageId, COMMERCE_COLLECTIONS.carts, cartId, { status: "checked_out" });

  const couponCode = asString(cartData.coupon_code);
  if (couponCode) {
    const coupon = await resolveCoupon(pageId, couponCode);
    if (coupon) {
      const couponData = coupon.data as Record<string, unknown>;
      await updateRecord(pageId, COMMERCE_COLLECTIONS.coupons, coupon.id, {
        used_count: asNumber(couponData.used_count, 0) + 1,
      });
    }
  }

  return { ok: true, orderId: order.id } as const;
}

function resolveStripeClient() {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) return null;
  return new Stripe(secret);
}

export async function createPaymentForOrder(pageId: string, orderId: string, provider?: string) {
  const order = await getRecord(pageId, COMMERCE_COLLECTIONS.orders, orderId);
  if (!order) return { ok: false, error: "order_not_found" } as const;
  const data = order.data as Record<string, unknown>;
  const amount = asNumber(data.total_cents, 0);
  const currency = asString(data.currency, DEFAULT_CURRENCY).toLowerCase();
  const targetProvider = provider ?? "mock";

  let status: "pending" | "succeeded" | "failed" = "pending";
  let providerRef: string | null = null;
  let captured = false;
  let failureReason: string | null = null;

  if (targetProvider === "stripe") {
    const stripe = resolveStripeClient();
    if (!stripe) {
      status = "failed";
      failureReason = "stripe_not_configured";
    } else {
      const intent = await stripe.paymentIntents.create({
        amount,
        currency,
        metadata: { orderId, pageId },
      });
      providerRef = intent.id;
      status = intent.status === "succeeded" ? "succeeded" : "pending";
      captured = intent.status === "succeeded";
    }
  } else {
    status = "succeeded";
    captured = true;
  }

  const payment = await createRecord(pageId, COMMERCE_COLLECTIONS.payments, {
    order_id: orderId,
    provider: targetProvider,
    provider_ref: providerRef,
    status,
    amount_cents: amount,
    currency,
    captured,
    failure_reason: failureReason ?? null,
  });

  await updateRecord(pageId, COMMERCE_COLLECTIONS.orders, orderId, {
    payment_status: status,
    status: status === "succeeded" ? "paid" : "pending",
  });

  return { ok: status === "succeeded", paymentId: payment.id, status } as const;
}

export async function createRefund(pageId: string, paymentId: string, amountCents: number, reason?: string) {
  const payment = await getRecord(pageId, COMMERCE_COLLECTIONS.payments, paymentId);
  if (!payment) return { ok: false, error: "payment_not_found" } as const;
  const data = payment.data as Record<string, unknown>;
  const provider = asString(data.provider, "mock");
  let status: "pending" | "succeeded" | "failed" = "pending";
  let failureReason: string | null = null;

  if (provider === "stripe") {
    const stripe = resolveStripeClient();
    const providerRef = asString(data.provider_ref);
    if (!stripe || !providerRef) {
      status = "failed";
      failureReason = "stripe_not_configured";
    } else {
      const refund = await stripe.refunds.create({
        payment_intent: providerRef,
        amount: amountCents,
        reason: "requested_by_customer",
      });
      status = refund.status === "succeeded" ? "succeeded" : "pending";
    }
  } else {
    status = "succeeded";
  }

  const refund = await createRecord(pageId, COMMERCE_COLLECTIONS.refunds, {
    payment_id: paymentId,
    order_id: asString(data.order_id),
    status,
    amount_cents: amountCents,
    reason: reason ?? null,
  });

  if (status === "succeeded") {
    await updateRecord(pageId, COMMERCE_COLLECTIONS.orders, asString(data.order_id), {
      status: "refunded",
      payment_status: "refunded",
    });
  }

  if (status === "failed" && failureReason) {
    await updateRecord(pageId, COMMERCE_COLLECTIONS.payments, paymentId, {
      status: "failed",
      failure_reason: failureReason,
    });
  }

  return { ok: status === "succeeded", refundId: refund.id, status } as const;
}

export async function adjustInventory(pageId: string, productId: string, options: { delta?: number; stock?: number }) {
  const inventory = await findRecordByField(pageId, COMMERCE_COLLECTIONS.inventory, "product_id", productId);
  if (!inventory) return { ok: false, error: "inventory_not_found" } as const;
  const data = inventory.data as Record<string, unknown>;
  const current = asNumber(data.stock, 0);
  const next = typeof options.stock === "number" ? Math.max(0, options.stock) : Math.max(0, current + asNumber(options.delta, 0));
  await updateRecord(pageId, COMMERCE_COLLECTIONS.inventory, inventory.id, { stock: next });
  return { ok: true, stock: next } as const;
}

export async function updateShipment(pageId: string, orderId: string, status: string, payload?: { carrier?: string; tracking_number?: string }) {
  const order = await getRecord(pageId, COMMERCE_COLLECTIONS.orders, orderId);
  if (!order) return { ok: false, error: "order_not_found" } as const;
  const normalized = (STATUS_ENUM.shipping as readonly string[]).includes(status) ? status : "pending";
  const existing = await findRecordByField(pageId, COMMERCE_COLLECTIONS.shipments, "order_id", orderId);

  if (existing) {
    await updateRecord(pageId, COMMERCE_COLLECTIONS.shipments, existing.id, {
      status: normalized,
      carrier: payload?.carrier ?? (existing.data as Record<string, unknown>)?.carrier ?? null,
      tracking_number: payload?.tracking_number ?? (existing.data as Record<string, unknown>)?.tracking_number ?? null,
      shipped_at: normalized === "shipped" ? new Date().toISOString() : (existing.data as Record<string, unknown>)?.shipped_at ?? null,
      delivered_at: normalized === "delivered" ? new Date().toISOString() : (existing.data as Record<string, unknown>)?.delivered_at ?? null,
    });
  } else {
    await createRecord(pageId, COMMERCE_COLLECTIONS.shipments, {
      order_id: orderId,
      status: normalized,
      carrier: payload?.carrier ?? null,
      tracking_number: payload?.tracking_number ?? null,
      shipped_at: normalized === "shipped" ? new Date().toISOString() : null,
      delivered_at: normalized === "delivered" ? new Date().toISOString() : null,
    });
  }

  const orderData = order.data as Record<string, unknown>;
  const stockAdjusted = asBoolean(orderData.stock_adjusted, false);
  if ((normalized === "shipped" || normalized === "delivered") && !stockAdjusted) {
    const items = await getOrderItems(pageId, orderId);
    for (const item of items) {
      const data = item.data as Record<string, unknown>;
      const productId = asString(data.product_id);
      const quantity = asNumber(data.quantity, 0);
      const inventory = await findRecordByField(pageId, COMMERCE_COLLECTIONS.inventory, "product_id", productId);
      if (inventory) {
        const invData = inventory.data as Record<string, unknown>;
        const stock = asNumber(invData.stock, 0);
        const reserved = asNumber(invData.reserved, 0);
        await updateRecord(pageId, COMMERCE_COLLECTIONS.inventory, inventory.id, {
          stock: Math.max(stock - quantity, 0),
          reserved: Math.max(reserved - quantity, 0),
        });
      }
    }
    await updateRecord(pageId, COMMERCE_COLLECTIONS.orders, orderId, { stock_adjusted: true });
  }

  await updateRecord(pageId, COMMERCE_COLLECTIONS.orders, orderId, { shipping_status: normalized });
  return { ok: true, status: normalized } as const;
}

export async function getCartSnapshot(pageId: string, appUserId: string) {
  const cart = await getOpenCart(pageId, appUserId);
  if (!cart) return { cart: null, items: [] };
  const items = await getCartItems(pageId, cart.id);
  return { cart, items };
}
