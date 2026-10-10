// The connector interface — every third-party integration (Klaviyo,
// Gorgias, AfterShip, ...) implements this so the core doesn't need to
// know anything connector-specific (PRD "Architecture": "Build once, in
// the core" / "Modular connector architecture").

export interface ConnectorHealth {
  ok: boolean;
  checkedAt: Date;
  message?: string;
}

export interface Connector {
  /** Must match the key this connector is registered under in registry.ts. */
  id: string;
  name: string;
  /** Least-privilege scopes this connector requests — never more than the
   * employee actually needs (PRD "Onboarding & Trust": minimum access). */
  requiredScopes: string[];

  /** Read-only fetch. Has no guardrail gate — reading is always allowed
   * once the connector is connected. */
  fetchData(shopId: string, query: Record<string, unknown>): Promise<unknown>;

  /** Called by the periodic health-check job. Feeds ConnectorCredential's
   * status and the "stale data" disclosure rule — an employee must say so
   * if it's answering from data behind a failing connector (PRD "Failure &
   * rollback"). */
  checkHealth(shopId: string): Promise<ConnectorHealth>;
}

export interface WritableConnector extends Connector {
  /**
   * Executes a PendingAction that has already been APPROVED by an
   * operator (see guardrails.server.ts#decidePendingAction). This must
   * never be called directly by employee logic — only by the execution
   * step that runs after an approval is recorded, so there is always a
   * decided-by + timestamp in the audit log before anything real happens.
   */
  execute(
    shopId: string,
    pendingActionId: string,
    payload: unknown,
  ): Promise<{ ok: boolean; message?: string }>;
}

export function isWritable(connector: Connector): connector is WritableConnector {
  return typeof (connector as WritableConnector).execute === "function";
}
