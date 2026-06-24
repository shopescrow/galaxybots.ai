import {
  db,
  botAssignmentsTable,
  botsTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";
import { scheduleUncertaintyGathering } from "./uncertainty-scheduler";
import { checkGoalConflicts } from "./goal-conflict-resolver";

interface SubTask {
  id: string;
  title: string;
  dependsOn: string[];
  status: "pending" | "running" | "done" | "blocked";
}

async function generateSubTasks(
  objective: string,
  horizon: string,
  botName: string,
  responsibilities: string[],
): Promise<SubTask[]> {
  const prompt = `You are ${botName}. Break down this goal into concrete sub-tasks with dependencies.

Goal: "${objective}"
Horizon: ${horizon}
Your responsibilities: ${responsibilities.join("; ")}

Generate a dependency-ordered list of sub-tasks (max 6). Each sub-task should be independently executable.

Respond with JSON array:
[
  {
    "id": "t1",
    "title": "Sub-task description",
    "dependsOn": [],
    "status": "pending"
  },
  {
    "id": "t2",
    "title": "Another sub-task",
    "dependsOn": ["t1"],
    "status": "pending"
  }
]`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5-mini",
      max_completion_tokens: 800,
      messages: [
        {
          role: "system",
          content: "Decompose AI agent goals into sub-tasks. Respond only with valid JSON.",
        },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
    });

    const raw = response.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw);
    const tasks: SubTask[] = Array.isArray(parsed) ? parsed : (parsed.subTasks ?? parsed.tasks ?? []);
    return tasks.slice(0, 6);
  } catch {
    return [];
  }
}

export async function decomposeGoal(assignmentId: number) {
  const [assignment] = await db
    .select()
    .from(botAssignmentsTable)
    .where(eq(botAssignmentsTable.id, assignmentId));

  if (!assignment) return;

  const [bot] = await db
    .select()
    .from(botsTable)
    .where(eq(botsTable.id, assignment.botId));

  if (!bot) return;

  const subTasks = await generateSubTasks(
    assignment.objective,
    assignment.horizon ?? "weekly",
    bot.name,
    bot.responsibilities ?? [],
  );

  if (subTasks.length > 0) {
    await db
      .update(botAssignmentsTable)
      .set({ subTasks, progressScore: 0 })
      .where(eq(botAssignmentsTable.id, assignmentId));

    console.log(
      `[goal-decomp] Decomposed assignment #${assignmentId} into ${subTasks.length} sub-tasks`,
    );
  }

  await Promise.all([
    scheduleUncertaintyGathering(assignmentId),
    checkGoalConflicts(assignmentId),
  ]);
}
