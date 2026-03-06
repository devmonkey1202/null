import { PrismaClient, PlanTier } from "@prisma/client";

const prisma = new PrismaClient();

const plans = [
  {
    id: PlanTier.free,
    name: "Free",
    price_cents: 0,
    features: {
      maxLivePages: 1,
      maxButtons: 3,
      maxTexts: 6,
      maxImages: 1,
      maxElements: 20,
      replayEnabled: false,
      detailedReports: false,
    },
  },
  {
    id: PlanTier.standard,
    name: "Standard",
    price_cents: 9900,
    features: {
      maxLivePages: 2,
      maxButtons: 6,
      maxTexts: 20,
      maxImages: 4,
      maxElements: 40,
      replayEnabled: true,
      detailedReports: true,
    },
  },
  {
    id: PlanTier.pro,
    name: "Pro",
    price_cents: 39000,
    features: {
      maxLivePages: 4,
      maxButtons: 10,
      maxTexts: 40,
      maxImages: 10,
      maxElements: 80,
      replayEnabled: true,
      detailedReports: true,
    },
  },
  {
    id: PlanTier.enterprise,
    name: "Enterprise",
    price_cents: null,
    features: {
      maxLivePages: 10,
      maxButtons: 20,
      maxTexts: 80,
      maxImages: 20,
      maxElements: 160,
      replayEnabled: true,
      detailedReports: true,
    },
  },
];

/** 8.3.1 초기 피드 "볼 것" 채우기: 시드 데모 페이지 (LIVE) */
const SEED_DEMO_CONTENT = {
  width: 400,
  height: 300,
  nodes: [
    {
      id: "seed_text_1",
      type: "text",
      x: 80,
      y: 120,
      w: 240,
      h: 40,
      props: { text: "NULL 데모 작품", fontSize: 20, fontWeight: 600 },
    },
  ],
};

async function main() {
  for (const plan of plans) {
    await prisma.plan.upsert({
      where: { id: plan.id },
      update: plan,
      create: plan,
    });
  }

  const seedUser = await prisma.user.upsert({
    where: { anon_id: "anon_seed_1" },
    update: {},
    create: {
      anon_id: "anon_seed_1",
      plan_id: PlanTier.free,
    },
  });

  // 시드 데모 페이지 1개 (LIVE) — 초기 피드 비지 않음
  const existing = await prisma.page.findFirst({
    where: { owner_id: seedUser.id, title: "NULL 데모" },
  });
  if (!existing) {
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const page = await prisma.page.create({
      data: {
        owner_id: seedUser.id,
        title: "NULL 데모",
        anon_number: 1,
        status: "live",
        live_started_at: new Date(),
        live_expires_at: expiresAt,
      },
    });
    const version = await prisma.pageVersion.create({
      data: { page_id: page.id, content_json: SEED_DEMO_CONTENT },
    });
    await prisma.page.update({
      where: { id: page.id },
      data: { current_version_id: version.id },
    });
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
