import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { LanguageProvider } from "@/contexts/LanguageContext";

// Pages
import Home from "@/pages/Home";
import BotRoster from "@/pages/bots/BotRoster";
import BotDetail from "@/pages/bots/BotDetail";
import Boardroom from "@/pages/boardroom/Boardroom";
import Journal from "@/pages/journal/Journal";
import Clients from "@/pages/clients/Clients";
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
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/bots" component={BotRoster} />
      <Route path="/bots/:id" component={BotDetail} />
      <Route path="/boardroom" component={Boardroom} />
      <Route path="/journal" component={Journal} />
      <Route path="/clients" component={Clients} />
      <Route path="/hire" component={Hire} />
      <Route path="/how-it-works" component={HowItWorks} />
      <Route path="/blog" component={Blog} />
      <Route path="/blog/:slug" component={BlogPost} />
      <Route path="/partner" component={PartnerLanding} />
      <Route path="/valuation" component={Valuation} />
      <Route path="/global" component={Global} />
      <Route path="/task-rooms" component={TaskSessions} />
      <Route path="/deploy-team" component={DeployTeam} />
      <Route path="/task-rooms/:id" component={TaskBoardroom} />
      <Route path="/assembly" component={Assembly} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <LanguageProvider>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </LanguageProvider>
    </QueryClientProvider>
  );
}

export default App;
