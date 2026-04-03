import { db, missionPlaybooksTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

type PlaybookStep = { order: number; role: string; objective: string };

function dirs(input: string): PlaybookStep[] {
  return input.split(",").map((d, i) => {
    const m = d.trim().match(/^(.+?)\s*\((.+?)\)$/);
    return m
      ? { order: i + 1, role: m[1].trim(), objective: m[2].trim() }
      : { order: i + 1, role: d.trim(), objective: "AI Director" };
  });
}

const BUILT_IN_PLAYBOOKS = [

  // ─────────────────────────────────────────────────────────────────────────────
  // FORTUNE 50 — Playbooks 01–20
  // ─────────────────────────────────────────────────────────────────────────────
  {
    name: "Quarterly Strategy War Room",
    description: "Compress 6 weeks of strategic planning into 5 days.\n\nThe Play:\nDay 1: Deploy 15 AI Directors across Finance, Operations, Sales, Marketing, Product, and Risk to independently analyze current position and market dynamics\nDay 2: Virtual Boardroom convenes all 15 Directors for collaborative scenario planning—they debate, pressure-test, and align on 3 strategic paths\nDay 3: Human leadership reviews AI-recommended paths; asks \"What if we...\" questions; AI refines models overnight\nDay 4: Final strategic framework with risk-adjusted ROI for each initiative\nDay 5: Board-ready presentation with Q&A prep and counter-argument scenarios\n\nExpected Outcome: 70% faster strategic cycles; 3x more scenarios evaluated",
    category: "fortune50", isBuiltIn: true as const,
    steps: dirs("Chairman Atlas (facilitator), CFO Sentinel Marcus (financial modeling), FP&A Oracle Demi (scenario analysis), Risk Warden Okafor (threat assessment)"),
  },
  {
    name: "M&A Target Scoring Engine",
    description: "Evaluate 100+ acquisition targets simultaneously with 24-hour turnaround.\n\nThe Play:\nDeploy Prospector to scan 100+ potential targets across 9 AI platforms for market visibility, sentiment, and competitive positioning\nFP&A Oracle Demi builds financial models for each target in parallel\nGeneral Counsel Alexis flags regulatory red flags and integration risks\nVirtual Boardroom ranks targets using weighted scoring (strategic fit, financial return, integration complexity, regulatory risk)\nHuman team reviews top 10; AI provides detailed due diligence packets for each\n\nExpected Outcome: Evaluate 10x more targets; reduce due diligence time by 80%",
    category: "fortune50", isBuiltIn: true as const,
    steps: dirs("FP&A Oracle Demi (valuation), General Counsel Alexis (legal risk), Tech Visionary Zara (tech stack assessment), Growth Hawk Yusuf (market expansion potential)"),
  },
  {
    name: "Regulatory Response Accelerator",
    description: "Respond to regulatory inquiries within hours, not weeks.\n\nThe Play:\nGeneral Counsel Alexis ingests the regulatory notice and maps required responses across departments\nInstitutional Memory pulls all relevant internal communications, decisions, and compliance records\nLegal team of AI Directors drafts initial response with cited evidence\nRisk Warden Okafor stress-tests response for unintended admissions or exposure\nHuman General Counsel reviews AI-drafted response; final approval in <4 hours\n\nExpected Outcome: 90% faster regulatory response; reduced legal exposure",
    category: "fortune50", isBuiltIn: true as const,
    steps: dirs("General Counsel Alexis (lead), CISO Sentinel Nova (data security), Risk Warden Okafor (exposure analysis), Compliance Director (regulatory mapping)"),
  },
  {
    name: "Supply Chain Disruption War Room",
    description: "Respond to disruptions in real-time with actionable alternatives.\n\nThe Play:\nOperator Rex monitors supply chain telemetry and external signals (weather, geopolitics, supplier financials)\nUpon disruption alert, Virtual Boardroom convenes Operations, Logistics, Procurement, Finance, and Risk Directors\nAI models alternative sourcing, routing, and inventory reallocation in <15 minutes\nHuman supply chain leader reviews top 3 recommendations; AI executes approved changes\nPost-mortem: AI documents lessons learned and updates playbook\n\nExpected Outcome: Disruption response from days to minutes; 50% less financial impact",
    category: "fortune50", isBuiltIn: true as const,
    steps: dirs("Operator Rex (operations), CFO Sentinel Marcus (cost impact), Risk Warden Okafor (cascading risks), Logistics Director (routing optimization)"),
  },
  {
    name: "Competitive Intelligence Mesh",
    description: "Continuous, real-time intelligence on all competitors across all markets.\n\nThe Play:\nProspector continuously scans 9 AI platforms for competitor mentions, citations, and sentiment\nBingoLingo monitors competitor content output and flags strategic shifts\nAI Directors analyze patterns: pricing changes, new market entries, talent moves, partnership announcements\nWeekly Competitive Intelligence Brief generated automatically; human strategists receive alerts for critical changes\nQuarterly: Virtual Boardroom war-games competitor responses to your moves\n\nExpected Outcome: Real-time competitive awareness; 3x faster strategic counter-moves",
    category: "fortune50", isBuiltIn: true as const,
    steps: dirs("Growth Hawk Yusuf (market moves), Brand Maven Priya (positioning shifts), Product Oracle Sasha (product changes)"),
  },
  {
    name: "Investor Relations Insight Engine",
    description: "Prepare for earnings calls, analyst questions, and investor meetings with perfect foresight.\n\nThe Play:\nAI Directors analyze transcripts of every sell-side analyst call, investor conference, and competitor earnings\nIdentify emerging themes, questions, and concerns before they're asked\nGenerate \"Most Likely Questions\" with AI-drafted answers and supporting data\nHuman IR team reviews; AI refines based on feedback\nDuring live calls: Real-time suggestion engine for unexpected questions\n\nExpected Outcome: 100% question coverage; reduced stock volatility around earnings",
    category: "fortune50", isBuiltIn: true as const,
    steps: dirs("CFO Sentinel Marcus (financial narrative), FP&A Oracle Demi (guidance modeling), Closer King Rivera (analyst psychology)"),
  },
  {
    name: "Product Launch Battle Simulator",
    description: "War-game product launches against likely competitive responses before committing resources.\n\nThe Play:\nProduct Oracle Sasha defines the launch plan, positioning, and pricing\nVirtual Boardroom assigns 5 AI Directors to role-play as key competitors\nCompetitive Directors respond to your launch as their companies would—pricing changes, marketing counter-moves, feature announcements\nFinance models impact of each competitive scenario on revenue and share\nHuman team selects optimal launch strategy based on simulated outcomes\nAI generates contingency playbooks for each likely competitive response\n\nExpected Outcome: 80% fewer launch surprises; 2x ROI confidence",
    category: "fortune50", isBuiltIn: true as const,
    steps: dirs("Product Oracle Sasha (launch plan), Growth Hawk Yusuf (competitor role-play), CFO Sentinel Marcus (financial impact), Brand Maven Priya (positioning defense)"),
  },
  {
    name: "Talent Succession Risk Monitor",
    description: "Identify and mitigate leadership gaps before they become crises.\n\nThe Play:\nHR Director Amara analyzes organizational data: tenure, performance, flight risk indicators\nAI identifies \"single points of failure\"—roles where one departure creates critical exposure\nFor each at-risk role, AI generates: internal successor candidates with readiness scores; external market availability and estimated replacement cost; knowledge transfer plans to mitigate departure impact\nQuarterly review with human CHRO; AI updates risk scores continuously\nAutomated alerts when flight risk indicators spike for critical roles\n\nExpected Outcome: Zero unexpected critical role vacancies; 50% faster succession",
    category: "fortune50", isBuiltIn: true as const,
    steps: dirs("HR Director Amara (lead), Operator Rex (process continuity), FP&A Oracle Demi (replacement cost modeling)"),
  },
  {
    name: "Pricing Optimization Engine",
    description: "Dynamic, market-responsive pricing across thousands of SKUs and segments.\n\nThe Play:\nAI Directors analyze: competitor pricing (real-time), customer willingness-to-pay signals, elasticity by segment, inventory levels, production costs\nVP of Pricing (AI Director) runs 10,000+ pricing scenarios overnight\nRecommendations delivered by 6 AM: optimal price points by SKU, segment, and region\nHuman pricing team reviews exception cases; AI implements approved changes\nContinuous learning loop: Actual sales data improves next day's recommendations\n\nExpected Outcome: 3-7% margin improvement without volume loss",
    category: "fortune50", isBuiltIn: true as const,
    steps: dirs("VP of Pricing (pricing scenarios), CFO Sentinel Marcus (margin impact), Growth Hawk Yusuf (volume trade-offs)"),
  },
  {
    name: "Annual Planning Compressor",
    description: "Complete annual planning in 4 weeks instead of 4 months.\n\nThe Play:\nWeek 1: AI Directors independently draft departmental plans based on corporate strategy\nWeek 2: Virtual Boardroom identifies conflicts, dependencies, and resource gaps across all departments\nWeek 3: Human leaders review AI-generated plans; AI incorporates feedback overnight\nWeek 4: Final integrated plan with cross-departmental alignment, risk assessment, and quarterly milestones\nAI generates board presentation, departmental playbooks, and OKR tracking templates\n\nExpected Outcome: 4x faster annual planning; zero cross-department conflicts",
    category: "fortune50", isBuiltIn: true as const,
    steps: dirs("FP&A Oracle Demi (resource allocation), Operator Rex (operational plans), Chairman Atlas (cross-functional alignment)"),
  },
  {
    name: "Crisis Communication Commander",
    description: "Respond to PR crises within hours with coordinated, vetted messaging.\n\nThe Play:\nUpon crisis alert, Brand Maven Priya drafts initial holding statement (5 minutes)\nGeneral Counsel Alexis reviews for legal exposure (10 minutes)\nRisk Warden Okafor assesses escalation scenarios (15 minutes)\nVirtual Boardroom generates 3 communication paths: minimal, standard, full transparency\nHuman leadership selects path; AI drafts all communication assets (press release, internal memo, social, talking points)\nReal-time sentiment monitoring triggers message adjustments as crisis evolves\n\nExpected Outcome: Response in <4 hours vs industry average 48 hours",
    category: "fortune50", isBuiltIn: true as const,
    steps: dirs("Brand Maven Priya (messaging), General Counsel Alexis (legal review), Risk Warden Okafor (escalation), Closer King Rivera (stakeholder management)"),
  },
  {
    name: "Board Meeting Pre-Flight",
    description: "Predict every board question and have answers ready.\n\nThe Play:\nAI Directors analyze 5 years of board transcripts, meeting minutes, and director biographies\nIdentify each director's: pet topics, questioning patterns, areas of expertise, known concerns\nGenerate personalized \"Most Likely Questions\" for each board member\nDraft responses with supporting data; flag areas where board may push back\nHuman CEO and CFO review; AI incorporates feedback\nDuring board meeting: Real-time suggestion engine for unexpected questions\n\nExpected Outcome: 95% of board questions anticipated; reduced meeting friction",
    category: "fortune50", isBuiltIn: true as const,
    steps: dirs("Chairman Atlas (board psychology), CFO Sentinel Marcus (financial questions), General Counsel Alexis (governance), FP&A Oracle Demi (forward-looking statements)"),
  },
  {
    name: "Innovation Funnel Accelerator",
    description: "Screen 1,000+ ideas to identify top 10 in 30 days.\n\nThe Play:\nBingoLingo scans internal idea submissions, patent databases, academic research, competitor patents, and startup activity\nAI Directors apply 9 screening filters: technical feasibility, market size, competitive advantage, regulatory path, strategic fit, ROI potential, timeline, resource requirements, risk\nTop 100 ideas advance to Virtual Boardroom for collaborative scoring\nTop 10 presented to human innovation committee with detailed business cases\nAI generates prototype specifications and test plans for approved ideas\n\nExpected Outcome: 10x faster idea screening; 3x higher success rate",
    category: "fortune50", isBuiltIn: true as const,
    steps: dirs("Product Oracle Sasha (feasibility), Tech Visionary Zara (technical path), CFO Sentinel Marcus (ROI), Risk Warden Okafor (failure scenarios)"),
  },
  {
    name: "Customer Churn Prevention Unit",
    description: "Identify at-risk customers 90 days before they leave—and save them.\n\nThe Play:\nAI monitors: usage patterns, support ticket sentiment, payment history, engagement scores, competitor mentions in customer communications\nChurn Risk Score calculated weekly for every enterprise customer\nFor high-risk customers: AI diagnoses root cause and recommends intervention playbook (discount, feature acceleration, executive call, product training)\nAccount teams receive automated playbooks tailored to each customer\nAI tracks intervention effectiveness and improves prediction models\n\nExpected Outcome: 30% reduction in enterprise churn; 60-day early warning",
    category: "fortune50", isBuiltIn: true as const,
    steps: dirs("Closer King Rivera (retention strategy), Customer Success Director (intervention design), Product Oracle Sasha (feature alignment)"),
  },
  {
    name: "Merger Integration Orchestrator",
    description: "Execute Day 1 integration across 50+ workstreams simultaneously.\n\nThe Play:\nUpon deal close, AI Directors ingest both companies' org charts, systems, processes, and cultures\nVirtual Boardroom identifies 500+ integration tasks across HR, IT, Finance, Operations, Sales, Marketing, Legal\nAI generates Day 1, Day 30, Day 90, Day 180 integration playbooks with dependencies and owners\nDaily standup: AI tracks progress, flags delays, reallocates resources automatically\nHuman integration leader reviews AI recommendations; AI executes approved changes\nCultural integration: AI monitors sentiment and flags friction points before they escalate\n\nExpected Outcome: 2x faster integration; 50% less productivity loss",
    category: "fortune50", isBuiltIn: true as const,
    steps: dirs("Operator Rex (workstream coordination), HR Director Amara (cultural integration), Tech Visionary Zara (systems integration), General Counsel Alexis (legal entity consolidation)"),
  },
  {
    name: "Regulatory Horizon Scanner",
    description: "Anticipate regulatory changes 12-24 months in advance.\n\nThe Play:\nAI monitors: legislative calendars, regulatory agency agendas, comment periods, political shifts, global regulatory trends\nFor each emerging regulation, AI assesses: probability of enactment, timeline, business impact, competitive implications\nVirtual Boardroom develops response strategies and advocacy positions\nQuarterly: Human government affairs team reviews AI-prioritized regulations\nAI generates draft comment letters, testimony, and lobbying materials\n\nExpected Outcome: 18-month regulatory early warning; proactive vs reactive posture",
    category: "fortune50", isBuiltIn: true as const,
    steps: dirs("General Counsel Alexis (regulatory mapping), Risk Warden Okafor (impact assessment), Government Affairs Director (advocacy strategy)"),
  },
  {
    name: "Workforce Productivity Navigator",
    description: "Identify productivity bottlenecks and optimization opportunities across 100,000+ employees.\n\nThe Play:\nAI analyzes: meeting patterns, collaboration networks, tool usage, project velocity, output quality metrics\nIdentify productivity drains: excessive meetings, approval bottlenecks, information silos, redundant tools\nFor each bottleneck, AI recommends specific interventions with projected productivity gain\nDepartment leaders review AI recommendations; AI tracks implementation and ROI\nContinuous optimization: AI learns what interventions work and refines recommendations\n\nExpected Outcome: 10-15% productivity gain; $1B+ annual value at Fortune 50 scale",
    category: "fortune50", isBuiltIn: true as const,
    steps: dirs("Operator Rex (process optimization), HR Director Amara (workforce analytics), Tech Visionary Zara (tool efficiency)"),
  },
  {
    name: "Earnings Call Defense System",
    description: "Prepare for every possible earnings call question—especially the hard ones.\n\nThe Play:\nAI analyzes every analyst note, investor letter, and competitor call from the past 12 months\nIdentify \"dark questions\"—topics no one is asking yet but should be\nGenerate 200+ potential questions across 9 categories: financial, strategic, competitive, regulatory, operational, talent, technology, ESG, M&A\nFor each question: AI drafts response, flags supporting data, identifies vulnerability\nHuman team rehearses with AI role-playing as 10 different analyst personas\nDuring live call: AI provides real-time response suggestions for unexpected questions\n\nExpected Outcome: Zero \"no comment\" answers; analyst confidence increases",
    category: "fortune50", isBuiltIn: true as const,
    steps: dirs("CFO Sentinel Marcus (financial), Closer King Rivera (analyst psychology), Brand Maven Priya (message discipline)"),
  },
  {
    name: "Strategic Partnership Evaluator",
    description: "Assess 50+ partnership opportunities simultaneously with consistent criteria.\n\nThe Play:\nProspector scans for potential partners across AI platforms, news, and market signals\nFor each opportunity, AI Directors assess: strategic fit, financial return, integration complexity, cultural alignment, regulatory risk, competitive implications\nVirtual Boardroom ranks partnerships using weighted scoring model\nHuman partnership team reviews top 10; AI provides term sheet drafts and negotiation playbooks\nPost-signing: AI tracks partnership performance against KPIs and flags issues early\n\nExpected Outcome: 5x faster partnership evaluation; 80% fewer failed partnerships",
    category: "fortune50", isBuiltIn: true as const,
    steps: dirs("Growth Hawk Yusuf (strategic fit), CFO Sentinel Marcus (financial modeling), General Counsel Alexis (agreement terms), Risk Warden Okafor (dependency risk)"),
  },
  {
    name: "ESG Intelligence Core",
    description: "Real-time ESG monitoring, reporting, and improvement recommendations.\n\nThe Play:\nAI monitors: regulatory ESG requirements (all jurisdictions), investor ESG expectations, peer commitments, NGO campaigns, media sentiment\nContinuous ESG score calculation across environmental, social, and governance pillars\nVirtual Boardroom identifies gaps between current performance and emerging expectations\nGenerate prioritized improvement initiatives with cost-benefit analysis\nAutomated ESG report generation for CDP, SASB, TCFD, and other frameworks\nReal-time alerting for ESG incidents or reputation threats\n\nExpected Outcome: Real-time ESG visibility; reduced reporting cost by 80%; improved ratings",
    category: "fortune50", isBuiltIn: true as const,
    steps: dirs("ESG Director (lead), Risk Warden Okafor (reputation), General Counsel Alexis (compliance), Brand Maven Priya (stakeholder communication)"),
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // CEO / ENTERPRISE STRATEGY — Playbooks 21–35
  // ─────────────────────────────────────────────────────────────────────────────
  {
    name: "Corporate Narrative Weaving",
    description: "Maintain a consistent, compelling corporate story across all channels and stakeholders.\n\nThe Play: AI Directors ingest all internal communications, external messaging, investor calls, and media coverage. Identify narrative drift or inconsistency. Virtual Boardroom generates unified narrative framework with channel-specific adaptations. Weekly narrative health score.\n\nMeasurable KPIs: Narrative consistency score (target: 95%), message recall rate (+30%), brand sentiment stability (±5% variance)\nExpected Outcome: Consistent messaging; 50% reduction in communication conflicts\nTime to Value: 30 days",
    category: "ceo", isBuiltIn: true as const,
    steps: dirs("Brand Maven Priya (narrative consistency), Chairman Atlas (strategic alignment), Magnus Drake (channel adaptation)"),
  },
  {
    name: "Board Dynamics Optimizer",
    description: "Improve board effectiveness by analyzing interaction patterns and decision quality.\n\nThe Play: AI analyzes board meeting transcripts, voting patterns, and intervention effectiveness. Identify which directors dominate, which defer, and where groupthink occurs. Recommend meeting structure changes, pre-reading adjustments, and discussion facilitation techniques.\n\nMeasurable KPIs: Decision quality score (+40%), meeting efficiency (time-to-decision -50%), director participation equity index\nExpected Outcome: 40% more efficient board meetings; better decision diversity\nTime to Value: 60 days",
    category: "ceo", isBuiltIn: true as const,
    steps: dirs("Chairman Atlas (board psychology), HR Director Amara (participation equity), Risk Warden Okafor (groupthink detection)"),
  },
  {
    name: "Stakeholder Sentiment Mesh",
    description: "Real-time sentiment analysis across all stakeholder groups (customers, employees, investors, regulators, media, NGOs).\n\nThe Play: Continuous monitoring of 50,000+ sources across 6 stakeholder categories. AI identifies sentiment shifts before they become trends. Automated alerts when any stakeholder segment moves outside normal range. Monthly Stakeholder Sentiment Report with recommended actions.\n\nMeasurable KPIs: Early warning lead time (target: 90 days), sentiment prediction accuracy (>85%), response time to shifts (-70%)\nExpected Outcome: 90-day early warning on stakeholder issues; proactive relationship management\nTime to Value: 45 days",
    category: "ceo", isBuiltIn: true as const,
    steps: dirs("Brand Maven Priya (sentiment monitoring), Risk Warden Okafor (early warning alerts), Closer King Rivera (relationship management)"),
  },
  {
    name: "CEO Time Allocation Optimizer",
    description: "Optimize CEO time for maximum enterprise value.\n\nThe Play: AI analyzes CEO calendar, email, and decision logs against enterprise value creation. Identify low-value activities that can be delegated or eliminated. Recommend optimal time allocation across strategy, talent, external relations, and operations. Weekly optimization suggestions.\n\nMeasurable KPIs: High-value activity time (+20%), decisions per hour (+35%), strategic initiative velocity (+50%)\nExpected Outcome: 20% more time on high-value activities; $100M+ incremental value\nTime to Value: 14 days",
    category: "ceo", isBuiltIn: true as const,
    steps: dirs("Operator Rex (calendar analysis), FP&A Oracle Demi (value creation mapping), Magnus Drake (delegation strategy)"),
  },
  {
    name: "Culture Health Diagnostic",
    description: "Quantify and improve organizational culture across 100,000+ employees.\n\nThe Play: AI analyzes internal communications, Slack/Teams messages, survey data, turnover patterns, and promotion velocity. Generate Culture Health Index (0-100) with sub-scores for psychological safety, innovation appetite, execution rigor, and inclusion. Monthly diagnostic with targeted interventions.\n\nMeasurable KPIs: Culture Health Index (+30% YoY), employee net promoter score (eNPS) +15 pts, voluntary turnover -25%\nExpected Outcome: Quantified culture metrics; 30% improvement in targeted dimensions\nTime to Value: 60 days",
    category: "ceo", isBuiltIn: true as const,
    steps: dirs("HR Director Amara (culture data analysis), Operator Rex (execution rigor scoring), Brand Maven Priya (internal communication health)"),
  },
  {
    name: "Strategic Bet Portfolio Manager",
    description: "Manage strategic initiatives as a financial portfolio—with risk-adjusted ROI, probability of success, and strategic alignment score. AI recommends portfolio rebalancing quarterly.\n\nMeasurable KPIs: Portfolio ROI (+500bps), initiative success rate (+35%), resource allocation efficiency (+40%)\nExpected Outcome: 2x strategic initiative success rate\nTime to Value: 90 days",
    category: "ceo", isBuiltIn: true as const,
    steps: dirs("FP&A Oracle Demi (ROI modeling), CFO Sentinel Marcus (capital allocation), Risk Warden Okafor (bet risk assessment)"),
  },
  {
    name: "Foresight-Driven Strategy Forums",
    description: "Embed strategic foresight into quarterly planning.\n\nThe Play: Adopt TRENDS' foresight methodology: scan global trends, identify drivers of change, model alternative futures, stress-test current strategy against each scenario.\n\nMeasurable KPIs: Strategic surprises (-60%), scenario coverage (10+ futures), strategic agility score\nExpected Outcome: Proactive vs. reactive strategy posture\nTime to Value: 120 days",
    category: "ceo", isBuiltIn: true as const,
    steps: dirs("Chairman Atlas (scenario facilitation), Magnus Drake (global trend analysis), Risk Warden Okafor (strategy stress-testing)"),
  },
  {
    name: "Algorithmic State Readiness",
    description: "Prepare for AI-driven governance and regulatory shifts.\n\nThe Play: Based on TRENDS' \"Algorithmic State\" framework, map how AI and machine intelligence will reshape your regulatory and competitive landscape. Build response playbooks.\n\nMeasurable KPIs: Regulatory exposure reduction (-40%), policy influence score, compliance lead time (+6 months)\nExpected Outcome: First-mover advantage in AI governance\nTime to Value: 180 days",
    category: "ceo", isBuiltIn: true as const,
    steps: dirs("General Counsel Alexis (regulatory landscape mapping), Tech Visionary Zara (AI governance assessment), Government Affairs Director (advocacy)"),
  },
  {
    name: "AI Strategy Roadmap",
    description: "Build a responsible, scalable AI strategy using Info-Tech's 4-step framework: (1) define AI vision and guiding principles, (2) assess AI maturity across governance/data/tech/skills, (3) prioritize use cases by impact/feasibility, (4) develop execution roadmap.\n\nMeasurable KPIs: AI maturity score (+2 levels), use case pipeline value ($500M+), governance coverage (100%)\nExpected Outcome: Enterprise-wide AI readiness\nTime to Value: 180 days",
    category: "ceo", isBuiltIn: true as const,
    steps: dirs("Tech Visionary Zara (AI maturity assessment), Product Oracle Sasha (use case prioritization), CISO Sentinel Nova (governance and risk)"),
  },
  {
    name: "Domain-Specific Model Strategy",
    description: "Deploy specialized AI models for competitive advantage. Gartner predicts >50% of enterprise AI models will be domain-specific by 2028. Identify high-value domains for custom model development. Build or partner for DSLMs.\n\nMeasurable KPIs: Model accuracy (+40% vs. general models), inference cost (-60%), time-to-value for new use cases (-70%)\nExpected Outcome: Proprietary AI capabilities competitors cannot replicate\nTime to Value: 270 days",
    category: "ceo", isBuiltIn: true as const,
    steps: dirs("Tech Visionary Zara (domain model selection), Product Oracle Sasha (use case mapping), CISO Sentinel Nova (security and compliance)"),
  },
  {
    name: "Geopatriation Risk Management",
    description: "Navigate shifting geopolitical tech landscape. Gartner predicts >75% of European and Middle Eastern enterprises will geopatriate workloads by 2030. Map sovereign AI requirements, assess vendor geography risks, build regional infrastructure strategy.\n\nMeasurable KPIs: Geopolitical risk exposure (-60%), compliance coverage (100% of regions), infrastructure redundancy score\nExpected Outcome: Resilient, compliant global operations\nTime to Value: 365 days",
    category: "ceo", isBuiltIn: true as const,
    steps: dirs("General Counsel Alexis (sovereign compliance mapping), CISO Sentinel Nova (vendor geography risk), Tech Visionary Zara (infrastructure strategy)"),
  },
  {
    name: "Sovereign AI Capability Building",
    description: "Develop independent AI capabilities aligned with Tony Blair Institute framework. No country or company can be fully self-sufficient in AI. Instead, identify areas of comparative advantage and build regulation, standards, and procurement within those domains.\n\nMeasurable KPIs: Strategic AI dependencies (-50%), proprietary model portfolio (+5/year), regulatory influence score\nExpected Outcome: Strategic AI autonomy without isolation\nTime to Value: 365 days",
    category: "ceo", isBuiltIn: true as const,
    steps: dirs("Tech Visionary Zara (AI capability inventory), General Counsel Alexis (standards and procurement), Government Affairs Director (policy influence)"),
  },
  {
    name: "CEO Shadow AI Detection & Integration",
    description: "Turn invisible innovation into competitive advantage. The shadow AI economy is an $8.1B signal that employees are solving problems faster than official channels. Deploy AI observability to detect unauthorized usage, then convert successful shadow workflows into compliant enterprise capabilities.\n\nMeasurable KPIs: Shadow AI visibility (100% detection), conversion rate to enterprise (target: 30%), productivity gain capture (+$50M)\nExpected Outcome: Innovation without regulatory exposure\nTime to Value: 90 days",
    category: "ceo", isBuiltIn: true as const,
    steps: dirs("CISO Sentinel Nova (shadow AI observability), Tech Visionary Zara (workflow conversion), Operator Rex (enterprise integration)"),
  },
  {
    name: "Multiagent System Orchestration",
    description: "Deploy collaborative AI agents for complex workflows. 2026 is the year of Agentic AI. Build multiagent systems where specialized AI agents collaborate on shared goals, handling routine tasks autonomously while humans focus on exception handling.\n\nMeasurable KPIs: Task automation rate (target: 60%), human exception handling time (-80%), agent collaboration efficiency score\nExpected Outcome: 40 minutes saved per employee interaction\nTime to Value: 180 days",
    category: "ceo", isBuiltIn: true as const,
    steps: dirs("Tech Visionary Zara (orchestration layer design), Operator Rex (workflow automation), Product Oracle Sasha (use case selection)"),
  },
  {
    name: "CEO Accountability for AI Outcomes",
    description: "Tie executive compensation to AI performance metrics. 95% of generative AI projects failed to show financial value within six months in 2025. Establish named ownership where performance metrics include AI results tied to executive compensation.\n\nMeasurable KPIs: AI initiative success rate (+50%), executive accountability coverage (100% of AI spend), ROI achievement rate (+300bps)\nExpected Outcome: Aligned incentives for AI value creation\nTime to Value: 30 days",
    category: "ceo", isBuiltIn: true as const,
    steps: dirs("Chairman Atlas (governance framework), CFO Sentinel Marcus (compensation modeling), FP&A Oracle Demi (AI ROI tracking)"),
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // CFO / FINANCE — Playbooks 36–50
  // ─────────────────────────────────────────────────────────────────────────────
  {
    name: "Risk-Adjusted ROI Framework",
    description: "Calculate true AI ROI accounting for safety and reliability. Apply AWS's ROI framework: map complete value chain from technical capabilities to business outcomes. Adjust gross benefits by hallucination rates, guardrail interventions, and model drift.\n\nMeasurable KPIs: Risk-adjusted ROI (target: 15%+), value chain visibility (100% of initiatives), investment confidence score\nExpected Outcome: Realistic AI investment evaluation\nTime to Value: 60 days",
    category: "cfo", isBuiltIn: true as const,
    steps: dirs("CFO Sentinel Marcus (ROI framework design), FP&A Oracle Demi (value chain mapping), Risk Warden Okafor (risk adjustment modeling)"),
  },
  {
    name: "TCO-Based AI Budgeting",
    description: "Capture total cost of AI ownership across development and operations. Unlike traditional SaaS (costly to build, cheap to run), AI is cheap to develop but expensive to operate. Account for inference fees, data labeling, prompt engineering, monitoring, change management, and human oversight (10-20% of original task time).\n\nMeasurable KPIs: TCO accuracy (+40% vs. peers), operational cost forecasting error (<5%), budget variance (-60%)\nExpected Outcome: No AI budget surprises\nTime to Value: 45 days",
    category: "cfo", isBuiltIn: true as const,
    steps: dirs("CFO Sentinel Marcus (TCO framework), FP&A Oracle Demi (operational cost forecasting), Tech Visionary Zara (infrastructure cost analysis)"),
  },
  {
    name: "Outcome-Based Pricing Negotiation",
    description: "Shift AI vendor contracts from licenses to outcomes. Leading organizations now pay based on what AI accomplishes—e.g., $1.40 per case resolution—instead of traditional licensing fees. Renegotiate vendor contracts to align incentives.\n\nMeasurable KPIs: Cost per outcome (-40%), vendor alignment score, contract value protection\nExpected Outcome: Pay only for value delivered\nTime to Value: 120 days",
    category: "cfo", isBuiltIn: true as const,
    steps: dirs("CFO Sentinel Marcus (contract restructuring), General Counsel Alexis (legal terms), Closer King Rivera (negotiation strategy)"),
  },
  {
    name: "AI Value Capture Attribution",
    description: "Isolate AI contribution from other initiatives. Use \"tagging frameworks\" to distinguish between machine-generated, human-verified, and human-enhanced phases of workflows. Track contribution by interaction type.\n\nMeasurable KPIs: Attribution accuracy (+60%), value capture rate (+35%), investment confidence\nExpected Outcome: Clear line-of-sight to AI ROI\nTime to Value: 90 days",
    category: "cfo", isBuiltIn: true as const,
    steps: dirs("FP&A Oracle Demi (attribution modeling), Tech Visionary Zara (tagging framework setup), Product Oracle Sasha (workflow phase tracking)"),
  },
  {
    name: "Productivity Leak Quantification",
    description: "Measure actual vs. theoretical productivity gains. Calculate true time savings as: Hours Saved × Hourly Rate × Utilization Rate. Utilization typically ranges 25-90%. Identify and close leakage points.\n\nMeasurable KPIs: Utilization rate (target: 80%+), productivity capture (+$100M), idle time (-50%)\nExpected Outcome: Realized productivity gains\nTime to Value: 60 days",
    category: "cfo", isBuiltIn: true as const,
    steps: dirs("FP&A Oracle Demi (leakage measurement), Operator Rex (process auditing), HR Director Amara (workforce utilization)"),
  },
  {
    name: "Generative Engine Optimization ROI",
    description: "Measure value of being cited by AI engines. Gartner predicts 25% drop in traditional search volume by 2026. Track citations across 9 AI platforms (ChatGPT, Gemini, Perplexity, etc.) and correlate with inbound leads and brand searches.\n\nMeasurable KPIs: Citation-to-lead conversion (+50%), brand search volume (+100%), GEO ROI (target: 5x)\nExpected Outcome: First-page ranking in AI answers\nTime to Value: 120 days",
    category: "cfo", isBuiltIn: true as const,
    steps: dirs("Brand Maven Priya (citation tracking), Prospector Engine (platform monitoring), FP&A Oracle Demi (GEO ROI modeling)"),
  },
  {
    name: "R&D Tax Credit Capture for AI",
    description: "Claim tax credits for AI development activities. Custom model development, multiagent orchestration, AI security frameworks, and hybrid computing architecture all qualify for R&D credits. Systematically document technical uncertainty and experimentation.\n\nMeasurable KPIs: R&D credit capture (+$20M/year), documentation coverage (100% of eligible work), audit defense readiness\nExpected Outcome: Non-dilutive funding for AI\nTime to Value: 180 days",
    category: "cfo", isBuiltIn: true as const,
    steps: dirs("CFO Sentinel Marcus (credit eligibility audit), Tech Visionary Zara (technical documentation), General Counsel Alexis (audit defense preparation)"),
  },
  {
    name: "Tariff Impact Modeling for Tech Spend",
    description: "Navigate 9-45% hardware cost increases. US tariff policies could increase hardware costs 9-45%. Model scenarios, build buffer into budgets, explore alternative sourcing and geopatriation options.\n\nMeasurable KPIs: Tariff exposure (-60%), cost variance (<5%), alternative sourcing coverage (3+ per component)\nExpected Outcome: Budget certainty despite trade volatility\nTime to Value: 90 days",
    category: "cfo", isBuiltIn: true as const,
    steps: dirs("CFO Sentinel Marcus (tariff scenario modeling), Operator Rex (alternative sourcing), Risk Warden Okafor (trade risk assessment)"),
  },
  {
    name: "Value-Realization Speed Tracking",
    description: "Measure how quickly AI benefits appear. Track \"value-realization speed\"—time from deployment to measurable benefit. Top performers see value in weeks for quick wins. Set 90-day targets.\n\nMeasurable KPIs: Value-realization speed (target: <90 days), quick win conversion rate (+50%), long-term initiative tracking\nExpected Outcome: Faster time-to-value\nTime to Value: 30 days (tracking setup)",
    category: "cfo", isBuiltIn: true as const,
    steps: dirs("FP&A Oracle Demi (value-realization timeline), Product Oracle Sasha (quick win identification), Closer King Rivera (benefit communication)"),
  },
  {
    name: "AI Portfolio Rebalancing",
    description: "Shift AI spend from periphery to core. 64% of AI budgets now allocated to core business operations. Audit current AI portfolio, rebalance from peripheral tasks to high-value core domains.\n\nMeasurable KPIs: Core vs. periphery ratio (target: 80/20), ROI by domain (+300bps for core), strategic alignment score\nExpected Outcome: AI investment where it matters most\nTime to Value: 120 days",
    category: "cfo", isBuiltIn: true as const,
    steps: dirs("CFO Sentinel Marcus (portfolio audit), FP&A Oracle Demi (ROI by domain), Tech Visionary Zara (capability reallocation)"),
  },
  {
    name: "Agentic AI ROI Framework",
    description: "Measure value from autonomous systems. 57% of organizations use Agentic AI, but only 10% see meaningful ROI. Track metrics like task completion rate, human intervention frequency, and decision quality.\n\nMeasurable KPIs: Agent autonomy rate (target: 80%), human intervention frequency (-70%), task quality score\nExpected Outcome: ROI from autonomous agents\nTime to Value: 180 days",
    category: "cfo", isBuiltIn: true as const,
    steps: dirs("Tech Visionary Zara (agent performance metrics), Operator Rex (autonomy rate tracking), FP&A Oracle Demi (ROI calculation)"),
  },
  {
    name: "Financial Sentiment Integration",
    description: "Incorporate market signals into financial planning. AI monitors analyst reports, investor calls, social sentiment, and macroeconomic indicators. Update forecasts dynamically based on sentiment shifts.\n\nMeasurable KPIs: Forecast accuracy (+30%), earnings surprise frequency (-80%), analyst rating improvement\nExpected Outcome: Market-aware financial planning\nTime to Value: 90 days",
    category: "cfo", isBuiltIn: true as const,
    steps: dirs("CFO Sentinel Marcus (forecast updating), FP&A Oracle Demi (sentiment modeling), Brand Maven Priya (market signal scanning)"),
  },
  {
    name: "Dynamic Capital Allocation",
    description: "Shift capital to highest-ROI AI initiatives in real-time. Traditional annual budgeting fails for fast-moving AI. Implement quarterly reallocation based on value-realization metrics. Sunset underperformers early.\n\nMeasurable KPIs: Capital velocity (+50%), underperformer sunset time (-70%), portfolio ROI (+500bps)\nExpected Outcome: Capital always chasing highest returns\nTime to Value: 60 days",
    category: "cfo", isBuiltIn: true as const,
    steps: dirs("CFO Sentinel Marcus (capital velocity management), FP&A Oracle Demi (ROI ranking), Product Oracle Sasha (initiative assessment)"),
  },
  {
    name: "Intangible Value Monetization",
    description: "Convert hard-to-measure benefits into financial value. Customer satisfaction, brand trust, employee morale, and strategic optionality matter but resist quantification. Apply proxy metrics and contingent valuation methods.\n\nMeasurable KPIs: Intangible coverage (100% of strategic benefits), valuation confidence score, board acceptance rate\nExpected Outcome: Full value capture, not just direct savings\nTime to Value: 120 days",
    category: "cfo", isBuiltIn: true as const,
    steps: dirs("FP&A Oracle Demi (proxy metric design), Brand Maven Priya (brand value modeling), HR Director Amara (morale-to-productivity links)"),
  },
  {
    name: "AI Cost Optimization Engine",
    description: "Continuously reduce AI operational costs. AI costs scale with usage. Implement automated model selection (route simpler queries to cheaper models), cache common responses, and compress prompts.\n\nMeasurable KPIs: Cost per inference (-60% YoY), model routing efficiency (+40%), infrastructure utilization (+50%)\nExpected Outcome: AI cost curve bending down\nTime to Value: 90 days",
    category: "cfo", isBuiltIn: true as const,
    steps: dirs("Tech Visionary Zara (model routing optimization), CFO Sentinel Marcus (cost curve management), FP&A Oracle Demi (infrastructure efficiency)"),
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // CIO / CTO / TECHNOLOGY — Playbooks 51–65
  // ─────────────────────────────────────────────────────────────────────────────
  {
    name: "Multiagent System Architecture",
    description: "Deploy collaborative AI agents for enterprise workflows. Gartner identifies Multiagent Systems as a top 2026 strategic trend. Build orchestration layer where specialized agents pursue individual objectives or collaborate on shared goals. Use for supply chain, customer service, and internal operations.\n\nMeasurable KPIs: Workflow automation rate (target: 70%), agent collaboration success (+50%), human oversight efficiency (-60%)\nExpected Outcome: End-to-end process automation\nTime to Value: 270 days",
    category: "cio_cto", isBuiltIn: true as const,
    steps: dirs("Tech Visionary Zara (orchestration layer design), Operator Rex (workflow automation), Product Oracle Sasha (use case selection)"),
  },
  {
    name: "Hybrid Computing Architecture",
    description: "Combine CPUs, GPUs, and specialized processors. Gartner predicts >40% of enterprises will have integrated hybrid computing by 2028. Build infrastructure that routes workloads to optimal processors based on task type, latency needs, and cost.\n\nMeasurable KPIs: Compute efficiency (+50%), latency reduction (-70%), cost per workload (-40%)\nExpected Outcome: Optimized AI infrastructure\nTime to Value: 365 days",
    category: "cio_cto", isBuiltIn: true as const,
    steps: dirs("Tech Visionary Zara (infrastructure architecture), CISO Sentinel Nova (security integration), FP&A Oracle Demi (cost modeling)"),
  },
  {
    name: "AI Security Platform Deployment",
    description: "Protect against AI-specific risks. Gartner predicts >50% of enterprises will use AI security platforms by 2028. Deploy centralized visibility, usage policy enforcement, and protection against prompt injection, data leakage, and rogue agent actions.\n\nMeasurable KPIs: Security incidents (-80%), policy violation detection (100%), response time (-90%)\nExpected Outcome: Secure AI deployment at scale\nTime to Value: 180 days",
    category: "cio_cto", isBuiltIn: true as const,
    steps: dirs("CISO Sentinel Nova (platform deployment), Tech Visionary Zara (integration design), General Counsel Alexis (policy compliance)"),
  },
  {
    name: "Digital Provenance Implementation",
    description: "Track AI-generated content origin and authenticity. By 2029, enterprises neglecting digital provenance face compliance and sanction risks costing billions. Implement watermarking, content credentials, and audit trails for all AI outputs.\n\nMeasurable KPIs: Provenance coverage (100% of AI content), compliance audit score, tamper detection rate\nExpected Outcome: Regulatory-ready AI content\nTime to Value: 270 days",
    category: "cio_cto", isBuiltIn: true as const,
    steps: dirs("General Counsel Alexis (compliance framework), CISO Sentinel Nova (technical implementation), Brand Maven Priya (content credentialing)"),
  },
  {
    name: "Geopatriation Infrastructure",
    description: "Shift workloads to local alternatives. >75% of European and Middle Eastern enterprises will geopatriate by 2030. Build capability to move data from global public clouds to sovereign clouds, regional providers, or on-prem.\n\nMeasurable KPIs: Geopolitical risk score (-60%), data residency compliance (100%), cloud provider diversity (4+)\nExpected Outcome: Resilient, compliant data infrastructure\nTime to Value: 365 days",
    category: "cio_cto", isBuiltIn: true as const,
    steps: dirs("CISO Sentinel Nova (data residency compliance), Tech Visionary Zara (infrastructure migration), General Counsel Alexis (regional regulation mapping)"),
  },
  {
    name: "AI Maturity Assessment",
    description: "Measure readiness across governance, data, tech, and skills. Apply Info-Tech's AI Maturity Assessment Tool to evaluate current state and identify gaps. Use results to prioritize capability investments.\n\nMeasurable KPIs: Maturity score improvement (+2 levels YoY), gap closure rate (80%), investment prioritization accuracy\nExpected Outcome: Clear path to AI maturity\nTime to Value: 60 days",
    category: "cio_cto", isBuiltIn: true as const,
    steps: dirs("Tech Visionary Zara (maturity scoring), CISO Sentinel Nova (governance audit), HR Director Amara (skills gap analysis)"),
  },
  {
    name: "Preemptive Cybersecurity Operations",
    description: "Shift from reactive to proactive defense. Preemptive solutions will account for half of all security spending by 2030. Implement AI-powered SecOps, threat hunting, programmatic denial, and deception technologies.\n\nMeasurable KPIs: Mean time to detect (-80%), mean time to respond (-85%), breach prevention rate (99.9%+)\nExpected Outcome: AI-powered cyber defense\nTime to Value: 270 days",
    category: "cio_cto", isBuiltIn: true as const,
    steps: dirs("CISO Sentinel Nova (SecOps deployment), Risk Warden Okafor (threat modeling), Tech Visionary Zara (defense architecture)"),
  },
  {
    name: "Synthetic Data Generation",
    description: "Create safe, scalable training data. Companies increasingly turn to synthetic data to train models safely and efficiently, especially in regulated industries. Build pipelines for privacy-preserving data generation.\n\nMeasurable KPIs: Training data cost (-70%), privacy compliance (100%), model accuracy parity with real data\nExpected Outcome: Unlimited, compliant training data\nTime to Value: 180 days",
    category: "cio_cto", isBuiltIn: true as const,
    steps: dirs("Tech Visionary Zara (data pipeline design), General Counsel Alexis (privacy compliance), Product Oracle Sasha (training data specifications)"),
  },
  {
    name: "Edge AI Deployment",
    description: "Run models locally for real-time, private inference. Edge AI enables real-time responses, privacy, and offline use. Deploy models on devices, browsers, and edge nodes for low-latency applications.\n\nMeasurable KPIs: Inference latency (-90%), data transfer costs (-80%), offline capability (100% uptime)\nExpected Outcome: Fast, private, always-available AI\nTime to Value: 270 days",
    category: "cio_cto", isBuiltIn: true as const,
    steps: dirs("Tech Visionary Zara (edge architecture design), CISO Sentinel Nova (privacy engineering), Product Oracle Sasha (application requirements)"),
  },
  {
    name: "Domain-Specific LLM Development",
    description: "Build specialized models for proprietary advantage. Generic LLMs often fall short for specialized tasks. Train or fine-tune models on proprietary data for industry, function, or process-specific needs.\n\nMeasurable KPIs: Task accuracy (+50% vs. general models), inference cost (-60%), proprietary data utilization (100%)\nExpected Outcome: Unfair AI advantage\nTime to Value: 365 days",
    category: "cio_cto", isBuiltIn: true as const,
    steps: dirs("Tech Visionary Zara (model training strategy), Product Oracle Sasha (use case specification), General Counsel Alexis (data usage compliance)"),
  },
  {
    name: "Hybrid AI-Quantum Integration",
    description: "Prepare for quantum-classical hybrid workflows. Hybrid AI and quantum computing workflows are moving from labs into real-world use, especially for optimization and scientific simulation. Build interfaces and use case pipeline.\n\nMeasurable KPIs: Quantum-ready use cases (+5/year), simulation speed (+1000x for eligible problems), talent readiness score\nExpected Outcome: First-mover quantum advantage\nTime to Value: 730 days",
    category: "cio_cto", isBuiltIn: true as const,
    steps: dirs("Tech Visionary Zara (quantum use case identification), FP&A Oracle Demi (investment planning), Product Oracle Sasha (pipeline development)"),
  },
  {
    name: "AI Observability Stack",
    description: "Detect shadow AI and measure actual usage. Traditional metrics track licenses purchased, not value delivered. Deploy AI observability for prompt-level visibility into what employees are actually doing.\n\nMeasurable KPIs: Shadow AI detection (100%), usage visibility (100% of interactions), risk identification (-80%)\nExpected Outcome: Complete AI usage intelligence\nTime to Value: 90 days",
    category: "cio_cto", isBuiltIn: true as const,
    steps: dirs("CISO Sentinel Nova (observability deployment), Tech Visionary Zara (usage analytics), Operator Rex (workflow insight extraction)"),
  },
  {
    name: "Multi-LLM Routing Optimization",
    description: "Route queries to optimal model for cost/quality. Different tasks need different models. Build intelligent router that sends simple queries to cheap models (e.g., Llama 3 8B) and complex reasoning to premium models (GPT-4, Claude).\n\nMeasurable KPIs: Cost per query (-70%), quality score (95%+ of best model), routing accuracy (90%+)\nExpected Outcome: Best quality at lowest cost\nTime to Value: 120 days",
    category: "cio_cto", isBuiltIn: true as const,
    steps: dirs("Tech Visionary Zara (routing logic design), CFO Sentinel Marcus (cost optimization), Product Oracle Sasha (quality benchmarking)"),
  },
  {
    name: "Infrastructure Bottleneck Elimination",
    description: "Remove constraints limiting AI scale. AI leaders invest to eliminate infrastructure bottlenecks. Audit GPU availability, data pipelines, API latency, and storage throughput. Invest in highest-constraint areas.\n\nMeasurable KPIs: Queue time (-90%), throughput (+300%), resource utilization (+50%)\nExpected Outcome: Unlimited AI scaling capacity\nTime to Value: 180 days",
    category: "cio_cto", isBuiltIn: true as const,
    steps: dirs("Tech Visionary Zara (bottleneck auditing), FP&A Oracle Demi (investment prioritization), Operator Rex (throughput optimization)"),
  },
  {
    name: "Sovereign Cloud Strategy",
    description: "Build or partner for regional AI infrastructure. As geopatriation accelerates, develop relationships with sovereign cloud providers in key regions (EU, Middle East, Asia). Ensure AI capabilities available locally.\n\nMeasurable KPIs: Regional coverage (100% of key markets), data residency compliance, latency to regional customers (-80%)\nExpected Outcome: Globally distributed, locally compliant AI\nTime to Value: 365 days",
    category: "cio_cto", isBuiltIn: true as const,
    steps: dirs("Tech Visionary Zara (sovereign cloud partnerships), General Counsel Alexis (regional compliance), CISO Sentinel Nova (security architecture)"),
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // COO / OPERATIONS — Playbooks 66–80
  // ─────────────────────────────────────────────────────────────────────────────
  {
    name: "End-to-End Process Redesign",
    description: "Rebuild core workflows with embedded AI. Top performers focus on high-value domains that unlock disproportionate economic value and redesign workflows end-to-end, not just add AI to existing processes.\n\nMeasurable KPIs: Process cycle time (-60%), touchless rate (+200%), employee satisfaction (+30%)\nExpected Outcome: AI-native operations\nTime to Value: 180 days",
    category: "coo", isBuiltIn: true as const,
    steps: dirs("Operator Rex (workflow redesign), Product Oracle Sasha (AI integration points), Tech Visionary Zara (technology enablement)"),
  },
  {
    name: "Autonomous Exception Handling",
    description: "AI resolves routine exceptions without human intervention. Most process exceptions follow predictable patterns. Train AI to recognize and resolve common exceptions (price discrepancies, inventory variances, approval edge cases). Humans handle only novel exceptions.\n\nMeasurable KPIs: Exception auto-resolution rate (target: 80%), human intervention time (-90%), error rate (-50%)\nExpected Outcome: Lights-out exception handling\nTime to Value: 120 days",
    category: "coo", isBuiltIn: true as const,
    steps: dirs("Operator Rex (exception pattern training), Product Oracle Sasha (resolution automation), Risk Warden Okafor (edge case escalation rules)"),
  },
  {
    name: "Predictive Maintenance Network",
    description: "Predict equipment failures before they occur. Deploy IoT sensors + AI models to predict failure with >90% accuracy. Schedule maintenance only when needed. SA Power Networks achieved 99% success rate and $945K annual savings.\n\nMeasurable KPIs: Unplanned downtime (-70%), maintenance cost (-40%), asset life (+30%)\nExpected Outcome: Zero unplanned failures\nTime to Value: 270 days",
    category: "coo", isBuiltIn: true as const,
    steps: dirs("Operator Rex (sensor data integration), Tech Visionary Zara (predictive model deployment), FP&A Oracle Demi (maintenance cost optimization)"),
  },
  {
    name: "Dynamic Workforce Allocation",
    description: "Match human talent to tasks in real-time. AI analyzes skills, availability, workload, and task requirements. Dynamically assign humans to tasks where they add most value, routing routine work to AI agents.\n\nMeasurable KPIs: Utilization rate (+30%), skill-task match (+50%), overtime (-60%)\nExpected Outcome: Humans doing human work, AI doing everything else\nTime to Value: 120 days",
    category: "coo", isBuiltIn: true as const,
    steps: dirs("Operator Rex (allocation optimization), HR Director Amara (skills matching), Tech Visionary Zara (AI routing infrastructure)"),
  },
  {
    name: "Real-Time Supply Chain Control Tower",
    description: "End-to-end supply chain visibility with AI recommendations. AI monitors suppliers, logistics, inventory, and demand. Upon disruption, recommends alternative sourcing, routing, and inventory reallocation within 15 minutes.\n\nMeasurable KPIs: Disruption response time (-95%), inventory optimization (+30%), on-time delivery (+25%)\nExpected Outcome: Self-healing supply chain\nTime to Value: 365 days",
    category: "coo", isBuiltIn: true as const,
    steps: dirs("Operator Rex (supply chain monitoring), Risk Warden Okafor (disruption alerts), FP&A Oracle Demi (cost impact analysis)"),
  },
  {
    name: "Intelligent Document Processing",
    description: "Extract, classify, and action information from any document. Deploy AI that reads invoices, contracts, forms, and emails. Extract structured data, route for approval, update systems, and trigger workflows—all without human touch.\n\nMeasurable KPIs: Document processing time (-90%), data accuracy (99%+), labor cost (-80%)\nExpected Outcome: Paperless, touchless operations\nTime to Value: 90 days",
    category: "coo", isBuiltIn: true as const,
    steps: dirs("Operator Rex (document pipeline automation), Product Oracle Sasha (data extraction logic), General Counsel Alexis (contract processing)"),
  },
  {
    name: "AI-Augmented Quality Control",
    description: "Detect defects at machine speed and human accuracy. Computer vision AI inspects products, documents, or digital assets for defects. Achieves near-perfect accuracy at speeds impossible for humans. Escalates edge cases.\n\nMeasurable KPIs: Defect detection rate (99.9%+), false positive rate (<1%), inspection speed (+1000%)\nExpected Outcome: Zero-defect quality\nTime to Value: 180 days",
    category: "coo", isBuiltIn: true as const,
    steps: dirs("Operator Rex (inspection pipeline), Tech Visionary Zara (computer vision deployment), Product Oracle Sasha (quality threshold calibration)"),
  },
  {
    name: "Automated Regulatory Compliance Monitoring",
    description: "Continuous compliance checking across operations. AI monitors operations against regulatory requirements in real-time. Flags violations before they occur. Generates audit trails and compliance reports automatically.\n\nMeasurable KPIs: Compliance violations (-90%), audit preparation time (-80%), regulatory reporting cost (-70%)\nExpected Outcome: Always audit-ready\nTime to Value: 180 days",
    category: "coo", isBuiltIn: true as const,
    steps: dirs("General Counsel Alexis (regulatory requirement mapping), Operator Rex (compliance monitoring), Risk Warden Okafor (violation flagging)"),
  },
  {
    name: "Intelligent Scheduling & Routing",
    description: "Optimize complex scheduling with AI. For field service, logistics, or meeting scheduling, AI considers constraints (skills, location, time windows, priorities) and generates optimal schedules. Updates in real-time as conditions change.\n\nMeasurable KPIs: Schedule optimization (+40%), travel time (-25%), first-time fix rate (+35%)\nExpected Outcome: Perfect scheduling every time\nTime to Value: 120 days",
    category: "coo", isBuiltIn: true as const,
    steps: dirs("Operator Rex (schedule optimization), Tech Visionary Zara (constraint modeling), FP&A Oracle Demi (cost efficiency analysis)"),
  },
  {
    name: "Cognitive Process Automation",
    description: "Automate judgment-dependent processes. RPA handles rules-based tasks. Cognitive AI (using LLMs) handles tasks requiring judgment: document classification, email triage, customer request routing, approval recommendations.\n\nMeasurable KPIs: Process automation rate (+200%), judgment task coverage (100% of routine), escalation rate (target: <20%)\nExpected Outcome: End-to-end cognitive automation\nTime to Value: 180 days",
    category: "coo", isBuiltIn: true as const,
    steps: dirs("Operator Rex (cognitive automation deployment), Product Oracle Sasha (judgment task mapping), Tech Visionary Zara (LLM integration)"),
  },
  {
    name: "Operational Digital Twin",
    description: "Simulate operations to test changes before deployment. Build AI-powered digital twin of operations. Test process changes, capacity adjustments, and disruption responses in simulation. Deploy only what works.\n\nMeasurable KPIs: Change success rate (+50%), disruption impact (-80%), testing velocity (+300%)\nExpected Outcome: Fail in simulation, succeed in production\nTime to Value: 365 days",
    category: "coo", isBuiltIn: true as const,
    steps: dirs("Operator Rex (digital twin modeling), Tech Visionary Zara (simulation infrastructure), FP&A Oracle Demi (change impact analysis)"),
  },
  {
    name: "Intelligent Inventory Optimization",
    description: "Hold optimal inventory across network. AI forecasts demand at SKU-location level, considering seasonality, promotions, weather, and economic indicators. Optimizes safety stock and reorder points.\n\nMeasurable KPIs: Inventory carrying cost (-30%), stockouts (-80%), working capital release ($100M+)\nExpected Outcome: Right product, right place, right time\nTime to Value: 180 days",
    category: "coo", isBuiltIn: true as const,
    steps: dirs("Operator Rex (demand forecasting), FP&A Oracle Demi (working capital optimization), Tech Visionary Zara (inventory model deployment)"),
  },
  {
    name: "Automated Vendor Risk Management",
    description: "Continuously assess vendor risk. AI monitors vendor financial health, security posture, operational performance, and geopolitical exposure. Flags deteriorating vendors before they fail.\n\nMeasurable KPIs: Vendor failure prediction (90%+ accuracy), risk response time (-80%), vendor due diligence cost (-70%)\nExpected Outcome: No supplier surprises\nTime to Value: 120 days",
    category: "coo", isBuiltIn: true as const,
    steps: dirs("Risk Warden Okafor (vendor risk scoring), Operator Rex (performance monitoring), General Counsel Alexis (contract compliance)"),
  },
  {
    name: "Intelligent Workload Balancing",
    description: "Distribute work optimally across human and AI resources. AI analyzes incoming work, determines complexity, and routes to optimal resource (AI agent, junior human, senior human). Learns from outcomes to improve routing.\n\nMeasurable KPIs: Workload balance score, skill development rate (+50%), cost per task (-40%)\nExpected Outcome: Humans always working at top of license\nTime to Value: 90 days",
    category: "coo", isBuiltIn: true as const,
    steps: dirs("Operator Rex (workload analysis), HR Director Amara (human capacity planning), Tech Visionary Zara (AI routing optimization)"),
  },
  {
    name: "Continuous Process Mining",
    description: "Discover optimization opportunities automatically. AI analyzes event logs to discover actual processes (not assumed processes). Identifies bottlenecks, rework loops, and compliance violations. Recommends fixes.\n\nMeasurable KPIs: Optimization opportunities found (+500%), process violation detection (100%), recommendation acceptance rate (80%+)\nExpected Outcome: Self-optimizing operations\nTime to Value: 60 days",
    category: "coo", isBuiltIn: true as const,
    steps: dirs("Operator Rex (process log analysis), Tech Visionary Zara (mining tool deployment), Product Oracle Sasha (recommendation generation)"),
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // CHRO / HUMAN RESOURCES — Playbooks 81–95
  // ─────────────────────────────────────────────────────────────────────────────
  {
    name: "AI Literacy at Scale",
    description: "Build foundational AI skills across all employees. Deploy mandatory AI literacy training for all employees. Focus on prompt engineering, AI limitations (hallucinations, bias), and responsible use. Certify completion.\n\nMeasurable KPIs: AI literacy rate (target: 100%), certification completion (95%+), unauthorized usage (-70%)\nExpected Outcome: AI-fluent workforce\nTime to Value: 180 days",
    category: "chro", isBuiltIn: true as const,
    steps: dirs("HR Director Amara (training curriculum design), Tech Visionary Zara (AI fundamentals instruction), CISO Sentinel Nova (responsible use guidelines)"),
  },
  {
    name: "Expert-First AI Augmentation",
    description: "Amplify experienced employees, not replace them. NTT DATA research shows AI leaders use AI to amplify experienced, highly skilled employees rather than replace them. Focus AI deployment on expert augmentation, not junior replacement.\n\nMeasurable KPIs: Expert productivity (+50%), junior development speed (+100%), retention of top talent (+30%)\nExpected Outcome: Force multiplier for best people\nTime to Value: 120 days",
    category: "chro", isBuiltIn: true as const,
    steps: dirs("HR Director Amara (expert identification), Product Oracle Sasha (AI tool matching), Operator Rex (augmentation workflows)"),
  },
  {
    name: "AI Role Redesign",
    description: "Redefine every role for human-AI collaboration. For each role, identify tasks for AI automation, AI augmentation, and human-only judgment. Redesign job descriptions, training, and performance metrics accordingly.\n\nMeasurable KPIs: Role coverage (100% of positions), human-AI collaboration score, job satisfaction (+30%)\nExpected Outcome: Future-proofed workforce\nTime to Value: 365 days",
    category: "chro", isBuiltIn: true as const,
    steps: dirs("HR Director Amara (role analysis), Operator Rex (process decomposition), Product Oracle Sasha (AI capability mapping)"),
  },
  {
    name: "Continuous Skills Ontology",
    description: "Maintain real-time view of organizational capabilities. Build AI-powered skills ontology that maps every employee's capabilities, updated continuously from project work, training completion, and manager feedback.\n\nMeasurable KPIs: Skills data freshness (daily), matching accuracy (90%+), skills gap identification (100%)\nExpected Outcome: Real-time talent intelligence\nTime to Value: 270 days",
    category: "chro", isBuiltIn: true as const,
    steps: dirs("HR Director Amara (ontology design), Tech Visionary Zara (automated data collection), Operator Rex (matching engine deployment)"),
  },
  {
    name: "AI-Augmented Talent Acquisition",
    description: "Hire better, faster with AI. AI screens resumes, conducts initial interviews (via conversational AI), assesses technical skills, and predicts cultural fit. Humans focus on final rounds and relationship-building.\n\nMeasurable KPIs: Time-to-hire (-70%), quality-of-hire (+40%), recruiter time on admin (-80%)\nExpected Outcome: Best talent, first\nTime to Value: 120 days",
    category: "chro", isBuiltIn: true as const,
    steps: dirs("HR Director Amara (screening automation), Closer King Rivera (candidate engagement), Tech Visionary Zara (assessment tools)"),
  },
  {
    name: "Flight Risk Prediction",
    description: "Identify at-risk talent before they leave. AI analyzes engagement signals, compensation competitiveness, career progression, and external job market activity. Flags high-risk employees with recommended interventions.\n\nMeasurable KPIs: Prediction accuracy (85%+), voluntary turnover (-40%), retention cost (-50%)\nExpected Outcome: Zero surprise departures\nTime to Value: 90 days",
    category: "chro", isBuiltIn: true as const,
    steps: dirs("HR Director Amara (risk scoring model), FP&A Oracle Demi (replacement cost analysis), Risk Warden Okafor (early intervention triggers)"),
  },
  {
    name: "Personalized Career Pathing",
    description: "AI-recommended career moves for every employee. AI analyzes skills, interests, performance, and open roles to recommend next career moves. Employees see potential paths; managers see development opportunities.\n\nMeasurable KPIs: Internal mobility (+100%), promotion velocity (+50%), employee engagement (+30%)\nExpected Outcome: Careers, not just jobs\nTime to Value: 180 days",
    category: "chro", isBuiltIn: true as const,
    steps: dirs("HR Director Amara (career path modeling), Operator Rex (internal opportunity matching), FP&A Oracle Demi (development ROI analysis)"),
  },
  {
    name: "AI Performance Management",
    description: "Continuous, data-driven performance feedback. Traditional annual reviews fail. AI analyzes work outputs, collaboration patterns, and project outcomes to provide continuous performance insights. Humans conduct coaching conversations.\n\nMeasurable KPIs: Feedback frequency (+1000%), performance accuracy (+50%), manager time on admin (-80%)\nExpected Outcome: Fair, frequent, actionable feedback\nTime to Value: 120 days",
    category: "chro", isBuiltIn: true as const,
    steps: dirs("HR Director Amara (performance data collection), Operator Rex (output analysis), Product Oracle Sasha (feedback delivery system)"),
  },
  {
    name: "Multi-Job Employee Support",
    description: "Support employees working multiple simultaneous roles. Gartner reports a third of CIOs will adopt gig-worker protocols to support multi-job IT employees. Build policies, scheduling, and compensation for the multi-job reality.\n\nMeasurable KPIs: Multi-job employee satisfaction (+40%), compliance rate (100%), productivity measurement accuracy\nExpected Outcome: Engaged, productive multi-job workforce\nTime to Value: 180 days",
    category: "chro", isBuiltIn: true as const,
    steps: dirs("HR Director Amara (policy design), Operator Rex (scheduling optimization), General Counsel Alexis (compliance framework)"),
  },
  {
    name: "Change Management at Scale",
    description: "Drive AI adoption across 100,000+ employees. NTT DATA finds top performers treat adoption as a company-wide change program with constructive change management to reduce resistance. Deploy AI adoption champions, communication campaigns, and feedback loops.\n\nMeasurable KPIs: AI adoption rate (target: 80% within 6 months), resistance rate (<10%), value realization velocity\nExpected Outcome: AI embraced, not endured\nTime to Value: 270 days",
    category: "chro", isBuiltIn: true as const,
    steps: dirs("HR Director Amara (change program design), Brand Maven Priya (communication campaigns), Operator Rex (adoption measurement)"),
  },
  {
    name: "Ethical AI Use Policy",
    description: "Establish clear guidelines for responsible AI use. Info-Tech emphasizes responsible AI adoption requires transparency, fairness, and accountability embedded from the outset. Draft and deploy enterprise-wide AI use policy.\n\nMeasurable KPIs: Policy acknowledgment (100%), violation rate (<1%), ethics training completion (100%)\nExpected Outcome: Responsible AI at scale\nTime to Value: 90 days",
    category: "chro", isBuiltIn: true as const,
    steps: dirs("General Counsel Alexis (policy drafting), HR Director Amara (training and rollout), CISO Sentinel Nova (technical safeguards)"),
  },
  {
    name: "AI Fluency for Leadership",
    description: "Ensure every leader can manage AI-augmented teams. Leaders need different skills: managing hybrid human-AI teams, interpreting AI recommendations, and maintaining human judgment. Deploy leadership-specific AI training.\n\nMeasurable KPIs: Leadership AI fluency (target: 100%), team AI adoption (+50%), leader confidence score (90%+)\nExpected Outcome: AI-native leadership\nTime to Value: 120 days",
    category: "chro", isBuiltIn: true as const,
    steps: dirs("HR Director Amara (leadership training), Chairman Atlas (strategic AI context), Magnus Drake (judgment frameworks)"),
  },
  {
    name: "Workforce Planning with AI Scenarios",
    description: "Model workforce needs under different AI adoption scenarios. AI models how automation will affect each role over 3-5 years. Identify roles for phase-out, transformation, or creation. Build transition plans.\n\nMeasurable KPIs: Workforce plan accuracy (+50%), transition success rate (80%+), skills gap closure (-60%)\nExpected Outcome: Workforce ready for AI future\nTime to Value: 180 days",
    category: "chro", isBuiltIn: true as const,
    steps: dirs("HR Director Amara (scenario modeling), FP&A Oracle Demi (cost projection), Operator Rex (transition plan design)"),
  },
  {
    name: "Inclusion & Bias Monitoring",
    description: "Detect and correct AI bias in HR processes. AI systems can perpetuate or amplify bias. Continuously audit AI-HR systems (recruiting, promotion, performance) for disparate impact. Correct detected bias.\n\nMeasurable KPIs: Bias detection rate (100% of systems), disparate impact (-80%), audit compliance (100%)\nExpected Outcome: Fair AI for all employees\nTime to Value: 120 days",
    category: "chro", isBuiltIn: true as const,
    steps: dirs("HR Director Amara (bias audit design), General Counsel Alexis (legal compliance), Risk Warden Okafor (impact assessment)"),
  },
  {
    name: "AI-Augmented Learning & Development",
    description: "Personalized, just-in-time learning for every employee. AI recommends learning content based on role, skills gap, and career goals. Generates practice exercises and quizzes. Adapts difficulty in real-time.\n\nMeasurable KPIs: Learning completion rate (+200%), skill acquisition speed (+50%), content relevance score (90%+)\nExpected Outcome: Learning that sticks\nTime to Value: 120 days",
    category: "chro", isBuiltIn: true as const,
    steps: dirs("HR Director Amara (learning path design), Product Oracle Sasha (content recommendation engine), Tech Visionary Zara (adaptive delivery platform)"),
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // CMO / MARKETING — Playbooks 96–105
  // ─────────────────────────────────────────────────────────────────────────────
  {
    name: "Generative Engine Optimization (GEO)",
    description: "Get cited by AI engines answering customer questions. Optimize content to be cited by ChatGPT, Gemini, Perplexity, and other AI answer engines. Structure content for extraction (clear claims, data citations, authoritative sources).\n\nMeasurable KPIs: Citation volume (+300%), AI answer share of voice (target: 30%+), inbound leads from citations (+200%)\nExpected Outcome: First-page ranking in AI answers\nTime to Value: 90 days",
    category: "cmo", isBuiltIn: true as const,
    steps: dirs("Brand Maven Priya (content optimization for AI citation), Prospector Engine (platform monitoring), Product Oracle Sasha (structured data strategy)"),
  },
  {
    name: "AI-Generated Content at Scale",
    description: "Produce personalized content for every segment. BingoLingo.ai generates blogs, LinkedIn articles, email newsletters, case studies, and press releases. Each piece optimized for GEO and branded for your company.\n\nMeasurable KPIs: Content volume (+1000%), personalization rate (100% of segments), engagement rate (+50%)\nExpected Outcome: Unlimited, relevant content\nTime to Value: 30 days",
    category: "cmo", isBuiltIn: true as const,
    steps: dirs("Brand Maven Priya (brand voice and strategy), Product Oracle Sasha (segment personalization), Prospector Engine (content intelligence)"),
  },
  {
    name: "Brand Sentiment AI Monitoring",
    description: "Real-time brand health tracking. AI monitors social media, news, review sites, and forums. Detects sentiment shifts, emerging issues, and competitive mentions. Alerts within minutes of significant change.\n\nMeasurable KPIs: Sentiment monitoring coverage (100% of channels), alert lead time (hours vs. days), response time (-80%)\nExpected Outcome: Never surprised by brand crisis\nTime to Value: 45 days",
    category: "cmo", isBuiltIn: true as const,
    steps: dirs("Brand Maven Priya (sentiment monitoring), Risk Warden Okafor (crisis alert triggers), Prospector Engine (channel scanning)"),
  },
  {
    name: "Customer Journey AI Orchestration",
    description: "AI-powered personalization at every touchpoint. AI tracks customer across channels, predicts intent, and orchestrates next-best-action. Website, email, ads, and sales all coordinated by AI.\n\nMeasurable KPIs: Conversion rate (+40%), customer effort score (-30%), personalization accuracy (90%+)\nExpected Outcome: Seamless, personal customer experience\nTime to Value: 180 days",
    category: "cmo", isBuiltIn: true as const,
    steps: dirs("Brand Maven Priya (journey mapping), Closer King Rivera (conversion optimization), Product Oracle Sasha (personalization engine)"),
  },
  {
    name: "AI-Driven Market Segmentation",
    description: "Discover hidden customer segments. AI analyzes behavioral, demographic, and firmographic data to identify natural customer clusters. Reveals segments humans miss.\n\nMeasurable KPIs: Segment discovery (+500% YoY), segment profitability (+40%), targeting efficiency (+50%)\nExpected Outcome: See your market clearly\nTime to Value: 90 days",
    category: "cmo", isBuiltIn: true as const,
    steps: dirs("Brand Maven Priya (segmentation analysis), Prospector Engine (data intelligence), Product Oracle Sasha (cluster interpretation)"),
  },
  {
    name: "Predictive Customer Lifetime Value",
    description: "Forecast CLV for every customer. AI predicts CLV using purchase history, engagement, support interactions, and external data. Segment customers by predicted value for differentiated treatment.\n\nMeasurable KPIs: CLV prediction accuracy (90%+), high-value retention (+40%), low-value acquisition cost (-50%)\nExpected Outcome: Invest where returns highest\nTime to Value: 120 days",
    category: "cmo", isBuiltIn: true as const,
    steps: dirs("Brand Maven Priya (CLV modeling), FP&A Oracle Demi (revenue projection), Closer King Rivera (high-value retention strategy)"),
  },
  {
    name: "AI Campaign Optimization",
    description: "Real-time campaign tuning across channels. AI monitors campaign performance across channels, tests creative variations, reallocates budget to highest-ROI tactics, and adjusts targeting—all in real-time.\n\nMeasurable KPIs: ROAS (+50%), CPA (-40%), campaign setup time (-80%)\nExpected Outcome: Always-optimized campaigns\nTime to Value: 60 days",
    category: "cmo", isBuiltIn: true as const,
    steps: dirs("Brand Maven Priya (campaign performance analysis), FP&A Oracle Demi (budget reallocation), Closer King Rivera (conversion tactics)"),
  },
  {
    name: "Competitive Intelligence Automation",
    description: "Real-time competitor tracking. Prospector continuously scans AI engines for competitor mentions, pricing changes, product launches, and positioning shifts. Weekly intelligence brief delivered automatically.\n\nMeasurable KPIs: Competitor coverage (100% of relevant players), intelligence lead time (hours vs. weeks), countermove success rate (+50%)\nExpected Outcome: Know competitor moves before they happen\nTime to Value: 60 days",
    category: "cmo", isBuiltIn: true as const,
    steps: dirs("Prospector Engine (platform scanning), Brand Maven Priya (competitive positioning), Growth Hawk Yusuf (market move intelligence)"),
  },
  {
    name: "AI-Generated Visual Content",
    description: "Produce images, video, and 3D content at scale. 2026 sees rapid growth in AI-generated video, audio, and 3D content. Deploy generative visual AI for product images, social media video, and immersive experiences.\n\nMeasurable KPIs: Visual content volume (+1000%), production cost (-90%), engagement rate (+50%)\nExpected Outcome: Unlimited visual content\nTime to Value: 90 days",
    category: "cmo", isBuiltIn: true as const,
    steps: dirs("Brand Maven Priya (visual brand standards), Tech Visionary Zara (generative media tooling), Product Oracle Sasha (content pipeline)"),
  },
  {
    name: "Voice of Customer (VoC) AI",
    description: "Extract insights from every customer interaction. AI analyzes support tickets, surveys, social media, call transcripts, and reviews. Identifies emerging themes, pain points, and opportunities. Quarterly VoC report.\n\nMeasurable KPIs: Insight discovery (+500%), time-to-insight (-90%), customer-driven product improvements (+200%)\nExpected Outcome: Customer voice driving strategy\nTime to Value: 60 days",
    category: "cmo", isBuiltIn: true as const,
    steps: dirs("Brand Maven Priya (insight synthesis), Product Oracle Sasha (feedback loop design), Operator Rex (data collection integration)"),
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // CPO / PRODUCT — Playbooks 106–115
  // ─────────────────────────────────────────────────────────────────────────────
  {
    name: "AI-First Product Development",
    description: "Build products with AI at the core, not as add-on. NTT DATA finds growth leaders rebuild core applications with embedded AI rather than surface-level add-ons. Redesign product architecture for AI-native experiences.\n\nMeasurable KPIs: AI feature adoption (80%+), user engagement (+100%), development velocity (+50%)\nExpected Outcome: AI-native product portfolio\nTime to Value: 365 days",
    category: "cpo", isBuiltIn: true as const,
    steps: dirs("Product Oracle Sasha (AI-native architecture design), Tech Visionary Zara (core AI integration), Brand Maven Priya (user experience vision)"),
  },
  {
    name: "AI Feature Prioritization",
    description: "Data-driven roadmap decisions. AI analyzes user feedback, usage data, support tickets, and market trends. Scores potential features by impact, effort, and strategic alignment. Human PMs make final call.\n\nMeasurable KPIs: Feature success rate (+50%), roadmap accuracy (+40%), development waste (-60%)\nExpected Outcome: Build what matters\nTime to Value: 90 days",
    category: "cpo", isBuiltIn: true as const,
    steps: dirs("Product Oracle Sasha (feature scoring model), FP&A Oracle Demi (impact-to-effort analysis), Prospector Engine (market intelligence)"),
  },
  {
    name: "User Behavior AI Analytics",
    description: "Understand how users actually use your product. AI analyzes clickstreams, session recordings, and feature usage. Identifies friction points, unused features, and power user patterns. Recommends improvements.\n\nMeasurable KPIs: Friction point detection (100%), feature adoption (+50%), user satisfaction (+30%)\nExpected Outcome: Data-driven product decisions\nTime to Value: 60 days",
    category: "cpo", isBuiltIn: true as const,
    steps: dirs("Product Oracle Sasha (behavior analysis), Tech Visionary Zara (analytics infrastructure), Operator Rex (friction point identification)"),
  },
  {
    name: "AI-Augmented User Research",
    description: "Synthesize research across sources. AI analyzes user interviews, surveys, usability tests, and analytics. Identifies themes and generates user personas, journey maps, and problem statements.\n\nMeasurable KPIs: Research synthesis time (-90%), insight quality (+50%), research coverage (+300%)\nExpected Outcome: Deeper user understanding\nTime to Value: 60 days",
    category: "cpo", isBuiltIn: true as const,
    steps: dirs("Product Oracle Sasha (research synthesis), Brand Maven Priya (persona development), Operator Rex (data collection automation)"),
  },
  {
    name: "Predictive User Churn",
    description: "Identify at-risk users before they leave. AI analyzes usage patterns, support interactions, and account health. Flags users likely to churn. Recommends interventions (feature education, support outreach, pricing adjustments).\n\nMeasurable KPIs: Churn prediction accuracy (85%+), churn reduction (-40%), intervention success rate (+50%)\nExpected Outcome: Proactive retention\nTime to Value: 90 days",
    category: "cpo", isBuiltIn: true as const,
    steps: dirs("Product Oracle Sasha (churn prediction model), Closer King Rivera (retention intervention design), FP&A Oracle Demi (revenue impact analysis)"),
  },
  {
    name: "AI-Generated Product Requirements",
    description: "Draft PRDs from user feedback and market analysis. AI synthesizes user feedback, competitor analysis, and market trends into structured product requirement documents. PMs review, edit, and approve.\n\nMeasurable KPIs: PRD creation time (-80%), requirement quality (+40%), stakeholder alignment (+50%)\nExpected Outcome: Faster, better requirements\nTime to Value: 60 days",
    category: "cpo", isBuiltIn: true as const,
    steps: dirs("Product Oracle Sasha (PRD generation), Prospector Engine (market and competitive analysis), Brand Maven Priya (user needs synthesis)"),
  },
  {
    name: "AI-Powered Prototyping",
    description: "Generate interactive prototypes from descriptions. AI generates clickable prototypes from natural language descriptions. PMs iterate by describing changes. Developers get specification and generated code.\n\nMeasurable KPIs: Prototyping time (-90%), iteration velocity (+500%), development handoff quality (+50%)\nExpected Outcome: From idea to prototype in hours\nTime to Value: 90 days",
    category: "cpo", isBuiltIn: true as const,
    steps: dirs("Product Oracle Sasha (prototype generation), Tech Visionary Zara (technical specification), Brand Maven Priya (UX validation)"),
  },
  {
    name: "Automated Usability Testing",
    description: "AI simulates user interactions to find issues. AI agents navigate product like real users, identifying confusing flows, broken links, and accessibility issues. Generates video recordings and fix recommendations.\n\nMeasurable KPIs: Usability issue detection (100% of flows), test coverage (+1000%), fix time (-70%)\nExpected Outcome: Usability issues caught before users see them\nTime to Value: 60 days",
    category: "cpo", isBuiltIn: true as const,
    steps: dirs("Product Oracle Sasha (test scenario design), Tech Visionary Zara (AI agent deployment), Operator Rex (issue triage)"),
  },
  {
    name: "Feature Impact Prediction",
    description: "Forecast how features will affect metrics. AI analyzes historical feature launches, user segments, and market conditions. Predicts adoption, engagement, and revenue impact before building.\n\nMeasurable KPIs: Prediction accuracy (80%+), feature ROI (+50%), development investment efficiency (+40%)\nExpected Outcome: No more surprise flops\nTime to Value: 120 days",
    category: "cpo", isBuiltIn: true as const,
    steps: dirs("Product Oracle Sasha (impact modeling), FP&A Oracle Demi (revenue projection), Tech Visionary Zara (technical feasibility)"),
  },
  {
    name: "Product-Led Growth AI",
    description: "Use AI to drive product adoption and expansion. AI identifies users ready for upgrade, recommends next features, and personalizes in-product messaging. Drives expansion without sales touch.\n\nMeasurable KPIs: Expansion revenue (+100%), feature adoption (+50%), sales-assisted cost (-60%)\nExpected Outcome: Product sells itself\nTime to Value: 120 days",
    category: "cpo", isBuiltIn: true as const,
    steps: dirs("Product Oracle Sasha (PLG signal detection), Closer King Rivera (expansion strategy), FP&A Oracle Demi (revenue expansion modeling)"),
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // CISO / SECURITY — Playbooks 116–120
  // ─────────────────────────────────────────────────────────────────────────────
  {
    name: "AI Security Platform",
    description: "Unified protection for all AI applications. Deploy Gartner-defined AI security platform providing centralized visibility, usage policy enforcement, and protection against prompt injection, data leakage, and rogue agents.\n\nMeasurable KPIs: AI application coverage (100%), policy violation detection (100%), incident response time (-90%)\nExpected Outcome: Secure AI at scale\nTime to Value: 180 days",
    category: "ciso", isBuiltIn: true as const,
    steps: dirs("CISO Sentinel Nova (platform deployment and policy), Tech Visionary Zara (AI application inventory), General Counsel Alexis (compliance alignment)"),
  },
  {
    name: "Preemptive Cyber Defense",
    description: "AI-powered threat hunting and automated response. AI will be a double-edged sword in security—attackers use AI for adaptive attacks, defenders use AI for faster detection and response. Deploy AI-powered SecOps with automated containment.\n\nMeasurable KPIs: Mean time to detect (-85%), mean time to respond (-90%), breach prevention (99.99%+)\nExpected Outcome: AI-defense advantage\nTime to Value: 270 days",
    category: "ciso", isBuiltIn: true as const,
    steps: dirs("CISO Sentinel Nova (threat hunting and SecOps), Risk Warden Okafor (attack scenario modeling), Tech Visionary Zara (automated response infrastructure)"),
  },
  {
    name: "Prompt Injection Defense",
    description: "Protect LLM applications from prompt attacks. As AI agents gain system access, prompt injection becomes critical threat. Deploy input validation, context isolation, and output monitoring for all LLM applications.\n\nMeasurable KPIs: Prompt injection detection (99.9%+), false positive rate (<1%), agent compromise prevention\nExpected Outcome: LLM applications safe from prompt attacks\nTime to Value: 120 days",
    category: "ciso", isBuiltIn: true as const,
    steps: dirs("CISO Sentinel Nova (attack pattern detection), Tech Visionary Zara (validation framework), Risk Warden Okafor (compromise scenario modeling)"),
  },
  {
    name: "AI Data Leakage Prevention",
    description: "Stop sensitive data from entering AI models. Employees paste confidential data into ChatGPT and other AI tools. Deploy DLP that detects and blocks sensitive data (PII, financials, IP) from reaching AI endpoints.\n\nMeasurable KPIs: Data leakage prevention (99.9%+), false positive rate (<5%), employee awareness (100%)\nExpected Outcome: AI productivity without data exposure\nTime to Value: 90 days",
    category: "ciso", isBuiltIn: true as const,
    steps: dirs("CISO Sentinel Nova (DLP policy deployment), General Counsel Alexis (data classification), Tech Visionary Zara (endpoint protection)"),
  },
  {
    name: "AI Supply Chain Security",
    description: "Secure AI models and dependencies. AI supply chain includes base models, training data, fine-tuning pipelines, and dependencies. Deploy model signing, dependency scanning, and provenance tracking.\n\nMeasurable KPIs: Model provenance (100% of models), dependency coverage (100%), supply chain attack prevention\nExpected Outcome: Trustworthy AI from trusted sources\nTime to Value: 180 days",
    category: "ciso", isBuiltIn: true as const,
    steps: dirs("CISO Sentinel Nova (supply chain audit), Tech Visionary Zara (dependency scanning), Operator Rex (pipeline security)"),
  },
];

export async function seedPlaybooks(): Promise<void> {
  const existing = await db
    .select({ id: missionPlaybooksTable.id, name: missionPlaybooksTable.name })
    .from(missionPlaybooksTable)
    .where(eq(missionPlaybooksTable.isBuiltIn, true));

  const existingMap = new Map(existing.map((r) => [r.name, r.id]));
  const canonicalNames = new Set(BUILT_IN_PLAYBOOKS.map((p) => p.name));

  // Remove stale built-ins no longer in the canonical list
  for (const [name, id] of existingMap) {
    if (!canonicalNames.has(name)) {
      await db
        .delete(missionPlaybooksTable)
        .where(and(eq(missionPlaybooksTable.id, id), eq(missionPlaybooksTable.isBuiltIn, true)));
      console.log(`[seed] Playbooks: removed stale built-in "${name}"`);
    }
  }

  let inserted = 0;
  let updated = 0;

  for (const p of BUILT_IN_PLAYBOOKS) {
    const existingId = existingMap.get(p.name);
    if (existingId) {
      // Update with exact canonical content
      await db
        .update(missionPlaybooksTable)
        .set({
          description: p.description,
          category: p.category,
          steps: p.steps,
        })
        .where(eq(missionPlaybooksTable.id, existingId));
      updated++;
    } else {
      await db.insert(missionPlaybooksTable).values({
        name: p.name,
        description: p.description,
        category: p.category,
        isBuiltIn: true,
        steps: p.steps,
      });
      inserted++;
    }
  }

  console.log(
    `[seed] Playbooks: ${inserted} inserted, ${updated} updated (${BUILT_IN_PLAYBOOKS.length} total built-ins)`
  );
}
