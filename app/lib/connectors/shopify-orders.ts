// Sam's refund-execution connector. Important architectural point: a
// refund is a Shopify concept, not a Gorgias one — Gorgias (stubbed
// separately, see gorgias.ts) is where Sam reads the support ticket and
// drafts a response, but the money itself moves through Shopify's own
// order API. That means the highest-stakes part of Sam's job — actually
// issuing a refund — needs zero third-party OAuth, the same reason
// Ellie's connector needed none. Reading ticket context from Gorgias is
// a separate, genuinely-third-party integration left stubbed until real
// Gorgias credentials are available (see app/lib/connectors/gorgias.ts
// and the PRD caveat on Protected Customer Data review).
//
// IMPORTANT: shopify.dev was unreachable from the environment this was
// written in. Shopify's refund API specifically requires referencing the
// order's original transaction (a `parentId`) rather than a bare amount
// — this file implements that two-step fetch-then-refund pattern because
// getting it wrong silently fails worse here than almost anywhere else
// in this codebase (it's real money). Verify both the query and the
// refundCreate input shape against the live Admin API schema before
// relying on this against a real store.

import db from "~/db.server";
import { unauthenticated } from "~/shopify.server";
import type { ConnectorHealth, WritableConnector } from "~/lib/connectors/types";

async function getAdminClient(shopId: string) {
  const shop = await db.shop.findUniqueOrThrow({ where: { id: shopId } });
  const { admin } = await unauthenticated.admin(shop.domain);
  return admin;
}

export interface RecentOrder {
  id: string;
  name: string;
  customerName: string;
  amount: string;
  currencyCode: string;
  fulfillmentStatus: string;
  financialStatus: string;
}

export interface RefundPayload {
  orderId: string;
  orderName: string;
  amount: string;
  currencyCode: string;
  reason: string;
}

export const shopifyOrdersConnector: WritableConnector = {
  id: "shopify_orders",
  name: "Shopify Orders (native)",
  // NOTE: the exact scope `refundCreate` requires wasn't confirmed
  // against live docs — `write_orders` is the conventional one, verify
  // before relying on it.
  requiredScopes: ["read_orders", "write_orders"],

  async fetchData(shopId, query) {
    const admin = await getAdminClient(shopId);
    const limit = typeof query.limit === "number" ? query.limit : 5;

    const response = await admin.graphql(
      `#graphql
      query RecentOrders($first: Int!) {
        orders(first: $first, sortKey: CREATED_AT, reverse: true) {
          edges {
            node {
              id
              name
              displayFulfillmentStatus
              displayFinancialStatus
              customer { displayName }
              totalPriceSet { shopMoney { amount currencyCode } }
            }
          }
        }
      }`,
      { variables: { first: limit } },
    );
    const body = await response.json();
    const orders: RecentOrder[] = (body.data?.orders?.edges ?? []).map(
      (edge: { node: any }) => ({
        id: edge.node.id,
        name: edge.node.name,
        customerName: edge.node.customer?.displayName ?? "Unknown customer",
        amount: edge.node.totalPriceSet.shopMoney.amount,
        currencyCode: edge.node.totalPriceSet.shopMoney.currencyCode,
        fulfillmentStatus: edge.node.displayFulfillmentStatus,
        financialStatus: edge.node.displayFinancialStatus,
      }),
    );

    return { orders };
  },

  async checkHealth(shopId): Promise<ConnectorHealth> {
    try {
      await getAdminClient(shopId);
      return { ok: true, checkedAt: new Date() };
    } catch (error) {
      return { ok: false, checkedAt: new Date(), message: (error as Error).message };
    }
  },

  async execute(shopId, _pendingActionId, payload) {
    const admin = await getAdminClient(shopId);
    const { orderId, amount, currencyCode, reason } = payload as RefundPayload;

    // Step 1: find the original sale/capture transaction — Shopify's
    // refund API refunds AGAINST a parent transaction, it doesn't accept
    // a bare amount on its own.
    const txResponse = await admin.graphql(
      `#graphql
      query OrderTransactions($id: ID!) {
        order(id: $id) {
          transactions(first: 10) {
            id
            kind
            gateway
            status
          }
        }
      }`,
      { variables: { id: orderId } },
    );
    const txBody = await txResponse.json();
    const transactions: { id: string; kind: string; gateway: string; status: string }[] =
      txBody.data?.order?.transactions ?? [];
    const parent = transactions.find(
      (tx) => (tx.kind === "SALE" || tx.kind === "CAPTURE") && tx.status === "SUCCESS",
    );

    if (!parent) {
      return {
        ok: false,
        message: "Couldn't find a completed sale/capture transaction on this order to refund against.",
      };
    }

    // Step 2: issue the refund against that transaction.
    const refundResponse = await admin.graphql(
      `#graphql
      mutation IssueRefund($input: RefundInput!) {
        refundCreate(input: $input) {
          refund { id }
          userErrors { field message }
        }
      }`,
      {
        variables: {
          input: {
            orderId,
            note: reason,
            transactions: [
              {
                orderId,
                parentId: parent.id,
                gateway: parent.gateway,
                kind: "REFUND",
                amount,
                currency: currencyCode,
              },
            ],
          },
        },
      },
    );
    const refundBody = await refundResponse.json();
    const userErrors = refundBody.data?.refundCreate?.userErrors ?? [];

    return {
      ok: userErrors.length === 0,
      message:
        userErrors.length === 0
          ? `Refunded ${amount} ${currencyCode}.`
          : userErrors[0]?.message ?? "Refund failed.",
    };
  },
};
