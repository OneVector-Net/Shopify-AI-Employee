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

Stack: Remix + TypeScript + Prisma + Polaris + App Bridge — Shopify's
current official stack for embedded admin apps, chosen specifically
because it gives native Polaris components for free rather than hand-
rebuilding Shopify's design system (see the wireframe discussion this
scaffold follows up on).

## What's deliberately stubbed, not yet real

- **Connectors** (`app/lib/connectors/gorgias.ts`, `klaviyo.ts`) return
  fake data and don't call real APIs yet. The shape is real; the HTTP
  calls and OAuth are a follow-up task per connector.
- **Secrets vault** — `ConnectorCredential.secretRef` is an opaque
  pointer, not a working implementation. See
  `app/lib/connectors/README.md` for why this needs a real secrets
  manager before any connector goes live, and why it's not safe to fill
  in with an env var as a shortcut.
- **Execution step** — approving a `PendingAction` does not yet call a
  connector's `execute()`. That wiring is intentionally a separate piece
  of code so drafting, approving, and executing stay three distinct,
  auditable steps (PRD feature #18).
- **Permission-upgrade flow** (read-only → write-scoped via Shopify's
  OAuth scope-update) is not built yet — `EmployeeState.permissionTier`
  exists in the schema but nothing flips it yet except direct DB access.
- **Onboarding UI** (the guided, conversational per-employee setup) isn't
  built — `seedDefaultGuardrails()` exists so there's something sane to
  seed once it is.
- Only two connectors are stubbed (Gorgias, Klaviyo) as the reference
  pattern — the rest (AfterShip, Loop, Smile.io, ReCharge/Skio,
  Fabrikatör, etc.) follow the same shape in
  `app/lib/connectors/types.ts`.

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

Per the PRD's rollout plan: validate this core against **one employee**
before replicating the pattern for the rest. Wire up Sam's or Ellie's
real connector(s) end-to-end (OAuth, real data fetch, one real guarded
write action through the PendingAction → approval → execute path) before
touching Liz, Max, or Mia.
