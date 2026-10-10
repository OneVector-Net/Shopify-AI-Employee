import type { Connector } from "~/lib/connectors/types";
import { gorgiasConnector } from "~/lib/connectors/gorgias";
import { klaviyoConnector } from "~/lib/connectors/klaviyo";
import { shopifyCatalogConnector } from "~/lib/connectors/shopify-catalog";

// Central registry — adding a new third-party app means writing one file
// implementing the Connector interface and registering it here. Nothing
// else in the core needs to change (PRD: "Modular connector architecture").
const registry = new Map<string, Connector>();

function register(connector: Connector) {
  registry.set(connector.id, connector);
}

register(gorgiasConnector);
register(klaviyoConnector);
register(shopifyCatalogConnector);

export function getConnector(id: string): Connector | undefined {
  return registry.get(id);
}

export function listConnectors(): Connector[] {
  return Array.from(registry.values());
}
