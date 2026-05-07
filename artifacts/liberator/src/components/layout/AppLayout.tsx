import { Link, useLocation } from "wouter";
import { Boxes, LayoutDashboard, Plus, Settings, TrendingDown, Crown, Database } from "lucide-react";
import { cn } from "@/lib/utils";

interface AppLayoutProps {
  children: React.ReactNode;
}

interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

export function AppLayout({ children }: AppLayoutProps) {
  const [location] = useLocation();

  const navGroups: NavGroup[] = [
    {
      label: "Command Center",
      items: [
        { name: "Dashboard", href: "/", icon: LayoutDashboard },
        { name: "New Extraction", href: "/jobs/new", icon: Plus },
      ],
    },
    {
      label: "My CRMs",
      items: [
        { name: "All CRMs", href: "/crms", icon: Database },
      ],
    },
    {
      label: "Intel",
      items: [
        { name: "Cost of Captivity", href: "/intel/cost-of-captivity", icon: TrendingDown },
        { name: "The Reclamation", href: "/intel/reclamation", icon: Crown },
      ],
    },
  ];

  const navigation = navGroups.flatMap((g) => g.items);

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row">
      <div className="w-full md:w-64 border-r border-border bg-card flex flex-col hidden md:flex">
        <div className="p-6 border-b border-border flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-primary flex items-center justify-center text-primary-foreground">
            <Boxes className="w-5 h-5" />
          </div>
          <span className="font-bold text-lg tracking-tight">Liberator</span>
        </div>
        <div className="flex-1 py-6 px-4 space-y-6">
          {navGroups.map((group) => (
            <div key={group.label} className="space-y-1">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 px-2">
                {group.label}
              </div>
              {group.items.map((item) => {
                const isActive = location === item.href;
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2 rounded-md transition-colors",
                      isActive
                        ? "bg-primary/10 text-primary font-medium"
                        : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                    )}
                  >
                    <item.icon className="w-4 h-4" />
                    {item.name}
                  </Link>
                );
              })}
            </div>
          ))}
        </div>
        <div className="p-4 border-t border-border">
          <div className="flex items-center gap-3 px-3 py-2 text-sm text-muted-foreground hover:text-foreground cursor-pointer rounded-md hover:bg-secondary transition-colors">
            <Settings className="w-4 h-4" />
            System Preferences
          </div>
        </div>
      </div>

      {/* Mobile nav */}
      <div className="md:hidden border-b border-border bg-card p-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-primary flex items-center justify-center text-primary-foreground">
            <Boxes className="w-3 h-3" />
          </div>
          <span className="font-bold">Liberator</span>
        </div>
        <div className="flex gap-2">
          {navigation.map((item) => (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "p-2 rounded-md transition-colors",
                location === item.href
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-secondary"
              )}
            >
              <item.icon className="w-5 h-5" />
            </Link>
          ))}
        </div>
      </div>

      <main className="flex-1 overflow-auto">
        <div className="p-4 md:p-8 max-w-7xl mx-auto">{children}</div>
      </main>
    </div>
  );
}
