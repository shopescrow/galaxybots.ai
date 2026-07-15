import { z } from "zod";
import { registerTool } from "./registry";
import { generateScript, getContentOutput, callTool } from "../services/partners/comedyclash-client";

registerTool({
  name: "comedyclash_generate_script",
  description: "Generate a comedy script or content using ComedyClash. Provide a prompt describing the desired script topic, style, and length. Returns a job ID and optionally the completed script.",
  inputSchema: z.object({
    prompt: z.string().describe("Description of the script to generate (topic, style, length, audience, etc.)"),
    format: z.enum(["standup", "sketch", "monologue", "dialogue", "roast"]).optional().describe("Script format"),
    lengthMinutes: z.number().min(1).max(60).optional().describe("Target length in minutes"),
  }),
  execute: async (input, context) => {
    const result = await generateScript(
      input.prompt,
      { format: input.format, lengthMinutes: input.lengthMinutes },
      context.clientId ?? null,
    );
    return result;
  },
});

registerTool({
  name: "comedyclash_get_content_output",
  description: "Retrieve the output of a ComedyClash content generation job. Use the jobId returned by comedyclash_generate_script to poll for completion.",
  inputSchema: z.object({
    jobId: z.string().describe("The ComedyClash job ID to retrieve output for"),
  }),
  execute: async (input, context) => {
    const result = await getContentOutput(input.jobId, context.clientId ?? null);
    return result;
  },
});

registerTool({
  name: "comedyclash_call_tool",
  description: "Call a specific ComedyClash tool by slug. Use this for CC features not covered by the dedicated tools (e.g. joke_generator, punchline_refiner, audience_analyzer).",
  inputSchema: z.object({
    toolSlug: z.string().describe("The ComedyClash tool slug to invoke"),
    params: z.record(z.string(), z.unknown()).describe("Parameters to pass to the tool"),
  }),
  execute: async (input, context) => {
    const result = await callTool(input.toolSlug, input.params, context.clientId ?? null);
    return result;
  },
});
