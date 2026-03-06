import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "@/lib/db";
import { computeVirtualRange } from "@/lib/virtualization";
import {
  createOrganization,
  inviteOrganizationMember,
  acceptOrganizationInvite,
  updateOrganizationMemberRole,
  createTeam,
  addTeamMember,
  removeTeamMember,
  assignPageToOrg,
  listOrgPages,
} from "@/lib/orgs";
import { createSsoConnection, loginWithSso } from "@/lib/app-sso";
import { registerAppUser, loginAppUser } from "@/lib/app-auth";
import { generateBackupCodes, generateOtpSecret, generateTotp, hashBackupCode } from "@/lib/otp";
import { checkWaf } from "@/lib/waf";
import { hashIp } from "@/lib/request";

const LOG_DIR = join(process.cwd(), "logs");

function ensureLogDir() {
  if (!existsSync(LOG_DIR)) {
    mkdirSync(LOG_DIR, { recursive: true });
  }
}

function writeLog(name: string, lines: string[]) {
  ensureLogDir();
  const file = join(LOG_DIR, name);
  writeFileSync(file, `${lines.join("\n")}\n`, "utf8");
  return file;
}

function randomEmail(prefix: string) {
  return `${prefix}_${Date.now()}@local.test`;
}

async function ensurePlanFree() {
  await prisma.plan.upsert({
    where: { id: "free" },
    update: {},
    create: { id: "free", name: "Free", price_cents: 0, features: {} },
  });
}

async function runVirtualizationScenario() {
  const lines: string[] = [];
  lines.push("# L2 Virtualization Scenario (simulation)");
  lines.push(`ts=${new Date().toISOString()}`);

  const itemCount = 5000;
  const itemSize = 32;
  const viewport = 640;
  const overscan = 5;
  const offsets = [0, 320, 1600, 6400, 12000];
  lines.push(`params: count=${itemCount} itemSize=${itemSize} viewport=${viewport} overscan=${overscan}`);

  offsets.forEach((offset) => {
    const range = computeVirtualRange({
      itemCount,
      itemSize,
      viewportSize: viewport,
      scrollOffset: offset,
      overscan,
    });
    const visible = range.end >= range.start ? range.end - range.start + 1 : 0;
    lines.push(`scroll=${offset} start=${range.start} end=${range.end} visible=${visible} offsetTop=${range.offsetTop}`);
  });

  return writeLog("l2-virtualization.log", lines);
}

async function runOrgScenario() {
  const lines: string[] = [];
  lines.push("# L2 Organization/Team Scenario");
  lines.push(`ts=${new Date().toISOString()}`);

  await ensurePlanFree();

  const owner = await prisma.user.create({
    data: {
      anon_id: `anon_${Date.now()}`,
      email: randomEmail("owner"),
      plan: { connect: { id: "free" } },
    },
  });
  const memberUser = await prisma.user.create({
    data: {
      anon_id: `anon_${Date.now()}_m`,
      email: randomEmail("member"),
      plan: { connect: { id: "free" } },
    },
  });

  const page = await prisma.page.create({
    data: {
      owner_id: owner.id,
      anon_number: Math.floor(Math.random() * 1000000),
      title: "L2 Org Page",
      status: "draft",
    },
  });

  const org = await createOrganization(owner.id, "L2 Org");
  lines.push(`org=${org.id} slug=${org.slug}`);

  const invite = await inviteOrganizationMember(org.id, owner.id, memberUser.email ?? randomEmail("invite"), "member");
  lines.push(`invite ok=${invite.ok}`);
  if (!invite.ok) {
    throw new Error(`org_invite_failed:${invite.error}`);
  }

  const accepted = await acceptOrganizationInvite(org.id, memberUser.id, memberUser.email ?? null);
  lines.push(`invite_accept ok=${accepted.ok}`);
  if (!accepted.ok) {
    throw new Error(`org_accept_failed:${accepted.error}`);
  }

  const updated = await updateOrganizationMemberRole(org.id, owner.id, accepted.member.id, "admin");
  lines.push(`role_update ok=${updated.ok}`);

  const team = await createTeam(org.id, owner.id, "L2 Team");
  lines.push(`team_create ok=${team.ok}`);
  if (!team.ok) {
    throw new Error(`team_create_failed:${team.error}`);
  }

  const added = await addTeamMember(org.id, team.team.id, owner.id, accepted.member.id);
  lines.push(`team_add ok=${added.ok}`);

  const removed = await removeTeamMember(org.id, team.team.id, owner.id, accepted.member.id);
  lines.push(`team_remove ok=${removed.ok}`);

  const assigned = await assignPageToOrg(org.id, owner.id, page.id);
  lines.push(`page_assign ok=${assigned.ok}`);

  const pages = await listOrgPages(org.id);
  lines.push(`org_pages=${pages.length}`);

  await prisma.page.delete({ where: { id: page.id } });
  await prisma.organization.delete({ where: { id: org.id } });
  await prisma.user.deleteMany({ where: { id: { in: [owner.id, memberUser.id] } } });

  return writeLog("l2-orgs.log", lines);
}

async function runSsoScenario(pageId: string) {
  const lines: string[] = [];
  lines.push("# L2 SSO Scenario");
  lines.push(`ts=${new Date().toISOString()}`);

  const connection = await createSsoConnection(pageId, {
    provider: "oauth",
    name: "L2 OAuth",
    auto_provision: true,
    allow_unlinked: true,
    default_role: "user",
  });
  lines.push(`connection=${connection.id}`);

  const login = await loginWithSso(pageId, {
    provider: "oauth",
    connectionName: connection.name,
    payload: { subject: `sub-${Date.now()}`, email: randomEmail("sso"), displayName: "L2 SSO User" },
  });
  lines.push(`login created=${login.created} user=${login.user.id} token_len=${login.token.length}`);

  await prisma.appSession.deleteMany({ where: { app_user_id: login.user.id } });
  await prisma.appSsoAccount.deleteMany({ where: { app_user_id: login.user.id } });
  await prisma.appUser.delete({ where: { id: login.user.id } });
  await prisma.appSsoConnection.delete({ where: { id: connection.id } });

  return writeLog("l2-sso.log", lines);
}

async function runOtpScenario(pageId: string) {
  const lines: string[] = [];
  lines.push("# L2 OTP Scenario");
  lines.push(`ts=${new Date().toISOString()}`);

  const email = randomEmail("otp");
  const password = "N0ll!Pass1";
  const registered = await registerAppUser(pageId, email, password, "OTP User");
  lines.push(`registered user=${registered.user.id}`);

  const secret = generateOtpSecret();
  const backupCodes = generateBackupCodes(4, 10);
  const backupHashes = backupCodes.map(hashBackupCode);

  await prisma.appUser.update({
    where: { id: registered.user.id },
    data: {
      otp_enabled: true,
      otp_secret: secret,
      otp_backup_codes: backupHashes,
    },
  });

  const otpToken = generateTotp({ secret });
  const loginOtp = await loginAppUser(pageId, email, password, { otp: otpToken });
  lines.push(`login_otp ok user=${loginOtp.user.id}`);

  const loginBackup = await loginAppUser(pageId, email, password, { otpBackup: backupCodes[0] });
  lines.push(`login_backup ok user=${loginBackup.user.id}`);

  await prisma.appSession.deleteMany({ where: { app_user_id: registered.user.id } });
  await prisma.appUser.delete({ where: { id: registered.user.id } });

  return writeLog("l2-otp.log", lines);
}

async function runWafScenario() {
  const lines: string[] = [];
  lines.push("# L2 WAF Scenario");
  lines.push(`ts=${new Date().toISOString()}`);

  process.env.WAF_ENABLED = "1";
  process.env.WAF_CHECK_BODY_SIZE = "1";
  process.env.WAF_MAX_BODY_BYTES = "10";
  process.env.WAF_CHECK_UA = "1";
  process.env.WAF_BLOCK_UA_REGEX = "BadBot";
  process.env.WAF_CHECK_IP_BLOCKS = "1";

  const blockedIp = "203.0.113.10";
  const ipHash = hashIp(blockedIp);
  const block = await prisma.ipBlock.create({
    data: { ip_hash: ipHash, reason: "l2-test" },
  });

  const bodyReq = new Request("http://localhost/api/test", {
    method: "POST",
    headers: { "content-length": "999" },
  });
  const bodyDecision = await checkWaf(bodyReq);
  lines.push(`body_size allowed=${bodyDecision.allowed}`);

  const uaReq = new Request("http://localhost/api/test", {
    headers: { "user-agent": "BadBot/1.0" },
  });
  const uaDecision = await checkWaf(uaReq);
  lines.push(`ua_block allowed=${uaDecision.allowed}`);

  const ipReq = new Request("http://localhost/api/test", {
    headers: { "x-forwarded-for": blockedIp },
  });
  const ipDecision = await checkWaf(ipReq);
  lines.push(`ip_block allowed=${ipDecision.allowed}`);

  const okReq = new Request("http://localhost/api/health", {
    headers: { "content-length": "1", "user-agent": "Mozilla/5.0" },
  });
  const okDecision = await checkWaf(okReq);
  lines.push(`health_skip allowed=${okDecision.allowed}`);

  await prisma.ipBlock.delete({ where: { id: block.id } });

  return writeLog("l2-waf.log", lines);
}

async function ensurePage(): Promise<{ pageId: string; ownerId: string }> {
  await ensurePlanFree();
  const owner = await prisma.user.create({
    data: {
      anon_id: `anon_${Date.now()}_app`,
      email: randomEmail("app"),
      plan: { connect: { id: "free" } },
    },
  });
  const page = await prisma.page.create({
    data: {
      owner_id: owner.id,
      anon_number: Math.floor(Math.random() * 1000000),
      title: "L2 App Page",
      status: "draft",
    },
  });
  return { pageId: page.id, ownerId: owner.id };
}

async function cleanupPage(pageId: string, ownerId: string) {
  await prisma.page.deleteMany({ where: { id: pageId } });
  await prisma.user.deleteMany({ where: { id: ownerId } });
}

async function main() {
  const outputs: string[] = [];
  outputs.push(await runVirtualizationScenario());
  outputs.push(await runOrgScenario());

  const { pageId, ownerId } = await ensurePage();
  try {
    outputs.push(await runSsoScenario(pageId));
    outputs.push(await runOtpScenario(pageId));
  } finally {
    await cleanupPage(pageId, ownerId);
  }

  outputs.push(await runWafScenario());

  console.log("L2 scenario logs:");
  outputs.forEach((file) => console.log(`- ${file}`));
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
