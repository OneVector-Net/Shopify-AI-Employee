// Ellie's bulk SEO-copy workflow. The "propose" half is real: it fetches
// real products via the live Shopify catalog connector, builds a genuine
// diff, and queues it through the guardrail engine exactly like every
// other employee's write action would. The suggestion-generation half is
// intentionally stubbed — swapping in a real LLM call is a follow-up
// task, not core infrastructure, and keeping it stubbed lets the rest of
// the pipeline (diff preview, approval, execute) be built and exercised
// without that dependency.

import { shopifyCatalogConnector, type CatalogProduct } from "~/lib/connectors/shopify-catalog";
import { proposeAction } from "~/lib/guardrails.server";

export interface ProductSeoDiff {
  productId: string;
  title: string;
  before: string;
  after: string;
}

// TODO: replace with a real LLM-generated suggestion (see PRD "Best
// features from market apps" for Ellie — Avada AI Product Description,
// AIBulk). Deterministic for now so the pipeline is testable without an
// LLM integration wired up yet.
function generateSeoSuggestion(product: CatalogProduct): string {
  if (product.description && product.description.trim().length > 0) {
    return product.description;
  }
  return `${product.title} — shop the full details, sizing, and specs for ${product.title} today.`;
}

export async function buildSeoDiffs(shopId: string, limit = 10): Promise<ProductSeoDiff[]> {
  const data = (await shopifyCatalogConnector.fetchData(shopId, { limit })) as {
    products: CatalogProduct[];
  };

  return data.products
    .map((product) => ({
      productId: product.id,
      title: product.title,
      before: product.description,
      after: generateSeoSuggestion(product),
    }))
    .filter((diff) => diff.after !== diff.before);
}

export async function proposeSeoBulkUpdate(shopId: string, diffs: ProductSeoDiff[]) {
  return proposeAction({
    shopId,
    employeeId: "ellie",
    actionType: "bulk_catalog_edit",
    summary: `Update SEO descriptions for ${diffs.length} product${diffs.length === 1 ? "" : "s"}`,
    payload: { diffs },
  });
}
