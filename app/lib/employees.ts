// The five AI employees. This is the single source of truth for who they
// are, what pain point they address, and which connectors they need —
// referenced by the dashboard UI, the onboarding flow, and the guardrail
// engine. See PRD "The Five AI Employees".

export type EmployeeId = "liz" | "sam" | "max" | "mia" | "ellie";

export interface EmployeeDefinition {
  id: EmployeeId;
  name: string;
  role: string;
  painPoint: string;
  avatarInitial: string;
  accentColor: string;
  /** Connector ids this employee can be wired up to. Must match keys in
   * app/lib/connectors/registry.ts. */
  connectors: string[];
  /** Hard guardrails are enforced in code (see guardrails.server.ts) and
   * are not operator-editable; this list is for display only. */
  hardGuardrails: string[];
}

export const EMPLOYEES: Record<EmployeeId, EmployeeDefinition> = {
  liz: {
    id: "liz",
    name: "Liz",
    role: "Marketing Strategist",
    painPoint: "CAC & attribution blind spots",
    avatarInitial: "L",
    accentColor: "#6d5bd0",
    connectors: ["triplewhale", "northbeam", "metaads", "googleads"],
    hardGuardrails: [
      "No autonomous ad budget changes (spend / pause / launch)",
      "Cannot present attribution or LTV estimates as verified fact",
    ],
  },
  sam: {
    id: "sam",
    name: "Sam",
    role: "CX Agent",
    painPoint: "Support ticket overhead & WISMO / returns",
    avatarInitial: "S",
    accentColor: "#2c6ecb",
    // shopify_orders needs no third-party OAuth — refunds are a Shopify
    // concept, not a Gorgias one, so the highest-stakes part of Sam's job
    // runs on the native Admin API (see
    // app/lib/connectors/shopify-orders.ts). Gorgias/AfterShip/Loop stay
    // stubbed until real OAuth credentials are available for them.
    connectors: ["shopify_orders", "gorgias", "aftership", "loop"],
    hardGuardrails: [
      "Refund / credit requires a human-approval ceiling",
      "Legal or safety-sensitive complaints always escalate, never self-resolved",
    ],
  },
  max: {
    id: "max",
    name: "Max",
    role: "Inventory Manager",
    painPoint: "Inventory mismanagement & working capital",
    avatarInitial: "M",
    accentColor: "#1f9a6c",
    connectors: ["fabrikator", "inventoryplanner", "prediko"],
    hardGuardrails: ["No autonomous purchase-order placement or supplier commitment"],
  },
  mia: {
    id: "mia",
    name: "Mia",
    role: "Retention / Lifecycle Marketer",
    painPoint: "Weak retention & one-and-done buyers",
    avatarInitial: "M",
    accentColor: "#d9527a",
    connectors: ["klaviyo", "smileio", "recharge"],
    hardGuardrails: [
      "No full-list / large-segment send without a human checkpoint",
      "Never messages a contact who has opted out",
    ],
  },
  ellie: {
    id: "ellie",
    name: "Ellie",
    role: "Catalog & Admin Manager",
    painPoint: "Catalog management & administrative overhead",
    avatarInitial: "E",
    accentColor: "#c77d2e",
    // shopify_catalog needs no third-party OAuth at all — it's the first
    // connector built end-to-end (see app/lib/connectors/shopify-catalog.ts)
    // precisely because it has the fewest external failure points.
    connectors: ["shopify_catalog", "aibulk", "avadaai"],
    hardGuardrails: [
      "No irreversible bulk catalog action without preview/approval",
      "No publishing regulated/compliance-sensitive claims without human review",
    ],
  },
};

export const EMPLOYEE_LIST: EmployeeDefinition[] = Object.values(EMPLOYEES);
