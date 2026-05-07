import type { VerticalPack } from "./types";

export const agencyPack: VerticalPack = {
  id: "agency",
  name: "Agency & Consulting",
  industry: "Consulting",
  icon: "🎯",
  color: "#7c3aed",
  tagline: "Scale your agency without scaling headcount",
  description:
    "Built for marketing agencies, management consultants, design studios, and professional service firms. Your AI team understands utilization rates, client lifetime value, scope creep management, and the feast-or-famine cycle that defines agency life. From solopreneur to 50-person shop, every bot speaks agency.",
  highlights: [
    "Utilization rate tracking and capacity planning",
    "Client profitability analysis and scope management",
    "Proposal automation and win rate optimization",
    "Retainer vs. project-based revenue mix optimization",
    "White-label and subcontractor management strategies",
  ],
  botOverlays: [
    {
      botTitle: "Managing Director",
      overlayPrompt:
        "You are advising a marketing agency, consulting firm, or professional services company. Frame strategy around client concentration risk (no client >25% of revenue), service line expansion, geographic reach, and the build vs. buy decision for new capabilities. Understand the agency lifecycle (founder-led → process-driven → scalable) and when to specialize vs. generalize. Reference Agency Management Institute and SPI Research benchmarks.",
    },
    {
      botTitle: "Finance Director",
      overlayPrompt:
        "You are advising a marketing agency, consulting firm, or professional services company. Financial analysis should focus on average billable rate (ABR), effective bill rate (EBR), utilization rate (target 65-75%), project profitability by client and service line, and the retainer vs. project revenue mix. Understand scope creep economics, change order management, and the cash flow challenges of milestone billing. Track AGI (adjusted gross income) not just topline revenue.",
    },
    {
      botTitle: "Director of Marketing",
      overlayPrompt:
        "You are advising a marketing agency, consulting firm, or professional services company. Agency marketing should practice what it preaches: thought leadership, case study marketing, award submissions, speaking engagements, and strategic partnerships. Focus on niche positioning, ideal client profile (ICP) refinement, and inbound content that demonstrates expertise. Understand the irony of agencies struggling with their own marketing and help break that pattern.",
    },
    {
      botTitle: "Director of Sales",
      overlayPrompt:
        "You are advising a marketing agency, consulting firm, or professional services company. Sales guidance should cover the consultative sales process: discovery → audit → proposal → negotiation → close. Understand proposal pricing strategies (fixed bid, T&M, value-based, retainer), the RFP response process, and how to qualify prospects based on budget, timeline, and decision-making authority. Focus on expanding existing client relationships through upsell and cross-sell.",
    },
  ],
  scenarios: [
    {
      title: "Client Profitability & Scope Audit",
      category: "Operations",
      difficulty: "Strategic",
      situation:
        "The agency's topline revenue is growing but margins are shrinking. The team suspects scope creep on several accounts is eating into profitability, but there's no systematic tracking of hours-to-estimate variance.",
      actions: [
        "Analyze profitability by client account (billed vs. actual hours)",
        "Identify scope creep patterns and quantify their cost",
        "Design a scope management and change order process",
        "Recommend client-level pricing adjustments or contract restructuring",
      ],
      missionObjective:
        "Conduct a comprehensive client profitability audit for this agency. Analyze each active client account by billed revenue, actual hours invested, effective bill rate, and project profitability margin. Identify the top 3 accounts with scope creep issues and quantify the revenue leakage. Design a change order process and recommend contract restructuring to protect margins on unprofitable accounts.",
      recommendedBots: [
        "Finance Director",
        "Director of Operations",
        "Director of Sales",
      ],
    },
    {
      title: "New Business Pipeline Optimization",
      category: "Lead Generation",
      difficulty: "Tactical",
      situation:
        "The agency relies on referrals for 80% of new business. While close rates on referrals are high, the pipeline is unpredictable and feast-or-famine cycles create cash flow stress. The team needs a systematic approach to pipeline generation.",
      actions: [
        "Audit the current pipeline and map the referral-to-close journey",
        "Design an inbound content strategy for the agency's niche",
        "Build a strategic partnership and co-marketing program",
        "Create a monthly business development cadence for partners/directors",
      ],
      missionObjective:
        "Design a systematic new business pipeline for this agency. Audit current referral sources, win rates, and pipeline velocity. Build an inbound content strategy targeting the agency's ideal client profile, design a strategic partnership program, and create a monthly BD cadence for senior team members. Target: reduce referral dependency from 80% to 50% and create 3-month pipeline visibility.",
      recommendedBots: [
        "Director of Marketing",
        "Director of Sales",
        "Managing Director",
      ],
    },
    {
      title: "Capacity Planning & Hiring Model",
      category: "Operations",
      difficulty: "Critical",
      situation:
        "The agency is at 90% utilization and turning away new projects. The founder needs to decide between hiring full-time staff, using contractors, or building a white-label partnership network. Each option has different margin, quality, and scalability implications.",
      actions: [
        "Model capacity needs based on pipeline and retainer commitments",
        "Compare economics of full-time hire vs. contractor vs. white-label",
        "Design a hybrid staffing model with overflow capacity",
        "Build a hiring plan with break-even analysis per role",
      ],
      missionObjective:
        "Build a capacity planning and hiring model for this agency. Forecast capacity needs based on current retainers, pipeline, and seasonal patterns. Compare the economics of 3 staffing models (full-time hire, freelance contractor, white-label partner) across cost, quality, and scalability dimensions. Deliver a recommended hybrid model with role-specific break-even analysis and a hiring timeline.",
      recommendedBots: [
        "Finance Director",
        "Director of Operations",
        "Managing Director",
      ],
    },
    {
      title: "Service Line Expansion Strategy",
      category: "Market Expansion",
      difficulty: "Strategic",
      situation:
        "The agency specializes in content marketing but clients keep asking for SEO, paid media, and web development. Adding services could increase client LTV by 60% but requires new capabilities the team doesn't have.",
      actions: [
        "Analyze client demand signals and revenue potential by service line",
        "Map build vs. partner vs. acquire options for each capability",
        "Design a phased rollout plan starting with highest-demand services",
        "Create pricing packages that bundle existing and new services",
      ],
      missionObjective:
        "Design a service line expansion strategy for this agency. Analyze client demand data and revenue potential for SEO, paid media, and web development. Evaluate build (hire), partner (white-label), and acquire options for each service. Create a phased rollout plan with pricing packages that bundle new and existing services. Project the impact on client LTV, average contract value, and agency margins over 12 months.",
      recommendedBots: [
        "Managing Director",
        "Finance Director",
        "Director of Sales",
      ],
    },
  ],
  pipelines: [
    {
      name: "Monthly Agency Performance Review",
      triggerType: "manual",
      steps: [
        {
          botTitle: "Finance Director",
          instruction:
            "Generate the monthly agency financial report: total revenue, AGI (adjusted gross income), utilization rate, effective bill rate, and profitability by client. Flag any client with profitability below 30% or utilization above 85% (capacity risk).",
        },
        {
          botTitle: "Director of Sales",
          instruction:
            "Based on the financial report, review the pipeline: new opportunities, proposal status, and projected close dates. Identify any revenue gaps in the next 90 days and recommend BD actions to fill them.",
        },
        {
          botTitle: "Managing Director",
          instruction:
            "Synthesize financial and pipeline data into a leadership brief. Highlight capacity constraints, client concentration risks, and strategic opportunities for the coming quarter.",
        },
      ],
    },
  ],
  kbDocuments: [
    {
      title: "Agency Operations & Business Development Reference",
      filename: "agency-operations-reference.txt",
      content: `AGENCY OPERATIONS & BUSINESS DEVELOPMENT REFERENCE

KEY FINANCIAL METRICS:
AGI (Adjusted Gross Income): Net revenue after pass-through costs (media spend, printing, etc.).
Utilization Rate: Billable hours / available hours. Target: 65-75% (higher risks burnout).
Average Billable Rate (ABR): Standard rate for each role/seniority level.
Effective Bill Rate (EBR): Actual revenue earned per hour worked. Often lower than ABR due to scope creep.
Project Profitability: Revenue - (hours worked × fully loaded cost per hour). Target: 50%+ margin.
Client Concentration: No single client should exceed 25% of total revenue.
Revenue Per Employee: Total revenue / headcount. Healthy agency: $150K-250K+.
Retainer Ratio: Retainer revenue / total revenue. Higher = more predictable cash flow.

BUSINESS DEVELOPMENT:
Win Rate: Proposals won / proposals submitted. Target: 25-40%.
Pipeline Coverage: Pipeline value / revenue target. Need 3x coverage minimum.
Sales Cycle: Average time from first contact to signed SOW. Typically 30-90 days.
Client Lifetime Value (LTV): Average annual revenue × average tenure. High-performing: 3+ years.
Referral Rate: New clients from referrals / total new clients. Industry average: 60-80%.
Proposal Hit Rate by Source: Track win rates separately for referrals, inbound, outbound, RFPs.

PRICING MODELS:
Hourly/T&M: Bill for time spent. Simple but commoditizing.
Fixed Bid/Project: Set price for defined scope. Higher margin if scoped well.
Value-Based: Price tied to outcome or value delivered. Highest margin potential.
Retainer: Monthly recurring fee for ongoing services. Best for predictable revenue.
Performance: Fee partially tied to results (leads, conversions, etc.). Risk-sharing model.

SCOPE MANAGEMENT:
Change Order Process: Document any work outside original SOW, get written approval before executing.
Scope Creep Signals: Increasing revision rounds, "quick asks," expanding stakeholder list.
Prevention: Detailed SOW with explicit deliverables, revision limits, and out-of-scope definitions.`,
    },
  ],
};
