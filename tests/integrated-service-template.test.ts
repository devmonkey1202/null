import { describe, expect, it } from "vitest";

import { getAbsoluteFrame } from "@/advanced/geom/geom";
import { layoutDoc } from "@/advanced/layout/engine";
import { hydrateDoc } from "@/advanced/doc/scene";
import {
  buildIntegratedServiceDoc,
  buildIntegratedServiceThumbnailDataUrl,
  INTEGRATED_SERVICE_DESIGN_TOKENS,
  INTEGRATED_SERVICE_PROJECT_TITLE,
} from "@/lib/integrated-service-template";

function findNodesByName(doc: { nodes?: Record<string, { name?: string }> }, name: string) {
  return Object.entries(doc.nodes ?? {}).filter(([, node]) => node.name === name);
}

function firstNodeByName(doc: { nodes?: Record<string, { name?: string }> }, name: string) {
  const entry = findNodesByName(doc, name)[0];
  expect(entry, `expected node named "${name}"`).toBeTruthy();
  return entry?.[1] as {
    name?: string;
    style?: {
      fills?: Array<{ type?: string; color?: string }>;
      strokes?: Array<{ color?: string; width?: number }>;
      effects?: Array<{ type?: string; color?: string; x?: number; y?: number; blur?: number; opacity?: number }>;
      radius?: number;
    };
    text?: { style?: { fontSize?: number; fontWeight?: number; align?: string } };
  };
}

describe("integrated service template", () => {
  it("builds a multi-page integrated service document", () => {
    const doc = buildIntegratedServiceDoc() as {
      pages?: Array<{ id?: string; name?: string; rootId?: string; breakpoints?: Array<{ id?: string; name?: string }> }>;
      variables?: Array<{ name?: string }>;
      prototype?: { startPageId?: string };
      nodes?: Record<
        string,
        {
          name?: string;
          parentId?: string;
          frame?: { x?: number; y?: number };
          prototype?: {
            interactions?: Array<{
              action?: { type?: string; targetPageId?: string; targetNodeId?: string; transition?: { type?: string } };
            }>;
          };
        }
      >;
    };

    expect(doc.pages?.length).toBe(3);
    expect(INTEGRATED_SERVICE_PROJECT_TITLE).toContain("NULL");
    expect(Object.keys(doc.nodes ?? {}).length).toBeGreaterThan(25);
    expect(doc.prototype?.startPageId).toBe(doc.pages?.[0]?.id);
    expect(doc.pages?.[0]?.breakpoints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "bp_user_compact_desktop",
        }),
        expect.objectContaining({
          id: "bp_user_mobile",
        }),
      ]),
    );
    expect(doc.pages?.[1]?.breakpoints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "bp_partner_compact_desktop",
        }),
        expect.objectContaining({
          id: "bp_partner_mobile",
        }),
      ]),
    );
    expect(doc.pages?.[2]?.breakpoints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "bp_ops_compact_desktop",
        }),
        expect.objectContaining({
          id: "bp_ops_mobile",
        }),
      ]),
    );

    const pageRootFrames = (doc.pages ?? []).map((page) => doc.nodes?.[page.rootId ?? ""]?.frame);
    expect(pageRootFrames).toEqual([
      expect.objectContaining({ x: 0, y: 0 }),
      expect.objectContaining({ x: 2000, y: 0 }),
      expect.objectContaining({ x: 4000, y: 0 }),
    ]);

    const interactions = Object.values(doc.nodes ?? {}).flatMap((node) => node.prototype?.interactions ?? []);
    expect(interactions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: expect.objectContaining({
            type: "scrollTo",
          }),
        }),
      ]),
    );
    expect(doc.variables?.map((variable) => variable.name)).toEqual(
      expect.arrayContaining([
        "$app_user.email",
        "$app_user.display_name",
        "$app_user.role",
        "$app_user.logged_in",
        "service_last_ok",
        "service_last_error",
        "chat_titles",
        "notification_titles",
        "todo_items",
        "todo_list",
        "todo_meta",
        "note_content",
        "noteContent",
        "kanban_columns",
        "kanbanColumns",
        "kanban_cards",
        "kanbanCards",
        "reservation_titles",
        "reservation_states",
        "reservation_active_id",
        "reservation_active_title",
        "reservation_active_state",
        "reservation_resource_id",
        "reservation_customer_key",
        "ticket_titles",
        "ticket_states",
        "ticket_messages",
        "ticket_active_id",
        "ticket_active_title",
        "ticket_active_state",
        "ticket_queue_id",
        "ticket_requester_key",
        "ticket_author_key",
        "crm_lead_titles",
        "crm_lead_stages",
        "crm_active_lead_id",
        "crm_active_lead_title",
        "crm_active_stage_id",
        "crm_active_stage_name",
        "crm_pipeline_id",
        "crm_next_stage_id",
        "crm_next_stage_name",
        "crm_next_stage_key",
        "document_titles",
        "document_states",
        "document_active_id",
        "document_active_title",
        "document_active_status",
        "document_request_id",
        "approval_status",
        "ops_release_count",
        "ops_current_version_id",
        "ops_runbook_release",
        "ops_policy_rule_count",
        "ops_events_24h",
        "ops_queued_jobs",
        "ops_dead_lettered_jobs",
        "ops_page_audit_24h",
        "ops_app_audit_24h",
        "ops_latest_app_audit_action",
        "ops_latest_page_audit_action",
        "billing_account_count",
        "billing_latest_invoice_id",
        "billing_latest_settlement_status",
        "policy_eval_decision",
        "policy_eval_risk_score",
      ]),
    );

    const serialized = JSON.stringify(doc);
    expect(serialized).toContain("Todo Form Panel");
    expect(serialized).toContain("Note Form Panel");
    expect(serialized).toContain("Kanban Form Panel");
    expect(serialized).toContain("{{ todo_items }}");
    expect(serialized).toContain("{{ note_content }}");
    expect(serialized).toContain("{{ kanban_columns }}");
    expect(serialized).toContain("Reservation Form Panel");
    expect(serialized).toContain("Reservation Status Panel");
    expect(serialized).toContain("Ticket Create Panel");
    expect(serialized).toContain("Ticket Reply Panel");
    expect(serialized).toContain("CRM Lead Move Panel");
    expect(serialized).toContain("{{ reservation_titles }}");
    expect(serialized).toContain("{{ reservation_states }}");
    expect(serialized).toContain("{{ ticket_titles }}");
    expect(serialized).toContain("{{ ticket_messages }}");
    expect(serialized).toContain("{{ crm_active_lead_title }}");
    expect(serialized).toContain("{{ crm_next_stage_name }}");
    expect(serialized).toContain("Approval Decision Panel");
    expect(serialized).toContain("{{ document_titles }}");
    expect(serialized).toContain("{{ document_active_status }}");
    expect(serialized).toContain("Operations Release Panel");
    expect(serialized).toContain("Policy Evaluation Panel");
    expect(serialized).toContain("Billing Settlement Panel");
    expect(serialized).toContain("운영 텔레메트리");
    expect(serialized).toContain("감사 로그");
    expect(serialized).toContain("{{ ops_current_version_id }}");
    expect(serialized).toContain("{{ ops_events_24h }}");
    expect(serialized).toContain("{{ ops_latest_app_audit_action }}");
    expect(serialized).toContain("{{ billing_latest_invoice_id }}");
    expect(serialized).toContain("{{ billing_latest_settlement_status }}");
    expect(serialized).toContain("{{ policy_eval_decision }}");
    expect(serialized).toContain("좁은 데스크톱 파트너 포털");
    expect(serialized).toContain("모바일 사용자 앱");
    expect(serialized).toContain("모바일 파트너 포털");
    expect(serialized).toContain("모바일 운영 콘솔");

    const nodes = Object.entries(doc.nodes ?? {});
    const actionButton = nodes.find(([, node]) => node.name === "Action Button");
    const actionButtonText = nodes.find(([, node]) => node.name === "Action Button Text");

    expect(actionButton?.[0]).toBeTruthy();
    expect(actionButtonText?.[1].parentId).toBe(actionButton?.[0]);
    expect(findNodesByName(doc, "Page Tab")).toHaveLength(0);
    expect(findNodesByName(doc, "Navigation Card")).toHaveLength(0);
  });

  it("injects provided credentials into text nodes", () => {
    const doc = buildIntegratedServiceDoc({
      credentials: [
        {
          label: "운영 관리자",
          role: "admin",
          email: "admin+demo@null.local",
          password: "NullDemo!2026",
          displayName: "NULL 운영 관리자",
        },
      ],
    }) as { nodes?: Record<string, { text?: string }> };

    const serialized = JSON.stringify(doc);
    expect(serialized.includes("admin+demo@null.local")).toBe(true);
    expect(serialized.includes("NullDemo!2026")).toBe(true);
  });

  it("applies shared design tokens to panels, controls, and text hierarchy", () => {
    const doc = hydrateDoc(buildIntegratedServiceDoc());

    const todoPanel = firstNodeByName(doc, "Todo Form Panel");
    expect(todoPanel.style?.fills?.[0]).toEqual({ type: "solid", color: INTEGRATED_SERVICE_DESIGN_TOKENS.colors.surface });
    expect(todoPanel.style?.strokes?.[0]).toEqual({ color: INTEGRATED_SERVICE_DESIGN_TOKENS.colors.border, width: 1 });
    expect(todoPanel.style?.radius).toBe(INTEGRATED_SERVICE_DESIGN_TOKENS.radius.panel);
    expect(todoPanel.style?.effects?.[0]).toEqual(expect.objectContaining(INTEGRATED_SERVICE_DESIGN_TOKENS.shadows.panel));

    const credentialsPanel = firstNodeByName(doc, "Credentials Panel");
    expect(credentialsPanel.style?.strokes?.[0]).toEqual({ color: INTEGRATED_SERVICE_DESIGN_TOKENS.colors.borderBrand, width: 1 });
    expect(credentialsPanel.style?.effects?.[0]).toEqual(expect.objectContaining(INTEGRATED_SERVICE_DESIGN_TOKENS.shadows.brandPanel));

    const actionButton = firstNodeByName(doc, "Action Button");
    expect(actionButton.style?.radius).toBe(INTEGRATED_SERVICE_DESIGN_TOKENS.radius.pill);
    expect(actionButton.style?.effects?.[0]).toEqual(expect.objectContaining(INTEGRATED_SERVICE_DESIGN_TOKENS.shadows.button));

    const input = firstNodeByName(doc, "Input");
    expect(input.style?.strokes?.[0]).toEqual({ color: INTEGRATED_SERVICE_DESIGN_TOKENS.colors.borderStrong, width: 1 });
    expect(input.style?.radius).toBe(INTEGRATED_SERVICE_DESIGN_TOKENS.radius.item);

    const runtimePanel = firstNodeByName(doc, "Runtime Value Panel");
    expect(runtimePanel.style?.strokes?.[0]).toEqual({ color: INTEGRATED_SERVICE_DESIGN_TOKENS.colors.borderBrand, width: 1 });
    expect(runtimePanel.style?.radius).toBe(INTEGRATED_SERVICE_DESIGN_TOKENS.radius.panel);

    const todoTitle = firstNodeByName(doc, "Todo Title");
    expect(todoTitle.text?.style?.fontSize).toBe(INTEGRATED_SERVICE_DESIGN_TOKENS.typography.panelTitle.size);
    expect(todoTitle.text?.style?.fontWeight).toBe(INTEGRATED_SERVICE_DESIGN_TOKENS.typography.panelTitle.weight);

    const todoBody = firstNodeByName(doc, "Todo Body");
    expect(todoBody.text?.style?.fontSize).toBe(INTEGRATED_SERVICE_DESIGN_TOKENS.typography.panelBody.size);
    expect(todoBody.text?.style?.fontWeight).toBe(INTEGRATED_SERVICE_DESIGN_TOKENS.typography.panelBody.weight);

    const inputLabel = firstNodeByName(doc, "Input Label");
    expect(inputLabel.text?.style?.fontSize).toBe(INTEGRATED_SERVICE_DESIGN_TOKENS.typography.fieldLabel.size);
    expect(inputLabel.text?.style?.fontWeight).toBe(INTEGRATED_SERVICE_DESIGN_TOKENS.typography.fieldLabel.weight);

    const actionButtonText = firstNodeByName(doc, "Action Button Text");
    expect(actionButtonText.text?.style?.fontSize).toBe(INTEGRATED_SERVICE_DESIGN_TOKENS.typography.action.size);
    expect(actionButtonText.text?.style?.fontWeight).toBe(INTEGRATED_SERVICE_DESIGN_TOKENS.typography.action.weight);
    expect(actionButtonText.text?.style?.align).toBe("center");

    const sectionLabel = firstNodeByName(doc, "Section Label Text");
    expect(sectionLabel.text?.style?.fontSize).toBe(INTEGRATED_SERVICE_DESIGN_TOKENS.typography.sectionLabel.size);
    expect(sectionLabel.text?.style?.fontWeight).toBe(INTEGRATED_SERVICE_DESIGN_TOKENS.typography.sectionLabel.weight);
  });

  it("keeps shared component content inside its surfaces after credential variations", () => {
    const doc = layoutDoc(
      hydrateDoc(buildIntegratedServiceDoc({
        credentials: [
          {
            label: "운영 관리자",
            role: "admin",
            email: "admin.owner.with.audit.trail+integrated.validation@null.example.local",
            password: "NullDemo!2026-Primary-Owner",
            displayName: "NULL Platform Integrated Validation Operations Owner",
          },
          {
            label: "파트너 운영자",
            role: "partner_manager",
            email: "partner.portal.release.coordinator+validation@null.example.local",
            password: "NullDemo!2026-Partner-Coordinator",
            displayName: "Partner Portal Release And Support Coordinator",
          },
          {
            label: "일반 사용자",
            role: "member_success",
            email: "member.success.long.identity+validation@null.example.local",
            password: "NullDemo!2026-Member-Success",
            displayName: "Validated End User Success Representative",
          },
        ],
      })),
    );
    const entries = Object.entries(doc.nodes ?? {});
    const isInside = (
      inner: { x: number; y: number; w: number; h: number },
      outer: { x: number; y: number; w: number; h: number },
    ) =>
      inner.x >= outer.x &&
      inner.y >= outer.y &&
      inner.x + inner.w <= outer.x + outer.w &&
      inner.y + inner.h <= outer.y + outer.h;

    const expectNodesInside = (nodeName: string, containerMatcher: (name: string) => boolean) => {
      const containerFrames = entries
        .filter(([, node]) => containerMatcher(node.name ?? ""))
        .map(([id]) => getAbsoluteFrame(doc, id))
        .filter(Boolean) as Array<{ x: number; y: number; w: number; h: number }>;
      const targetFrames = entries
        .filter(([, node]) => node.name === nodeName)
        .map(([id]) => getAbsoluteFrame(doc, id))
        .filter(Boolean) as Array<{ x: number; y: number; w: number; h: number }>;

      expect(containerFrames.length, `expected containers for ${nodeName}`).toBeGreaterThan(0);
      expect(targetFrames.length, `expected targets for ${nodeName}`).toBeGreaterThan(0);
      targetFrames.forEach((frame) => {
        expect(containerFrames.some((container) => isInside(frame, container)), `${nodeName} should stay inside its surface`).toBe(true);
      });
    };

    expectNodesInside("Credential Label", (name) => /^Credential \d+$/.test(name));
    expectNodesInside("Credential Name", (name) => /^Credential \d+$/.test(name));
    expectNodesInside("Credential Role", (name) => /^Credential \d+$/.test(name));
    expectNodesInside("Credential Email", (name) => /^Credential \d+$/.test(name));
    expectNodesInside("Credential Password", (name) => /^Credential \d+$/.test(name));
    expectNodesInside("Bullet Accent", (name) => name === "Bullet List Row");
    expectNodesInside("Bullet Title", (name) => name === "Bullet List Row");
    expectNodesInside("Bullet Meta", (name) => name === "Bullet List Row");
    expectNodesInside("Feature Metric Label", (name) => name === "Feature Metric Card");
    expectNodesInside("Feature Metric Value", (name) => name === "Feature Metric Card");
    expectNodesInside("Input Label", (name) => name === "Input" || name === "Textarea");
    expectNodesInside("Placeholder", (name) => name === "Input" || name === "Textarea");
    expectNodesInside("Runtime Label", (name) => name === "Runtime Value Row");
    expectNodesInside("Runtime Value", (name) => name === "Runtime Value Row");
  });

  it("builds a data-url thumbnail", () => {
    const thumbnail = buildIntegratedServiceThumbnailDataUrl();
    expect(thumbnail.startsWith("data:image/svg+xml;charset=utf-8,")).toBe(true);
    expect(decodeURIComponent(thumbnail)).toContain("NULL");
  });
});
