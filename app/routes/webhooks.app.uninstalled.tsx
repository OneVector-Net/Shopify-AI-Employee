import type { ActionFunctionArgs } from "@remix-run/node";
import db from "~/db.server";
import { authenticate } from "~/shopify.server";

// Clean up a shop's data when the app is uninstalled. Audit log entries
// are intentionally NOT deleted here — they're the evidentiary record
// referenced in the PRD's Accountability & Liability section, and should
// follow the data-retention policy decided there, not just vanish on
// uninstall.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, session } = await authenticate.webhook(request);

  if (session) {
    await db.session.deleteMany({ where: { shop } });
  }

  return new Response();
};
