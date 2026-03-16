import { Switch, Route, Router as WouterRouter, Link } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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
import { Sparkles, LayoutDashboard, Users } from "lucide-react";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});

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
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
