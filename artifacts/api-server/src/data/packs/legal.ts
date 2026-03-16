import type { VerticalPack } from "./types";

export const legalPack: VerticalPack = {
  id: "legal",
  name: "Legal & Professional Services",
  industry: "Legal",
  icon: "⚖️",
  color: "#0f766e",
  tagline: "Billable intelligence for modern law firms",
  description:
    "Built for law firms, accounting practices, and professional service firms. Your AI executive team understands billable hour optimization, client intake workflows, matter management, and regulatory compliance. Every bot respects privilege boundaries and confidentiality requirements.",
  highlights: [
    "Billable hour tracking and utilization rate optimization",
    "Client intake and conflict-check workflow automation",
    "Regulatory awareness across all bot interactions (ABA, state bar rules)",
    "Matter profitability analysis and realization rate improvement",
    "Business development strategies for professional service firms",
  ],
  botOverlays: [
    {
      botTitle: "Chief Strategy Officer",
      overlayPrompt:
        "You are advising a legal or professional services firm. Frame strategy around practice area profitability, partner leverage ratios, realization rates, and client concentration risk. Reference Am Law 200 benchmarks and legal industry trends (alternative fee arrangements, legal tech adoption, AI impact on billable work). Consider the tension between traditional partnership models and modern firm management.",
    },
    {
      botTitle: "Chief Financial Officer",
      overlayPrompt:
        "You are advising a legal or professional services firm. Financial analysis should focus on revenue per lawyer (RPL), profit per equity partner (PPEP), realization rate, collection rate, and leverage ratio. Understand the billable hour model, alternative fee arrangements, and contingency fee structures. Track WIP (work in progress) and accounts receivable aging. Reference Am Law profitability benchmarks.",
    },
    {
      botTitle: "Chief Marketing Officer",
      overlayPrompt:
        "You are advising a legal or professional services firm. Marketing must respect bar association advertising rules and ethics opinions. Focus on thought leadership, speaking engagements, legal directories (Chambers, Legal 500), client alerts, and referral network cultivation. Understand the partner-driven rainmaking model and how to scale business development beyond individual relationships.",
    },
    {
      botTitle: "Chief Operations Officer",
      overlayPrompt:
        "You are advising a legal or professional services firm. Operations focus on matter management, document management systems, e-billing compliance, time entry enforcement, and paralegal leverage. Understand the technology stack (practice management, document review, e-discovery) and process optimization opportunities that don't compromise quality or compliance.",
    },
  ],
  scenarios: [
    {
      title: "Practice Area Profitability Review",
      category: "Operations",
      difficulty: "Strategic",
      situation:
        "The managing partner suspects certain practice areas are subsidizing others. Associate utilization varies widely across groups, and realization rates on complex litigation matters have declined 15% over two years.",
      actions: [
        "Analyze revenue, costs, and profitability by practice area",
        "Benchmark utilization and realization rates against Am Law medians",
        "Identify practice areas with structural profitability challenges",
        "Recommend resource reallocation and pricing adjustments",
      ],
      missionObjective:
        "Conduct a practice area profitability analysis for this law firm. Break down revenue, direct costs, and overhead allocation by practice group. Benchmark utilization rates, realization rates, and RPL against Am Law 200 medians. Identify underperforming practice areas and recommend structural changes (staffing, pricing, or practice area mergers) to improve firm-wide profitability.",
      recommendedBots: [
        "Chief Financial Officer",
        "Chief Strategy Officer",
        "Chief Operations Officer",
      ],
    },
    {
      title: "Client Intake & Conflict Check Automation",
      category: "Operations",
      difficulty: "Tactical",
      situation:
        "New client intake takes an average of 5 days due to manual conflict checks, partner approval workflows, and engagement letter generation. The firm is losing prospective clients to faster-moving competitors.",
      actions: [
        "Map the current intake workflow and identify bottlenecks",
        "Design an automated conflict-check and clearance process",
        "Create engagement letter templates with dynamic fee structures",
        "Build a client onboarding checklist with automated follow-ups",
      ],
      missionObjective:
        "Redesign the client intake and conflict-check workflow for this law firm. Map the current 5-day process, identify automation opportunities, design a streamlined workflow that reduces intake to under 48 hours while maintaining compliance with bar association conflict-of-interest rules. Include engagement letter automation and a digital onboarding experience.",
      recommendedBots: [
        "Chief Operations Officer",
        "Chief Technology Officer",
        "Chief Strategy Officer",
      ],
    },
    {
      title: "Lateral Hiring ROI Analysis",
      category: "Operations",
      difficulty: "Critical",
      situation:
        "The firm is considering hiring a lateral partner with a $2M book of business and a $1.5M compensation guarantee. Need to model the true ROI including client portability risk, conflicts displacement, and integration costs.",
      actions: [
        "Model lateral partner economics over a 3-year horizon",
        "Assess client portability and revenue at risk",
        "Calculate integration costs and conflict displacement impact",
        "Recommend go/no-go with risk-adjusted return projections",
      ],
      missionObjective:
        "Build a comprehensive ROI model for a lateral partner hire at this law firm. Model 3-year economics including: guaranteed compensation, expected portable book ($2M claimed), client portability discount (typically 60-70% in year 1), conflicts displacement risk, integration costs, and support staff requirements. Deliver a risk-adjusted recommendation with scenarios for best case, expected case, and worst case.",
      recommendedBots: [
        "Chief Financial Officer",
        "Chief Strategy Officer",
      ],
    },
  ],
  pipelines: [
    {
      name: "Monthly Firm Performance Review",
      triggerType: "manual",
      steps: [
        {
          botTitle: "Chief Financial Officer",
          instruction:
            "Generate the monthly firm performance report: total revenue, realization rate, collection rate, WIP aging, and utilization by practice group. Flag any practice group below 85% utilization or below 90% realization rate.",
        },
        {
          botTitle: "Chief Operations Officer",
          instruction:
            "Based on the CFO's report, analyze operational bottlenecks affecting underperforming practice groups. Review matter staffing efficiency and recommend process improvements.",
        },
        {
          botTitle: "Chief Strategy Officer",
          instruction:
            "Synthesize financial and operational data into a managing partner brief. Identify top strategic priorities for the coming month, including any lateral recruiting or practice area investment opportunities.",
        },
      ],
    },
  ],
  kbDocuments: [
    {
      title: "Legal Industry Metrics & Compliance Primer",
      filename: "legal-industry-primer.txt",
      content: `LEGAL INDUSTRY METRICS & COMPLIANCE PRIMER

KEY PERFORMANCE METRICS:
Revenue Per Lawyer (RPL): Total firm revenue / total lawyers. Am Law 200 median: ~$1M.
Profit Per Equity Partner (PPEP): Net income / equity partners. Top firms: $2M+.
Realization Rate: Fees collected / fees billed at standard rates. Target: 90%+.
Collection Rate: Cash collected / fees billed. Target: 95%+.
Utilization Rate: Billable hours / available hours. Target: 85%+ for associates.
Leverage Ratio: Associates per partner. Higher leverage = more profitable (typically).
WIP (Work in Progress): Unbilled time and costs. Should not exceed 60 days of revenue.
AR Aging: Accounts receivable aging. Target: <60 days average.

ALTERNATIVE FEE ARRANGEMENTS (AFAs):
Fixed Fee: Set price for defined scope. Risk: scope creep.
Capped Fee: Maximum fee with hourly billing up to cap.
Success Fee: Contingency or bonus on outcome.
Blended Rate: Single rate for all timekeepers on a matter.
Holdback/Incentive: Portion of fee tied to performance metrics.

ETHICAL CONSIDERATIONS:
ABA Model Rule 1.6: Confidentiality of information.
ABA Model Rule 1.7: Conflict of interest — current clients.
ABA Model Rule 1.9: Duties to former clients.
ABA Model Rule 1.10: Imputation of conflicts.
ABA Model Rule 7.1-7.5: Advertising and solicitation rules.
Trust Account Rules: IOLTA compliance for client funds.`,
    },
  ],
};
