// Reference implementation for Mia's primary connector — read-heavy
// (segmentation, campaign data) plus a guarded write path (triggering a
// flow / sending a campaign). Stub, same shape as gorgias.ts.

import type { ConnectorHealth, WritableConnector } from "~/lib/connectors/types";

export const klaviyoConnector: WritableConnector = {
  id: "klaviyo",
  name: "Klaviyo",
  requiredScopes: ["campaigns:read", "segments:read", "campaigns:write"],

  async fetchData(shopId, query) {
    // TODO: real Klaviyo API call via stored credential.
    return {
      shopId,
      query,
      segments: [],
      note: "stub: wire up real Klaviyo API credentials",
    };
  },

  async checkHealth(_shopId): Promise<ConnectorHealth> {
    return { ok: true, checkedAt: new Date(), message: "stub connector — always reports healthy" };
  },

  async execute(shopId, pendingActionId, payload) {
    // Only ever called post-approval — see gorgias.ts for the same note.
    // TODO: call the real Klaviyo API (e.g. send a campaign to a segment).
    return {
      ok: true,
      message: `stub: would execute pending action ${pendingActionId} for shop ${shopId} with payload ${JSON.stringify(
        payload,
      )}`,
    };
  },
};
