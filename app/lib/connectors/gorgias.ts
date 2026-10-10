// Reference implementation for Sam's primary connector. This is a stub —
// real OAuth + API calls are a later task — but the shape is real: it
// shows exactly where a credential lookup, a read call, and a guarded
// write would go, so the next connector (AfterShip, Loop, ...) can copy
// this pattern.

import type { ConnectorHealth, WritableConnector } from "~/lib/connectors/types";

export const gorgiasConnector: WritableConnector = {
  id: "gorgias",
  name: "Gorgias",
  requiredScopes: ["tickets:read", "tickets:write"],

  async fetchData(shopId, query) {
    // TODO: look up the stored credential (via ConnectorCredential.secretRef
    // -> secrets vault, never a raw token in this file) and call the real
    // Gorgias API. Stubbed so the dashboard has something to render.
    return {
      shopId,
      query,
      tickets: [],
      note: "stub: wire up real Gorgias API credentials",
    };
  },

  async checkHealth(_shopId): Promise<ConnectorHealth> {
    return { ok: true, checkedAt: new Date(), message: "stub connector — always reports healthy" };
  },

  async execute(shopId, pendingActionId, payload) {
    // Only ever called after guardrails.server.ts#decidePendingAction has
    // recorded an APPROVED decision for this pendingActionId — never call
    // this directly from employee logic.
    // TODO: call the real Gorgias API (e.g. issue a refund).
    return {
      ok: true,
      message: `stub: would execute pending action ${pendingActionId} for shop ${shopId} with payload ${JSON.stringify(
        payload,
      )}`,
    };
  },
};
