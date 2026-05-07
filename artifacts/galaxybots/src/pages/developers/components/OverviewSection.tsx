import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Code2, Webhook, Terminal, Shield, Zap, Globe } from "lucide-react";
import { CodeBlock } from "./CodeBlock";

export function OverviewSection() {
  return (
    <div className="space-y-6">
      <div className="text-center max-w-3xl mx-auto mb-8">
        <h2 className="text-3xl font-display font-bold mb-3">Build on GalaxyBots</h2>
        <p className="text-muted-foreground">
          Integrate AI-powered bots, task automation, and intelligent pipelines into your applications.
          The GalaxyBots API gives you programmatic access to the full platform.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-border/50 bg-gradient-to-br from-primary/5 to-transparent">
          <CardContent className="p-6 text-center">
            <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-3">
              <Code2 className="w-6 h-6 text-primary" />
            </div>
            <h3 className="font-display font-bold mb-1">REST API</h3>
            <p className="text-xs text-muted-foreground">
              Full CRUD for bots, conversations, task sessions, pipelines, and more
            </p>
          </CardContent>
        </Card>
        <Card className="border-border/50 bg-gradient-to-br from-cyan/5 to-transparent">
          <CardContent className="p-6 text-center">
            <div className="w-12 h-12 rounded-xl bg-cyan/10 border border-cyan/20 flex items-center justify-center mx-auto mb-3">
              <Webhook className="w-6 h-6 text-cyan" />
            </div>
            <h3 className="font-display font-bold mb-1">Webhooks</h3>
            <p className="text-xs text-muted-foreground">
              Real-time event notifications for task completions, leads, and alerts
            </p>
          </CardContent>
        </Card>
        <Card className="border-border/50 bg-gradient-to-br from-gold/5 to-transparent">
          <CardContent className="p-6 text-center">
            <div className="w-12 h-12 rounded-xl bg-gold/10 border border-gold/20 flex items-center justify-center mx-auto mb-3">
              <Terminal className="w-6 h-6 text-gold" />
            </div>
            <h3 className="font-display font-bold mb-1">MCP Server</h3>
            <p className="text-xs text-muted-foreground">
              Connect Claude, Cursor, or any MCP client to GalaxyBots tools
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-sm font-tech uppercase tracking-wider text-muted-foreground">Quick Start</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <p className="text-sm font-bold">1. Generate an API Key</p>
            <p className="text-xs text-muted-foreground">Go to the "My Keys" tab and create a new developer API key with your desired scopes.</p>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-bold">2. Make Your First Request</p>
            <CodeBlock code={`curl -H "Authorization: Bearer gbdev_your_key_here" \\
  ${window.location.origin}/api/healthz`} />
          </div>
          <div className="space-y-2">
            <p className="text-sm font-bold">3. Explore the API</p>
            <p className="text-xs text-muted-foreground">Browse the API Reference tab for all available endpoints, or try the Playground to test live requests.</p>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-sm font-tech uppercase tracking-wider text-muted-foreground">Authentication</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            All API requests must include your API key in the Authorization header:
          </p>
          <CodeBlock code={`Authorization: Bearer gbdev_your_api_key_here`} />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="p-3 rounded-lg bg-secondary/50 border border-border/30">
              <div className="flex items-center gap-2 mb-1">
                <Shield className="w-4 h-4 text-primary" />
                <span className="text-xs font-bold">Read Scope</span>
              </div>
              <p className="text-[10px] text-muted-foreground">GET requests to all endpoints</p>
            </div>
            <div className="p-3 rounded-lg bg-secondary/50 border border-border/30">
              <div className="flex items-center gap-2 mb-1">
                <Zap className="w-4 h-4 text-gold" />
                <span className="text-xs font-bold">Write Scope</span>
              </div>
              <p className="text-[10px] text-muted-foreground">POST/PATCH/DELETE + read access</p>
            </div>
            <div className="p-3 rounded-lg bg-secondary/50 border border-border/30">
              <div className="flex items-center gap-2 mb-1">
                <Globe className="w-4 h-4 text-cyan" />
                <span className="text-xs font-bold">Admin Scope</span>
              </div>
              <p className="text-[10px] text-muted-foreground">Full access including client management</p>
            </div>
          </div>
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
            <p className="text-xs text-primary font-bold mb-1">Rate Limits</p>
            <p className="text-xs text-muted-foreground">
              Standard keys: 1,000 requests/day. Partner keys: 5,000 requests/day.
              Rate limit status is available in response headers and the Usage tab.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
