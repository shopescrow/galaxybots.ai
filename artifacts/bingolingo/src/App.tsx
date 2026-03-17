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
import { Sparkles, LayoutDashboard, Users, Loader2 } from "lucide-react";

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

function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link href="/">
            <div className="flex items-center gap-2 cursor-pointer">
              <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
                <Sparkles className="h-4 w-4 text-primary-foreground" />
              </div>
              <span className="font-bold text-lg">BingoLingo.ai</span>
            </div>
          </Link>
          <nav className="flex items-center gap-1">
            <Link href="/">
              <span className="px-3 py-1.5 text-sm rounded-md hover:bg-accent transition-colors cursor-pointer flex items-center gap-1.5">
                <LayoutDashboard className="h-3.5 w-3.5" /> Dashboard
              </span>
            </Link>
            <Link href="/clients">
              <span className="px-3 py-1.5 text-sm rounded-md hover:bg-accent transition-colors cursor-pointer flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5" /> Clients
              </span>
            </Link>
          </nav>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-6 py-8">
        {children}
      </main>
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
