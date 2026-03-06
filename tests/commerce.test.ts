// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => ({
  records: [] as Array<{
    id: string;
    page_id: string;
    collection_slug: string;
    data: Record<string, unknown>;
    created_at: Date;
    updated_at: Date;
    app_user_id?: string | null;
  }>,
  collections: [] as Array<{ slug: string; name: string }>,
  nextId: 1,
}));

function resetStore() {
  store.records = [];
  store.collections = [];
  store.nextId = 1;
}

function seedRecord(pageId: string, slug: string, data: Record<string, unknown>, appUserId?: string | null) {
  const record = {
    id: `rec_${store.nextId++}`,
    page_id: pageId,
    collection_slug: slug,
    data: { ...data },
    created_at: new Date(),
    updated_at: new Date(),
    app_user_id: appUserId ?? null,
  };
  store.records.push(record);
  return record;
}

const prismaMock = vi.hoisted(() => ({
  appRecord: {
    findMany: vi.fn(async (args?: { where?: Record<string, unknown>; take?: number }) => {
      const where = (args?.where ?? {}) as Record<string, unknown>;
      const pageId = typeof where.page_id === "string" ? where.page_id : "";
      const slug = typeof where.collection_slug === "string" ? where.collection_slug : "";
      const appUserId = typeof where.app_user_id === "string" ? where.app_user_id : undefined;
      let items = store.records.filter((rec) => {
        if (pageId && rec.page_id !== pageId) return false;
        if (slug && rec.collection_slug !== slug) return false;
        if (appUserId && rec.app_user_id !== appUserId) return false;
        return true;
      });
      if (typeof args?.take === "number") items = items.slice(0, args.take);
      return items;
    }),
    delete: vi.fn(async (args: { where: { id: string } }) => {
      const idx = store.records.findIndex((rec) => rec.id === args.where.id);
      if (idx >= 0) {
        const [removed] = store.records.splice(idx, 1);
        return removed;
      }
      return null;
    }),
  },
}));

const appDataMock = vi.hoisted(() => ({
  setSchema: vi.fn(async (_pageId: string, collections: Array<{ slug: string; name: string }>) => {
    store.collections = collections;
    return { migrationId: "test" };
  }),
  createRecord: vi.fn(async (pageId: string, slug: string, data: Record<string, unknown>, _actor?: unknown, options?: { appUserId?: string | null }) => {
    return seedRecord(pageId, slug, data, options?.appUserId ?? null);
  }),
  updateRecord: vi.fn(async (pageId: string, slug: string, id: string, data: Record<string, unknown>) => {
    const record = store.records.find((rec) => rec.id === id && rec.page_id === pageId && rec.collection_slug === slug);
    if (!record) return null;
    record.data = { ...(record.data ?? {}), ...data };
    record.updated_at = new Date();
    return record;
  }),
  getRecord: vi.fn(async (pageId: string, slug: string, id: string) => {
    return store.records.find((rec) => rec.id === id && rec.page_id === pageId && rec.collection_slug === slug) ?? null;
  }),
}));

vi.mock("@/lib/db", () => ({ prisma: prismaMock }));
vi.mock("@/lib/app-data", () => appDataMock);
vi.mock("stripe", () => ({
  default: class {
    paymentIntents = { create: vi.fn(async () => ({ id: "pi_test", status: "succeeded" })) };
    refunds = { create: vi.fn(async () => ({ id: "re_test", status: "succeeded" })) };
  },
}));

import {
  COMMERCE_COLLECTIONS,
  ensureCommerceSchema,
  getCommerceCatalog,
  addItemToCart,
  applyCouponToCart,
  rebuildCartTotals,
  createOrderFromCart,
  createPaymentForOrder,
  createRefund,
  updateShipment,
  adjustInventory,
} from "@/lib/commerce";

describe("commerce flows", () => {
  const pageId = "page_1";

  beforeEach(() => {
    resetStore();
    prismaMock.appRecord.findMany.mockClear();
    prismaMock.appRecord.delete.mockClear();
    appDataMock.setSchema.mockClear();
    appDataMock.createRecord.mockClear();
    appDataMock.updateRecord.mockClear();
    appDataMock.getRecord.mockClear();
  });

  it("bootstraps schema and returns catalog data", async () => {
    await ensureCommerceSchema(pageId);
    expect(appDataMock.setSchema).toHaveBeenCalled();
    const slugs = store.collections.map((c) => c.slug);
    expect(slugs).toContain(COMMERCE_COLLECTIONS.products);
    expect(slugs).toContain(COMMERCE_COLLECTIONS.orders);

    const category = seedRecord(pageId, COMMERCE_COLLECTIONS.categories, { name: "의류" });
    const product = seedRecord(pageId, COMMERCE_COLLECTIONS.products, {
      name: "티셔츠",
      price_cents: 15000,
      active: true,
      category_id: category.id,
    });
    seedRecord(pageId, COMMERCE_COLLECTIONS.inventory, { product_id: product.id, stock: 12, reserved: 1 });

    const catalog = await getCommerceCatalog(pageId);
    expect(catalog.length).toBe(1);
    expect(catalog[0].category?.name).toBe("의류");
    expect(catalog[0].inventory?.stock).toBe(12);
  });

  it("handles cart -> order -> payment/refund -> shipment/inventory", async () => {
    const product = seedRecord(pageId, COMMERCE_COLLECTIONS.products, {
      name: "키보드",
      price_cents: 5000,
      active: true,
      currency: "KRW",
    });
    seedRecord(pageId, COMMERCE_COLLECTIONS.inventory, {
      product_id: product.id,
      stock: 10,
      reserved: 0,
      allow_backorder: false,
    });
    seedRecord(pageId, COMMERCE_COLLECTIONS.coupons, {
      code: "SAVE10",
      type: "percent",
      value: 10,
      active: true,
      min_subtotal_cents: 0,
      used_count: 0,
    });
    seedRecord(pageId, COMMERCE_COLLECTIONS.promotions, {
      name: "VIP",
      type: "fixed",
      value: 700,
      active: true,
    });
    seedRecord(pageId, COMMERCE_COLLECTIONS.taxRates, {
      name: "KR VAT",
      rate: 0.1,
      country: "KR",
      region: "seoul",
      active: true,
    });

    const add = await addItemToCart(pageId, "app_user_1", product.id, 2);
    expect(add.ok).toBe(true);
    const cartId = add.cartId;

    const cartRecord = store.records.find((rec) => rec.id === cartId)!;
    cartRecord.data.tax_context = { country: "KR", region: "seoul" };
    cartRecord.data.shipping_cents = 500;

    const coupon = await applyCouponToCart(pageId, cartId, "SAVE10");
    expect(coupon.ok).toBe(true);
    const totals = await rebuildCartTotals(pageId, cartId);
    expect(totals.ok).toBe(true);
    expect(totals.totals.totalCents).toBe(10400);
    expect(totals.totals.discountCents).toBe(1000);
    expect(totals.totals.taxCents).toBe(900);

    const orderRes = await createOrderFromCart(pageId, cartId);
    expect(orderRes.ok).toBe(true);
    const orderId = orderRes.orderId;

    const inventory = store.records.find((rec) => rec.collection_slug === COMMERCE_COLLECTIONS.inventory)!;
    expect((inventory.data.reserved as number) >= 2).toBe(true);

    const payment = await createPaymentForOrder(pageId, orderId, "mock");
    expect(payment.ok).toBe(true);

    const refund = await createRefund(pageId, payment.paymentId, 5000, "test");
    expect(refund.ok).toBe(true);

    const shipment = await updateShipment(pageId, orderId, "shipped", { carrier: "test", tracking_number: "T123" });
    expect(shipment.ok).toBe(true);

    const inventoryAfter = store.records.find((rec) => rec.collection_slug === COMMERCE_COLLECTIONS.inventory)!;
    expect((inventoryAfter.data.stock as number) <= 10).toBe(true);
    expect((inventoryAfter.data.reserved as number) >= 0).toBe(true);

    const adjust = await adjustInventory(pageId, product.id, { stock: 20 });
    expect(adjust.ok).toBe(true);
    expect(adjust.stock).toBe(20);
  });
});
