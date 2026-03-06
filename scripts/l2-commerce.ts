import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "@/lib/db";
import { ensurePlanDefaults } from "@/lib/plan";
import { createRecord } from "@/lib/app-data";
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

const LOG_DIR = join(process.cwd(), "logs");

function ensureLogDir() {
  if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });
}

function writeLog(name: string, lines: string[]) {
  ensureLogDir();
  const file = join(LOG_DIR, name);
  writeFileSync(file, `${lines.join("\n")}\n`, "utf8");
  return file;
}

async function main() {
  const lines: string[] = [];
  lines.push("# L2 Commerce Scenario");
  lines.push(`ts=${new Date().toISOString()}`);

  await ensurePlanDefaults(prisma);
  const anonId = `anon_l2_${Date.now()}`;
  const user = await prisma.user.create({
    data: {
      anon_id: anonId,
      plan_id: "free",
    },
  });
  const page = await prisma.page.create({
    data: {
      owner_id: user.id,
      anon_number: 1,
      status: "live",
      title: "L2 Commerce",
    },
  });
  const appUser = await prisma.appUser.create({
    data: {
      page_id: page.id,
      email: `l2-${Date.now()}@example.local`,
      password_hash: "local",
      display_name: "L2 User",
    },
  });

  lines.push(`page_id=${page.id} app_user_id=${appUser.id}`);
  await ensureCommerceSchema(page.id);
  lines.push("schema=ok");

  const category = await createRecord(page.id, COMMERCE_COLLECTIONS.categories, {
    name: "전자기기",
    slug: "electronics",
    description: "L2 category",
  });
  const product = await createRecord(page.id, COMMERCE_COLLECTIONS.products, {
    name: "키보드",
    sku: "KB-001",
    description: "L2 product",
    price_cents: 5000,
    currency: "KRW",
    active: true,
    category_id: category.id,
  });
  await createRecord(page.id, COMMERCE_COLLECTIONS.inventory, {
    product_id: product.id,
    stock: 10,
    reserved: 0,
    allow_backorder: false,
  });
  await createRecord(page.id, COMMERCE_COLLECTIONS.coupons, {
    code: "SAVE10",
    type: "percent",
    value: 10,
    active: true,
    min_subtotal_cents: 0,
    used_count: 0,
  });
  await createRecord(page.id, COMMERCE_COLLECTIONS.promotions, {
    name: "VIP",
    type: "fixed",
    value: 700,
    active: true,
  });
  await createRecord(page.id, COMMERCE_COLLECTIONS.taxRates, {
    name: "KR VAT",
    rate: 0.1,
    country: "KR",
    region: "seoul",
    active: true,
  });

  const catalog = await getCommerceCatalog(page.id);
  lines.push(`catalog_items=${catalog.length}`);

  const cartAdd = await addItemToCart(page.id, appUser.id, product.id, 2);
  if (!cartAdd.ok) throw new Error("cart_add_failed");
  lines.push(`cart_id=${cartAdd.cartId}`);

  await applyCouponToCart(page.id, cartAdd.cartId, "SAVE10");
  const totals = await rebuildCartTotals(page.id, cartAdd.cartId);
  if (!totals.ok) throw new Error("cart_totals_failed");
  lines.push(`totals subtotal=${totals.totals.subtotalCents} discount=${totals.totals.discountCents} tax=${totals.totals.taxCents} total=${totals.totals.totalCents}`);

  const order = await createOrderFromCart(page.id, cartAdd.cartId);
  if (!order.ok) throw new Error(`order_failed ${order.error}`);
  lines.push(`order_id=${order.orderId}`);

  const payment = await createPaymentForOrder(page.id, order.orderId, "mock");
  if (!payment.ok) throw new Error("payment_failed");
  lines.push(`payment_id=${payment.paymentId} status=${payment.status}`);

  const refund = await createRefund(page.id, payment.paymentId, 2000, "l2_refund");
  if (!refund.ok) throw new Error("refund_failed");
  lines.push(`refund_id=${refund.refundId} status=${refund.status}`);

  const shipment = await updateShipment(page.id, order.orderId, "shipped", { carrier: "l2", tracking_number: "L2-TRACK" });
  if (!shipment.ok) throw new Error("shipment_failed");
  lines.push(`shipment_status=${shipment.status}`);

  const adjust = await adjustInventory(page.id, product.id, { stock: 20 });
  if (!adjust.ok) throw new Error("inventory_adjust_failed");
  lines.push(`inventory_stock=${adjust.stock}`);

  // Cleanup test data
  await prisma.page.delete({ where: { id: page.id } });
  await prisma.user.delete({ where: { id: user.id } });

  const logFile = writeLog("l2-commerce.log", lines);
  console.log(`L2 commerce log: ${logFile}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
