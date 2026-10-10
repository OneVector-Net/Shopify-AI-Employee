// The guardrail engine — the core safety mechanism described in the PRD's
// "Permissions & Guardrails" section. Three rules live here, and nowhere
// else in the codebase should bypass them:
//
//   1. An employee cannot even DRAFT a write action unless the operator has
//      explicitly enabled write access for that employee (feature #18).
//   2. A draft is never auto-executed — it always waits for an explicit,
//      fresh operator decision (confirm-to-execute, feature #18).
//   3. HARD guardrails are not editable through this module at all, by
//      design — they are compiled-in constants, not database rows an
//      operator (or a confused employee) can quietly update.

import db from "~/db.server";
import { logAuditEvent } from "~/lib/audit.server";
import type { EmployeeId } from "~/lib/employees";

// Guardrail keys that are universal across every employee and can never be
// changed from the guardrail-settings UI, full stop (PRD: "Universal,
// non-negotiable" guardrails).
export const UNIVERSAL_HARD_KEYS = [
  "approval_required_above_threshold",
  "ai_disclosure_enabled",
  "audit_log_enabled",
] as const;

// Guardrail keys that are hard for a *specific* employee (PRD: "Employee-
// specific" hard guardrails). The ceiling *amount* for Sam is soft — this
// list is about the existence of the rule, not its configured value.
export const EMPLOYEE_HARD_KEYS: Record<EmployeeId, string[]> = {
  liz: ["autonomous_ad_spend_disabled", "attribution_claims_unverified_disclaimer"],
  sam: ["legal_safety_always_escalates"],
  max: ["autonomous_po_placement_disabled"],
  mia: ["mass_send_requires_checkpoint", "respects_opt_out"],
  ellie: ["bulk_action_requires_preview", "regulated_claims_require_review"],
};

function isHardKey(employeeId: EmployeeId, key: string): boolean {
  return (
    (UNIVERSAL_HARD_KEYS as readonly string[]).includes(key) ||
    (EMPLOYEE_HARD_KEYS[employeeId] ?? []).includes(key)
  );
}

// Soft guardrail defaults, seeded the first time an employee is enabled for
// a shop. These are deliberately conservative — the operator can loosen or
// tighten them later, but an employee should never start more permissive
// than this.
const SOFT_GUARDRAIL_DEFAULTS: Partial<Record<EmployeeId, Record<string, string>>> = {
  sam: { refund_ceiling_usd: "50" },
  mia: { large_segment_threshold: "250" },
  max: { po_draft_only: "true" },
};

export async function seedDefaultGuardrails(shopId: string, employeeId: EmployeeId) {
  const defaults = SOFT_GUARDRAIL_DEFAULTS[employeeId] ?? {};
  for (const [key, value] of Object.entries(defaults)) {
    await db.guardrailSetting.upsert({
      where: { shopId_employeeId_key: { shopId, employeeId, key } },
      update: {},
      create: { shopId, employeeId, key, kind: "SOFT", value },
    });
  }
}

export interface GuardrailChangeResult {
  ok: boolean;
  reason?: "hard_guardrail";
  message?: string;
}

/**
 * Attempt to change a guardrail's value. Mirrors the PRD's "conflict
 * resolution" flow: soft settings are applied (and logged); hard ones are
 * refused with a message pointing at where that limit can actually be
 * reviewed, never silently ignored and never applied anyway.
 */
export async function requestGuardrailChange(params: {
  shopId: string;
  employeeId: EmployeeId;
  key: string;
  newValue: string;
  requestedBy: "OPERATOR" | "EMPLOYEE";
}): Promise<GuardrailChangeResult> {
  const { shopId, employeeId, key, newValue, requestedBy } = params;

  if (isHardKey(employeeId, key)) {
    await logAuditEvent({
      shopId,
      employeeId,
      actorType: requestedBy,
      actionType: "guardrail_change_refused",
      summary: `Refused to change hard guardrail "${key}" for ${employeeId}`,
      payload: { key, attemptedValue: newValue },
    });
    return {
      ok: false,
      reason: "hard_guardrail",
      message: `"${key}" is a platform-level safety guardrail and can't be changed in conversation. An account owner can review it under Settings > Guardrails.`,
    };
  }

  await db.guardrailSetting.upsert({
    where: { shopId_employeeId_key: { shopId, employeeId, key } },
    update: { value: newValue, kind: "SOFT" },
    create: { shopId, employeeId, key, kind: "SOFT", value: newValue },
  });

  await logAuditEvent({
    shopId,
    employeeId,
    actorType: requestedBy,
    actionType: "guardrail_changed",
    summary: `Set "${key}" to "${newValue}" for ${employeeId}`,
    payload: { key, newValue },
  });

  return { ok: true };
}

/** Reads one soft guardrail's current configured value (e.g. Sam's
 * refund ceiling), falling back to undefined if never set/seeded. */
export async function getSoftGuardrailValue(
  shopId: string,
  employeeId: EmployeeId,
  key: string,
): Promise<string | undefined> {
  const row = await db.guardrailSetting.findUnique({
    where: { shopId_employeeId_key: { shopId, employeeId, key } },
  });
  return row?.value;
}

export async function getGuardrails(shopId: string, employeeId: EmployeeId) {
  const soft = await db.guardrailSetting.findMany({ where: { shopId, employeeId } });
  const hard = [
    ...UNIVERSAL_HARD_KEYS.map((key) => ({ key, scope: "universal" as const })),
    ...(EMPLOYEE_HARD_KEYS[employeeId] ?? []).map((key) => ({ key, scope: "employee" as const })),
  ];
  return { soft, hard };
}

/** Rule #1: an employee may not draft/propose a write action unless the
 * operator has explicitly turned write access on for it. */
export async function canDraftActions(shopId: string, employeeId: EmployeeId): Promise<boolean> {
  const state = await db.employeeState.findUnique({
    where: { shopId_employeeId: { shopId, employeeId } },
  });
  return Boolean(state?.enabled && state.permissionTier === "WRITE_SCOPED");
}

export class GuardrailViolation extends Error {}

/**
 * Create a draft action awaiting operator approval. This is the ONLY way
 * a connector module should be able to queue a write — there is
 * deliberately no function anywhere in this codebase that both creates
 * and executes an action in the same call (Rule #2: confirm-to-execute).
 */
export async function proposeAction(params: {
  shopId: string;
  employeeId: EmployeeId;
  actionType: string;
  summary: string;
  payload: unknown;
}) {
  const { shopId, employeeId, actionType, summary, payload } = params;

  const allowed = await canDraftActions(shopId, employeeId);
  if (!allowed) {
    throw new GuardrailViolation(
      `${employeeId} is not permitted to draft "${actionType}" actions yet — the operator must enable write access for this employee first.`,
    );
  }

  const pending = await db.pendingAction.create({
    data: {
      shopId,
      employeeId,
      actionType,
      summary,
      payload: JSON.stringify(payload),
      status: "PENDING",
    },
  });

  await logAuditEvent({
    shopId,
    employeeId,
    actorType: "EMPLOYEE",
    actionType: `${actionType}_drafted`,
    summary,
    payload,
    pendingActionId: pending.id,
  });

  return pending;
}

/** Operator approves or declines a pending action. Approval does NOT
 * execute it — see app/lib/connectors/README.md for why execution is kept
 * as a deliberately separate step. */
export async function decidePendingAction(params: {
  pendingActionId: string;
  decision: "APPROVED" | "DECLINED";
  decidedBy: string;
}) {
  const { pendingActionId, decision, decidedBy } = params;

  const pending = await db.pendingAction.update({
    where: { id: pendingActionId },
    data: { status: decision, decidedAt: new Date(), decidedBy },
  });

  await logAuditEvent({
    shopId: pending.shopId,
    employeeId: pending.employeeId as EmployeeId,
    actorType: "OPERATOR",
    actionType: `${pending.actionType}_${decision.toLowerCase()}`,
    summary: `Operator ${decision.toLowerCase()} "${pending.actionType}" for ${pending.employeeId}`,
    payload: pending.payload,
    pendingActionId: pending.id,
  });

  return pending;
}
