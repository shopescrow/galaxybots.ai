import { z } from "zod";
import { registerTool, type ToolContext } from "./registry";
import {
  db,
  prospectsTable,
  prospectOutreachLogTable,
  prospectOutreachTemplatesTable,
  clientsTable,
} from "@workspace/db";
import { eq, and, desc, sql } from "drizzle-orm";
import { broadcastSSE } from "../services/platform/sse";

function substituteTemplateVars(
  text: string,
  vars: Record<string, string>,
): string {
  let result = text;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value);
  }
  return result;
}

registerTool({
  name: "prospect_outreach",
  description:
    "Send a personalized outreach message to a qualified prospect via email or SMS. Uses a template or custom message. Logs the send and increments the outreach counter.",
  inputSchema: z.object({
    prospectId: z.number().describe("The ID of the prospect to contact"),
    channel: z
      .enum(["email", "sms"])
      .describe("Communication channel to use"),
    message: z
      .string()
      .optional()
      .describe("Custom message body (overrides template)"),
    templateId: z
      .number()
      .optional()
      .describe("Template ID to use (uses default if not specified)"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    prospectId: z.number().optional(),
    channel: z.string().optional(),
    deliveryStatus: z.string().optional(),
    messagePreview: z.string().optional(),
    error: z.string().optional(),
  }),
  execute: async (input, context: ToolContext) => {
    const conditions = [eq(prospectsTable.id, input.prospectId)];
    if (context.clientId) {
      conditions.push(eq(prospectsTable.clientId, context.clientId));
    }
    const [prospect] = await db
      .select()
      .from(prospectsTable)
      .where(conditions.length > 1 ? and(...conditions) : conditions[0]);

    if (!prospect) {
      return {
        success: false,
        error: `Prospect with ID ${input.prospectId} not found.`,
      };
    }

    const outreachAllowedStatuses = ["qualified", "contacted", "responded"];
    if (!outreachAllowedStatuses.includes(prospect.status)) {
      return {
        success: false,
        error: `Prospect must be in qualified, contacted, or responded status to send outreach. Current status: ${prospect.status}`,
      };
    }

    if (
      input.channel === "email" &&
      !prospect.email
    ) {
      return {
        success: false,
        error:
          "Prospect has no email address on file. Enrich the prospect first.",
      };
    }

    if (input.channel === "sms" && !prospect.phone) {
      return {
        success: false,
        error:
          "Prospect has no phone number on file. Enrich the prospect first.",
      };
    }

    const templateVars: Record<string, string> = {
      companyName: prospect.companyName,
      domain: prospect.domain || "your website",
      botName: context.botName || "Sales Bot",
    };

    let messageBody = "";
    let subject: string | null = null;

    if (input.message) {
      messageBody = substituteTemplateVars(input.message, templateVars);
    } else {
      let template;
      if (input.templateId) {
        [template] = await db
          .select()
          .from(prospectOutreachTemplatesTable)
          .where(eq(prospectOutreachTemplatesTable.id, input.templateId));
      } else {
        [template] = await db
          .select()
          .from(prospectOutreachTemplatesTable)
          .where(
            and(
              eq(prospectOutreachTemplatesTable.channel, input.channel),
              eq(prospectOutreachTemplatesTable.isDefault, true),
            ),
          );
      }

      if (!template) {
        return {
          success: false,
          error: `No template found for channel "${input.channel}". Provide a custom message.`,
        };
      }

      messageBody = substituteTemplateVars(template.body, templateVars);
      subject = template.subject
        ? substituteTemplateVars(template.subject, templateVars)
        : null;
    }

    let deliveryStatus = "sent";

    try {
      if (input.channel === "email") {
        const sgKey = process.env.SENDGRID_API_KEY;
        if (sgKey && prospect.email) {
          const sgResponse = await fetch(
            "https://api.sendgrid.com/v3/mail/send",
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${sgKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                personalizations: [{ to: [{ email: prospect.email }] }],
                from: {
                  email:
                    process.env.SENDGRID_FROM_EMAIL || "outreach@galaxybots.ai",
                  name: "GalaxyBots",
                },
                subject:
                  subject || `AI Optimization for ${prospect.companyName}`,
                content: [{ type: "text/plain", value: messageBody }],
              }),
              signal: AbortSignal.timeout(10000),
            },
          );
          deliveryStatus = sgResponse.ok ? "delivered" : "failed";
        } else {
          deliveryStatus = "simulated";
        }
      } else {
        const twilioSid = process.env.TWILIO_ACCOUNT_SID;
        const twilioAuth = process.env.TWILIO_AUTH_TOKEN;
        const twilioFrom = process.env.TWILIO_PHONE_NUMBER;
        if (twilioSid && twilioAuth && twilioFrom && prospect.phone) {
          const twilioResponse = await fetch(
            `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`,
            {
              method: "POST",
              headers: {
                Authorization: `Basic ${Buffer.from(`${twilioSid}:${twilioAuth}`).toString("base64")}`,
                "Content-Type": "application/x-www-form-urlencoded",
              },
              body: new URLSearchParams({
                To: prospect.phone,
                From: twilioFrom,
                Body: messageBody,
              }),
              signal: AbortSignal.timeout(10000),
            },
          );
          deliveryStatus = twilioResponse.ok ? "delivered" : "failed";
        } else {
          deliveryStatus = "simulated";
        }
      }
    } catch {
      deliveryStatus = "failed";
    }

    await db.insert(prospectOutreachLogTable).values({
      prospectId: prospect.id,
      channel: input.channel,
      messageBody,
      subject,
      deliveryStatus,
    });

    await db
      .update(prospectsTable)
      .set({
        outreachSentCount: sql`${prospectsTable.outreachSentCount} + 1`,
        status:
          prospect.status === "qualified" ? "contacted" : prospect.status,
        updatedAt: new Date(),
      })
      .where(eq(prospectsTable.id, prospect.id));

    broadcastSSE("prospect-outreach", {
      prospectId: prospect.id,
      companyName: prospect.companyName,
      channel: input.channel,
      deliveryStatus,
      clientId: prospect.clientId,
    });

    return {
      success: true,
      prospectId: prospect.id,
      channel: input.channel,
      deliveryStatus,
      messagePreview: messageBody.slice(0, 200),
    };
  },
});

registerTool({
  name: "prospect_log_response",
  description:
    "Log a response received from a prospect after outreach. Updates the most recent outreach log and sets the prospect status to 'responded'.",
  inputSchema: z.object({
    prospectId: z.number().describe("The ID of the prospect who responded"),
    responseSnippet: z
      .string()
      .describe("A snippet or summary of the prospect's response"),
    responseChannel: z
      .enum(["email", "sms"])
      .describe("Channel the response was received on"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    prospectId: z.number().optional(),
    companyName: z.string().optional(),
    newStatus: z.string().optional(),
    error: z.string().optional(),
  }),
  execute: async (input, context: ToolContext) => {
    const conditions = [eq(prospectsTable.id, input.prospectId)];
    if (context.clientId) {
      conditions.push(eq(prospectsTable.clientId, context.clientId));
    }
    const [prospect] = await db
      .select()
      .from(prospectsTable)
      .where(conditions.length > 1 ? and(...conditions) : conditions[0]);

    if (!prospect) {
      return {
        success: false,
        error: `Prospect with ID ${input.prospectId} not found.`,
      };
    }

    const responseAllowedStatuses = ["contacted", "responded"];
    if (!responseAllowedStatuses.includes(prospect.status)) {
      return {
        success: false,
        error: `Prospect must be in contacted or responded status to log a response. Current status: ${prospect.status}`,
      };
    }

    const [latestLog] = await db
      .select()
      .from(prospectOutreachLogTable)
      .where(and(
        eq(prospectOutreachLogTable.prospectId, input.prospectId),
        eq(prospectOutreachLogTable.channel, input.responseChannel),
      ))
      .orderBy(desc(prospectOutreachLogTable.sentAt))
      .limit(1);

    if (!latestLog) {
      return {
        success: false,
        error: `No outreach log found for prospect ${input.prospectId}. Outreach must be sent before logging a response.`,
      };
    }

    await db
      .update(prospectOutreachLogTable)
      .set({
        responseReceivedAt: new Date(),
        responseSnippet: input.responseSnippet,
      })
      .where(eq(prospectOutreachLogTable.id, latestLog.id));

    await db
      .update(prospectsTable)
      .set({
        status: "responded",
        updatedAt: new Date(),
      })
      .where(eq(prospectsTable.id, input.prospectId));

    broadcastSSE("prospect-response", {
      prospectId: prospect.id,
      companyName: prospect.companyName,
      responseChannel: input.responseChannel,
      clientId: prospect.clientId,
    });

    return {
      success: true,
      prospectId: prospect.id,
      companyName: prospect.companyName,
      newStatus: "responded",
    };
  },
});

registerTool({
  name: "prospect_convert",
  description:
    "Mark a prospect as converted by linking them to a client record. Sets the prospect status to 'converted' and records the conversion timestamp.",
  inputSchema: z.object({
    prospectId: z.number().describe("The ID of the prospect to convert"),
    clientId: z
      .number()
      .describe("The ID of the client record this prospect converted into"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    prospectId: z.number().optional(),
    clientId: z.number().optional(),
    companyName: z.string().optional(),
    convertedAt: z.string().optional(),
    error: z.string().optional(),
  }),
  execute: async (input, context: ToolContext) => {
    if (!context.clientId) {
      return {
        success: false,
        error: "Client context is required to convert a prospect.",
      };
    }

    const [prospect] = await db
      .select()
      .from(prospectsTable)
      .where(
        and(
          eq(prospectsTable.id, input.prospectId),
          eq(prospectsTable.clientId, context.clientId),
        ),
      );

    if (!prospect) {
      return {
        success: false,
        error: `Prospect with ID ${input.prospectId} not found.`,
      };
    }

    const validStatuses = ["qualified", "contacted", "responded"];
    if (!validStatuses.includes(prospect.status)) {
      return {
        success: false,
        error: `Prospect must be in qualified, contacted, or responded status to convert. Current status: ${prospect.status}`,
      };
    }

    const [targetClient] = await db
      .select()
      .from(clientsTable)
      .where(eq(clientsTable.id, input.clientId));

    if (!targetClient) {
      return {
        success: false,
        error: `Client with ID ${input.clientId} not found.`,
      };
    }

    const convertedAt = new Date();
    await db
      .update(prospectsTable)
      .set({
        status: "converted",
        convertedClientId: input.clientId,
        convertedAt,
        updatedAt: new Date(),
      })
      .where(eq(prospectsTable.id, input.prospectId));

    broadcastSSE("prospect-converted", {
      prospectId: prospect.id,
      companyName: prospect.companyName,
      clientId: prospect.clientId,
      convertedClientId: input.clientId,
      convertedClientName: targetClient.companyName,
    });

    return {
      success: true,
      prospectId: prospect.id,
      clientId: input.clientId,
      companyName: prospect.companyName,
      convertedAt: convertedAt.toISOString(),
    };
  },
});
