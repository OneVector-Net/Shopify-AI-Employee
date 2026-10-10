// Append-only audit log (PRD "Non-Functional Requirements"). Every write
// action, every guardrail decision, and every approval/decline gets
// recorded here — this is the evidentiary record referenced in the
// Accountability & Liability section, so entries are never updated or
// deleted by application code.

import db from "~/db.server";
import type { EmployeeId } from "~/lib/employees";

export type ActorType = "EMPLOYEE" | "OPERATOR" | "SYSTEM";

export interface AuditLogInput {
  shopId: string;
  employeeId?: EmployeeId;
  actorType: ActorType;
  actionType: string;
  summary: string;
  payload?: unknown;
  pendingActionId?: string;
}

export async function logAuditEvent(input: AuditLogInput) {
  return db.auditLogEntry.create({
    data: {
      shopId: input.shopId,
      employeeId: input.employeeId,
      actorType: input.actorType,
      actionType: input.actionType,
      summary: input.summary,
      payload: input.payload !== undefined ? JSON.stringify(input.payload) : null,
      pendingActionId: input.pendingActionId,
    },
  });
}

export async function getRecentAuditEvents(shopId: string, limit = 20) {
  return db.auditLogEntry.findMany({
    where: { shopId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}
