# Shopify AI Employees — Core Infrastructure

This is the scaffold for the shared core described in the PRD's
"Architecture" section: the pieces every one of the five employees (Liz,
Sam, Max, Mia, Ellie) depends on, built once rather than five times.

## What's here

| PRD concept | Code |
| --- | --- |
| Embedded Shopify admin app (App Bridge + Polaris) | `app/routes/app.tsx`, `app/root.tsx` |
| Dashboard / employee roster | `app/routes/app._index.tsx` |
| The five employees (roles, pain points, hard guardrails) | `app/lib/employees.ts` |
| Permission/guardrail engine (hard vs. soft, confirm-to-execute) | `app/lib/guardrails.server.ts` |
| Audit log | `app/lib/audit.server.ts` |
| Connector framework (interface + registry) | `app/lib/connectors/` |
| Data model (Shop, EmployeeState, ConnectorCredential, PendingAction, GuardrailSetting, AuditLogEntry) | `prisma/schema.prisma` |
| Shopify OAuth | `app/shopify.server.ts`, `app/routes/auth.$.tsx` |
| **Ellie, end-to-end (first employee wired for real)** | `app/lib/connectors/shopify-catalog.ts`, `app/lib/ellie.server.ts`, `app/routes/app.employees.$employeeId.tsx` |

Stack: Remix + TypeScript + Prisma + Polaris + App Bridge — Shopify's
current official stack for embedded admin apps, chosen specifically
because it gives native Polaris components for free rather than hand-
rebuilding Shopify's design system (see the wireframe discussion this
scaffold follows up on).

## Ellie — the first employee built end-to-end

Per the rollout plan, Ellie went first: lowest blast radius (no money,
not customer-facing), and the only employee that needs **zero**
third-party connectors for v1 — she runs on Shopify's own Admin API via
`app/lib/connectors/shopify-catalog.ts`, using the app's own installed
session (`unauthenticated.admin()`), not a stored OAuth credential.

Her workflow (`app/routes/app.employees.$employeeId.tsx`,
`app/lib/ellie.server.ts`) is real end-to-end: fetch real products →
build a real diff → `proposeAction()` queues it as a `PendingAction`
(blocked entirely if write access isn't enabled, per guardrail rule #1)
→ operator sees an actual before/after table and approves or declines →
approval calls `shopifyCatalogConnector.execute()`, which is the one
place in the codebase allowed to do that, and only after an APPROVED
decision is on record. Nothing in this path is a stub except the SEO
copy itself (see below).

**Known caveat:** the GraphQL query/mutation shapes in
`shopify-catalog.ts` (especially `productUpdate`'s input) were written
from Admin API convention, not verified against the live schema —
`shopify.dev` was unreachable from this environment. Confirm field names
before relying on this against a real store.

## What's deliberately stubbed, not yet real

- **The other four connectors** (`app/lib/connectors/gorgias.ts`,
  `klaviyo.ts`) return fake data and don't call real APIs yet. The shape
  is real; HTTP calls and OAuth are a follow-up task per connector, the
  same way Ellie's was just done for real.
- **SEO copy generation** (`app/lib/ellie.server.ts#generateSeoSuggestion`)
  is a deterministic placeholder, not a real LLM call — intentionally,
  so the rest of the pipeline could be built and tested without an LLM
  integration in place yet.
- **Secrets vault** — `ConnectorCredential.secretRef` is an opaque
  pointer, not a working implementation. See
  `app/lib/connectors/README.md` for why this needs a real secrets
  manager before any *third-party* connector goes live (Ellie's own
  connector doesn't need one at all, which is why it was first).
- **Permission-upgrade flow** — the "Enable write access" button on an
  employee's page flips `EmployeeState` directly rather than going
  through Shopify's real OAuth scope-update prompt (PRD feature #17).
  Fine for exercising the rest of the pipeline locally; needs replacing
  before this goes in front of a real merchant.
- **Onboarding UI** (the guided, conversational per-employee setup) isn't
  built — `seedDefaultGuardrails()` exists so there's something sane to
  seed once it is.

## Local setup

```bash
npm install
cp .env.example .env   # fill in SHOPIFY_API_KEY / SHOPIFY_API_SECRET from
                        # a Shopify Partner Dashboard app, and SHOPIFY_APP_URL
                        # (an ngrok/cloudflared tunnel URL for local dev)
npx prisma migrate dev --name init
npm run dev             # runs `shopify app dev` — requires the Shopify CLI
```

You'll need a Shopify Partner account and a development store to actually
install and test this against — there's no way around that for an
embedded app. `shopify app dev` will prompt you to connect one the first
time you run it.

## ⚠ Known issue: Polaris React is deprecated

`npm install` surfaces this directly:

> `@shopify/polaris@13.9.5: Polaris React is deprecated and no longer
> maintained. For building Shopify admin experiences, use Polaris web
> components.`

This scaffold's UI (`app/routes/app.tsx`, `app/routes/app._index.tsx`)
currently uses `@shopify/polaris` (the React component library) because:

1. It still works — Shopify has not removed it, only stopped updating it,
   and React and web-component versions can run side by side in the same
   app.
2. I could not reach `shopify.dev` from this environment (proxy blocks
   the host) to confirm the exact current syntax for the replacement —
   Polaris **web components** (custom elements like `<s-page>`,
   `<s-button>`, `<s-badge>`, loaded from a Shopify CDN script tag rather
   than installed via npm). Shipping a UI rewrite built on guessed tag
   names risked silently-broken markup (unknown custom elements just
   render as nothing, with no compile error).

**Recommended near-term follow-up, from an environment that can reach
shopify.dev:** read
https://shopify.dev/docs/apps/build/app-home/migrate-from-polaris-react
and migrate `app/routes/app.tsx` + `app/routes/app._index.tsx` to Polaris
web components before this goes much further — every new embedded app
should be built on the components Shopify is actually still updating,
not the deprecated ones, and the earlier this migrates the less UI code
there is to convert. None of the core logic (guardrails, connectors,
audit log, data model) is affected either way — this is isolated to the
two UI route files.

## Suggested next step

Ellie validated the pattern (see above). Next: wire up Sam the same way
— real Gorgias OAuth + connector, a real WISMO/refund workflow through
the same `proposeAction` → approve → `execute()` path — before touching
Liz, Max, or Mia. Sam is a bigger lift (a real third-party OAuth
integration, Protected Customer Data review, customer-facing judgment
calls) so budget more time for her than Ellie took.
