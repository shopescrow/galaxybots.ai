import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  Plus,
  Trash2,
  ShieldCheck,
  Zap,
  PlayCircle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ASSET_TYPE_OPTIONS, type AutonomyConfig } from "@/lib/asset-fetch";
import {
  useAutonomyConfigs,
  useUpsertAutonomyConfig,
  useDeleteAutonomyConfig,
  useRunAutonomy,
} from "./useReviewData";

const ANY = "*";

export function AutonomySettings() {
  const { toast } = useToast();
  const { data: configs, isLoading } = useAutonomyConfigs();
  const upsert = useUpsertAutonomyConfig();
  const del = useDeleteAutonomyConfig();
  const run = useRunAutonomy();

  async function runSweep() {
    try {
      const res = await run.mutateAsync();
      toast({
        title: res.message
          ? res.message
          : `Auto-published ${res.published.length} asset${res.published.length === 1 ? "" : "s"}`,
        description: res.skipped.length
          ? `${res.skipped.length} in-review asset(s) did not qualify.`
          : undefined,
      });
    } catch (err) {
      toast({
        title: "Autonomy run failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    }
  }

  return (
    <div className="space-y-5">
      <Card className="border-cyan/20 bg-cyan/5">
        <CardContent className="flex flex-wrap items-center gap-3 py-4">
          <Zap className="w-5 h-5 text-cyan shrink-0" />
          <div className="flex-1 min-w-[240px]">
            <p className="text-sm font-medium">Confidence-tiered autonomy</p>
            <p className="text-xs text-muted-foreground font-tech">
              Assets above the threshold that pass compliance auto-publish on the
              next sweep. Everything else stays in the review queue.
            </p>
          </div>
          <Button
            onClick={runSweep}
            disabled={run.isPending}
            className="font-tech text-sm gap-2"
          >
            {run.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <PlayCircle className="w-4 h-4" />
            )}
            Run autonomy sweep
          </Button>
        </CardContent>
      </Card>

      <ConfigEditor
        onSave={async (cfg) => {
          try {
            await upsert.mutateAsync(cfg);
            toast({ title: "Autonomy rule saved" });
          } catch (err) {
            toast({
              title: "Save failed",
              description: err instanceof Error ? err.message : "Unknown error",
              variant: "destructive",
            });
          }
        }}
        saving={upsert.isPending}
      />

      <Card>
        <CardHeader className="pb-3 border-b border-border/30">
          <CardTitle className="text-base flex items-center gap-2 font-tech">
            <ShieldCheck className="w-4 h-4 text-primary" />
            Active rules
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : !configs || configs.length === 0 ? (
            <p className="text-sm text-muted-foreground font-tech py-6 text-center">
              No autonomy rules yet. Add one above to enable auto-publish.
            </p>
          ) : (
            <div className="space-y-2">
              {configs.map((c) => (
                <RuleRow
                  key={c.id}
                  config={c}
                  onDelete={async () => {
                    try {
                      await del.mutateAsync(c.id);
                      toast({ title: "Rule removed" });
                    } catch (err) {
                      toast({
                        title: "Delete failed",
                        description:
                          err instanceof Error ? err.message : "Unknown error",
                        variant: "destructive",
                      });
                    }
                  }}
                  busy={del.isPending}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function RuleRow({
  config,
  onDelete,
  busy,
}: {
  config: AutonomyConfig;
  onDelete: () => void;
  busy: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border/50 bg-card/60 px-4 py-2.5">
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="font-tech text-[10px] uppercase">
          {config.assetType === ANY ? "all types" : config.assetType.replace(/_/g, " ")}
        </Badge>
        <span className="text-muted-foreground text-xs">/</span>
        <Badge variant="outline" className="font-tech text-[10px]">
          {config.targetPlatform === ANY ? "all platforms" : config.targetPlatform}
        </Badge>
      </div>
      <span className="text-xs font-tech text-muted-foreground">
        threshold <span className="text-foreground font-semibold">{config.confidenceThreshold}%</span>
      </span>
      {config.requireCompliancePass && (
        <Badge variant="outline" className="font-tech text-[9px] text-green-400 border-green-500/30">
          compliance must pass
        </Badge>
      )}
      <Badge
        className={`font-tech text-[10px] ${
          config.autoPublishEnabled
            ? "bg-cyan/15 text-cyan border-cyan/30"
            : "bg-muted/30 text-muted-foreground border-border/50"
        }`}
      >
        {config.autoPublishEnabled ? "enabled" : "disabled"}
      </Badge>
      <Button
        size="sm"
        variant="ghost"
        className="ml-auto text-xs h-7 text-red-400 hover:text-red-300"
        onClick={onDelete}
        disabled={busy}
      >
        <Trash2 className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
}

function ConfigEditor({
  onSave,
  saving,
}: {
  onSave: (cfg: {
    assetType: string;
    targetPlatform: string;
    autoPublishEnabled: boolean;
    confidenceThreshold: number;
    requireCompliancePass: boolean;
  }) => void;
  saving: boolean;
}) {
  const [assetType, setAssetType] = useState(ANY);
  const [platform, setPlatform] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [threshold, setThreshold] = useState(85);
  const [requirePass, setRequirePass] = useState(true);

  return (
    <Card>
      <CardHeader className="pb-3 border-b border-border/30">
        <CardTitle className="text-base flex items-center gap-2 font-tech">
          <Plus className="w-4 h-4 text-primary" />
          Add / update rule
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-4 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-tech text-muted-foreground mb-1.5 block">
              Asset type
            </label>
            <Select value={assetType} onValueChange={setAssetType}>
              <SelectTrigger className="font-tech text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>All types</SelectItem>
                {ASSET_TYPE_OPTIONS.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t.replace(/_/g, " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-tech text-muted-foreground mb-1.5 block">
              Target platform (blank = all)
            </label>
            <Input
              placeholder="e.g. gumroad, youtube…"
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
              className="font-tech text-sm"
            />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-tech text-muted-foreground">
              Confidence threshold
            </label>
            <span className="text-sm font-tech font-semibold tabular-nums">
              {threshold}%
            </span>
          </div>
          <Slider
            value={[threshold]}
            min={0}
            max={100}
            step={1}
            onValueChange={(v) => setThreshold(v[0] ?? 85)}
          />
        </div>

        <div className="flex flex-wrap items-center gap-6">
          <label className="flex items-center gap-2 text-sm font-tech cursor-pointer">
            <Switch checked={enabled} onCheckedChange={setEnabled} />
            Auto-publish enabled
          </label>
          <label className="flex items-center gap-2 text-sm font-tech cursor-pointer">
            <Switch checked={requirePass} onCheckedChange={setRequirePass} />
            Require compliance pass
          </label>
          <Button
            className="ml-auto font-tech text-sm"
            disabled={saving}
            onClick={() =>
              onSave({
                assetType,
                targetPlatform: platform.trim(),
                autoPublishEnabled: enabled,
                confidenceThreshold: threshold,
                requireCompliancePass: requirePass,
              })
            }
          >
            {saving ? (
              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
            ) : (
              <Plus className="w-4 h-4 mr-1" />
            )}
            Save rule
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
