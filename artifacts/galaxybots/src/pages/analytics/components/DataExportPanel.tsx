import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { BASE } from "./types";

export function DataExportPanel() {
  const downloadCsv = (dataset: string) => {
    window.open(`${BASE}/api/analytics/export/${dataset}`, "_blank");
  };

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-tech text-muted-foreground uppercase tracking-wider flex items-center gap-2">
          <Download className="w-4 h-4" />
          Data Export
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-xs text-muted-foreground mb-3">
          Download raw datasets as CSV for analysis.
        </p>
        <Button variant="outline" size="sm" className="w-full justify-start" onClick={() => downloadCsv("llm-usage")}>
          <Download className="w-4 h-4 mr-2" />
          LLM Usage Log
        </Button>
        <Button variant="outline" size="sm" className="w-full justify-start" onClick={() => downloadCsv("tool-activity")}>
          <Download className="w-4 h-4 mr-2" />
          Tool Activity Log
        </Button>
      </CardContent>
    </Card>
  );
}
