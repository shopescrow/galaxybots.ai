import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerMetricsTool(server: McpServer): void {
  server.tool(
    "get_metrics",
    "Retrieve Stripe subscription and revenue metrics scoped to a client ID. Returns subscription count and MRR. Falls back to a stub when STRIPE_SECRET_KEY is not set.",
    {
      clientId: z.string().describe("The client ID to scope metrics to"),
    },
    async ({ clientId }) => {
      console.log(`[MCP] get_metrics: clientId=${clientId}`);
      try {
        const stripeKey = process.env.STRIPE_SECRET_KEY;

        if (!stripeKey) {
          console.log("[MCP] get_metrics: STRIPE_SECRET_KEY not set, returning stub response");
          return {
            content: [{
              type: "text" as const,
              text: JSON.stringify({
                mode: "dev-stub",
                message: "STRIPE_SECRET_KEY is not set. In production, this would return live Stripe metrics.",
                clientId,
                metrics: {
                  subscriptionCount: 0,
                  mrr: 0,
                  currency: "usd",
                },
              }, null, 2),
            }],
          };
        }

        type StripeSubscription = {
          id: string;
          metadata: Record<string, string>;
          items: { data: Array<{ price: { unit_amount: number | null; recurring: { interval: string } | null } }> };
        };

        const allSubscriptions: StripeSubscription[] = [];
        let hasMore = true;
        let startingAfter: string | undefined;

        while (hasMore) {
          const params = new URLSearchParams({ status: "active", limit: "100" });
          if (startingAfter) params.set("starting_after", startingAfter);

          const res = await fetch(
            `https://api.stripe.com/v1/subscriptions?${params}`,
            { headers: { "Authorization": `Bearer ${stripeKey}` } }
          );

          if (!res.ok) {
            const errorBody = await res.text();
            throw new Error(`Stripe API error (${res.status}): ${errorBody}`);
          }

          const page = await res.json() as { data: StripeSubscription[]; has_more: boolean };
          allSubscriptions.push(...page.data);
          hasMore = page.has_more;
          if (hasMore && page.data.length > 0) {
            startingAfter = page.data[page.data.length - 1].id;
          }
        }

        const subscriptions = allSubscriptions.filter(
          (sub) => sub.metadata?.client_id === clientId
        );

        let mrr = 0;
        for (const sub of subscriptions) {
          for (const item of sub.items.data) {
            const amount = item.price.unit_amount || 0;
            const interval = item.price.recurring?.interval;
            if (interval === "month") {
              mrr += amount;
            } else if (interval === "year") {
              mrr += Math.round(amount / 12);
            }
          }
        }

        const metrics = {
          clientId,
          subscriptionCount: subscriptions.length,
          mrr: mrr / 100,
          currency: "usd",
        };

        console.log(`[MCP] get_metrics: clientId=${clientId}, subs=${metrics.subscriptionCount}, mrr=$${metrics.mrr}`);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(metrics, null, 2) }],
        };
      } catch (error) {
        console.error("[MCP] get_metrics: Error", error);
        return {
          content: [{ type: "text" as const, text: `Error fetching metrics: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    }
  );
}
