# Connector framework

Every third-party integration implements the `Connector` (or
`WritableConnector`) interface in `types.ts` and registers itself in
`registry.ts`. That's the whole contract the core depends on — nothing
in the dashboard, guardrail engine, or audit log needs to know that
Gorgias and Klaviyo are different products.

## Secrets — not yet wired up, by design

`ConnectorCredential.secretRef` in the Prisma schema is an **opaque
pointer**, never a raw OAuth token. This scaffold does not include a
secrets-vault implementation yet — see the PRD's "Security & credentials"
section:

- Use a dedicated secrets manager (AWS Secrets Manager, HashiCorp Vault,
  or equivalent), isolated from the app server.
- Per-merchant envelope encryption — never one shared key for every shop.
- `secretRef` should resolve to a real token only inside the secrets
  layer, never by reading it out of the main database.

Do not store tokens directly on `ConnectorCredential` or in environment
variables once real connectors are built — that reintroduces exactly the
centralized-blast-radius risk flagged in the PRD.

## Execution is always a separate step from drafting

`proposeAction()` in `guardrails.server.ts` creates a `PendingAction` and
never calls a connector's `execute()`. `decidePendingAction()` records an
operator's approval and also never calls `execute()` directly. Wiring the
two together (a job or request handler that calls `execute()` only after
seeing `status: "APPROVED"`) is a deliberate, separate piece of code —
keeping drafting, approving, and executing as three distinct steps is
what makes "confirm-to-execute" (PRD feature #18) actually enforceable
rather than just a UI convention.
