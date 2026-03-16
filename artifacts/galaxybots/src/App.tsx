import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { UserPreferencesProvider } from "@/contexts/UserPreferencesContext";
import { DemoProvider } from "@/contexts/DemoContext";

import Home from "@/pages/Home";
import BotRoster from "@/pages/bots/BotRoster";
import BotDetail from "@/pages/bots/BotDetail";
import Boardroom from "@/pages/boardroom/Boardroom";
import Journal from "@/pages/journal/Journal";
import Clients from "@/pages/clients/Clients";
import ClientDetail from "@/pages/clients/ClientDetail";
import Hire from "@/pages/hire/Hire";
import HowItWorks from "@/pages/HowItWorks";
import Blog from "@/pages/blog/Blog";
import BlogPost from "@/pages/blog/BlogPost";
import PartnerLanding from "@/pages/partner/PartnerLanding";
import Valuation from "@/pages/Valuation";
import Global from "@/pages/Global";
import TaskSessions from "@/pages/task-sessions/TaskSessions";
import DeployTeam from "@/pages/task-sessions/DeployTeam";
import TaskBoardroom from "@/pages/task-sessions/TaskBoardroom";
import Assembly from "@/pages/Assembly";
import Compliance from "@/pages/compliance/Compliance";
import Integrations from "@/pages/integrations/Integrations";
import AIReceptionist from "@/pages/bots/AIReceptionist";
import ROIDashboard from "@/pages/roi/ROIDashboard";
import SharedReport from "@/pages/roi/SharedReport";
import Billing from "@/pages/Billing";
import Scenarios from "@/pages/scenarios/Scenarios";
import Prospects from "@/pages/prospects/Prospects";
import Settings from "@/pages/Settings";
import Governance from "@/pages/governance/Governance";
import KnowledgeBase from "@/pages/knowledge-base/KnowledgeBase";
import DocumentStudio from "@/pages/documents/DocumentStudio";
import Pipelines from "@/pages/pipelines/Pipelines";
import CommandCenter from "@/pages/command-center/CommandCenter";
import AnalyticsDashboard from "@/pages/analytics/AnalyticsDashboard";
import NotFound from "@/pages/not-found";
import Login from "@/pages/auth/Login";
import Register from "@/pages/auth/Register";
import ForgotUsername from "@/pages/auth/ForgotUsername";
import ForgotPassword from "@/pages/auth/ForgotPassword";
import LiveDemo from "@/pages/demo/LiveDemo";
import DemoClaim from "@/pages/demo/DemoClaim";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

function SmartHome() {
  const { user, isLoading } = useAuth();
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }
  if (user && (user.role === "owner" || user.role === "admin")) {
    return <Redirect to="/command-center" />;
  }
  return <Home />;
}

function AuthenticatedRoutes() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return <Redirect to="/login" />;
  }

  return (
    <Switch>
      <Route path="/command-center" component={CommandCenter} />
      <Route path="/bots" component={BotRoster} />
      <Route path="/bots/ai-receptionist" component={AIReceptionist} />
      <Route path="/bots/:id" component={BotDetail} />
      <Route path="/boardroom" component={Boardroom} />
      <Route path="/journal" component={Journal} />
      <Route path="/clients" component={Clients} />
      <Route path="/clients/:id" component={ClientDetail} />
      <Route path="/hire" component={Hire} />
      <Route path="/blog" component={Blog} />
      <Route path="/blog/:slug" component={BlogPost} />
      <Route path="/partner" component={PartnerLanding} />
      <Route path="/valuation" component={Valuation} />
      <Route path="/global" component={Global} />
      <Route path="/task-rooms" component={TaskSessions} />
      <Route path="/deploy-team" component={DeployTeam} />
      <Route path="/task-rooms/:id" component={TaskBoardroom} />
      <Route path="/assembly" component={Assembly} />
      <Route path="/compliance" component={Compliance} />
      <Route path="/integrations" component={Integrations} />
      <Route path="/clients/:id/roi" component={ROIDashboard} />
      <Route path="/roi/shared/:token" component={SharedReport} />
      <Route path="/billing" component={Billing} />
      <Route path="/scenarios" component={Scenarios} />
      <Route path="/prospects" component={Prospects} />
      <Route path="/settings" component={Settings} />
      <Route path="/governance" component={Governance} />
      <Route path="/knowledge-base" component={KnowledgeBase} />
      <Route path="/documents" component={DocumentStudio} />
      <Route path="/pipelines" component={Pipelines} />
      <Route path="/analytics" component={AnalyticsDashboard} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AppRouter() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />
      <Route path="/forgot-username" component={ForgotUsername} />
      <Route path="/forgot-password" component={ForgotPassword} />
      <Route path="/demo" component={LiveDemo} />
      <Route path="/demo/claim" component={DemoClaim} />
      <Route path="/" component={SmartHome} />
      <Route path="/how-it-works" component={HowItWorks} />
      <Route>
        <AuthenticatedRoutes />
      </Route>
    </Switch>
  );
}

export default function App() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <DemoProvider>
          <UserPreferencesProvider>
            <QueryClientProvider client={queryClient}>
              <TooltipProvider>
                <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
                  <AppRouter />
                </WouterRouter>
                <Toaster />
              </TooltipProvider>
            </QueryClientProvider>
          </UserPreferencesProvider>
        </DemoProvider>
      </AuthProvider>
    </LanguageProvider>
  );
}
