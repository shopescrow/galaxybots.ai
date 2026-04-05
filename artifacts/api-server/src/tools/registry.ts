import { z } from "zod";
import type { ChatCompletionTool } from "openai/resources/chat/completions";

export interface ToolDefinition<TInput = unknown, TOutput = unknown> {
  name: string;
  description: string;
  inputSchema: z.ZodType<TInput>;
  outputSchema?: z.ZodType<TOutput>;
  execute: (input: TInput, context: ToolContext) => Promise<TOutput>;
}

export interface ToolContext {
  sessionId?: number;
  conversationId?: number;
  botId?: number;
  botName?: string;
  clientId?: number;
  userId?: number;
  isGuest?: boolean;
  depth?: number;
  guestSessionToken?: string;
}

const toolMap = new Map<string, ToolDefinition>();

export function registerTool<TInput, TOutput>(tool: ToolDefinition<TInput, TOutput>) {
  toolMap.set(tool.name, tool as ToolDefinition);
}

export function getTool(name: string): ToolDefinition | undefined {
  return toolMap.get(name);
}

export function getAllTools(): ToolDefinition[] {
  return Array.from(toolMap.values());
}

export function getOpenAIToolDefinitions(): ChatCompletionTool[] {
  return getAllTools().map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: zodToJsonSchema(tool.inputSchema),
    },
  }));
}

function zodToJsonSchema(schema: z.ZodType): Record<string, unknown> {
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape;
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    for (const [key, value] of Object.entries(shape)) {
      const fieldSchema = value as z.ZodType;
      properties[key] = zodToJsonSchema(fieldSchema);
      if (!(fieldSchema instanceof z.ZodOptional)) {
        required.push(key);
      }
    }

    return {
      type: "object",
      properties,
      ...(required.length > 0 ? { required } : {}),
    };
  }

  if (schema instanceof z.ZodString) {
    return { type: "string" };
  }

  if (schema instanceof z.ZodNumber) {
    return { type: "number" };
  }

  if (schema instanceof z.ZodBoolean) {
    return { type: "boolean" };
  }

  if (schema instanceof z.ZodArray) {
    return {
      type: "array",
      items: zodToJsonSchema(schema.element),
    };
  }

  if (schema instanceof z.ZodOptional) {
    return zodToJsonSchema(schema.unwrap());
  }

  if (schema instanceof z.ZodEnum) {
    return { type: "string", enum: schema.options };
  }

  return { type: "string" };
}
