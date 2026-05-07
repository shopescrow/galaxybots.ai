import { z } from "zod";
import { registerTool, type ToolContext } from "../registry";
import { getClientCredential, withCredentialRetry } from "./_shared";

registerTool({
  name: "crm_upsert_contact",
  description: "Create or update a HubSpot contact by email using the client's HubSpot private app token.",
  inputSchema: z.object({
    email: z.string().describe("Contact email address"),
    firstName: z.string().optional().describe("Contact first name"),
    lastName: z.string().optional().describe("Contact last name"),
    company: z.string().optional().describe("Contact company name"),
    phone: z.string().optional().describe("Contact phone number"),
  }),
  execute: withCredentialRetry("hubspot", async (input, context: ToolContext) => {
    const credential = await getClientCredential(context.clientId, "hubspot");
    if (!credential) {
      return { success: false, error: "No HubSpot credential configured for this client." };
    }
    const headers = {
      Authorization: `Bearer ${credential}`,
      "Content-Type": "application/json",
    };
    try {
      const searchRes = await fetch("https://api.hubapi.com/crm/v3/objects/contacts/search", {
        method: "POST",
        headers,
        body: JSON.stringify({
          filterGroups: [{ filters: [{ propertyName: "email", operator: "EQ", value: input.email }] }],
          limit: 1,
        }),
      });
      const searchData = await searchRes.json() as { total: number; results: Array<{ id: string }> };

      const properties: Record<string, string> = { email: input.email };
      if (input.firstName) properties.firstname = input.firstName;
      if (input.lastName) properties.lastname = input.lastName;
      if (input.company) properties.company = input.company;
      if (input.phone) properties.phone = input.phone;

      if (searchData.total > 0) {
        const contactId = searchData.results[0].id;
        const updateRes = await fetch(`https://api.hubapi.com/crm/v3/objects/contacts/${contactId}`, {
          method: "PATCH",
          headers,
          body: JSON.stringify({ properties }),
        });
        if (!updateRes.ok) {
          return { success: false, error: `HubSpot update error: ${updateRes.status}` };
        }
        return { success: true, action: "updated", contactId };
      } else {
        const createRes = await fetch("https://api.hubapi.com/crm/v3/objects/contacts", {
          method: "POST",
          headers,
          body: JSON.stringify({ properties }),
        });
        if (!createRes.ok) {
          return { success: false, error: `HubSpot create error: ${createRes.status}` };
        }
        const data = await createRes.json() as { id: string };
        return { success: true, action: "created", contactId: data.id };
      }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Failed to upsert HubSpot contact" };
    }
  }),
});

registerTool({
  name: "crm_create_deal",
  description: "Create a deal in HubSpot CRM using the client's HubSpot private app token.",
  inputSchema: z.object({
    dealName: z.string().describe("Deal name"),
    stage: z.string().optional().describe("Deal stage (e.g. 'appointmentscheduled', 'qualifiedtobuy', 'closedwon')"),
    amount: z.number().optional().describe("Deal amount in dollars"),
    contactEmail: z.string().optional().describe("Associated contact email"),
  }),
  execute: withCredentialRetry("hubspot", async (input, context: ToolContext) => {
    const credential = await getClientCredential(context.clientId, "hubspot");
    if (!credential) {
      return { success: false, error: "No HubSpot credential configured for this client." };
    }
    const headers = {
      Authorization: `Bearer ${credential}`,
      "Content-Type": "application/json",
    };
    try {
      const properties: Record<string, string | number> = { dealname: input.dealName };
      if (input.stage) properties.dealstage = input.stage;
      if (input.amount !== undefined) properties.amount = input.amount;

      const response = await fetch("https://api.hubapi.com/crm/v3/objects/deals", {
        method: "POST",
        headers,
        body: JSON.stringify({ properties }),
      });
      if (!response.ok) {
        const errText = await response.text();
        return { success: false, error: `HubSpot deal error: ${response.status} - ${errText}` };
      }
      const data = await response.json() as { id: string };
      return { success: true, dealId: data.id, dealName: input.dealName };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Failed to create HubSpot deal" };
    }
  }),
});
