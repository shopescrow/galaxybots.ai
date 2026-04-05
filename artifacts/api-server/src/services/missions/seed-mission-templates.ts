import { db, missionTemplatesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const BUILT_IN_TEMPLATES = [
  {
    name: "Q4 Strategic Planning",
    description: "Develop a comprehensive Q4 strategy including OKRs, resource allocation, and risk mitigation.",
    category: "Strategy",
    estimatedDuration: "2–3 weeks",
    recommendedBots: ["CEO", "CFO", "Chief of Staff"],
    objectiveTemplate:
      "Develop a comprehensive Q4 strategic plan for {{companyName}} covering OKRs, budget allocation, headcount planning, and key risk factors. Deliverables include an executive summary, department-level OKR scorecard, and 90-day roadmap.",
    successCriteria: "Board-ready Q4 plan with executive summary, OKR scorecard, and 90-day roadmap delivered.",
  },
  {
    name: "New Market Entry Analysis",
    description: "Evaluate market opportunity, competitive landscape, and go-to-market strategy for a new geography or segment.",
    category: "Strategy",
    estimatedDuration: "1–2 weeks",
    recommendedBots: ["CMO", "Chief Strategy Officer", "VP Sales"],
    objectiveTemplate:
      "Analyze the market opportunity for {{companyName}} entering {{marketName}}. Include TAM/SAM/SOM sizing, top 5 competitors, regulatory considerations, and a recommended go-to-market playbook with 12-month milestones.",
    successCriteria: "Market analysis report with TAM sizing, competitive matrix, and GTM playbook delivered.",
  },
  {
    name: "Fundraising Preparation",
    description: "Build investor materials, financial model, and due diligence readiness for a funding round.",
    category: "Strategy",
    estimatedDuration: "3–4 weeks",
    recommendedBots: ["CFO", "CEO", "General Counsel"],
    objectiveTemplate:
      "Prepare {{companyName}} for a {{roundType}} fundraising round targeting {{targetAmount}}. Build the investor pitch deck, financial model with 3-year projections, data room checklist, and Q&A prep document for investor diligence.",
    successCriteria: "Complete pitch deck, financial model, and data room ready for investor meetings.",
  },
  {
    name: "Competitive Intelligence Brief",
    description: "Monitor and analyze competitor activity, positioning, and product releases.",
    category: "Marketing & Growth",
    estimatedDuration: "3–5 days",
    recommendedBots: ["CMO", "VP Marketing", "Chief Strategy Officer"],
    objectiveTemplate:
      "Produce a competitive intelligence brief for {{companyName}} covering the top {{competitorCount}} competitors in {{industry}}. Include product updates, pricing changes, messaging shifts, AEO visibility scores, and a recommended response playbook.",
    successCriteria: "Competitive intelligence brief with action recommendations published to stakeholders.",
  },
  {
    name: "Content Strategy Sprint",
    description: "Develop a 90-day content calendar with AI-optimized topics, formats, and distribution channels.",
    category: "Marketing & Growth",
    estimatedDuration: "1 week",
    recommendedBots: ["CMO", "VP Marketing", "Content Director"],
    objectiveTemplate:
      "Build a 90-day content strategy for {{companyName}} targeting {{targetAudience}}. Include a content calendar, 10 high-priority topic briefs optimized for AI search, distribution plan across {{channels}}, and monthly performance KPIs.",
    successCriteria: "90-day content calendar, 10 topic briefs, and distribution plan delivered.",
  },
  {
    name: "Prospect Outreach Campaign",
    description: "Design and launch a targeted outreach campaign for a specific prospect segment.",
    category: "Marketing & Growth",
    estimatedDuration: "1–2 weeks",
    recommendedBots: ["VP Sales", "CMO", "Chief Revenue Officer"],
    objectiveTemplate:
      "Design a prospect outreach campaign for {{companyName}} targeting {{segmentName}} with {{prospectCount}} prospects. Deliver personalized email sequences, LinkedIn outreach scripts, follow-up cadence, and success metrics dashboard.",
    successCriteria: "Outreach sequences live with >20% open rate target; pipeline report delivered weekly.",
  },
  {
    name: "New Client Onboarding",
    description: "Systematically onboard a new client with discovery, setup, and 30-day success milestones.",
    category: "Operations",
    estimatedDuration: "2–4 weeks",
    recommendedBots: ["Chief of Staff", "COO", "VP Customer Success"],
    objectiveTemplate:
      "Onboard {{clientName}} as a new client for {{companyName}}. Complete discovery questionnaire, configure AI bots, set 30/60/90-day success milestones, deliver welcome kit, and schedule first quarterly business review.",
    successCriteria: "Client fully onboarded: bots configured, milestones set, QBR scheduled.",
  },
  {
    name: "Quarterly Business Review",
    description: "Prepare and deliver a comprehensive QBR deck for a client with performance metrics and roadmap.",
    category: "Operations",
    estimatedDuration: "3–5 days",
    recommendedBots: ["VP Customer Success", "CFO", "COO"],
    objectiveTemplate:
      "Prepare a Quarterly Business Review for {{clientName}} covering Q{{quarterNumber}} {{year}}. Include KPI performance vs targets, ROI analysis, bot usage insights, top wins, open issues, and next quarter roadmap priorities.",
    successCriteria: "QBR deck presented and approved by client; action items logged.",
  },
  {
    name: "Process Audit",
    description: "Identify operational bottlenecks, redundancies, and automation opportunities across key workflows.",
    category: "Operations",
    estimatedDuration: "1–2 weeks",
    recommendedBots: ["COO", "Chief of Staff", "VP Operations"],
    objectiveTemplate:
      "Conduct a process audit of the {{departmentName}} department at {{companyName}}. Map current workflows, identify top 5 bottlenecks, score automation readiness, and deliver a prioritized improvement roadmap with estimated time and cost savings.",
    successCriteria: "Process audit report with prioritized improvement roadmap and ROI estimates delivered.",
  },
  {
    name: "Financial Modeling",
    description: "Build or refresh a financial model with scenario analysis for decision-making.",
    category: "Finance",
    estimatedDuration: "1–2 weeks",
    recommendedBots: ["CFO", "VP Finance"],
    objectiveTemplate:
      "Build a financial model for {{companyName}} covering {{timeframePeriod}}. Include P&L projections, cash flow analysis, unit economics, three scenario models (base / bull / bear), and a one-page executive summary with key assumptions.",
    successCriteria: "Financial model with three scenarios and executive summary signed off by finance lead.",
  },
  {
    name: "Cost Optimization Review",
    description: "Identify and prioritize cost reduction opportunities across vendor, headcount, and infrastructure spend.",
    category: "Finance",
    estimatedDuration: "1 week",
    recommendedBots: ["CFO", "COO", "VP Finance"],
    objectiveTemplate:
      "Perform a cost optimization review for {{companyName}} targeting {{savingsTarget}} in annual savings. Analyze vendor contracts, software subscriptions, headcount allocation, and infrastructure spend. Deliver a ranked savings opportunity list with implementation effort scores.",
    successCriteria: "Cost optimization report with ranked opportunities totaling at least {{savingsTarget}} in identified savings.",
  },
  {
    name: "Revenue Attribution Analysis",
    description: "Map revenue to marketing channels, campaigns, and bot-driven activities.",
    category: "Finance",
    estimatedDuration: "3–5 days",
    recommendedBots: ["CFO", "CMO", "Chief Revenue Officer"],
    objectiveTemplate:
      "Conduct a revenue attribution analysis for {{companyName}} over the past {{analysisPeriod}}. Map revenue to channels, campaigns, and bot-driven activities. Deliver a multi-touch attribution model, top 5 highest-ROI channels, and recommended budget reallocation.",
    successCriteria: "Revenue attribution report with multi-touch model and reallocation recommendations delivered.",
  },
] as const;

export async function seedMissionTemplates(): Promise<void> {
  try {
    const existing = await db
      .select({ name: missionTemplatesTable.name })
      .from(missionTemplatesTable)
      .where(eq(missionTemplatesTable.isBuiltIn, true));

    const existingNames = new Set(existing.map((t) => t.name));

    const toInsert = BUILT_IN_TEMPLATES.filter((t) => !existingNames.has(t.name));

    if (toInsert.length === 0) {
      console.log("[seed] Mission templates: all built-ins already seeded");
      return;
    }

    await db.insert(missionTemplatesTable).values(
      toInsert.map((t) => ({
        ...t,
        isBuiltIn: true,
        createdBy: null,
        recommendedBots: t.recommendedBots as string[],
      }))
    );

    console.log(`[seed] Mission templates: seeded ${toInsert.length} built-in template(s)`);
  } catch (err) {
    console.error("[seed] Failed to seed mission templates:", err);
  }
}
