import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Form, useLoaderData } from "@remix-run/react";
import {
  Badge,
  BlockStack,
  Box,
  Button,
  Card,
  DataTable,
  InlineStack,
  Page,
  Text,
} from "@shopify/polaris";
import db from "~/db.server";
import { shopifyCatalogConnector } from "~/lib/connectors/shopify-catalog";
import { buildSeoDiffs, proposeSeoBulkUpdate } from "~/lib/ellie.server";
import { EMPLOYEES, type EmployeeId } from "~/lib/employees";
import { decidePendingAction, getGuardrails } from "~/lib/guardrails.server";
import { authenticate } from "~/shopify.server";

function isEmployeeId(value: string): value is EmployeeId {
  return value in EMPLOYEES;
}

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const employeeId = params.employeeId ?? "";

  if (!isEmployeeId(employeeId)) {
    throw new Response("Unknown employee", { status: 404 });
  }

  const shop = await db.shop.upsert({
    where: { domain: session.shop },
    update: {},
    create: { domain: session.shop },
  });

  const state = await db.employeeState.upsert({
    where: { shopId_employeeId: { shopId: shop.id, employeeId } },
    update: {},
    create: { shopId: shop.id, employeeId },
  });

  const pendingActions = await db.pendingAction.findMany({
    where: { shopId: shop.id, employeeId },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  const guardrails = await getGuardrails(shop.id, employeeId);

  // Only Ellie has a real workflow wired up so far (see README) — the
  // other four employees get the generic page below until their
  // connectors are built the same way hers was.
  const seoDiffs =
    employeeId === "ellie" && state.enabled ? await buildSeoDiffs(shop.id, 10) : [];

  return json({ employeeId, state, pendingActions, guardrails, seoDiffs });
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const employeeId = params.employeeId ?? "";
  if (!isEmployeeId(employeeId)) {
    throw new Response("Unknown employee", { status: 404 });
  }

  const shop = await db.shop.upsert({
    where: { domain: session.shop },
    update: {},
    create: { domain: session.shop },
  });

  const formData = await request.formData();
  const intent = formData.get("intent");

  // Simplified stand-in for the real "permission upgrade" flow (PRD
  // feature #17), which should go through Shopify's actual OAuth
  // scope-update prompt rather than flipping a flag directly. Fine for
  // exercising the rest of the pipeline locally; not production-ready.
  if (intent === "enable_write_access") {
    await db.employeeState.update({
      where: { shopId_employeeId: { shopId: shop.id, employeeId } },
      data: { enabled: true, permissionTier: "WRITE_SCOPED" },
    });
    return redirect(`/app/employees/${employeeId}`);
  }

  if (intent === "propose_seo_update" && employeeId === "ellie") {
    const diffs = await buildSeoDiffs(shop.id, 10);
    if (diffs.length > 0) {
      await proposeSeoBulkUpdate(shop.id, diffs);
    }
    return redirect(`/app/employees/${employeeId}`);
  }

  if (intent === "approve" || intent === "decline") {
    const pendingActionId = String(formData.get("pendingActionId"));
    const decided = await decidePendingAction({
      pendingActionId,
      decision: intent === "approve" ? "APPROVED" : "DECLINED",
      // TODO: use the actual logged-in staff member's identity once
      // available (session.shop is the store domain, a workable stand-in
      // for now but not who specifically clicked approve).
      decidedBy: session.shop,
    });

    // Execution stays a deliberately separate step from approval (PRD
    // feature #18 / app/lib/connectors/README.md) — this is the one
    // place in the codebase that calls a connector's execute() after
    // seeing an APPROVED decision.
    if (intent === "approve" && employeeId === "ellie") {
      const payload = JSON.parse(decided.payload) as {
        diffs: { productId: string; after: string }[];
      };
      const result = await shopifyCatalogConnector.execute(shop.id, decided.id, payload);
      await db.pendingAction.update({
        where: { id: decided.id },
        data: {
          status: result.ok ? "EXECUTED" : "FAILED",
          executedAt: new Date(),
          failureReason: result.ok ? null : result.message,
        },
      });
    }

    return redirect(`/app/employees/${employeeId}`);
  }

  return redirect(`/app/employees/${employeeId}`);
};

export default function EmployeeWorkspace() {
  const { employeeId, state, pendingActions, guardrails, seoDiffs } =
    useLoaderData<typeof loader>();
  const employee = EMPLOYEES[employeeId as EmployeeId];

  return (
    <Page title={employee.name} subtitle={employee.role} backAction={{ url: "/app" }}>
      <BlockStack gap="400">
        {!state.enabled && (
          <Card>
            <BlockStack gap="200">
              <Text as="p">
                {employee.name} is read-only and hasn&apos;t been given write access yet.
              </Text>
              <Form method="post">
                <input type="hidden" name="intent" value="enable_write_access" />
                <Button submit>Enable write access (approval still required for every action)</Button>
              </Form>
            </BlockStack>
          </Card>
        )}

        <Card>
          <BlockStack gap="200">
            <Text as="h3" variant="headingSm">
              Guardrails
            </Text>
            {guardrails.hard.map((g) => (
              <InlineStack key={g.key} align="space-between">
                <Text as="span">{g.key}</Text>
                <Badge>Hard</Badge>
              </InlineStack>
            ))}
            {guardrails.soft.map((g) => (
              <InlineStack key={g.key} align="space-between">
                <Text as="span">{`${g.key}: ${g.value}`}</Text>
                <Badge tone="info">Soft</Badge>
              </InlineStack>
            ))}
          </BlockStack>
        </Card>

        {employeeId === "ellie" && state.enabled && (
          <Card>
            <BlockStack gap="300">
              <Text as="h3" variant="headingSm">
                Bulk SEO update — preview
              </Text>
              {seoDiffs.length === 0 ? (
                <Text as="p" tone="subdued">
                  No pending suggestions right now — every scanned product already has a
                  description.
                </Text>
              ) : (
                <>
                  <DataTable
                    columnContentTypes={["text", "text", "text"]}
                    headings={["Product", "Current", "Proposed"]}
                    rows={seoDiffs.map((d) => [d.title, d.before || "(empty)", d.after])}
                  />
                  <Form method="post">
                    <input type="hidden" name="intent" value="propose_seo_update" />
                    <Button submit>{`Propose this update (${seoDiffs.length} products)`}</Button>
                  </Form>
                </>
              )}
            </BlockStack>
          </Card>
        )}

        {employeeId !== "ellie" && (
          <Card>
            <Text as="p" tone="subdued">
              {employee.name}&apos;s real workflow isn&apos;t built yet — Ellie is the first
              employee wired end-to-end. This page shows her guardrails and will gain a real
              workflow the same way once it&apos;s her turn.
            </Text>
          </Card>
        )}

        <Card>
          <BlockStack gap="200">
            <Text as="h3" variant="headingSm">
              Pending &amp; recent actions
            </Text>
            {pendingActions.length === 0 ? (
              <Text as="p" tone="subdued">
                Nothing here yet.
              </Text>
            ) : (
              pendingActions.map((action) => (
                <Box
                  key={action.id}
                  padding="200"
                  borderWidth="025"
                  borderColor="border"
                  borderRadius="200"
                >
                  <BlockStack gap="150">
                    <InlineStack align="space-between">
                      <Text as="span">{action.summary}</Text>
                      <Badge
                        tone={
                          action.status === "PENDING"
                            ? "attention"
                            : action.status === "EXECUTED"
                              ? "success"
                              : action.status === "FAILED"
                                ? "critical"
                                : undefined
                        }
                      >
                        {action.status}
                      </Badge>
                    </InlineStack>
                    {action.status === "PENDING" && (
                      <InlineStack gap="200">
                        <Form method="post">
                          <input type="hidden" name="intent" value="approve" />
                          <input type="hidden" name="pendingActionId" value={action.id} />
                          <Button submit variant="primary">
                            Approve
                          </Button>
                        </Form>
                        <Form method="post">
                          <input type="hidden" name="intent" value="decline" />
                          <input type="hidden" name="pendingActionId" value={action.id} />
                          <Button submit>Decline</Button>
                        </Form>
                      </InlineStack>
                    )}
                    {action.failureReason && (
                      <Text as="p" tone="critical">
                        {action.failureReason}
                      </Text>
                    )}
                  </BlockStack>
                </Box>
              ))
            )}
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
