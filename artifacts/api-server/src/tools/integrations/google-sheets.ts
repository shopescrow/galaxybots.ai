import { z } from "zod";
import { registerTool, type ToolContext } from "../registry";
import { getClientCredential, withCredentialRetry } from "./_shared";

registerTool({
  name: "read_sheet",
  description: "Read rows from a Google Sheet using the client's connected Google Sheets OAuth token. Returns an array of row arrays.",
  inputSchema: z.object({
    spreadsheetId: z.string().describe("The Google Sheets spreadsheet ID (found in the sheet URL)"),
    range: z.string().describe("A1 notation range to read (e.g. 'Sheet1!A1:D10')"),
  }),
  execute: withCredentialRetry("google_sheets", async (input, context: ToolContext) => {
    const credential = await getClientCredential(context.clientId, "google_sheets");
    if (!credential) {
      return { success: false, rows: [], error: "No Google Sheets credential configured for this client. Connect Google Sheets in Integrations settings." };
    }
    try {
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(input.spreadsheetId)}/values/${encodeURIComponent(input.range)}`;
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${credential}` },
      });
      if (!response.ok) {
        const errText = await response.text();
        return { success: false, rows: [], error: `Google Sheets API error: ${response.status} - ${errText}` };
      }
      const data = await response.json() as { values?: string[][] };
      const rows = data.values ?? [];
      return { success: true, rows, rowCount: rows.length };
    } catch (err) {
      return { success: false, rows: [], error: err instanceof Error ? err.message : "Failed to read Google Sheet" };
    }
  }),
});

registerTool({
  name: "write_sheet",
  description: "Append or update rows in a Google Sheet using the client's connected Google Sheets OAuth token.",
  inputSchema: z.object({
    spreadsheetId: z.string().describe("The Google Sheets spreadsheet ID (found in the sheet URL)"),
    range: z.string().describe("A1 notation range to write to (e.g. 'Sheet1!A1')"),
    rows: z.array(z.array(z.string())).describe("Array of row arrays to write (each row is an array of cell values)"),
    append: z.boolean().optional().describe("If true, append rows after existing data. If false, overwrite starting at the range. Defaults to true."),
  }),
  execute: withCredentialRetry("google_sheets", async (input, context: ToolContext) => {
    const credential = await getClientCredential(context.clientId, "google_sheets");
    if (!credential) {
      return { success: false, error: "No Google Sheets credential configured for this client. Connect Google Sheets in Integrations settings." };
    }
    const shouldAppend = input.append !== false;
    try {
      let url: string;
      let method: string;
      if (shouldAppend) {
        url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(input.spreadsheetId)}/values/${encodeURIComponent(input.range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
        method = "POST";
      } else {
        url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(input.spreadsheetId)}/values/${encodeURIComponent(input.range)}?valueInputOption=USER_ENTERED`;
        method = "PUT";
      }
      const response = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${credential}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ range: input.range, majorDimension: "ROWS", values: input.rows }),
      });
      if (!response.ok) {
        const errText = await response.text();
        return { success: false, error: `Google Sheets API error: ${response.status} - ${errText}` };
      }
      const data = await response.json() as { updates?: { updatedRows?: number } };
      const updatedRows = data.updates?.updatedRows ?? input.rows.length;
      return { success: true, message: `${shouldAppend ? "Appended" : "Wrote"} ${updatedRows} row(s) to ${input.range}`, updatedRows };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Failed to write to Google Sheet" };
    }
  }),
});
