import { AppLayout } from "@/components/layout/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import { lazy, Suspense } from "react";
import {
  Key,
  Code2,
  Webhook,
  BookOpen,
  Activity,
  History,
  Play,
  Terminal,
  Server,
} from "lucide-react";
import { Loader2 } from "lucide-react";

const OverviewSection = lazy(() => import("./components/OverviewSection").then(m => ({ default: m.OverviewSection })));
const ApiKeysSection = lazy(() => import("./components/ApiKeysSection").then(m => ({ default: m.ApiKeysSection })));
const ApiReferenceSection = lazy(() => import("./components/ApiReferenceSection").then(m => ({ default: m.ApiReferenceSection })));
const PlaygroundSection = lazy(() => import("./components/PlaygroundSection").then(m => ({ default: m.PlaygroundSection })));
const WebhooksSection = lazy(() => import("./components/WebhooksSection").then(m => ({ default: m.WebhooksSection })));
const McpGuideSection = lazy(() => import("./components/McpGuideSection").then(m => ({ default: m.McpGuideSection })));
const McpConnectionsSection = lazy(() => import("./components/McpConnectionsSection").then(m => ({ default: m.McpConnectionsSection })));
const UsageSection = lazy(() => import("./components/UsageSection").then(m => ({ default: m.UsageSection })));
const ChangelogSection = lazy(() => import("./components/ChangelogSection").then(m => ({ default: m.ChangelogSection })));

function TabFallback() {
  return (
    <div className="flex justify-center py-12">
      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
    </div>
  );
}

export default function DeveloperPortal() {
  return (
    <AppLayout>
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2.5 rounded-xl bg-primary/10 border border-primary/20">
              <Code2 className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-display font-bold">Developer Portal</h1>
              <p className="text-sm text-muted-foreground">APIs, webhooks, and tools to build on GalaxyBots</p>
            </div>
          </div>
        </div>

        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="flex flex-wrap gap-1 h-auto p-1 bg-secondary/50">
            <TabsTrigger value="overview" className="text-xs gap-1">
              <BookOpen className="w-3 h-3" /> Overview
            </TabsTrigger>
            <TabsTrigger value="keys" className="text-xs gap-1">
              <Key className="w-3 h-3" /> My Keys
            </TabsTrigger>
            <TabsTrigger value="reference" className="text-xs gap-1">
              <Code2 className="w-3 h-3" /> API Reference
            </TabsTrigger>
            <TabsTrigger value="playground" className="text-xs gap-1">
              <Play className="w-3 h-3" /> Playground
            </TabsTrigger>
            <TabsTrigger value="webhooks" className="text-xs gap-1">
              <Webhook className="w-3 h-3" /> Webhooks
            </TabsTrigger>
            <TabsTrigger value="mcp" className="text-xs gap-1">
              <Terminal className="w-3 h-3" /> MCP Guide
            </TabsTrigger>
            <TabsTrigger value="mcp-connections" className="text-xs gap-1">
              <Server className="w-3 h-3" /> MCP Connections
            </TabsTrigger>
            <TabsTrigger value="usage" className="text-xs gap-1">
              <Activity className="w-3 h-3" /> Usage
            </TabsTrigger>
            <TabsTrigger value="changelog" className="text-xs gap-1">
              <History className="w-3 h-3" /> Changelog
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview"><ErrorBoundary><Suspense fallback={<TabFallback />}><OverviewSection /></Suspense></ErrorBoundary></TabsContent>
          <TabsContent value="keys"><ErrorBoundary><Suspense fallback={<TabFallback />}><ApiKeysSection /></Suspense></ErrorBoundary></TabsContent>
          <TabsContent value="reference"><ErrorBoundary><Suspense fallback={<TabFallback />}><ApiReferenceSection /></Suspense></ErrorBoundary></TabsContent>
          <TabsContent value="playground"><ErrorBoundary><Suspense fallback={<TabFallback />}><PlaygroundSection /></Suspense></ErrorBoundary></TabsContent>
          <TabsContent value="webhooks"><ErrorBoundary><Suspense fallback={<TabFallback />}><WebhooksSection /></Suspense></ErrorBoundary></TabsContent>
          <TabsContent value="mcp"><ErrorBoundary><Suspense fallback={<TabFallback />}><McpGuideSection /></Suspense></ErrorBoundary></TabsContent>
          <TabsContent value="mcp-connections"><ErrorBoundary><Suspense fallback={<TabFallback />}><McpConnectionsSection /></Suspense></ErrorBoundary></TabsContent>
          <TabsContent value="usage"><ErrorBoundary><Suspense fallback={<TabFallback />}><UsageSection /></Suspense></ErrorBoundary></TabsContent>
          <TabsContent value="changelog"><ErrorBoundary><Suspense fallback={<TabFallback />}><ChangelogSection /></Suspense></ErrorBoundary></TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
