import { z } from "zod";
import { registerTool, type ToolContext } from "../registry";

registerTool({
  name: "create_issue",
  description: "Create an issue in Linear using the platform-level Linear API key. For project management and task tracking.",
  inputSchema: z.object({
    title: z.string().describe("Issue title"),
    description: z.string().optional().describe("Issue description (markdown supported)"),
    priority: z.number().optional().describe("Priority: 0=none, 1=urgent, 2=high, 3=medium, 4=low"),
    teamId: z.string().optional().describe("Linear team ID (uses first available team if not provided)"),
  }),
  execute: async (input, _context: ToolContext) => {
    const apiKey = process.env.LINEAR_API_KEY;
    if (!apiKey) {
      return { success: false, error: "Linear API key not configured. Set LINEAR_API_KEY environment variable." };
    }
    try {
      let teamId = input.teamId;
      if (!teamId) {
        const teamsRes = await fetch("https://api.linear.app/graphql", {
          method: "POST",
          headers: { Authorization: apiKey, "Content-Type": "application/json" },
          body: JSON.stringify({ query: "{ teams { nodes { id name } } }" }),
        });
        const teamsData = await teamsRes.json() as { data?: { teams?: { nodes: Array<{ id: string }> } } };
        teamId = teamsData.data?.teams?.nodes[0]?.id;
        if (!teamId) return { success: false, error: "No Linear teams found." };
      }

      const mutation = `mutation CreateIssue($input: IssueCreateInput!) { issueCreate(input: $input) { success issue { id identifier title url } } }`;
      const variables = {
        input: {
          title: input.title,
          description: input.description ?? "",
          priority: input.priority ?? 0,
          teamId,
        },
      };
      const response = await fetch("https://api.linear.app/graphql", {
        method: "POST",
        headers: { Authorization: apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({ query: mutation, variables }),
      });
      const data = await response.json() as { data?: { issueCreate?: { success: boolean; issue?: { id: string; identifier: string; title: string; url: string } } } };
      if (data.data?.issueCreate?.success) {
        const issue = data.data.issueCreate.issue;
        return { success: true, issueId: issue?.id, identifier: issue?.identifier, url: issue?.url };
      }
      return { success: false, error: "Failed to create Linear issue" };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Failed to create Linear issue" };
    }
  },
});

registerTool({
  name: "update_issue",
  description: "Update an existing Linear issue's status using the platform-level Linear API key.",
  inputSchema: z.object({
    issueId: z.string().describe("Linear issue ID or identifier (e.g. 'ENG-123')"),
    status: z.string().optional().describe("New status name (e.g. 'In Progress', 'Done', 'Todo')"),
    priority: z.number().optional().describe("New priority: 0=none, 1=urgent, 2=high, 3=medium, 4=low"),
    title: z.string().optional().describe("Updated title"),
  }),
  execute: async (input, _context: ToolContext) => {
    const apiKey = process.env.LINEAR_API_KEY;
    if (!apiKey) {
      return { success: false, error: "Linear API key not configured. Set LINEAR_API_KEY environment variable." };
    }
    try {
      const updateFields: Record<string, unknown> = {};
      if (input.title) updateFields.title = input.title;
      if (input.priority !== undefined) updateFields.priority = input.priority;

      if (input.status) {
        const stateQuery = `{ workflowStates { nodes { id name } } }`;
        const stateRes = await fetch("https://api.linear.app/graphql", {
          method: "POST",
          headers: { Authorization: apiKey, "Content-Type": "application/json" },
          body: JSON.stringify({ query: stateQuery }),
        });
        const stateData = await stateRes.json() as { data?: { workflowStates?: { nodes: Array<{ id: string; name: string }> } } };
        const matchState = stateData.data?.workflowStates?.nodes.find(
          (s) => s.name.toLowerCase() === input.status!.toLowerCase()
        );
        if (matchState) {
          updateFields.stateId = matchState.id;
        }
      }

      const mutation = `mutation UpdateIssue($id: String!, $input: IssueUpdateInput!) { issueUpdate(id: $id, input: $input) { success issue { id identifier title url } } }`;
      const response = await fetch("https://api.linear.app/graphql", {
        method: "POST",
        headers: { Authorization: apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({ query: mutation, variables: { id: input.issueId, input: updateFields } }),
      });
      const data = await response.json() as { data?: { issueUpdate?: { success: boolean; issue?: { id: string; identifier: string; title: string; url: string } } } };
      if (data.data?.issueUpdate?.success) {
        const issue = data.data.issueUpdate.issue;
        return { success: true, issueId: issue?.id, identifier: issue?.identifier };
      }
      return { success: false, error: "Failed to update Linear issue" };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Failed to update Linear issue" };
    }
  },
});
