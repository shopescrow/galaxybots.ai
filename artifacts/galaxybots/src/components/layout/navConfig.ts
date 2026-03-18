import {
  Zap,
  Bot,
  Building2,
  BarChart2,
  Settings,
  Sparkles,
  Search,
  Layout,
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
  children: NavChild[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    id: "command",
    label: "Command",
    icon: Zap,
    roles: ["owner", "admin"],
    children: [
      { href: "/command-center", label: "Command Center", description: "Owner/admin overview" },
      { href: "/assembly", label: "Assembly", description: "Build and configure assemblies" },
      { href: "/global", label: "Global Assembly", description: "Global assembly management" },
      { href: "/task-rooms", label: "Task Rooms", description: "Collaborative task rooms" },
      { href: "/pipelines", label: "Pipelines", description: "Automation pipelines" },
    ],
  },
  {
    id: "team",
    label: "Team",
    icon: Bot,
    children: [
      { href: "/bots", label: "Bot Roster", description: "Manage your bots" },
      { href: "/boardroom", label: "Boardroom", description: "Strategic discussions" },
      { href: "/scenarios", label: "Scenarios", description: "Scenario planning" },
      { href: "/journal", label: "Journal", description: "Activity journal" },
      { href: "/governance", label: "Governance", description: "Governance controls" },
    ],
  },
  {
    id: "clients",
    label: "Clients",
    icon: Building2,
    children: [
      { href: "/clients", label: "Clients", description: "Client management" },
      { href: "/compliance", label: "Compliance", description: "Compliance tracking" },
      { href: "/proposals", label: "Proposals", description: "Proposals management" },
      { href: "/prospector", label: "Prospector", description: "Autonomous B2B intelligence" },
      { href: "/prospects", label: "Prospects", description: "Prospect pipeline" },
      { href: "/client-portal", label: "Client Portal", description: "Client-facing portal" },
    ],
  },
  {
    id: "intelligence",
    label: "Intelligence",
    icon: BarChart2,
    children: [
      { href: "/analytics", label: "Analytics", description: "Data analytics" },
      { href: "/knowledge-base", label: "Knowledge Base", description: "Knowledge repository" },
      { href: "/documents", label: "Documents", description: "Document management" },
      { href: "/bots/ai-receptionist", label: "AI Receptionist", description: "Front-desk automation" },
    ],
  },
  {
    id: "platform",
    label: "Platform",
    icon: Settings,
    children: [
      { href: "/integrations", label: "Integrations", description: "Third-party connections" },
      { href: "/billing", label: "Billing", description: "Billing and subscription" },
      { href: "/marketplace", label: "Marketplace", description: "Apps and add-ons" },
      { href: "/five-year-plan", label: "Strategic Plan", description: "5-Year business strategy" },
      { href: "/packs", label: "Industry Packs", description: "Vertical-specific packs" },
      { href: "/developers", label: "Developer Portal", description: "API and developer tools" },
    ],
  },
  {
    id: "bingolingo",
    label: "BingoLingo",
    icon: Sparkles,
    external: true,
    externalHref: "/bingolingo/",
    accent: "gold",
    children: [],
  },
];
