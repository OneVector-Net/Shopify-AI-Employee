// Sam's refund workflow. Like Ellie's SEO workflow, the drafting →
// approve → execute plumbing here is real; what's stubbed is the
// judgment call a real Sam would make — reading the actual Gorgias
// ticket and deciding a refund is warranted. For now this always drafts
// against the most recent order with a canned WISMO reason, so the rest
// of the pipeline (ceiling check, action-card preview, approval, real
// Shopify refund execution) can be built and tested without a live
// Gorgias connection.

import {
  shopifyOrdersConnector,
  type RecentOrder,
  type RefundPayload,
} from "~/lib/connectors/shopify-orders";
import { getSoftGuardrailValue, proposeAction } from "~/lib/guardrails.server";

export interface RefundDraft extends RefundPayload {
  customerName: string;
  /** True when the proposed amount exceeds the operator-configured
   * refund ceiling (PRD: Sam's hard guardrail is that SOME ceiling must
   * exist and be enforced via approval; the dollar value itself is
   * soft/configurable). Everything still requires approval regardless
   * (confirm-to-execute, PRD feature #18) — this flag is surfaced to the
   * operator as an extra-scrutiny signal, not a silent block. */
  exceedsCeiling: boolean;
  ceiling?: number;
}

export async function buildRefundDraft(shopId: string): Promise<RefundDraft | null> {
  const data = (await shopifyOrdersConnector.fetchData(shopId, { limit: 1 })) as {
    orders: RecentOrder[];
  };
  const order = data.orders[0];
  if (!order) return null;

  const ceilingRaw = await getSoftGuardrailValue(shopId, "sam", "refund_ceiling_usd");
  const ceiling = ceilingRaw !== undefined ? Number(ceilingRaw) : undefined;
  const amount = Number(order.amount);

  return {
    orderId: order.id,
    orderName: order.name,
    customerName: order.customerName,
    amount: order.amount,
    currencyCode: order.currencyCode,
    reason: "Customer reports item never arrived (WISMO) — tracking shows no recent movement.",
    exceedsCeiling: ceiling !== undefined && amount > ceiling,
    ceiling,
  };
}

export async function proposeRefund(shopId: string, draft: RefundDraft) {
  const summary = draft.exceedsCeiling
    ? `Refund ${draft.amount} ${draft.currencyCode} for order ${draft.orderName} — exceeds the ${draft.ceiling} refund ceiling, needs extra scrutiny`
    : `Refund ${draft.amount} ${draft.currencyCode} for order ${draft.orderName}`;

  return proposeAction({
    shopId,
    employeeId: "sam",
    actionType: "refund",
    summary,
    payload: draft satisfies RefundDraft,
  });
}
