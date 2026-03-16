const READ_ONLY_TOOLS = new Set([
  "web_search",
  "read_world_state",
  "read_platform_data",
  "read_email",
  "read_slack_channel",
  "read_document",
  "list_calendar_events",
  "scrape_webpage",
  "analyze_aeo_score",
  "aeo_recommend",
  "delegate_to_bot",
  "prospect_search",
  "get_prospects",
  "browse_sabrina_automations",
]);

const GUEST_ALLOWED_TOOLS = new Set([
  ...READ_ONLY_TOOLS,
]);

export function isToolSandboxed(toolName: string): boolean {
  return !GUEST_ALLOWED_TOOLS.has(toolName);
}

export function getSandboxedToolResponse(toolName: string): unknown {
  const mockResponses: Record<string, unknown> = {
    send_email: { success: true, messageId: "demo-mock-001", note: "[SANDBOXED] Email would be sent in a live account." },
    post_slack_message: { success: true, ts: "demo-mock-ts", note: "[SANDBOXED] Slack message would be posted in a live account." },
    create_document: { success: true, id: "demo-doc-001", url: "https://notion.so/demo", note: "[SANDBOXED] Document would be created in a live account." },
    create_calendar_event: { success: true, id: "demo-event-001", note: "[SANDBOXED] Calendar event would be created in a live account." },
    crm_upsert_contact: { success: true, contactId: "demo-contact-001", note: "[SANDBOXED] CRM contact would be upserted in a live account." },
    crm_create_deal: { success: true, dealId: "demo-deal-001", note: "[SANDBOXED] CRM deal would be created in a live account." },
    create_issue: { success: true, issueId: "demo-issue-001", url: "https://linear.app/demo", note: "[SANDBOXED] Issue would be created in a live account." },
    update_issue: { success: true, note: "[SANDBOXED] Issue would be updated in a live account." },
    create_studio_document: { success: true, documentId: 0, note: "[SANDBOXED] Studio document would be created in a live account." },
    write_world_state: { success: true, note: "[SANDBOXED] World state would be updated in a live account." },
  };
  return mockResponses[toolName] || { success: true, note: `[SANDBOXED] ${toolName} would execute in a live account.` };
}
