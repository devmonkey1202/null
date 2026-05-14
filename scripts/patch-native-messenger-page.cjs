const { createHash } = require("crypto");
const { PrismaClient } = require("@prisma/client");

const PAGE_ID = "cmoka5cfm000pjo04qt2bn58g";

const prisma = new PrismaClient();

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function computeDeployHash(content) {
  return createHash("sha256").update(JSON.stringify(content ?? null)).digest("hex");
}

function ensurePrototype(node) {
  if (!node.prototype) node.prototype = { interactions: [] };
  if (!Array.isArray(node.prototype.interactions)) node.prototype.interactions = [];
  return node.prototype;
}

function setClickVariable(node, variableId, value) {
  const prototype = ensurePrototype(node);
  prototype.interactions = [
    {
      id: `ix_${node.id}_${variableId}_${String(value)}`,
      trigger: "click",
      action: { type: "setVariable", variableId, value },
    },
  ];
}

function cloneSubtree(doc, sourceId, nextRootId, nextParentId) {
  const idMap = new Map();

  const walk = (nodeId) => {
    const source = doc.nodes[nodeId];
    if (!source) return null;
    const targetId =
      nodeId === sourceId
        ? nextRootId
        : `${nextRootId}_${nodeId.startsWith(`${sourceId}_`) ? nodeId.slice(sourceId.length + 1) : nodeId}`;
    idMap.set(nodeId, targetId);

    for (const childId of source.children ?? []) {
      walk(childId);
    }
    return targetId;
  };

  walk(sourceId);

  for (const [oldId, newId] of idMap.entries()) {
    const source = doc.nodes[oldId];
    const clone = deepClone(source);
    clone.id = newId;
    clone.parentId = oldId === sourceId ? nextParentId : idMap.get(source.parentId) ?? nextParentId;
    clone.children = (source.children ?? []).map((childId) => idMap.get(childId)).filter(Boolean);
    doc.nodes[newId] = clone;
  }

  return nextRootId;
}

function updateText(doc, nodeId, value) {
  const node = doc.nodes[nodeId];
  if (!node?.text) return;
  node.text.value = value;
}

function updateFrame(doc, nodeId, patch) {
  const node = doc.nodes[nodeId];
  if (!node?.frame) return;
  Object.assign(node.frame, patch);
}

async function main() {
  const page = await prisma.page.findUnique({
    where: { id: PAGE_ID },
    select: {
      id: true,
      current_version_id: true,
      current_version: { select: { content_json: true } },
    },
  });

  if (!page?.current_version?.content_json) {
    throw new Error(`page ${PAGE_ID} not found`);
  }

  const doc = deepClone(page.current_version.content_json);

  const chatListIds = ["chat_list_item_0", "chat_list_item_1", "chat_list_item_2", "chat_list_item_3"];
  chatListIds.forEach((id, index) => {
    const node = doc.nodes[id];
    if (!node) return;
    node.name = "List item";
    setClickVariable(node, "messenger_chat_index", index);
  });

  const friendList = doc.nodes.friend_list;
  if (!friendList) throw new Error("friend_list missing");
  const friendTemplateId = friendList.children?.[0];
  if (!friendTemplateId) throw new Error("friend_list template missing");
  const friendIds = [friendTemplateId];
  for (let index = 1; index < 4; index += 1) {
    const nextId = `friend_list_item_${index}`;
    if (!doc.nodes[nextId]) cloneSubtree(doc, friendTemplateId, nextId, "friend_list");
    friendIds.push(nextId);
  }
  friendList.children = friendIds;
  friendIds.forEach((id, index) => {
    const node = doc.nodes[id];
    if (!node) return;
    node.name = "List item";
    updateFrame(doc, id, { x: 18, y: 18 + index * 96, w: 664, h: 82 });
    setClickVariable(node, "messenger_friend_index", index);
  });

  const alertList = doc.nodes.alert_list;
  if (!alertList) throw new Error("alert_list missing");
  const alertTemplateId = alertList.children?.[0];
  if (!alertTemplateId) throw new Error("alert_list template missing");
  const alertIds = [alertTemplateId];
  for (let index = 1; index < 4; index += 1) {
    const nextId = `alert_list_item_${index}`;
    if (!doc.nodes[nextId]) cloneSubtree(doc, alertTemplateId, nextId, "alert_list");
    alertIds.push(nextId);
  }
  alertList.children = alertIds;
  updateFrame(doc, "alert_list", { x: 42, y: 140, w: 1164, h: 420 });
  alertIds.forEach((id, index) => {
    const node = doc.nodes[id];
    if (!node) return;
    node.name = "List item";
    updateFrame(doc, id, { x: 18, y: 18 + index * 98, w: 1128, h: 86 });
    setClickVariable(node, "messenger_alert_index", index);
  });

  [
    [alertTemplateId, "alert_list_item"],
    ["alert_list_item_1", "alert_list_item_1"],
    ["alert_list_item_2", "alert_list_item_2"],
    ["alert_list_item_3", "alert_list_item_3"],
  ].forEach(([sourceId]) => {
    const titleId = `${sourceId}_title`;
    const bodyId = `${sourceId}_body`;
    const badgeId = `${sourceId}_badge`;
    updateFrame(doc, titleId, { w: 952 });
    updateFrame(doc, bodyId, { w: 952 });
    updateFrame(doc, badgeId, { x: 1038 });
  });

  ["alert_form", "chat_room_create", "chat_metric_call", "call_settings", "chat_search_input", "alerts_card_a", "alerts_card_b"].forEach((id) => {
    if (doc.nodes[id]) doc.nodes[id].hidden = true;
  });

  updateText(doc, "friends_sub", "이름, 이메일, 핸들로 친구를 찾고 요청을 보낸 뒤 바로 대화를 시작합니다.");
  updateText(doc, "alerts_sub", "친구 요청, 수락, 새 메시지가 들어오면 자동으로 여기 모입니다.");
  updateText(doc, "settings_sub", "표시 이름과 상태 메시지를 바꾸고 계정에서 로그아웃할 수 있습니다.");
  updateText(doc, "auth_art_sub", "로그인 후 친구 추가, 1:1 대화, 알림, 프로필 변경이 실제로 연결됩니다.");
  updateText(doc, "auth_form_meta", "로그인하면 이전 대화 기록과 친구 상태를 그대로 이어갑니다.");
  updateText(doc, "chat_message_input_placeholder", "메시지를 입력하고 Enter 또는 전송을 누르세요");

  const version = await prisma.pageVersion.create({
    data: {
      page_id: PAGE_ID,
      content_json: doc,
    },
  });

  await prisma.page.update({
    where: { id: PAGE_ID },
    data: { current_version_id: version.id },
  });

  await prisma.pageSetting.upsert({
    where: { page_id_key: { page_id: PAGE_ID, key: "prod_version" } },
    update: {
      value: {
        versionId: version.id,
        deployedAt: new Date().toISOString(),
        deployHash: computeDeployHash(doc),
      },
    },
    create: {
      page_id: PAGE_ID,
      key: "prod_version",
      value: {
        versionId: version.id,
        deployedAt: new Date().toISOString(),
        deployHash: computeDeployHash(doc),
      },
    },
  });

  console.log(JSON.stringify({ ok: true, pageId: PAGE_ID, versionId: version.id }, null, 2));
}

main()
  .catch(async (error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
