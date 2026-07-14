import {
  Zap,
  Bot,
  Building2,
  BarChart2,
  Settings,
  Sparkles,
  Search,
  Layout,
  Workflow,
  Activity,
  Radio,
  Brain,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface NavChild {
  href: string;
  label: string;
  description?: string;
}

export interface NavGroup {
  id: string;
  label: string;
  icon: LucideIcon;
  roles?: string[];
  external?: boolean;
  externalHref?: string;
  accent?: string;
  color?: string;
  district?: string;
  children: NavChild[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    id: "command",
    label: "Command",
    icon: Zap,
    roles: ["owner", "admin"],
    color: "gold",
    district: "HQ District",
    children: [
      { href: "/atrium",        label: "Galaxy Mall",     description: "Mission control — all districts in one view" },
      { href: "/command-center", label: "Command Center", description: "Owner/admin overview" },
      { href: "/asset-review",  label: "Review Cockpit",  description: "Batch asset review & confidence-tiered autonomy" },
      { href: "/activity",      label: "Activity Stream", description: "Unified cross-platform activity feed" },
      { href: "/process-studio",label: "Process Studio",  description: "Visual workflow builder" },
      { href: "/assembly",      label: "Assembly",        description: "Build and configure assemblies" },
      { href: "/global",        label: "Global Assembly", description: "Global assembly management" },
      { href: "/task-rooms",    label: "Task Rooms",      description: "Collaborative task rooms" },
      { href: "/pipelines",     label: "Pipelines",       description: "Automation pipelines" },
    ],
  },
  {
    id: "team",
    label: "Team",
    icon: Bot,
    color: "cyan",
    district: "Bot District",
    children: [
      { href: "/bots",       label: "Bot Roster",        description: "Manage your bots" },
      { href: "/boardroom",  label: "Boardroom",         description: "Strategic discussions" },
      { href: "/scenarios",  label: "Scenarios",         description: "Scenario planning" },
      { href: "/journal",    label: "Journal",           description: "Activity journal" },
      { href: "/governance", label: "Governance",        description: "Governance controls" },
      { href: "/gaa",        label: "Autonomous Agent",  description: "Galaxy Autonomous Agent — goals, constitution & escalations" },
    ],
  },
  {
    id: "clients",
    label: "Clients",
    icon: Building2,
    color: "emerald",
    district: "Business District",
    children: [
      { href: "/clients",       label: "Clients",         description: "Client management" },
      { href: "/roi",           label: "ROI Dashboard",   description: "Client ROI and value reporting" },
      { href: "/compliance",    label: "Compliance",      description: "Compliance tracking" },
      { href: "/proposals",     label: "Proposals",       description: "Proposals management" },
      { href: "/prospector",    label: "Prospector",      description: "Autonomous B2B intelligence" },
      { href: "/prospects",     label: "Prospects",       description: "Prospect pipeline" },
      { href: "/client-portal", label: "Client Portal",   description: "Client-facing portal" },
    ],
  },
  {
    id: "intelligence",
    label: "Intelligence",
    icon: BarChart2,
    color: "purple",
    district: "Data District",
    children: [
      { href: "/analytics",             label: "Analytics",             description: "Data analytics" },
      { href: "/briefs",                label: "Intelligence Briefings", description: "Daily & weekly briefings" },
      { href: "/knowledge-base",        label: "Knowledge Base",        description: "Knowledge repository" },
      { href: "/documents",             label: "Documents",             description: "Document management" },
      { href: "/asset-studio",          label: "Asset Studio",          description: "Portfolio of income-producing digital assets" },
      { href: "/bots/ai-receptionist",  label: "AI Receptionist",       description: "Front-desk automation" },
      { href: "/employee-learning",     label: "AI Profiles",           description: "Employee behavioral profiles & learning loop" },
      { href: "/self-improvement",      label: "Self-Improvement",      description: "Calibration, prompt evolution & alignment" },
      { href: "/experiments",           label: "Experiments",           description: "A/B hypothesis testing" },
      { href: "/alignment-audit",       label: "Alignment Audit",       description: "Multi-stakeholder learned preferences" },
      { href: "/prompt-versions",       label: "Prompt Versions",       description: "System prompt evolution history" },
      { href: "/platform-intelligence", label: "Platform Intelligence", description: "Oracle reports, AGI dimensions & consequence alignment" },
      { href: "/galaxy-intelligence",   label: "Galaxy Intelligence",   description: "Self-optimization dashboard" },
      { href: "/demand-intelligence",   label: "Demand Intelligence",   description: "Niche demand vs. competition research" },
    ],
  },
  {
    id: "platform",
    label: "Platform",
    icon: Settings,
    color: "blue",
    district: "Core District",
    children: [
      { href: "/integrations",    label: "Integrations",    description: "Third-party connections" },
      { href: "/billing",         label: "Billing",         description: "Billing and subscription" },
      { href: "/statements",      label: "Statements",      description: "Itemized usage invoices & PDFs" },
      { href: "/marketplace",     label: "Marketplace",     description: "Apps and add-ons" },
      { href: "/five-year-plan",  label: "Strategic Plan",  description: "5-Year business strategy" },
      { href: "/user-guide",      label: "User Guide",      description: "New user onboarding guide" },
      { href: "/packs",           label: "Industry Packs",  description: "Vertical-specific packs" },
      { href: "/developers",      label: "Developer Portal",description: "API and developer tools" },
      { href: "/mcp-growth-hub",  label: "MCP Growth Hub",  description: "Market your MCP servers across agent discovery platforms" },
    ],
  },
  {
    id: "bingolingo",
    label: "BingoLingo",
    icon: Sparkles,
    external: true,
    externalHref: "/bingolingo/",
    accent: "gold",
    color: "amber",
    district: "Partner Wing",
    children: [],
  },
];
