import type { VerticalPack } from "./types";

export const restaurantPack: VerticalPack = {
  id: "restaurant",
  name: "Restaurant & Hospitality",
  industry: "Restaurant",
  icon: "🍽️",
  color: "#ea580c",
  tagline: "From kitchen to profit — AI that understands food business",
  description:
    "Designed for restaurants, bars, hotels, and hospitality groups. Your AI team knows food cost percentages, RevPAR, seasonal menu planning, and the razor-thin margins that define this industry. From a single location to a multi-unit empire, every bot speaks hospitality.",
  highlights: [
    "Food cost analysis and menu engineering (stars, puzzles, plowhorses, dogs)",
    "Labor cost optimization and scheduling intelligence",
    "Seasonal campaign planning and local marketing expertise",
    "Multi-unit comparison and franchise benchmarking",
    "Health code and food safety compliance awareness",
  ],
  botOverlays: [
    {
      botTitle: "Managing Director",
      overlayPrompt:
        "You are advising a restaurant or hospitality business. Frame strategy around unit economics, same-store sales growth, average check size, table turnover rate, and concept differentiation. Understand the lifecycle of restaurant concepts, the franchise vs. corporate model decision, and multi-unit expansion planning. Reference NRA (National Restaurant Association) data and industry trends.",
    },
    {
      botTitle: "Finance Director",
      overlayPrompt:
        "You are advising a restaurant or hospitality business. Financial analysis should focus on the prime cost model: food cost % (target 28-32%) + labor cost % (target 25-30%) = prime cost (target <60%). Track daily sales reports, PMIX (product mix) analysis, waste tracking, and cash flow with high seasonal variability. Understand tip credit laws, beverage cost targets (18-24%), and lease structures common in food service.",
    },
    {
      botTitle: "Director of Marketing",
      overlayPrompt:
        "You are advising a restaurant or hospitality business. Marketing strategy should focus on local SEO (Google Business Profile optimization), social media (Instagram/TikTok for visual food content), reputation management (Yelp, Google Reviews, TripAdvisor), and community engagement. Understand seasonal promotions, limited-time offers (LTOs), loyalty programs, and the power of user-generated content in driving covers.",
    },
    {
      botTitle: "Director of Operations",
      overlayPrompt:
        "You are advising a restaurant or hospitality business. Operations should focus on kitchen workflow, front-of-house service standards, inventory management (FIFO, par levels, vendor relationships), labor scheduling optimization, and health code compliance. Understand POS system data, cover counts, speed of service metrics, and the back-of-house to front-of-house coordination that drives guest satisfaction.",
    },
  ],
  scenarios: [
    {
      title: "Menu Engineering & Pricing Analysis",
      category: "Operations",
      difficulty: "Strategic",
      situation:
        "Food costs have crept up to 35% due to supply chain inflation. The menu hasn't been reengineered in over a year. Some dishes are popular but unprofitable, while high-margin items aren't selling well.",
      actions: [
        "Classify menu items using the menu engineering matrix (stars, puzzles, plowhorses, dogs)",
        "Analyze food cost percentage by dish and category",
        "Recommend price adjustments and menu repositioning",
        "Design a seasonal menu strategy that protects margins",
      ],
      missionObjective:
        "Conduct a comprehensive menu engineering analysis for this restaurant. Classify all menu items using the BCG-style matrix (stars, puzzles, plowhorses, dogs) based on popularity and profitability. Calculate actual vs. target food cost percentages. Recommend specific price adjustments, menu redesign strategies, and seasonal rotation plans to bring food cost back below 32%.",
      recommendedBots: [
        "Finance Director",
        "Director of Operations",
        "Managing Director",
      ],
    },
    {
      title: "Seasonal Campaign Planning",
      category: "Marketing Campaigns",
      difficulty: "Tactical",
      situation:
        "Summer is approaching and historically Q3 revenue drops 20% as regular customers travel. The restaurant needs a targeted campaign to drive traffic during slow months and attract tourist/visitor traffic.",
      actions: [
        "Analyze historical seasonal sales data to identify key opportunity windows",
        "Design summer-specific promotions (happy hours, prix fixe, events)",
        "Create a social media content calendar with local event tie-ins",
        "Plan a loyalty push to retain regulars through slow months",
      ],
      missionObjective:
        "Design a comprehensive summer traffic-building campaign for this restaurant. Analyze historical Q3 sales drop patterns, create targeted promotions (happy hour specials, prix fixe menus, live events), build a 12-week social media content calendar, and design a loyalty program push to retain regular customers. Target: reduce seasonal revenue decline from 20% to under 10%.",
      recommendedBots: [
        "Director of Marketing",
        "Managing Director",
        "Finance Director",
      ],
    },
    {
      title: "Labor Cost Optimization",
      category: "Operations",
      difficulty: "Critical",
      situation:
        "Labor costs have hit 33% of revenue, well above the 25-30% industry target. Overtime is rampant, scheduling is reactive, and turnover is high. The GM needs a data-driven approach to staffing.",
      actions: [
        "Map labor hours to revenue by daypart and day of week",
        "Identify overstaffing and understaffing patterns",
        "Design an optimized scheduling template based on covers forecast",
        "Recommend retention strategies to reduce turnover costs",
      ],
      missionObjective:
        "Conduct a labor cost optimization analysis for this restaurant. Map labor hours against revenue by daypart (breakfast, lunch, dinner) and day of week. Identify overstaffing/understaffing patterns, design optimized scheduling templates based on covers forecasting, and recommend retention strategies. Target: reduce labor cost from 33% to below 28% without impacting service quality.",
      recommendedBots: [
        "Director of Operations",
        "Finance Director",
      ],
    },
    {
      title: "Multi-Unit Expansion Feasibility",
      category: "Market Expansion",
      difficulty: "Critical",
      situation:
        "The restaurant has been profitable for 3 years at its original location. The owner is considering a second unit but needs a comprehensive feasibility study including site selection criteria, capital requirements, and operational scaling challenges.",
      actions: [
        "Analyze current unit profitability and replicability",
        "Define site selection criteria and evaluate 3 potential locations",
        "Build a financial model for unit #2 including build-out costs",
        "Design an operational playbook for multi-unit management",
      ],
      missionObjective:
        "Build a multi-unit expansion feasibility study for this restaurant. Analyze the original location's unit economics for replicability, define site selection criteria, model the full P&L for a second unit (build-out costs, ramp timeline, break-even analysis), and outline the operational changes needed for multi-unit management. Deliver a go/no-go recommendation with risk factors.",
      recommendedBots: [
        "Managing Director",
        "Finance Director",
        "Director of Operations",
      ],
    },
  ],
  pipelines: [
    {
      name: "Weekly P&L Briefing & Marketing Pulse",
      triggerType: "manual",
      steps: [
        {
          botTitle: "Finance Director",
          instruction:
            "Generate the weekly P&L summary: total revenue by daypart, food cost %, labor cost %, prime cost, covers count, and average check. Compare to prior week and same week last year. Flag any cost category exceeding target thresholds.",
        },
        {
          botTitle: "Director of Marketing",
          instruction:
            "Based on the financial briefing, analyze which promotions and marketing channels drove this week's traffic. Recommend 2-3 tactical marketing actions for the coming week to address any revenue gaps.",
        },
      ],
    },
  ],
  kbDocuments: [
    {
      title: "Restaurant Operations & Food Safety Reference",
      filename: "restaurant-operations-reference.txt",
      content: `RESTAURANT OPERATIONS & FOOD SAFETY REFERENCE

KEY FINANCIAL METRICS:
Food Cost %: Cost of goods sold / food revenue. Target: 28-32%.
Beverage Cost %: Beverage COGS / beverage revenue. Target: 18-24%.
Labor Cost %: Total labor (wages + benefits + taxes) / total revenue. Target: 25-30%.
Prime Cost: Food cost + labor cost. Should be under 60% of revenue.
Average Check: Total revenue / number of covers.
Table Turnover: Number of seatings per table per service period.
RevPASH: Revenue per available seat hour. Key metric for space optimization.
Break-even: Fixed costs / (1 - variable cost %). Typically $15K-25K/week for full-service.

MENU ENGINEERING MATRIX:
Stars: High popularity, high profitability. Promote and protect.
Puzzles: Low popularity, high profitability. Reposition or rename.
Plowhorses: High popularity, low profitability. Re-engineer or reprice.
Dogs: Low popularity, low profitability. Remove or reimagine.

FOOD SAFETY (HACCP):
Temperature Danger Zone: 41°F - 135°F (5°C - 57°C).
Two-Hour/Four-Hour Rule: Food in danger zone <2hrs = refrigerate. 2-4hrs = use immediately. >4hrs = discard.
FIFO: First In, First Out inventory rotation.
Critical Control Points: Cooking temps, cooling procedures, hot/cold holding.
Health Inspection Prep: Clean as you go, date labeling, handwashing stations, pest control documentation.`,
    },
  ],
};
