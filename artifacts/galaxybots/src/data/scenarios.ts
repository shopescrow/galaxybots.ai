export type ScenarioCategory =
  | "Lead Generation"
  | "Competitive Intelligence"
  | "Customer Retention"
  | "Reputation Management"
  | "Marketing Campaigns"
  | "Partnerships"
  | "Operations"
  | "Market Expansion"
  | "Customer Service";

export type ScenarioDifficulty = "Tactical" | "Strategic" | "Critical";

export interface Scenario {
  id: string;
  clientSlug: string;
  companyName: string;
  title: string;
  category: ScenarioCategory;
  difficulty: ScenarioDifficulty;
  situation: string;
  actions: string[];
  missionObjective: string;
}

export const SCENARIO_CLIENTS = [
  {
    slug: "7lawn11",
    name: "7 Lawn 11",
    website: "7lawn11.com",
    description: "London, Ontario landscaping & snow removal, 15+ years, A+ BBB rated",
  },
  {
    slug: "family-movers",
    name: "Family Movers Canada",
    website: "familymoverscanada.replit.app",
    description: "Canadian moving company serving families nationwide",
  },
] as const;

export const SCENARIOS: Scenario[] = [
  {
    id: "7lawn11-spring-leads",
    clientSlug: "7lawn11",
    companyName: "7 Lawn 11",
    title: "Spring Lead Generation",
    category: "Lead Generation",
    difficulty: "Tactical",
    situation:
      "Spring is approaching and 7 Lawn 11 needs to fill the residential lawn care roster for East London, Ontario. The company has 15+ years of experience and an A+ BBB rating but needs a targeted outreach push to capture new residential clients before competitors lock them in.",
    actions: [
      "Research residential properties in East London needing lawn care",
      "Build a targeted outreach list with property details",
      "Draft personalized cold emails referencing specific property needs",
      "Segment prospects by service type (mowing, fertilization, aeration)",
    ],
    missionObjective:
      "You are executing a live mission for 7 Lawn 11 (7lawn11.com), a landscaping and snow removal company in London, Ontario with 15+ years of experience and an A+ BBB rating. MISSION: Research residential properties in East London, Ontario that show signs of needing professional lawn care services. Build a targeted outreach list of at least 20 prospects. Draft personalized email templates referencing each prospect's specific property needs. Segment the list by service type (mowing, fertilization, aeration, full-service). Deliver a ready-to-execute outreach campaign.",
  },
  {
    id: "7lawn11-competitor-pricing",
    clientSlug: "7lawn11",
    companyName: "7 Lawn 11",
    title: "Competitor Pricing Analysis",
    category: "Competitive Intelligence",
    difficulty: "Strategic",
    situation:
      "7 Lawn 11 is losing bids on mid-range residential contracts. They suspect competitors are undercutting on price but don't have data to prove it or to adjust their positioning. A comprehensive pricing matrix is needed to understand market rates and identify where 7 Lawn 11 has pricing power.",
    actions: [
      "Research top 5 landscaping competitors in London, Ontario",
      "Build a detailed pricing matrix across service categories",
      "Identify areas where 7 Lawn 11 can win more bids",
      "Recommend pricing adjustments and value-add positioning",
    ],
    missionObjective:
      "You are executing a live mission for 7 Lawn 11 (7lawn11.com), a landscaping and snow removal company in London, Ontario with 15+ years of experience and an A+ BBB rating. MISSION: Research the top 5 landscaping and lawn care competitors in London, Ontario. Build a comprehensive pricing matrix comparing rates across all major service categories (mowing, trimming, fertilization, aeration, leaf removal, snow removal). Analyze where 7 Lawn 11 is competitively positioned and where they're being undercut. Recommend specific pricing adjustments and value-add strategies to win more bids.",
  },
  {
    id: "7lawn11-snow-renewals",
    clientSlug: "7lawn11",
    companyName: "7 Lawn 11",
    title: "Snow Removal Contract Renewals",
    category: "Customer Retention",
    difficulty: "Strategic",
    situation:
      "Winter season contracts are expiring. 7 Lawn 11 needs to proactively reach out to prior commercial snow removal clients before they sign with competitors. Some accounts may be at risk due to service issues or competitor offers.",
    actions: [
      "Identify prior commercial snow removal clients from CRM",
      "Draft personalized renewal outreach for each account",
      "Flag at-risk accounts based on service history",
      "Create an early-bird renewal incentive proposal",
    ],
    missionObjective:
      "You are executing a live mission for 7 Lawn 11 (7lawn11.com), a landscaping and snow removal company in London, Ontario with 15+ years of experience and an A+ BBB rating. MISSION: Identify all prior commercial snow removal clients. Draft personalized renewal outreach emails for each account, referencing their specific service history. Flag accounts that may be at risk of churning based on past service issues, late payments, or competitor activity. Propose an early-bird renewal incentive structure to lock in contracts before the competition.",
  },
  {
    id: "7lawn11-review-recovery",
    clientSlug: "7lawn11",
    companyName: "7 Lawn 11",
    title: "Review Recovery Campaign",
    category: "Reputation Management",
    difficulty: "Tactical",
    situation:
      "7 Lawn 11's online reputation needs active management. Some recent Google and BBB reviews are negative and unanswered. The company needs a systematic approach to respond to criticism and proactively generate positive reviews from satisfied customers.",
    actions: [
      "Monitor recent Google and BBB reviews",
      "Draft professional responses to negative reviews",
      "Build a follow-up email sequence to generate 5-star reviews",
      "Create a review request workflow for field crews",
    ],
    missionObjective:
      "You are executing a live mission for 7 Lawn 11 (7lawn11.com), a landscaping and snow removal company in London, Ontario with 15+ years of experience and an A+ BBB rating. MISSION: Audit all recent Google and BBB reviews for 7 Lawn 11. Draft professional, empathetic responses to every negative review. Build a 3-email follow-up sequence designed to encourage satisfied customers to leave 5-star reviews. Create a simple review request workflow that field crews can execute after completing a job.",
  },
  {
    id: "7lawn11-eavestrough",
    clientSlug: "7lawn11",
    companyName: "7 Lawn 11",
    title: "Eavestrough Cleaning Campaign",
    category: "Marketing Campaigns",
    difficulty: "Tactical",
    situation:
      "Fall is the prime season for eavestrough (gutter) cleaning. 7 Lawn 11 offers this service but hasn't run a focused campaign. Past residential customers are the best audience — they already trust the company and many have homes that need this seasonal service.",
    actions: [
      "Draft ad copy for fall eavestrough cleaning promotion",
      "Segment the CRM for past residential customers",
      "Schedule email and SMS outreach campaign",
      "Create a landing page brief for the seasonal offer",
    ],
    missionObjective:
      "You are executing a live mission for 7 Lawn 11 (7lawn11.com), a landscaping and snow removal company in London, Ontario with 15+ years of experience and an A+ BBB rating. MISSION: Build a complete fall eavestrough (gutter) cleaning campaign. Draft compelling ad copy for email, SMS, and social media. Segment the CRM to target past residential customers who are most likely to need this service. Create a campaign schedule with optimal send times. Draft a landing page brief with pricing, before/after messaging, and a clear call-to-action.",
  },
  {
    id: "fm-agent-partnerships",
    clientSlug: "family-movers",
    companyName: "Family Movers Canada",
    title: "Real Estate Agent Partnership Program",
    category: "Partnerships",
    difficulty: "Strategic",
    situation:
      "Family Movers Canada wants to build a referral pipeline with real estate agents. Agents are a high-value channel because they influence moving decisions at the point of sale. The company needs to identify top agents in target cities and propose a mutually beneficial referral arrangement.",
    actions: [
      "Identify top 20 real estate agents in target cities",
      "Research each agent's transaction volume and specialties",
      "Draft personalized partnership outreach emails",
      "Propose a referral fee structure and co-marketing plan",
    ],
    missionObjective:
      "You are executing a live mission for Family Movers Canada (familymoverscanada.replit.app), a Canadian moving company. MISSION: Identify the top 20 real estate agents in Family Movers Canada's target cities. Research each agent's transaction volume, specialties, and online presence. Draft personalized partnership outreach emails proposing a referral arrangement with specific terms. Create a referral fee structure and co-marketing plan that benefits both parties.",
  },
  {
    id: "fm-q2-preparation",
    clientSlug: "family-movers",
    companyName: "Family Movers Canada",
    title: "Q2 Moving Season Preparation",
    category: "Operations",
    difficulty: "Critical",
    situation:
      "Q2 is peak moving season in Canada. Family Movers Canada needs to analyze projected demand, identify staffing and resource gaps, and build a recruitment plan to ensure they can handle the volume without service quality issues.",
    actions: [
      "Analyze Q2 demand signals and historical patterns",
      "Identify staffing and resource gaps",
      "Build a crew recruitment outreach plan",
      "Create a capacity planning framework",
    ],
    missionObjective:
      "You are executing a live mission for Family Movers Canada (familymoverscanada.replit.app), a Canadian moving company. MISSION: Analyze Q2 moving season demand using historical patterns and current market signals. Identify specific staffing and resource gaps — how many additional crew members, trucks, and equipment are needed. Build a detailed crew recruitment outreach plan including job posting copy, target channels, and interview screening criteria. Create a capacity planning framework to prevent overbooking.",
  },
  {
    id: "fm-winback",
    clientSlug: "family-movers",
    companyName: "Family Movers Canada",
    title: "Customer Win-Back Campaign",
    category: "Customer Retention",
    difficulty: "Tactical",
    situation:
      "Family Movers Canada has a database of past customers who moved 2+ years ago and haven't returned. Many of these customers may be planning another move or know someone who is. A targeted re-engagement campaign could reactivate this dormant segment.",
    actions: [
      "Identify customers who moved 2+ years ago with no return",
      "Draft a 3-part re-engagement email sequence",
      "Create a referral incentive for past customers",
      "Build a win-back offer with exclusive pricing",
    ],
    missionObjective:
      "You are executing a live mission for Family Movers Canada (familymoverscanada.replit.app), a Canadian moving company. MISSION: Identify all customers who used Family Movers Canada 2+ years ago and have not returned. Draft a 3-part re-engagement email sequence: (1) a check-in asking if they're planning another move, (2) a referral incentive offering a discount for referring friends, and (3) an exclusive returning-customer offer. Build segmentation criteria and recommend optimal send timing.",
  },
  {
    id: "fm-calgary-expansion",
    clientSlug: "family-movers",
    companyName: "Family Movers Canada",
    title: "New Market Expansion Analysis",
    category: "Market Expansion",
    difficulty: "Critical",
    situation:
      "Family Movers Canada is considering expanding into Calgary. Before committing resources, they need a thorough market analysis covering competitors, pricing landscape, demand signals, and risks specific to the Calgary moving market.",
    actions: [
      "Research Calgary moving market size and growth",
      "Map existing competitors and their market share",
      "Analyze pricing landscape and service gaps",
      "Assess risks, regulatory requirements, and entry barriers",
    ],
    missionObjective:
      "You are executing a live mission for Family Movers Canada (familymoverscanada.replit.app), a Canadian moving company. MISSION: Conduct a comprehensive market analysis for entering the Calgary, Alberta moving market. Research the total addressable market, growth trends, and seasonal patterns. Map all major competitors with their pricing, service offerings, and market share estimates. Identify service gaps that Family Movers Canada could exploit. Assess risks including regulatory requirements, insurance needs, and entry barriers. Deliver a go/no-go recommendation with supporting data.",
  },
  {
    id: "fm-damage-claim",
    clientSlug: "family-movers",
    companyName: "Family Movers Canada",
    title: "Damage Claim Response Protocol",
    category: "Customer Service",
    difficulty: "Strategic",
    situation:
      "A customer has filed a damage claim after a recent move. Family Movers Canada needs to handle this professionally — researching best practices, drafting an appropriate resolution response, and building a repeatable claims workflow to prevent future issues and protect the company's reputation.",
    actions: [
      "Research moving industry best practices for damage claims",
      "Draft a professional resolution response to the customer",
      "Propose a claims processing workflow",
      "Create a damage prevention checklist for crews",
    ],
    missionObjective:
      "You are executing a live mission for Family Movers Canada (familymoverscanada.replit.app), a Canadian moving company. MISSION: A customer has filed a damage claim after a recent move. Research moving industry best practices for handling damage claims including documentation, liability assessment, and resolution timelines. Draft a professional, empathetic resolution response to the customer. Propose a complete claims processing workflow from initial report to resolution. Create a damage prevention checklist that crew leads can use before, during, and after every move.",
  },
];

export const SCENARIO_CATEGORIES: ScenarioCategory[] = [
  "Lead Generation",
  "Competitive Intelligence",
  "Customer Retention",
  "Reputation Management",
  "Marketing Campaigns",
  "Partnerships",
  "Operations",
  "Market Expansion",
  "Customer Service",
];

export function getScenariosByClient(clientSlug: string): Scenario[] {
  return SCENARIOS.filter((s) => s.clientSlug === clientSlug);
}

export function getScenariosByCategory(category: ScenarioCategory): Scenario[] {
  return SCENARIOS.filter((s) => s.category === category);
}

export function getScenarioById(id: string): Scenario | undefined {
  return SCENARIOS.find((s) => s.id === id);
}
