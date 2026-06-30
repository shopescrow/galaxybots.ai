import React, { lazy, Suspense, useState, useEffect } from "react";
import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { UserPreferencesProvider } from "@/contexts/UserPreferencesContext";
import { PartnerProvider } from "@/contexts/PartnerContext";
import { ActiveClientProvider } from "@/contexts/ActiveClientContext";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import { PageSkeleton } from "@/components/skeletons/PageSkeletons";

// ─── Lazy page imports ──────────────────────────────────────────────────────
const OnboardingWizard    = lazy(() => import("@/components/onboarding/OnboardingWizard"));
const Home                = lazy(() => import("@/pages/general/Home"));
const HowItWorks          = lazy(() => import("@/pages/marketing/HowItWorks"));
const Valuation           = lazy(() => import("@/pages/marketing/Valuation"));
const Global              = lazy(() => import("@/pages/general/Global"));
const Assembly            = lazy(() => import("@/pages/general/Assembly"));
const Billing             = lazy(() => import("@/pages/billing/Billing"));
const Statements          = lazy(() => import("@/pages/billing/Statements"));
const Pricing             = lazy(() => import("@/pages/marketing/Pricing"));
const Settings            = lazy(() => import("@/pages/settings/Settings"));

const BotRoster           = lazy(() => import("@/pages/bots/BotRoster"));
const BotDetail           = lazy(() => import("@/pages/bots/BotDetail"));
const AIReceptionist      = lazy(() => import("@/pages/bots/AIReceptionist"));
const CFODashboard        = lazy(() => import("@/pages/bots/CFODashboard"));

const Boardroom           = lazy(() => import("@/pages/boardroom/Boardroom"));
const Journal             = lazy(() => import("@/pages/journal/Journal"));

const Clients             = lazy(() => import("@/pages/clients/Clients"));
const ClientDetail        = lazy(() => import("@/pages/clients/ClientDetail"));
const ClientPortal        = lazy(() => import("@/pages/client-portal/ClientPortal"));

const Hire                = lazy(() => import("@/pages/hire/Hire"));

const Blog                = lazy(() => import("@/pages/blog/Blog"));
const BlogPost            = lazy(() => import("@/pages/blog/BlogPost"));

const PartnerLanding      = lazy(() => import("@/pages/partner/PartnerLanding"));
const PartnerApply        = lazy(() => import("@/pages/partner/PartnerApply"));
const PartnerAdminPortal  = lazy(() => import("@/pages/partner/PartnerAdminPortal"));

const TaskSessions        = lazy(() => import("@/pages/task-sessions/TaskSessions"));
const DeployTeam          = lazy(() => import("@/pages/task-sessions/DeployTeam"));
const TaskBoardroom       = lazy(() => import("@/pages/task-sessions/TaskBoardroom"));

const Compliance          = lazy(() => import("@/pages/compliance/Compliance"));
const Integrations        = lazy(() => import("@/pages/integrations/Integrations"));

const ROIDashboard        = lazy(() => import("@/pages/roi/ROIDashboard"));
const SharedReport        = lazy(() => import("@/pages/roi/SharedReport"));

const Scenarios           = lazy(() => import("@/pages/scenarios/Scenarios"));

const Prospects           = lazy(() => import("@/pages/prospects/Prospects"));
const Prospector          = lazy(() => import("@/pages/prospects/Prospector"));

const Governance          = lazy(() => import("@/pages/governance/Governance"));
const GaaConsole          = lazy(() => import("@/pages/gaa/GaaConsole"));
const KnowledgeBase       = lazy(() => import("@/pages/knowledge-base/KnowledgeBase"));
const DocumentStudio      = lazy(() => import("@/pages/documents/DocumentStudio"));
const AssetStudio         = lazy(() => import("@/pages/asset-studio/AssetStudio"));
const AssetDetail         = lazy(() => import("@/pages/asset-studio/AssetDetail"));
const ProposalStudio      = lazy(() => import("@/pages/proposals/ProposalStudio"));
const SharedProposal      = lazy(() => import("@/pages/proposals/SharedProposal"));
const Pipelines           = lazy(() => import("@/pages/pipelines/Pipelines"));
const GalaxyAtrium        = lazy(() => import("@/pages/atrium/GalaxyAtrium"));
const CommandCenter       = lazy(() => import("@/pages/command-center/CommandCenter"));
const AssetReviewCockpit  = lazy(() => import("@/pages/asset-review/AssetReviewCockpit"));
const AnalyticsDashboard  = lazy(() => import("@/pages/analytics/AnalyticsDashboard"));
const PitchDeck           = lazy(() => import("@/pages/five-year-plan/PitchDeck"));
const UserGuide           = lazy(() => import("@/pages/user-guide/UserGuide"));
const DeveloperPortal     = lazy(() => import("@/pages/developers/DeveloperPortal"));
const NotFound            = lazy(() => import("@/pages/general/not-found"));

const Login               = lazy(() => import("@/pages/auth/Login"));
const Register            = lazy(() => import("@/pages/auth/Register"));
const ForgotUsername      = lazy(() => import("@/pages/auth/ForgotUsername"));
const ForgotPassword      = lazy(() => import("@/pages/auth/ForgotPassword"));
const SSOCallback         = lazy(() => import("@/pages/auth/SSOCallback"));

const BookDemo            = lazy(() => import("@/pages/demo/BookDemo"));

const PacksLibrary        = lazy(() => import("@/pages/packs/PacksLibrary"));
const PackDetail          = lazy(() => import("@/pages/packs/PackDetail"));

const MarketplaceGallery  = lazy(() => import("@/pages/marketplace/MarketplaceGallery"));
const TemplateDetail      = lazy(() => import("@/pages/marketplace/TemplateDetail"));
const AdminModeration     = lazy(() => import("@/pages/marketplace/AdminModeration"));

const OrgAdmin            = lazy(() => import("@/pages/settings/OrgAdmin"));
const NotificationsPage   = lazy(() => import("@/pages/notifications/NotificationsPage"));
const UsageDashboard      = lazy(() => import("@/pages/usage/UsageDashboard"));
const BriefsPage          = lazy(() => import("@/pages/briefs/BriefsPage"));
const ProcessStudio       = lazy(() => import("@/pages/process-studio/ProcessStudio"));
const ActivityStream      = lazy(() => import("@/pages/activity/ActivityStream"));

const McpGrowthHub        = lazy(() => import("@/pages/mcp-marketing/McpGrowthHub"));
const McpLaunch           = lazy(() => import("@/pages/mcp-marketing/McpLaunch"));
const McpDocs             = lazy(() => import("@/pages/mcp-marketing/McpDocs"));
const SlaWalkthrough      = lazy(() => import("@/pages/sla-walkthrough/SlaWalkthrough"));
const GuardianHive        = lazy(() => import("@/pages/guardian/GuardianHive"));
const BeliefBrowser       = lazy(() => import("@/pages/beliefs/BeliefBrowser"));
const SecurityEventLog    = lazy(() => import("@/pages/beliefs/SecurityEventLog"));
const AnomalyQueue        = lazy(() => import("@/pages/beliefs/AnomalyQueue"));
const CausalModelDashboard = lazy(() => import("@/pages/causal/CausalModelDashboard"));
const SelfImprovementDashboard = lazy(() => import("@/pages/self-improvement/SelfImprovementDashboard"));
const ExperimentsPage     = lazy(() => import("@/pages/self-improvement/ExperimentsPage"));
const AlignmentAuditPage  = lazy(() => import("@/pages/self-improvement/AlignmentAuditPage"));
const PromptVersionsPage  = lazy(() => import("@/pages/self-improvement/PromptVersionsPage"));
const PlatformIntelligence = lazy(() => import("@/pages/platform-intelligence/PlatformIntelligence"));
const GalaxyIntelligence  = lazy(() => import("@/pages/intelligence/GalaxyIntelligence"));
const DemandEngine        = lazy(() => import("@/pages/intelligence/DemandEngine"));

// ─── Skeleton fallback used by all Suspense boundaries ───────────────────────
function PageLoader() {
  return <PageSkeleton />;
}

// ─── Auto-recover from stale lazy chunks after a new deploy ──────────────────
// A fresh deploy invalidates the hashed chunk filenames referenced by an
// already-open tab. The dynamic import then 404s and (without this) renders a
// blank page. Reload once per session to fetch the new assets.
if (typeof window !== "undefined") {
  window.addEventListener("vite:preloadError", () => {
    try {
      if (sessionStorage.getItem("chunk-reload") === "1") return;
      sessionStorage.setItem("chunk-reload", "1");
    } catch {
      // sessionStorage can throw in private mode / storage-denied browsers.
      // Fall through to a single reload attempt rather than crashing.
    }
    window.location.reload();
  });
}

// ─── Full-page fallback when a route crashes or a chunk fails to load ────────
function RootErrorFallback() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background text-center px-6">
      <h1 className="text-xl font-bold">This page failed to load</h1>
      <p className="text-sm text-muted-foreground max-w-sm">
        Something went wrong while loading this page. Reloading usually fixes it.
      </p>
      <button
        onClick={() => window.location.reload()}
        className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
      >
        Reload page
      </button>
    </div>
  );
}

// ─── QueryClient ─────────────────────────────────────────────────────────────
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

// ─── Admin-only route guard ────────────────────────────────────────────────────
function AdminOnly({ component: Component }: { component: React.ComponentType }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return <PageLoader />;
  if (!user) return <Redirect to="/login" />;
  if (user.role !== "owner" && user.role !== "admin") return <Redirect to="/boardroom" />;
  return <Component />;
}

function OwnerOnly({ component: Component }: { component: React.ComponentType }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return <PageLoader />;
  if (!user) return <Redirect to="/login" />;
  if (user.role !== "owner") return <Redirect to="/boardroom" />;
  return <Component />;
}

// ─── Route groups ─────────────────────────────────────────────────────────────
function SmartHome() {
  const { user, isLoading } = useAuth();
  if (isLoading) return <PageLoader />;
  if (user) {
    if (user.role === "owner" || user.role === "admin") {
      return <Redirect to="/atrium" />;
    }
    return <Redirect to="/boardroom" />;
  }
  return <Home />;
}

function AuthenticatedRoutes() {
  const { user, isLoading } = useAuth();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardShownThisSession, setWizardShownThisSession] = useState(false);

  useEffect(() => {
    if (!user || isLoading || wizardShownThisSession) return;
    const onboarding = user.onboarding;
    if (!onboarding || onboarding.dismissed || onboarding.completedAt) return;
    const hasIncompleteSteps = !onboarding.companyProfile || !onboarding.industry || !onboarding.firstClient || !onboarding.integrations;
    if (hasIncompleteSteps) {
      setWizardOpen(true);
      setWizardShownThisSession(true);
    }
  }, [user, isLoading, wizardShownThisSession]);

  if (isLoading) return <PageLoader />;
  if (!user) return <Redirect to="/login" />;

  return (
    <>
      <OnboardingWizard open={wizardOpen} onOpenChange={setWizardOpen} />
      <Switch>
        <Route path="/atrium"                 component={GalaxyAtrium} />
        <Route path="/command-center"         component={() => <AdminOnly component={CommandCenter} />} />
        <Route path="/asset-review"           component={() => <AdminOnly component={AssetReviewCockpit} />} />
        <Route path="/bots"                   component={BotRoster} />
        <Route path="/bots/ai-receptionist"   component={AIReceptionist} />
        <Route path="/bots/:id/cfo-dashboard" component={CFODashboard} />
        <Route path="/bots/:id"               component={BotDetail} />
        <Route path="/boardroom"              component={Boardroom} />
        <Route path="/journal"                component={Journal} />
        <Route path="/clients"                component={Clients} />
        <Route path="/clients/:id"            component={ClientDetail} />
        <Route path="/hire"                   component={Hire} />
        <Route path="/blog"                   component={Blog} />
        <Route path="/blog/:slug"             component={BlogPost} />
        <Route path="/valuation"              component={Valuation} />
        <Route path="/global"                 component={Global} />
        <Route path="/task-rooms"             component={TaskSessions} />
        <Route path="/deploy-team"            component={DeployTeam} />
        <Route path="/task-rooms/:id"         component={TaskBoardroom} />
        <Route path="/assembly"               component={Assembly} />
        <Route path="/compliance"             component={Compliance} />
        <Route path="/integrations"           component={Integrations} />
        <Route path="/roi"                    component={ROIDashboard} />
        <Route path="/clients/:id/roi"        component={ROIDashboard} />
        <Route path="/billing"                component={Billing} />
        <Route path="/statements"             component={() => <AdminOnly component={Statements} />} />
        <Route path="/scenarios"              component={Scenarios} />
        <Route path="/prospects"              component={Prospects} />
        <Route path="/prospector"             component={Prospector} />
        <Route path="/settings"               component={Settings} />
        <Route path="/governance"             component={Governance} />
        <Route path="/gaa"                    component={() => <OwnerOnly component={GaaConsole} />} />
        <Route path="/knowledge-base"         component={KnowledgeBase} />
        <Route path="/documents"              component={DocumentStudio} />
        <Route path="/asset-studio"           component={AssetStudio} />
        <Route path="/asset-studio/:id"       component={AssetDetail} />
        <Route path="/proposals"              component={ProposalStudio} />
        <Route path="/pipelines"              component={Pipelines} />
        <Route path="/analytics"              component={AnalyticsDashboard} />
        <Route path="/five-year-plan"         component={PitchDeck} />
        <Route path="/user-guide"              component={UserGuide} />
        <Route path="/admin/marketplace"      component={() => <AdminOnly component={AdminModeration} />} />
        <Route path="/settings/org"           component={() => <AdminOnly component={OrgAdmin} />} />
        <Route path="/notifications"          component={NotificationsPage} />
        <Route path="/usage"                  component={UsageDashboard} />
        <Route path="/briefs"                 component={BriefsPage} />
        <Route path="/process-studio"         component={ProcessStudio} />
        <Route path="/activity"               component={ActivityStream} />
        <Route path="/mcp-growth-hub"         component={McpGrowthHub} />
        <Route path="/sla-walkthrough"        component={SlaWalkthrough} />
        <Route path="/guardian-hive"          component={GuardianHive} />
        <Route path="/belief-browser"         component={() => <AdminOnly component={BeliefBrowser} />} />
        <Route path="/security-events"        component={() => <AdminOnly component={SecurityEventLog} />} />
        <Route path="/anomaly-queue"          component={() => <AdminOnly component={AnomalyQueue} />} />
        <Route path="/causal-model"           component={() => <AdminOnly component={CausalModelDashboard} />} />
        <Route path="/self-improvement"       component={SelfImprovementDashboard} />
        <Route path="/experiments"            component={ExperimentsPage} />
        <Route path="/alignment-audit"        component={AlignmentAuditPage} />
        <Route path="/prompt-versions"        component={PromptVersionsPage} />
        <Route path="/platform-intelligence"  component={() => <AdminOnly component={PlatformIntelligence} />} />
        <Route path="/galaxy-intelligence"    component={() => <AdminOnly component={GalaxyIntelligence} />} />
        <Route path="/demand-intelligence"    component={() => <AdminOnly component={DemandEngine} />} />
        <Route component={NotFound} />
      </Switch>
    </>
  );
}

function AppRouter() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Switch>
        <Route path="/client-portal"              component={ClientPortal} />
        <Route path="/login"                      component={Login} />
        <Route path="/register"                   component={Register} />
        <Route path="/forgot-username"            component={ForgotUsername} />
        <Route path="/forgot-password"            component={ForgotPassword} />
        <Route path="/demo"                       component={BookDemo} />
        <Route path="/sso/callback"               component={SSOCallback} />
        <Route path="/packs"                      component={PacksLibrary} />
        <Route path="/packs/:packId"              component={PackDetail} />
        <Route path="/marketplace"                component={MarketplaceGallery} />
        <Route path="/marketplace/:templateId"    component={TemplateDetail} />
        <Route path="/proposals/shared/:token"    component={SharedProposal} />
        <Route path="/roi/shared/:token"          component={SharedReport} />
        <Route path="/"                           component={SmartHome} />
        <Route path="/how-it-works"               component={HowItWorks} />
        <Route path="/pricing"                    component={Pricing} />
        <Route path="/partner-apply"              component={PartnerApply} />
        <Route path="/partner-admin/:ref"         component={PartnerAdminPortal} />
        <Route path="/partner-admin"              component={PartnerAdminPortal} />
        <Route path="/developers"                 component={DeveloperPortal} />
        <Route path="/mcp-launch"                 component={McpLaunch} />
        <Route path="/mcp-docs"                   component={McpDocs} />
        <Route path="/partner/:ref"               component={PartnerLanding} />
        <Route>
          <AuthenticatedRoutes />
        </Route>
      </Switch>
    </Suspense>
  );
}

export default function App() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <UserPreferencesProvider>
          <ActiveClientProvider>
            <PartnerProvider>
              <QueryClientProvider client={queryClient}>
                <TooltipProvider>
                  <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
                    <ErrorBoundary fallback={<RootErrorFallback />}>
                      <AppRouter />
                    </ErrorBoundary>
                  </WouterRouter>
                  <Toaster />
                </TooltipProvider>
              </QueryClientProvider>
            </PartnerProvider>
          </ActiveClientProvider>
        </UserPreferencesProvider>
      </AuthProvider>
    </LanguageProvider>
  );
}
