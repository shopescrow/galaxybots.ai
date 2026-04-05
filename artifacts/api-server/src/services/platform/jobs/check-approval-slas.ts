import {
  db,
  pendingApprovalsTable,
  approvalSlaConfigsTable,
} from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import { broadcastSSE } from "../sse";
import { createNotification } from "../../admin/notifications";
import { resumeAgenticLoopWithRejection } from "../../../tools/agentic-loop";
import type { ToolContext } from "../../../tools";
import nodemailer from "nodemailer";

const TIME_SENSITIVE_TOOLS = ["send_email", "create_invoice", "send_notification", "post_to_slack"];

export async function checkApprovalSLAs() {
  try {
    const now = new Date();
    const pendingApprovals = await db
      .select()
      .from(pendingApprovalsTable)
      .where(eq(pendingApprovalsTable.status, "pending"));

    if (pendingApprovals.length === 0) return;

    const clientIds = [...new Set(pendingApprovals.map((a) => a.clientId))];
    const slaConfigs = await db
      .select()
      .from(approvalSlaConfigsTable)
      .where(
        clientIds.length === 1
          ? eq(approvalSlaConfigsTable.clientId, clientIds[0])
          : inArray(approvalSlaConfigsTable.clientId, clientIds)
      );
    const slaConfigMap: Record<number, typeof slaConfigs[0]> = Object.fromEntries(
      slaConfigs.map((c) => [c.clientId, c])
    );

    for (const approval of pendingApprovals) {
      const config = slaConfigMap[approval.clientId];
      const isTimeSensitive = approval.isTimeSensitive || TIME_SENSITIVE_TOOLS.includes(approval.toolName);
      const slaMinutes = isTimeSensitive
        ? (config?.timeSensitiveSlaMinutes ?? 60)
        : (config?.defaultSlaMinutes ?? 240);

      let slaDeadline = approval.slaDeadline;
      if (!slaDeadline) {
        slaDeadline = new Date(approval.createdAt.getTime() + slaMinutes * 60 * 1000);
        await db
          .update(pendingApprovalsTable)
          .set({ slaDeadline, isTimeSensitive })
          .where(eq(pendingApprovalsTable.id, approval.id));
      }

      if (now < slaDeadline) continue;

      const doubleDeadline = new Date(slaDeadline.getTime() + slaMinutes * 60 * 1000);

      if (now >= doubleDeadline) {
        const updated = await db
          .update(pendingApprovalsTable)
          .set({
            status: "rejected",
            resolvedAt: now,
            rejectionReason: "SLA timeout — rejected automatically",
          })
          .where(and(eq(pendingApprovalsTable.id, approval.id), eq(pendingApprovalsTable.status, "pending")))
          .returning();

        if (updated.length === 0) continue;

        const rejectionReason = "SLA timeout — rejected automatically";

        const pausedCtx = approval.pausedLoopContext as {
          model: string;
          maxIterations: number;
          maxTokens: number;
          systemPrompt: string;
          messages: unknown[];
          remainingIterations: number;
          toolCallId: string;
          allToolCallIds?: string[];
        } | null;

        if (pausedCtx) {
          const toolContext: ToolContext = {
            clientId: approval.clientId,
            botId: approval.botId,
            botName: approval.botName ?? undefined,
            sessionId: approval.sessionId ?? undefined,
            conversationId: approval.conversationId ?? undefined,
          };
          resumeAgenticLoopWithRejection({
            pausedLoopContext: pausedCtx,
            toolName: approval.toolName,
            rejectionReason,
            context: toolContext,
          }).catch((e) => console.error("[sla] Failed to resume agentic loop after SLA rejection:", e));
        }

        createNotification({
          clientId: approval.clientId,
          category: "system",
          severity: "critical",
          title: "Approval auto-rejected (SLA timeout)",
          body: `${approval.botName ?? "Bot"}'s request to use "${approval.toolName}" was auto-rejected after ${slaMinutes * 2} minutes without a decision.`,
          link: "/command-center",
          metadata: { approvalId: approval.id, toolName: approval.toolName },
        }).catch((e) => console.error("[sla] Failed to create auto-reject notification:", e));

        broadcastSSE("activity", {
          id: `sla-reject-${approval.id}-${Date.now()}`,
          timestamp: new Date().toISOString(),
          clientId: approval.clientId,
          source: "system",
          eventType: "approval",
          severity: "critical",
          title: "Approval auto-rejected (SLA timeout)",
          description: `Tool "${approval.toolName}" request was auto-rejected after ${slaMinutes * 2} minutes`,
          metadata: { approvalId: approval.id, toolName: approval.toolName, reason: rejectionReason },
        });

        broadcastSSE("approval-sla-rejected", {
          clientId: approval.clientId,
          approvalId: approval.id,
          toolName: approval.toolName,
          reason: rejectionReason,
        });
      } else if (!approval.escalatedAt) {
        await db
          .update(pendingApprovalsTable)
          .set({ escalatedAt: now })
          .where(eq(pendingApprovalsTable.id, approval.id));

        createNotification({
          clientId: approval.clientId,
          category: "system",
          severity: "critical",
          title: "Approval SLA breached — action required",
          body: `${approval.botName ?? "Bot"}'s request to use "${approval.toolName}" is overdue. Auto-reject in ${slaMinutes} minutes if not resolved.`,
          link: "/command-center",
          metadata: { approvalId: approval.id, toolName: approval.toolName },
        }).catch((e) => console.error("[sla] Failed to create SLA breach notification:", e));

        broadcastSSE("approval-sla-breached", {
          clientId: approval.clientId,
          approvalId: approval.id,
          toolName: approval.toolName,
          slaDeadline: slaDeadline.toISOString(),
          secondaryApproverEmail: config?.secondaryApproverEmail ?? null,
        });

        if (config?.secondaryApproverEmail) {
          const smtpUser = process.env.SMTP_USER;
          const smtpPass = process.env.SMTP_PASS;
          if (smtpUser && smtpPass) {
            const transporter = nodemailer.createTransport({
              host: process.env.SMTP_HOST ?? "smtp.gmail.com",
              port: Number(process.env.SMTP_PORT ?? 587),
              secure: false,
              auth: { user: smtpUser, pass: smtpPass },
            });
            transporter.sendMail({
              from: `"GalaxyBots" <${smtpUser}>`,
              to: config.secondaryApproverEmail,
              subject: `[Action Required] Approval SLA breached for ${approval.toolName}`,
              text: [
                `An approval request is overdue and has been escalated to you.`,
                ``,
                `Bot: ${approval.botName ?? "Unknown"}`,
                `Tool: ${approval.toolName}`,
                `Tool input: ${typeof approval.toolInput === "object" ? JSON.stringify(approval.toolInput) : (approval.toolInput ?? "No input provided")}`,
                `SLA deadline: ${slaDeadline.toISOString()}`,
                `Auto-reject in: ${slaMinutes} minutes`,
                ``,
                `Please review at: ${process.env.APP_URL ?? "https://galaxybots.app"}/command-center`,
              ].join("\n"),
            }).catch((e: Error) => console.error("[sla] Failed to send escalation email:", e));
          } else {
            console.warn("[sla] Escalation email skipped — SMTP_USER/SMTP_PASS not configured");
          }
        }
      }
    }
  } catch (err) {
    console.error("[sla] Error checking approval SLAs:", err);
  }
}
