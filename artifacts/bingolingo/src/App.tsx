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
import { Sparkles, LayoutDashboard, Users, Loader2, Menu, X } from "lucide-react";
import { useState, useEffect } from "react";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});

const API_BASE = `${import.meta.env.BASE_URL}../api/bingolingo`.replace(/\/\//g, "/");
const LOGIN_URL = `${import.meta.env.BASE_URL}../`.replace(/\/\//g, "/") + "login";

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

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/clients", label: "Clients", icon: Users },
];

function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [location]);

  useEffect(() => {
    if (menuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [menuOpen]);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <Link href="/">
            <div className="flex items-center gap-2 cursor-pointer">
              <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
                <Sparkles className="h-4 w-4 text-primary-foreground" />
              </div>
              <span className="font-bold text-lg">BingoLingo.ai</span>
            </div>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden sm:flex items-center gap-1">
            {NAV_ITEMS.map((item) => {
              const isActive = item.href === "/" ? location === "/" : location.startsWith(item.href);
              return (
                <Link key={item.href} href={item.href}>
                  <span className={`px-3 py-1.5 text-sm rounded-md transition-colors cursor-pointer flex items-center gap-1.5 min-h-[36px] ${isActive ? "bg-accent text-foreground" : "hover:bg-accent"}`}>
                    <item.icon className="h-3.5 w-3.5" /> {item.label}
                  </span>
                </Link>
              );
            })}
          </nav>

          {/* Mobile hamburger */}
          <button
            className="sm:hidden p-2 rounded-md min-w-[44px] min-h-[44px] flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {/* Mobile dropdown nav */}
        {menuOpen && (
          <div className="sm:hidden border-t bg-card px-4 py-3 flex flex-col gap-1">
            {NAV_ITEMS.map((item) => {
              const isActive = item.href === "/" ? location === "/" : location.startsWith(item.href);
              return (
                <Link key={item.href} href={item.href}>
                  <span className={`px-3 py-3 text-sm rounded-md transition-colors cursor-pointer flex items-center gap-2 min-h-[44px] ${isActive ? "bg-accent text-foreground font-medium" : "hover:bg-accent"}`}>
                    <item.icon className="h-4 w-4" /> {item.label}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </header>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {children}
      </main>
    </div>
  );
}

function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-14 flex items-center">
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
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
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
