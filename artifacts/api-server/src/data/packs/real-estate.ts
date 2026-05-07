import type { VerticalPack } from "./types";

export const realEstatePack: VerticalPack = {
  id: "real-estate",
  name: "Real Estate",
  industry: "Real Estate",
  icon: "🏢",
  color: "#0284c7",
  tagline: "Close more deals with AI-powered market intelligence",
  description:
    "Built for brokerages, property management firms, and real estate investors. Your AI team understands cap rates, absorption rates, comparable analysis, and the transaction lifecycle. From residential sales to commercial leasing, every bot speaks real estate.",
  highlights: [
    "CMA (Comparative Market Analysis) and pricing strategy support",
    "Lead nurturing and drip campaign optimization",
    "Property management P&L and tenant retention analysis",
    "Market trend analysis and investment opportunity scoring",
    "Fair housing compliance awareness across all interactions",
  ],
  botOverlays: [
    {
      botTitle: "Managing Director",
      overlayPrompt:
        "You are advising a real estate company. Frame strategy around market cycle positioning (expansion, hyper-supply, recession, recovery), geographic diversification, asset class mix, and transaction volume growth. Understand brokerage models (traditional, discount, team-based), PropTech disruption, and the shift to hybrid commission structures. Reference NAR data and local MLS statistics.",
    },
    {
      botTitle: "Finance Director",
      overlayPrompt:
        "You are advising a real estate company. Financial analysis should cover commission revenue forecasting, agent split structures, cap rates, NOI, cash-on-cash return, GRM (gross rent multiplier), and debt service coverage ratio. For property management, track rent collection rates, vacancy rates, and maintenance cost per unit. For brokerages, focus on per-agent productivity and desk cost analysis.",
    },
    {
      botTitle: "Director of Marketing",
      overlayPrompt:
        "You are advising a real estate company. Marketing should focus on listing presentation strategies, digital presence (Zillow, Realtor.com, social media), open house optimization, sphere-of-influence marketing, and hyperlocal content. Understand the importance of Google Business Profile, virtual tours, drone photography ROI, and the role of personal branding for agents. All marketing must comply with fair housing advertising rules.",
    },
    {
      botTitle: "Director of Sales",
      overlayPrompt:
        "You are advising a real estate company. Sales guidance should cover lead conversion funnels (online lead → showing → offer → close), buyer consultation processes, listing presentation scripts, objection handling for commission discussions, and pipeline management. Understand the typical real estate sales cycle (30-90 days), seasonal patterns, and the importance of speed-to-lead response times.",
    },
  ],
  scenarios: [
    {
      title: "Market Analysis & Pricing Strategy",
      category: "Competitive Intelligence",
      difficulty: "Tactical",
      situation:
        "The local market is shifting from a seller's market to balanced conditions. Days on market have increased 40% in the last quarter, and price reductions are becoming more common. The brokerage needs a data-driven pricing strategy to maintain listing quality.",
      actions: [
        "Analyze local market data: DOM trends, price-to-list ratios, inventory levels",
        "Build a comparative market analysis framework for agents",
        "Develop pricing recommendations by property type and price band",
        "Create a market update presentation for sellers",
      ],
      missionObjective:
        "Conduct a comprehensive local real estate market analysis. Track days on market trends, sale-to-list price ratios, active inventory levels, and absorption rate over the past 6 months. Build a pricing strategy framework by property type and price band. Create a seller-facing market update that helps set realistic pricing expectations in a shifting market.",
      recommendedBots: [
        "Managing Director",
        "Finance Director",
        "Director of Sales",
      ],
    },
    {
      title: "Agent Recruitment & Retention Strategy",
      category: "Operations",
      difficulty: "Strategic",
      situation:
        "The brokerage has lost 5 producing agents to competitors in the last quarter, citing better commission splits and technology. Recruiting efforts are yielding mostly new agents who need significant training and support.",
      actions: [
        "Benchmark commission structures against top local competitors",
        "Design a value proposition that goes beyond split percentage",
        "Build an agent onboarding program that accelerates time-to-first-deal",
        "Create a retention framework with performance-based incentives",
      ],
      missionObjective:
        "Design a comprehensive agent recruitment and retention strategy for this real estate brokerage. Benchmark commission splits, technology offerings, and training programs against top 5 local competitors. Build a compelling value proposition, design an accelerated onboarding program, and create a performance-based retention framework that reduces agent attrition by 50%.",
      recommendedBots: [
        "Managing Director",
        "Director of Operations",
        "Director of Marketing",
      ],
    },
    {
      title: "Investment Property Portfolio Analysis",
      category: "Operations",
      difficulty: "Critical",
      situation:
        "A real estate investor client has a portfolio of 12 rental properties and wants to optimize for cash flow. Some properties have deferred maintenance, vacancy rates vary widely, and the investor is considering selling underperformers to acquire in a growing submarket.",
      actions: [
        "Analyze each property's NOI, cap rate, and cash-on-cash return",
        "Identify underperforming assets with disposition recommendations",
        "Score potential acquisition submarkets by growth indicators",
        "Model portfolio rebalancing scenarios with 5-year projections",
      ],
      missionObjective:
        "Conduct a real estate investment portfolio analysis for a 12-property rental portfolio. Calculate NOI, cap rate, cash-on-cash return, and DSCR for each property. Identify underperformers for disposition, score potential acquisition submarkets, and model 3 portfolio rebalancing scenarios with 5-year cash flow projections. Deliver a clear buy/hold/sell recommendation for each asset.",
      recommendedBots: [
        "Finance Director",
        "Managing Director",
      ],
    },
  ],
  pipelines: [
    {
      name: "Monthly Market Intelligence Briefing",
      triggerType: "manual",
      steps: [
        {
          botTitle: "Finance Director",
          instruction:
            "Generate the monthly market data summary: median sale price by property type, DOM trends, inventory levels, absorption rate, and mortgage rate impact analysis. Compare to prior month and same month last year.",
        },
        {
          botTitle: "Director of Marketing",
          instruction:
            "Based on the market data, create a market update narrative for agents to share with their sphere. Include 3 key talking points and social media content suggestions.",
        },
        {
          botTitle: "Managing Director",
          instruction:
            "Synthesize market data and marketing positioning into a strategic brief for brokerage leadership. Highlight any market shifts that require strategic adjustments to recruiting, training, or business model.",
        },
      ],
    },
  ],
  kbDocuments: [
    {
      title: "Real Estate Metrics & Compliance Reference",
      filename: "real-estate-reference.txt",
      content: `REAL ESTATE METRICS & COMPLIANCE REFERENCE

KEY FINANCIAL METRICS:
Cap Rate: NOI / Property Value. Market average varies by asset class and location.
NOI (Net Operating Income): Revenue - Operating Expenses (excludes debt service).
Cash-on-Cash Return: Annual pre-tax cash flow / total cash invested.
GRM (Gross Rent Multiplier): Property price / gross annual rental income. Quick valuation tool.
DSCR (Debt Service Coverage Ratio): NOI / annual debt service. Lenders want 1.25+.
Absorption Rate: Homes sold per month / total active inventory. Indicates market speed.
Days on Market (DOM): Average time from listing to accepted offer. Key market health indicator.
Price-to-List Ratio: Sale price / list price. Above 100% = seller's market.
Cap Ex Reserve: Typically 5-10% of gross rent set aside for capital improvements.

BROKERAGE METRICS:
Per-Agent Productivity: Transactions or GCI per agent per year. Top agents: $300K+ GCI.
Desk Cost: Fixed overhead / number of agents. Revenue per agent must exceed this.
Commission Split: Agent vs. brokerage revenue share. Varies from 50/50 to 90/10.
Recruiting Cost: Average $3K-5K per recruited agent (advertising, onboarding, training).

FAIR HOUSING COMPLIANCE:
Protected Classes (Federal): Race, color, national origin, religion, sex, familial status, disability.
Advertising Rules: Cannot use language that implies preference or limitation based on protected classes.
Steering Prohibition: Cannot direct buyers to or away from neighborhoods based on protected classes.
Reasonable Accommodation: Must make reasonable modifications for persons with disabilities.
Equal Service: Must provide the same quality of service to all clients regardless of protected class.`,
    },
  ],
};
