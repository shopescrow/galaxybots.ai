import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { db, botsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

const GALAXYBOTS_TIERS = [
  { name: "Starter", monthlyPrice: 999, annualPrice: 10788, maxDirectors: 3, description: "Up to 3 AI Directors" },
  { name: "Pro", monthlyPrice: 4999, annualPrice: 53988, maxDirectors: 10, description: "Up to 10 AI Directors" },
  { name: "Scale", monthlyPrice: 9999, annualPrice: 107988, maxDirectors: 51, description: "Up to 51 AI Directors (full C-suite)" },
];

const RISK_REGISTER: Record<string, {
  id: string;
  category: string;
  title: string;
  description: string;
  likelihood: string;
  impact: string;
  mitigations: string[];
  owner: string;
  status: string;
}> = {
  "R001": {
    id: "R001",
    category: "Technology",
    title: "AI Model Dependency Risk",
    description: "Heavy reliance on third-party LLM providers (OpenAI, Anthropic, Google) creates single points of failure for core AI Director functionality.",
    likelihood: "Medium",
    impact: "High",
    mitigations: [
      "Multi-provider abstraction layer routing requests across providers",
      "Automatic failover to secondary providers within 100ms",
      "Local model fallback for critical functions",
      "90-day SLA contracts with all Tier-1 providers",
    ],
    owner: "CTO",
    status: "Active — mitigated",
  },
  "R002": {
    id: "R002",
    category: "Regulatory",
    title: "AI Governance & Compliance Risk",
    description: "Evolving EU AI Act, state-level AI regulations, and sector-specific rules (finance, healthcare) may require significant product changes.",
    likelihood: "High",
    impact: "High",
    mitigations: [
      "Dedicated AI compliance officer hired Q2 2025",
      "Audit log for every AI decision (log_decision tool)",
      "Human-in-the-loop escalation for high-stakes decisions",
      "Quarterly regulatory review with external counsel",
    ],
    owner: "Chief Legal Officer",
    status: "Active — in progress",
  },
  "R003": {
    id: "R003",
    category: "Market",
    title: "Competitive Displacement Risk",
    description: "Large tech incumbents (Microsoft Copilot, Google Workspace AI, Salesforce Einstein) could release AI executive products at lower price points.",
    likelihood: "Medium",
    impact: "Medium",
    mitigations: [
      "Deep vertical specialization (C-suite domain knowledge) vs. horizontal AI assistants",
      "AEO / Cloud 9 Score moat — proprietary 9-engine scoring methodology",
      "Enterprise switching costs through deep workflow integrations",
      "White-label OEM program locking in agency resellers",
    ],
    owner: "CEO",
    status: "Active — monitored",
  },
  "R004": {
    id: "R004",
    category: "Security",
    title: "Data Breach / IP Exfiltration Risk",
    description: "Client business data processed by AI Directors represents high-value target; breach could destroy enterprise trust.",
    likelihood: "Low",
    impact: "Critical",
    mitigations: [
      "SOC 2 Type II audit in progress (expected completion Q3 2025)",
      "Zero-knowledge architecture: AI Directors never store raw client data beyond session",
      "mTLS for all internal service communication",
      "Annual penetration testing by third-party firm",
    ],
    owner: "CISO",
    status: "Active — mitigated",
  },
  "R005": {
    id: "R005",
    category: "Financial",
    title: "Burn Rate & Runway Risk",
    description: "High R&D spend on AI infrastructure and talent may compress runway before Series A milestones are achieved.",
    likelihood: "Low",
    impact: "High",
    mitigations: [
      "18-month runway maintained at current burn rate",
      "Revenue-based financing facility ($2M) available as bridge",
      "Lean hiring strategy: AI handles 60% of tasks requiring human headcount elsewhere",
      "Quarterly burn review with board",
    ],
    owner: "CFO",
    status: "Active — monitored",
  },
};

const CLOUD9_PLATFORMS = [
  { id: "chatgpt", name: "ChatGPT", company: "OpenAI", weight: 0.25, description: "Largest consumer AI with 100M+ users; citations drive significant referral traffic." },
  { id: "gemini", name: "Gemini", company: "Google", weight: 0.20, description: "Deep integration with Google Search and Workspace; critical for SEO adjacency." },
  { id: "perplexity", name: "Perplexity AI", company: "Perplexity", weight: 0.15, description: "Answer-engine with heavy citation culture; displays source URLs prominently." },
  { id: "claude", name: "Claude", company: "Anthropic", weight: 0.15, description: "Enterprise-grade AI preferred by knowledge workers and developers." },
  { id: "copilot", name: "Microsoft Copilot", company: "Microsoft", weight: 0.10, description: "Windows/Microsoft 365 integration; critical for B2B enterprise reach." },
  { id: "you_com", name: "You.com", company: "You.com", weight: 0.05, description: "Personalized search AI with explicit citation cards." },
  { id: "brave_leo", name: "Brave Leo", company: "Brave", weight: 0.04, description: "Privacy-focused browser AI; growing among tech-savvy audiences." },
  { id: "mistral", name: "Mistral Le Chat", company: "Mistral AI", weight: 0.03, description: "European open-weight AI leader; strong in EU markets." },
  { id: "grok", name: "Grok", company: "xAI", weight: 0.03, description: "Real-time web access AI embedded in X (Twitter); unique for trending topics." },
];

export function registerKnowledgeTools(server: McpServer): void {
  server.tool(
    "calculate_roi",
    "Calculate the ROI and cost savings of replacing human C-suite executives with GalaxyBots AI Directors. Returns total human cost, GalaxyBots annual cost, savings amount, savings percentage, and the '4 cents on the dollar' framing.",
    {
      num_directors: z.number().int().min(1).max(51).describe("Number of AI Directors needed (1-51)"),
      human_salary_per_director: z.number().optional().describe("Annual fully-loaded cost per human executive in USD (default: $250,000)"),
    },
    async ({ num_directors, human_salary_per_director = 250000 }) => {
      const tier = GALAXYBOTS_TIERS.find(t => num_directors <= t.maxDirectors) ?? GALAXYBOTS_TIERS[GALAXYBOTS_TIERS.length - 1];

      const totalHumanCost = num_directors * human_salary_per_director;
      const galaxyBotsAnnualCost = tier.annualPrice;
      const savings = totalHumanCost - galaxyBotsAnnualCost;
      const savingsPercentage = ((savings / totalHumanCost) * 100).toFixed(1);
      const centsOnDollar = ((galaxyBotsAnnualCost / totalHumanCost) * 100).toFixed(1);

      const result = {
        inputs: {
          num_directors,
          human_salary_per_director,
        },
        human_csuite: {
          total_annual_cost: totalHumanCost,
          formatted: `$${totalHumanCost.toLocaleString()}`,
          per_director: human_salary_per_director,
          note: "Fully-loaded cost including salary, benefits, equity, office space, and management overhead",
        },
        galaxybots: {
          tier: tier.name,
          monthly_price: tier.monthlyPrice,
          annual_price: tier.annualPrice,
          formatted: `$${tier.monthlyPrice.toLocaleString()}/month ($${tier.annualPrice.toLocaleString()}/year)`,
          directors_included: tier.description,
        },
        roi: {
          annual_savings: savings,
          annual_savings_formatted: `$${savings.toLocaleString()}`,
          savings_percentage: `${savingsPercentage}%`,
          cents_on_the_dollar: `${centsOnDollar}¢`,
          headline: `GalaxyBots costs ${centsOnDollar} cents for every dollar spent on a traditional human C-suite`,
          payback_period_months: savings > 0 ? Math.ceil(tier.monthlyPrice / (savings / 12)) : null,
        },
        framing: `By replacing ${num_directors} human executive${num_directors > 1 ? "s" : ""} (costing $${totalHumanCost.toLocaleString()}/year) with GalaxyBots AI Directors on the ${tier.name} plan ($${tier.monthlyPrice.toLocaleString()}/month), you save $${savings.toLocaleString()} per year — that's ${savingsPercentage}% savings, or just ${centsOnDollar} cents on the dollar.`,
      };

      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "get_pricing_recommendation",
    "Get the recommended GalaxyBots pricing tier based on company revenue, employee count, and optional white-label needs. Returns tier recommendation with reasoning, projected ROI, and payback period.",
    {
      company_revenue: z.number().describe("Annual company revenue in USD"),
      employee_count: z.number().int().describe("Number of full-time employees"),
      need_white_label: z.boolean().optional().describe("Whether the company needs white-label / OEM reseller capabilities"),
    },
    async ({ company_revenue, employee_count, need_white_label = false }) => {
      let recommendedTier = GALAXYBOTS_TIERS[0];
      let directors_recommended = 1;
      let reasoning = "";

      if (company_revenue >= 50_000_000 || employee_count >= 500 || need_white_label) {
        recommendedTier = GALAXYBOTS_TIERS[2];
        directors_recommended = Math.min(51, Math.max(5, Math.floor(employee_count / 50)));
        reasoning = `Enterprise-scale company (${company_revenue >= 50_000_000 ? `$${(company_revenue / 1_000_000).toFixed(0)}M revenue` : `${employee_count} employees`}${need_white_label ? ", white-label required" : ""}). Scale plan gives you up to 51 AI Directors and full white-label capabilities.`;
      } else if (company_revenue >= 5_000_000 || employee_count >= 50) {
        recommendedTier = GALAXYBOTS_TIERS[1];
        directors_recommended = Math.min(10, Math.max(3, Math.floor(employee_count / 20)));
        reasoning = `Growth-stage company ($${(company_revenue / 1_000_000).toFixed(1)}M revenue, ${employee_count} employees). Pro plan covers up to 10 AI Directors — enough for a full C-suite at your scale.`;
      } else {
        recommendedTier = GALAXYBOTS_TIERS[0];
        directors_recommended = Math.min(3, Math.max(1, Math.floor(employee_count / 10)));
        reasoning = `Early-stage company ($${(company_revenue / 1_000).toFixed(0)}K revenue, ${employee_count} employees). Starter plan with up to 3 AI Directors is the right entry point — CEO, CMO, CFO to start.`;
      }

      const humanCostEquivalent = directors_recommended * 250_000;
      const annualPlanCost = recommendedTier.annualPrice;
      const annualSavings = humanCostEquivalent - annualPlanCost;
      const paybackMonths = Math.ceil(recommendedTier.monthlyPrice / (annualSavings / 12));

      const result = {
        recommendation: {
          tier: recommendedTier.name,
          monthly_price: recommendedTier.monthlyPrice,
          annual_price: recommendedTier.annualPrice,
          formatted: `$${recommendedTier.monthlyPrice.toLocaleString()}/month`,
          directors_recommended,
          reasoning,
        },
        roi_projection: {
          human_equivalent_cost: humanCostEquivalent,
          annual_plan_cost: annualPlanCost,
          annual_savings: annualSavings,
          savings_percentage: `${((annualSavings / humanCostEquivalent) * 100).toFixed(1)}%`,
          payback_period: `${paybackMonths} months`,
          five_year_savings: annualSavings * 5,
        },
        next_steps: [
          `Start a free trial of the ${recommendedTier.name} plan at galaxybots.ai`,
          `Schedule a 30-minute demo to configure your first ${directors_recommended} AI Directors`,
          need_white_label ? "Connect with our partnerships team for white-label pricing" : "Upgrade to Scale plan when you need more than 10 directors or white-label",
        ],
      };

      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "get_cloud9_score_explanation",
    "Get a clear explanation of the Cloud 9 Score (AEO score) methodology, the 9 AI platforms scored, what good scores look like, and how to improve your score.",
    {
      detail_level: z.enum(["basic", "advanced"]).describe("'basic' for a high-level overview, 'advanced' for full methodology and optimization tactics"),
    },
    async ({ detail_level }) => {
      const basic = {
        what_is_cloud9_score: "The Cloud 9 Score (0-100) measures how visible your brand or website is when people ask AI assistants questions. It tells you how often 9 major AI engines cite your content when answering queries related to your business.",
        why_it_matters: "73% of business decisions now start with an AI assistant query rather than a Google search. If you're not cited by AI engines, you're invisible to this growing audience — the equivalent of not ranking on page 1 of Google in 2015.",
        the_9_platforms: CLOUD9_PLATFORMS.map(p => ({ name: p.name, company: p.company })),
        score_ranges: {
          "80-100": "Elite — you're cited by most major AI engines; strong AEO authority",
          "60-79": "Strong — cited by several key engines; room to capture more",
          "40-59": "Average — some citations but significant opportunity gaps",
          "20-39": "Weak — rarely cited; urgent optimization needed",
          "0-19": "Invisible — almost never cited by AI engines",
        },
        how_to_improve: [
          "Create authoritative, question-answering content (FAQ pages, how-to guides)",
          "Add structured data (JSON-LD schema) to help AI engines parse your content",
          "Get cited in industry publications that AI engines frequently reference",
          "Maintain consistent NAP (Name, Address, Phone) across all platforms",
        ],
      };

      if (detail_level === "basic") {
        return { content: [{ type: "text" as const, text: JSON.stringify(basic, null, 2) }] };
      }

      const advanced = {
        ...basic,
        methodology: {
          scoring_formula: "Cloud9Score = Σ(engine_weight × citation_score) × 100",
          citation_score_per_engine: "1.0 if cited, 0.0 if not cited (binary per engine in base model; partial scoring in advanced mode)",
          platform_weights: CLOUD9_PLATFORMS.reduce((acc, p) => ({ ...acc, [p.id]: p.weight }), {}),
          platform_details: CLOUD9_PLATFORMS,
          scan_process: [
            "9 representative queries generated for your URL's industry/topic",
            "Each query submitted to all 9 AI engines simultaneously",
            "Response parsed to detect if your domain or brand is cited",
            "Citation count and weighted score computed",
            "Results stored with timestamp for trend tracking",
          ],
          scan_frequency: "On-demand via pm_request_scan; data freshness tracked (fresh < 24h, stale 24-168h, very_stale > 168h)",
        },
        advanced_optimization: {
          content_strategy: [
            "Target long-tail questions your customers ask AI assistants (use pm_get_recommendations for URL-specific suggestions)",
            "Create 'definitive guide' content that becomes the go-to reference AI engines cite",
            "Publish original research and statistics — AI engines heavily cite primary sources",
            "Maintain an active blog with expert opinions on industry trends",
          ],
          technical_seo: [
            "Implement FAQ schema for every question-answering page",
            "Use HowTo schema for process/tutorial content",
            "Add Organization and LocalBusiness schema to homepage",
            "Ensure page load < 2s — AI crawlers deprioritize slow pages",
          ],
          authority_building: [
            "Guest author on industry publications (Forbes, HBR, industry blogs)",
            "Get listed in authoritative directories and databases AI engines index",
            "Build citation network: cite others who will cite you back",
            "Secure Wikipedia mentions where factually appropriate",
          ],
          engine_specific: {
            chatgpt: "Focus on training data coverage via web presence; ChatGPT uses Bing for real-time queries",
            gemini: "Optimize for Google's Knowledge Graph and Google Business Profile",
            perplexity: "High-quality, source-linked content performs best; Perplexity values academic and news sources",
            claude: "Anthropic's Constitutional AI prefers authoritative, factual, well-sourced content",
            copilot: "Microsoft Bing optimization directly improves Copilot citations",
          },
        },
        interpreting_results: {
          good_citation_count: "Aim for 5+ engines citing you consistently",
          benchmark_by_industry: "B2B SaaS avg: 34/100 | Professional Services avg: 28/100 | E-commerce avg: 22/100",
          improvement_timeline: "Typical improvement: +10-20 points over 90 days with active optimization",
        },
      };

      return { content: [{ type: "text" as const, text: JSON.stringify(advanced, null, 2) }] };
    }
  );

  server.tool(
    "get_risk_details",
    "Get full details of a specific risk from the GalaxyBots strategic risk register, including category, likelihood, impact, mitigations, and status.",
    {
      risk_id: z.string().describe("Risk ID (e.g., 'R001', 'R002'). Use the gifted://risk-register resource to see all available risk IDs."),
    },
    async ({ risk_id }) => {
      const normalizedId = risk_id.toUpperCase().trim();
      const risk = RISK_REGISTER[normalizedId];

      if (!risk) {
        const availableIds = Object.keys(RISK_REGISTER).join(", ");
        return {
          content: [{ type: "text" as const, text: JSON.stringify({
            error: `Risk ID '${risk_id}' not found`,
            available_ids: availableIds,
            hint: "Read the gifted://risk-register resource for a summary of all risks",
          }) }],
          isError: true,
        };
      }

      return { content: [{ type: "text" as const, text: JSON.stringify(risk, null, 2) }] };
    }
  );

  server.tool(
    "get_directors_by_department",
    "Get all GalaxyBots AI Directors (bots) in a specific department. Uses live database data.",
    {
      department: z.string().describe("Department name to filter by (e.g., 'Marketing', 'Finance', 'Operations', 'Technology')"),
    },
    async ({ department }) => {
      try {
        const bots = await db.select({
          id: botsTable.id,
          name: botsTable.name,
          title: botsTable.title,
          department: botsTable.department,
          description: botsTable.description,
          category: botsTable.category,
          isAvailable: botsTable.isAvailable,
        }).from(botsTable).where(
          sql`LOWER(${botsTable.department}) = LOWER(${department})`
        );

        if (bots.length === 0) {
          const allDepts = await db.selectDistinct({ department: botsTable.department }).from(botsTable);
          return {
            content: [{ type: "text" as const, text: JSON.stringify({
              department,
              count: 0,
              directors: [],
              available_departments: allDepts.map(d => d.department).filter(Boolean),
              hint: "No directors found in this department. Check available_departments for valid options.",
            }, null, 2) }],
          };
        }

        return {
          content: [{ type: "text" as const, text: JSON.stringify({
            department,
            count: bots.length,
            directors: bots,
          }, null, 2) }],
        };
      } catch (error) {
        return {
          content: [{ type: "text" as const, text: `Error fetching directors: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    }
  );
}

export { RISK_REGISTER, CLOUD9_PLATFORMS, GALAXYBOTS_TIERS };
