import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import {
  Avatar,
  Badge,
  BlockStack,
  Box,
  Button,
  Card,
  InlineGrid,
  InlineStack,
  Page,
  Text,
} from "@shopify/polaris";
import db from "~/db.server";
import { getRecentAuditEvents } from "~/lib/audit.server";
import { EMPLOYEE_LIST } from "~/lib/employees";
import { authenticate } from "~/shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const shop = await db.shop.upsert({
    where: { domain: session.shop },
    update: {},
    create: { domain: session.shop },
  });

  // Make sure every employee has a state row (defaults: disabled, read-only —
  // PRD "Onboarding & Trust": never start more permissive than this).
  for (const employee of EMPLOYEE_LIST) {
    await db.employeeState.upsert({
      where: { shopId_employeeId: { shopId: shop.id, employeeId: employee.id } },
      update: {},
      create: { shopId: shop.id, employeeId: employee.id },
    });
  }

  const states = await db.employeeState.findMany({ where: { shopId: shop.id } });
  const pendingActions = await db.pendingAction.findMany({
    where: { shopId: shop.id, status: "PENDING" },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
  const recentActivity = await getRecentAuditEvents(shop.id, 8);

  return json({ states, pendingActions, recentActivity });
};

export default function Dashboard() {
  const { states, pendingActions, recentActivity } = useLoaderData<typeof loader>();

  const stateFor = (employeeId: string) => states.find((s) => s.employeeId === employeeId);

  return (
    <Page title="AI Employees" subtitle="Your team, working inside the tools you already use.">
      <BlockStack gap="400">
        <InlineGrid columns={{ xs: 1, sm: 2, md: 5 }} gap="300">
          {EMPLOYEE_LIST.map((employee) => {
            const state = stateFor(employee.id);
            const pendingCount = pendingActions.filter((p) => p.employeeId === employee.id).length;

            return (
              <Card key={employee.id}>
                <BlockStack gap="200">
                  <Avatar initials={employee.avatarInitial} name={employee.name} size="md" />
                  <Text as="h3" variant="headingSm">
                    {employee.name}
                  </Text>
                  <Text as="p" tone="subdued" variant="bodySm">
                    {employee.role}
                  </Text>
                  {!state?.enabled ? (
                    <Badge tone="info">Not set up</Badge>
                  ) : pendingCount > 0 ? (
                    <Badge tone="attention">{`${pendingCount} need approval`}</Badge>
                  ) : state.permissionTier === "READ_ONLY" ? (
                    <Badge>Read-only</Badge>
                  ) : (
                    <Badge tone="success">All caught up</Badge>
                  )}
                  <Button url={`/app/employees/${employee.id}`} fullWidth>
                    Open
                  </Button>
                </BlockStack>
              </Card>
            );
          })}
        </InlineGrid>

        {/* Equal columns rather than the wireframe's 2:1 ratio — this
            Polaris version's InlineGrid doesn't type-check fr-unit
            shorthand ("2fr"/"1fr"); not worth a custom Grid just for the
            ratio at scaffold stage. */}
        <InlineGrid columns={2} gap="300">
          <Card>
            <BlockStack gap="300">
              <Text as="h3" variant="headingSm">
                Pending Approvals
              </Text>
              {pendingActions.length === 0 ? (
                <Text as="p" tone="subdued">
                  Nothing waiting on you right now.
                </Text>
              ) : (
                pendingActions.map((action) => (
                  <InlineStack key={action.id} align="space-between" blockAlign="center">
                    <Text as="span">{`${action.employeeId} — ${action.summary}`}</Text>
                    <Button url={`/app/approvals/${action.id}`} size="slim">
                      Review
                    </Button>
                  </InlineStack>
                ))
              )}
            </BlockStack>
          </Card>

          <Card>
            <BlockStack gap="200">
              <Text as="h3" variant="headingSm">
                Recent Activity
              </Text>
              {recentActivity.length === 0 ? (
                <Text as="p" tone="subdued">
                  No activity yet.
                </Text>
              ) : (
                recentActivity.map((entry) => (
                  <Box key={entry.id}>
                    <Text as="p" tone="subdued" variant="bodySm">
                      {new Date(entry.createdAt).toLocaleTimeString()} — {entry.summary}
                    </Text>
                  </Box>
                ))
              )}
            </BlockStack>
          </Card>
        </InlineGrid>
      </BlockStack>
    </Page>
  );
}
