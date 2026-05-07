import type { VerticalPack } from "./types";

export const saasTechPack: VerticalPack = {
  id: "saas-tech",
  name: "SaaS & Technology",
  industry: "Technology",
  icon: "💻",
  color: "#6366f1",
  tagline: "Ship faster, sell smarter, scale predictably",
  description:
    "Purpose-built for software companies from seed to Series C. Your AI executive team understands MRR, churn cohorts, product-led growth, and the dev-to-revenue pipeline. From pricing strategy to competitive positioning, every bot speaks SaaS.",
  highlights: [
    "MRR/ARR tracking and cohort analysis baked into every financial bot",
    "Product-led growth playbooks for Marketing and Sales directors",
    "Developer relations and community-building scenarios",
    "Competitive SaaS intelligence and feature parity analysis",
    "SOC 2 and compliance awareness across all bot interactions",
  ],
  botOverlays: [
    {
      botTitle: "Managing Director",
      overlayPrompt:
        "You are advising a SaaS/technology company. Frame all strategic analysis around SaaS metrics: MRR, ARR, net revenue retention, CAC payback period, LTV:CAC ratio, and logo vs. revenue churn. Reference industry benchmarks from Bessemer Cloud Index, KeyBanc SaaS Survey, and OpenView benchmarks. Consider product-led growth vs. sales-led motions and advise on the right GTM mix for the company's stage.",
    },
    {
      botTitle: "Finance Director",
      overlayPrompt:
        "You are advising a SaaS/technology company. All financial analysis should use SaaS-specific metrics: Rule of 40, burn multiple, magic number, gross margin (target 70%+), net dollar retention. Model subscription revenue with monthly and annual cohorts. Understand cloud infrastructure costs (AWS/GCP/Azure) as primary COGS. Reference typical SaaS benchmarks for the company's ARR range.",
    },
    {
      botTitle: "Director of Marketing",
      overlayPrompt:
        "You are advising a SaaS/technology company. Focus on product-qualified leads (PQLs), free trial conversion, content marketing for developer audiences, SEO for technical keywords, and community-led growth. Understand the B2B SaaS buying committee (champion, economic buyer, technical evaluator). Reference channels like Product Hunt, Hacker News, dev communities, and LinkedIn for distribution.",
    },
    {
      botTitle: "Director of Sales",
      overlayPrompt:
        "You are advising a SaaS/technology company. Structure sales guidance around the SaaS sales cycle: demo → trial → POC → procurement → close. Understand seat-based vs. usage-based pricing implications. Advise on sales-assisted PLG, expansion revenue strategies, and enterprise vs. SMB segmentation. Reference typical SaaS sales cycles, close rates, and ACV benchmarks.",
    },
    {
      botTitle: "Technical Director",
      overlayPrompt:
        "You are advising a SaaS/technology company. Focus on technical architecture decisions, build vs. buy trade-offs, API-first design, multi-tenancy, SOC 2 compliance, uptime SLAs, and engineering team velocity metrics. Understand cloud cost optimization, CI/CD best practices, and technical debt management.",
    },
  ],
  scenarios: [
    {
      title: "Pricing Tier Optimization",
      category: "Operations",
      difficulty: "Strategic",
      situation:
        "The company's current pricing tiers haven't been updated in 18 months. Usage data shows most customers cluster in the mid-tier, suggesting the value metric isn't aligned with willingness to pay. Competitors have shifted to usage-based models.",
      actions: [
        "Analyze current tier distribution and identify value metric misalignment",
        "Research competitor pricing models and packaging strategies",
        "Model revenue impact of usage-based vs. seat-based vs. hybrid pricing",
        "Draft new pricing architecture with migration plan for existing customers",
      ],
      missionObjective:
        "Conduct a comprehensive pricing analysis for this SaaS company. Analyze current tier utilization patterns, benchmark against 5+ competitor pricing models, and model the revenue impact of switching to usage-based, seat-based, or hybrid pricing. Deliver a recommended pricing architecture with a customer migration plan that minimizes churn risk.",
      recommendedBots: [
        "Managing Director",
        "Finance Director",
        "Director of Sales",
      ],
    },
    {
      title: "Product-Led Growth Playbook",
      category: "Lead Generation",
      difficulty: "Strategic",
      situation:
        "The company relies heavily on outbound sales but wants to build a self-serve motion. The product has a free tier but conversion to paid is below 2%. The onboarding flow has a 40% drop-off rate.",
      actions: [
        "Audit the current free-to-paid conversion funnel",
        "Identify activation milestones that correlate with conversion",
        "Design an in-product growth loop with viral mechanics",
        "Build a PQL scoring model for sales-assist intervention",
      ],
      missionObjective:
        "Design a product-led growth strategy for this SaaS company. Audit the current free-to-paid funnel, identify the 'aha moment' activation milestones, design in-product growth loops, and build a PQL scoring framework that triggers sales-assist at the right moment. Target: 5%+ free-to-paid conversion rate.",
      recommendedBots: [
        "Director of Marketing",
        "Managing Director",
        "Technical Director",
      ],
    },
    {
      title: "Competitive Feature Parity Analysis",
      category: "Competitive Intelligence",
      difficulty: "Tactical",
      situation:
        "Three new competitors have entered the market in the last 6 months. Sales is losing deals citing feature gaps. The product team needs a data-driven prioritization framework.",
      actions: [
        "Map feature sets across top 5 competitors",
        "Cross-reference with lost-deal reasons from sales data",
        "Score features by competitive impact and build effort",
        "Deliver a prioritized roadmap recommendation",
      ],
      missionObjective:
        "Conduct a competitive feature analysis against the top 5 competitors in this SaaS company's market. Map feature parity, cross-reference with lost-deal data, and deliver a prioritized product roadmap recommendation scored by competitive impact vs. engineering effort.",
      recommendedBots: [
        "Technical Director",
        "Director of Sales",
        "Managing Director",
      ],
    },
    {
      title: "Series B Fundraising Prep",
      category: "Operations",
      difficulty: "Critical",
      situation:
        "The company is 6 months from needing to raise a Series B. Current metrics: $3M ARR, 110% NRR, 18-month runway. Need to build a compelling data room and narrative for top-tier VCs.",
      actions: [
        "Build a SaaS metrics dashboard for investor consumption",
        "Draft the fundraising narrative and market sizing analysis",
        "Prepare financial model with 3 growth scenarios",
        "Create a target investor list with thesis alignment scoring",
      ],
      missionObjective:
        "Prepare this SaaS company for a Series B fundraise. Build an investor-grade metrics package (ARR, NRR, CAC payback, burn multiple, Rule of 40), draft the fundraising narrative with TAM/SAM/SOM analysis, create a 3-scenario financial model, and compile a ranked target investor list with thesis alignment notes.",
      recommendedBots: [
        "Finance Director",
        "Managing Director",
      ],
    },
  ],
  pipelines: [
    {
      name: "Weekly SaaS Metrics Briefing",
      triggerType: "manual",
      steps: [
        {
          botTitle: "Finance Director",
          instruction:
            "Generate this week's SaaS metrics summary: MRR movement (new, expansion, contraction, churn), net revenue retention trend, runway update, and cash flow forecast. Flag any metrics that deviate more than 10% from the 4-week average.",
        },
        {
          botTitle: "Director of Marketing",
          instruction:
            "Based on the CFO's metrics briefing, analyze the top-of-funnel performance: trial starts, PQL conversion, and marketing-sourced pipeline. Recommend 2-3 tactical adjustments for the coming week.",
        },
        {
          botTitle: "Managing Director",
          instruction:
            "Synthesize the financial and marketing updates into an executive brief. Highlight the top 3 strategic priorities for the week and any competitive signals that require attention.",
        },
      ],
    },
  ],
  kbDocuments: [
    {
      title: "SaaS Metrics & Benchmarks Glossary",
      filename: "saas-metrics-glossary.txt",
      content: `SaaS METRICS & BENCHMARKS GLOSSARY

MRR (Monthly Recurring Revenue): Total predictable monthly revenue from subscriptions. Excludes one-time fees.
ARR (Annual Recurring Revenue): MRR × 12. Primary metric for SaaS valuation.
Net Revenue Retention (NRR): Revenue from existing customers after expansion, contraction, and churn. Best-in-class: 120%+. Good: 110%+.
Gross Revenue Retention: Revenue retained without counting expansion. Target: 90%+.
CAC (Customer Acquisition Cost): Total sales + marketing spend / new customers acquired. 
LTV:CAC Ratio: Customer lifetime value divided by CAC. Healthy: 3:1+. Excellent: 5:1+.
CAC Payback Period: Months to recover CAC from gross margin. Target: <18 months for SMB, <24 months for enterprise.
Rule of 40: Growth rate + profit margin should exceed 40%. Used by investors to evaluate SaaS health.
Burn Multiple: Net burn / net new ARR. Below 1.5x is efficient. Above 2x is concerning.
Magic Number: Net new ARR / prior quarter sales & marketing spend. Above 0.75 = efficient, above 1.0 = time to invest more.
Gross Margin: Revenue minus COGS (hosting, support, onboarding). SaaS target: 70-80%.
Logo Churn: Percentage of customers lost. Monthly target: <2% for SMB, <1% for enterprise.
Revenue Churn: Percentage of MRR lost. Can be negative with expansion (best case).
Product-Qualified Lead (PQL): Free user who reaches activation threshold indicating buying intent.
Activation Rate: Percentage of new signups who reach the "aha moment." Target varies by product complexity.
Time to Value (TTV): Duration from signup to first meaningful outcome. Lower is better.
Expansion Revenue: Revenue growth from existing customers via upsell, cross-sell, or usage growth.`,
    },
  ],
};
