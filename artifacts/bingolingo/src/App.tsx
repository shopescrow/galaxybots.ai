import { Switch, Route, Router as WouterRouter, Link, useLocation } from "wouter";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Dashboard from "@/pages/Dashboard";
import ClientList from "@/pages/ClientList";
import NewClient from "@/pages/NewClient";
import ClientWorkspace from "@/pages/ClientWorkspace";
import ContentGenerator from "@/pages/ContentGenerator";
import ContentCalendar from "@/pages/ContentCalendar";
import ContentHub from "@/pages/ContentHub";
import HubPost from "@/pages/HubPost";
import NotFound from "@/pages/not-found";
import BLSettings from "@/pages/Settings";
import { Sparkles, LayoutDashboard, Users, Settings as SettingsIcon, Menu, X, Loader2 } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});

const API_BASE = `${import.meta.env.BASE_URL}../api/bingolingo`.replace(/\/\//g, "/");
const LOGIN_URL = `${import.meta.env.BASE_URL}../`.replace(/\/\//g, "/") + "login";

const BL_NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, matchPrefix: false },
  { href: "/clients", label: "Clients", icon: Users, matchPrefix: true },
  { href: "/settings", label: "Settings", icon: SettingsIcon, matchPrefix: false },
];

function useBLSidebarState() {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      const s = localStorage.getItem("bl_sidebar_collapsed");
      if (s !== null) return JSON.parse(s);
    } catch {}
    return false;
  });
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    try { localStorage.setItem("bl_sidebar_collapsed", JSON.stringify(collapsed)); } catch {}
  }, [collapsed]);

  const toggle = useCallback(() => setCollapsed((c) => !c), []);
  const closeMobile = useCallback(() => setMobileOpen(false), []);
  const toggleMobile = useCallback(() => setMobileOpen((o) => !o), []);

  return { collapsed, toggle, mobileOpen, closeMobile, toggleMobile };
}

function BLSidebar({
  collapsed,
  mobileOpen,
  onCloseMobile,
}: {
  collapsed: boolean;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}) {
  const [location] = useLocation();

  const isActive = (item: typeof BL_NAV[0]) =>
    item.matchPrefix ? location.startsWith(item.href) : location === item.href;

  const navItems = (fullWidth: boolean) =>
    BL_NAV.map((item) => {
      const active = isActive(item);
      const Icon = item.icon;
      return (
        <Link
          key={item.href}
          href={item.href}
          onClick={onCloseMobile}
          className={cn(
            "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors",
            active
              ? "bg-primary/10 text-primary"
              : "text-muted-foreground hover:bg-accent hover:text-foreground",
            !fullWidth && collapsed && "justify-center px-0"
          )}
          aria-current={active ? "page" : undefined}
        >
          <Icon className="w-4 h-4 shrink-0" />
          {fullWidth && <span>{item.label}</span>}
        </Link>
      );
    });

  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}

      <aside
        className={cn(
          "fixed top-14 left-0 h-[calc(100vh-3.5rem)] z-40 border-r border-border/40 bg-card transition-all duration-300 hidden lg:flex flex-col py-3",
          collapsed ? "w-14 px-2" : "w-56 px-2"
        )}
        aria-label="Sidebar navigation"
      >
        {navItems(!collapsed)}
      </aside>

      <aside
        className={cn(
          "fixed top-0 left-0 h-full w-64 z-50 flex flex-col border-r border-border/40 bg-card shadow-2xl transition-transform duration-300 lg:hidden",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
        aria-label="Mobile navigation"
        aria-hidden={!mobileOpen}
      >
        <div className="flex items-center justify-between px-4 h-14 border-b border-border/40">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-primary flex items-center justify-center">
              <Sparkles className="h-3.5 w-3.5 text-primary-foreground" />
            </div>
            <span className="font-bold text-base">BingoLingo.ai</span>
          </div>
          <button
            onClick={onCloseMobile}
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent"
            aria-label="Close navigation"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex flex-col gap-0.5 px-2 py-3">
          {navItems(true)}
        </div>
      </aside>
    </>
  );
}

function AuthGuard({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  if (location.startsWith("/hub/")) {
    return <>{children}</>;
  }

  const { data: authStatus, isLoading, error, refetch } = useQuery({
    queryKey: ["auth-check"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/dashboard-stats`, { credentials: "include" });
      if (res.status === 401) {
        window.location.href = LOGIN_URL;
        return { authenticated: false };
      }
      if (!res.ok) throw new Error("Unable to reach BingoLingo. Please try again.");
      return { authenticated: true };
    },
    retry: 1,
    staleTime: 60000,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-3">
          <p className="text-sm text-muted-foreground">{error.message}</p>
          <button onClick={() => refetch()} className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90">
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!authStatus?.authenticated) {
    return null;
  }

  return <>{children}</>;
}

function AppLayout({ children }: { children: React.ReactNode }) {
  const { collapsed, toggle, mobileOpen, closeMobile, toggleMobile } = useBLSidebarState();

  return (
    <div className="min-h-screen bg-background">
      <header className="fixed top-0 left-0 right-0 z-50 h-14 border-b bg-card flex items-center px-3 gap-3">
        <button
          onClick={toggleMobile}
          className="lg:hidden p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent min-w-[44px] min-h-[44px] flex items-center justify-center"
          aria-label="Toggle navigation"
        >
          <Menu className="w-5 h-5" />
        </button>
        <button
          onClick={toggle}
          className="hidden lg:flex p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent"
          aria-label="Toggle sidebar"
        >
          <Menu className="w-5 h-5" />
        </button>
        <Link href="/">
          <div className="flex items-center gap-2 cursor-pointer">
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
              <Sparkles className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-bold text-lg">BingoLingo.ai</span>
          </div>
        </Link>
        <div className="flex-1" />
        <Link href="/settings" className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent min-w-[44px] min-h-[44px] flex items-center justify-center" aria-label="Settings">
          <SettingsIcon className="w-4 h-4" />
        </Link>
      </header>

      <BLSidebar collapsed={collapsed} mobileOpen={mobileOpen} onCloseMobile={closeMobile} />

      <div
        className={cn(
          "flex flex-col pt-14 min-h-screen transition-all duration-300",
          "lg:ml-56",
          collapsed && "lg:ml-14"
        )}
      >
        <main className="flex-1 px-4 sm:px-6 py-6 sm:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}

function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="max-w-4xl mx-auto px-6 h-14 flex items-center">
          <Link href="/">
            <div className="flex items-center gap-2 cursor-pointer">
              <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
                <Sparkles className="h-4 w-4 text-primary-foreground" />
              </div>
              <span className="font-bold text-lg">BingoLingo.ai</span>
            </div>
          </Link>
        </div>
      </header>
      <main className="max-w-4xl mx-auto px-6 py-8">
        {children}
      </main>
    </div>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/">{() => <AppLayout><Dashboard /></AppLayout>}</Route>
      <Route path="/clients">{() => <AppLayout><ClientList /></AppLayout>}</Route>
      <Route path="/clients/new">{() => <AppLayout><NewClient /></AppLayout>}</Route>
      <Route path="/clients/:id">{() => <AppLayout><ClientWorkspace /></AppLayout>}</Route>
      <Route path="/clients/:id/generate">{() => <AppLayout><ContentGenerator /></AppLayout>}</Route>
      <Route path="/clients/:id/calendar">{() => <AppLayout><ContentCalendar /></AppLayout>}</Route>
      <Route path="/settings">{() => <AppLayout><BLSettings /></AppLayout>}</Route>
      <Route path="/hub/:clientSlug">{() => <PublicLayout><ContentHub /></PublicLayout>}</Route>
      <Route path="/hub/:clientSlug/:contentSlug">{() => <PublicLayout><HubPost /></PublicLayout>}</Route>
      <Route>{() => <AppLayout><NotFound /></AppLayout>}</Route>
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AuthGuard>
            <Router />
          </AuthGuard>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
