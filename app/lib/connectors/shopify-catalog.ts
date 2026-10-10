// Ellie's primary connector — and notably the one employee that doesn't
// need a third-party integration for v1 at all. It rides directly on the
// app's own installed Shopify session for the shop (via
// `unauthenticated.admin()`), not a stored OAuth credential like Gorgias
// or Klaviyo. That's exactly why Ellie was chosen to go first: one fewer
// external system that can break.
//
// IMPORTANT: shopify.dev was unreachable from the environment this was
// written in, so the GraphQL query/mutation shapes below are written from
// the current Admin API conventions but were NOT verified against the
// live schema for apiVersion 2024-10. Confirm field names (especially
// `productUpdate`'s input shape) before relying on this in production —
// a wrong field name fails loudly via `userErrors`/GraphQL errors, not
// silently, but it should still be checked before shipping.

import db from "~/db.server";
import { unauthenticated } from "~/shopify.server";
import type { ConnectorHealth, WritableConnector } from "~/lib/connectors/types";

async function getAdminClient(shopId: string) {
  const shop = await db.shop.findUniqueOrThrow({ where: { id: shopId } });
  const { admin } = await unauthenticated.admin(shop.domain);
  return admin;
}

export interface CatalogProduct {
  id: string;
  title: string;
  description: string;
}

export const shopifyCatalogConnector: WritableConnector = {
  id: "shopify_catalog",
  name: "Shopify Catalog (native)",
  requiredScopes: ["read_products", "write_products"],

  async fetchData(shopId, query) {
    const admin = await getAdminClient(shopId);
    const limit = typeof query.limit === "number" ? query.limit : 10;

    const response = await admin.graphql(
      `#graphql
      query BulkEditCandidates($first: Int!) {
        products(first: $first) {
          edges {
            node {
              id
              title
              description
            }
          }
        }
      }`,
      { variables: { first: limit } },
    );
    const body = await response.json();
    const products: CatalogProduct[] =
      body.data?.products?.edges?.map((edge: { node: CatalogProduct }) => edge.node) ?? [];

    return { products };
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
    const { diffs } = payload as { diffs: { productId: string; after: string }[] };

    const results: { productId: string; ok: boolean; error?: string }[] = [];

    for (const diff of diffs) {
      const response = await admin.graphql(
        `#graphql
        mutation UpdateProductDescription($id: ID!, $description: String!) {
          productUpdate(input: { id: $id, descriptionHtml: $description }) {
            product { id }
            userErrors { field message }
          }
        }`,
        { variables: { id: diff.productId, description: diff.after } },
      );
      const body = await response.json();
      const userErrors = body.data?.productUpdate?.userErrors ?? [];
      results.push({
        productId: diff.productId,
        ok: userErrors.length === 0,
        error: userErrors[0]?.message,
      });
    }

    const failed = results.filter((r) => !r.ok);
    return {
      ok: failed.length === 0,
      message:
        failed.length === 0
          ? `Updated ${results.length} product${results.length === 1 ? "" : "s"}.`
          : `${failed.length} of ${results.length} updates failed: ${failed.map((f) => f.error).join("; ")}`,
    };
  },
};
