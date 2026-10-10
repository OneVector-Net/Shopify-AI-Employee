import type { HeadersFunction, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Link, Outlet, useLoaderData, useRouteError } from "@remix-run/react";
import { boundary } from "@shopify/shopify-app-remix/server";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import { NavMenu } from "@shopify/app-bridge-react";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
import { authenticate } from "~/shopify.server";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return json({ apiKey: process.env.SHOPIFY_API_KEY || "" });
};

// This is the embedded app shell: the one place App Bridge + Polaris are
// wired up. Every employee screen (app._index, app.employees.$id, ...)
// renders inside this <Outlet /> and automatically gets the native
// Shopify admin chrome — this is what makes "look like the real Shopify
// dashboard" true by construction, not by reproducing Polaris by hand.
export default function AppLayout() {
  const { apiKey } = useLoaderData<typeof loader>();

  return (
    <AppProvider isEmbeddedApp apiKey={apiKey}>
      <NavMenu>
        <Link to="/app" rel="home">
          AI Employees
        </Link>
        <Link to="/app/guardrails">Guardrails</Link>
        <Link to="/app/activity">Activity</Link>
      </NavMenu>
      <Outlet />
    </AppProvider>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
