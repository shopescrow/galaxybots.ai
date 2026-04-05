import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ChevronDown, ChevronRight, ExternalLink, Loader2 } from "lucide-react";
import { CodeBlock } from "./CodeBlock";
import type { ParsedEndpoint } from "./types";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function parseOpenApiSpec(spec: string): ParsedEndpoint[] {
  const paths: ParsedEndpoint[] = [];
  const lines = spec.split("\n");
  let currentPath = "";
  let currentEntry: ParsedEndpoint["methods"][0] | null = null;
  let inParameters = false;
  let inRequestBody = false;
  let inResponses = false;
  let currentResponseStatus = "";

  for (const line of lines) {
    const pathMatch = line.match(/^  (\/\S+):$/);
    if (pathMatch) {
      if (currentPath && currentEntry) {
        const existing = paths.find(p => p.path === currentPath);
        if (existing) existing.methods.push(currentEntry);
        else paths.push({ path: currentPath, methods: [currentEntry] });
      }
      currentPath = pathMatch[1];
      currentEntry = null;
      inParameters = false;
      inRequestBody = false;
      inResponses = false;
      continue;
    }

    const methodMatch = line.match(/^    (get|post|put|patch|delete):$/);
    if (methodMatch && currentPath) {
      if (currentEntry) {
        const existing = paths.find(p => p.path === currentPath);
        if (existing) existing.methods.push(currentEntry);
        else paths.push({ path: currentPath, methods: [currentEntry] });
      }
      currentEntry = {
        method: methodMatch[1].toUpperCase(),
        summary: "",
        operationId: "",
        tags: [],
        parameters: [],
        requestBodyExample: null,
        responses: [],
      };
      inParameters = false;
      inRequestBody = false;
      inResponses = false;
      continue;
    }

    if (currentEntry) {
      const summaryMatch = line.match(/^\s+summary:\s*(.+)$/);
      if (summaryMatch) { currentEntry.summary = summaryMatch[1]; continue; }
      const opMatch = line.match(/^\s+operationId:\s*(.+)$/);
      if (opMatch) { currentEntry.operationId = opMatch[1]; continue; }
      const tagMatch = line.match(/^\s+tags:\s*\[(.+)\]$/);
      if (tagMatch) { currentEntry.tags = tagMatch[1].split(",").map((t: string) => t.trim()); continue; }

      if (line.match(/^\s+parameters:$/)) { inParameters = true; inRequestBody = false; inResponses = false; continue; }
      if (line.match(/^\s+requestBody:$/)) { inRequestBody = true; inParameters = false; inResponses = false; continue; }
      if (line.match(/^\s+responses:$/)) { inResponses = true; inParameters = false; inRequestBody = false; continue; }

      if (inParameters) {
        const nameMatch = line.match(/^\s+name:\s*(.+)$/);
        if (nameMatch) currentEntry.parameters.push(nameMatch[1]);
      }

      if (inResponses) {
        const statusMatch = line.match(/^\s+'(\d+)':$/);
        if (statusMatch) { currentResponseStatus = statusMatch[1]; continue; }
        const descMatch = line.match(/^\s+description:\s*(.+)$/);
        if (descMatch && currentResponseStatus) {
          currentEntry.responses.push({ status: currentResponseStatus, description: descMatch[1] });
          currentResponseStatus = "";
        }
      }
    }
  }

  if (currentPath && currentEntry) {
    const existing = paths.find(p => p.path === currentPath);
    if (existing) existing.methods.push(currentEntry);
    else paths.push({ path: currentPath, methods: [currentEntry] });
  }

  return paths;
}

export function ApiReferenceSection() {
  const { data: spec, isLoading } = useQuery<string>({
    queryKey: ["developer", "openapi"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/developer/openapi`);
      if (!res.ok) throw new Error("Failed");
      return res.text();
    },
  });

  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [expandedEndpoints, setExpandedEndpoints] = useState<Set<string>>(new Set());

  const togglePath = (path: string) => {
    setExpandedPaths(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const toggleEndpoint = (key: string) => {
    setExpandedEndpoints(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const parsed = parseOpenApiSpec(spec || "");

  const methodColor: Record<string, string> = {
    GET: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    POST: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    PUT: "bg-amber-500/20 text-amber-400 border-amber-500/30",
    PATCH: "bg-orange-500/20 text-orange-400 border-orange-500/30",
    DELETE: "bg-red-500/20 text-red-400 border-red-500/30",
  };

  const tagGroups: Record<string, { path: string; method: ParsedEndpoint["methods"][0] }[]> = {};
  for (const p of parsed) {
    for (const m of p.methods) {
      const tag = m.tags[0] || "other";
      if (!tagGroups[tag]) tagGroups[tag] = [];
      tagGroups[tag].push({ path: p.path, method: m });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-display font-bold">API Reference</h2>
        <div className="flex items-center gap-2">
          <a
            href={`${BASE}/api/developer/openapi`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary hover:underline flex items-center gap-1"
          >
            <ExternalLink className="w-3 h-3" /> Download OpenAPI Spec
          </a>
          <Badge variant="outline" className="font-tech text-xs">
            OpenAPI 3.1
          </Badge>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        Full REST API documentation auto-generated from the OpenAPI specification.
        Base URL: <code className="text-xs bg-secondary/80 px-1 py-0.5 rounded">{window.location.origin}/api</code>
      </p>

      {parsed.length > 0 ? (
        <div className="space-y-3">
          {Object.entries(tagGroups).map(([tag, endpoints]) => (
            <Card key={tag} className="border-border/50">
              <CardHeader className="pb-2 cursor-pointer" onClick={() => togglePath(tag)}>
                <CardTitle className="text-sm font-tech uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                  {expandedPaths.has(tag) ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  {tag}
                  <Badge variant="outline" className="text-[10px] ml-auto">{endpoints.length}</Badge>
                </CardTitle>
              </CardHeader>
              {expandedPaths.has(tag) && (
                <CardContent className="pt-0 space-y-1">
                  {endpoints.map((ep, idx) => {
                    const epKey = `${tag}-${idx}`;
                    const isExpanded = expandedEndpoints.has(epKey);
                    return (
                      <div key={idx} className="border border-border/30 rounded-lg overflow-hidden">
                        <div
                          className="flex items-center gap-3 p-2 hover:bg-secondary/50 transition-colors cursor-pointer"
                          onClick={() => toggleEndpoint(epKey)}
                        >
                          <Badge className={`text-[10px] font-mono w-16 justify-center ${methodColor[ep.method.method] || ""}`}>
                            {ep.method.method}
                          </Badge>
                          <code className="text-xs font-mono text-muted-foreground flex-1">{ep.path}</code>
                          <span className="text-xs text-muted-foreground truncate max-w-[200px]">{ep.method.summary}</span>
                          {isExpanded ? <ChevronDown className="w-3 h-3 text-muted-foreground" /> : <ChevronRight className="w-3 h-3 text-muted-foreground" />}
                        </div>
                        {isExpanded && (
                          <div className="border-t border-border/30 p-3 bg-secondary/20 space-y-3">
                            {ep.method.operationId && (
                              <div className="text-xs">
                                <span className="text-muted-foreground">Operation ID: </span>
                                <code className="font-mono text-primary">{ep.method.operationId}</code>
                              </div>
                            )}
                            {ep.method.parameters.length > 0 && (
                              <div>
                                <p className="text-xs font-bold mb-1">Parameters</p>
                                <div className="space-y-1">
                                  {ep.method.parameters.map((param, pi) => (
                                    <div key={pi} className="flex items-center gap-2 text-xs">
                                      <code className="font-mono bg-secondary/80 px-1.5 py-0.5 rounded">{param}</code>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            <div>
                              <p className="text-xs font-bold mb-1">Example Request</p>
                              <CodeBlock code={`curl -X ${ep.method.method} "${window.location.origin}/api${ep.path}" \\
  -H "Authorization: Bearer gbdev_your_key_here" \\
  -H "Content-Type: application/json"${ep.method.method !== "GET" && ep.method.method !== "DELETE" ? ` \\
  -d '{}'` : ""}`} />
                            </div>
                            {ep.method.responses.length > 0 && (
                              <div>
                                <p className="text-xs font-bold mb-1">Responses</p>
                                <div className="space-y-1">
                                  {ep.method.responses.map((resp, ri) => (
                                    <div key={ri} className="flex items-center gap-2 text-xs">
                                      <Badge variant={resp.status.startsWith("2") ? "default" : resp.status.startsWith("4") ? "destructive" : "outline"} className="text-[10px]">
                                        {resp.status}
                                      </Badge>
                                      <span className="text-muted-foreground">{resp.description}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      ) : (
        <Card className="border-border/50">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Unable to parse OpenAPI spec. Raw specification available at <code className="text-xs">/api/developer/openapi</code></p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
