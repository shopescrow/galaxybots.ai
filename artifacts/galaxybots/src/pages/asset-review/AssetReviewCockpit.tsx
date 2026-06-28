import { AppLayout } from "@/components/layout/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import { ClipboardCheck, SlidersHorizontal, History } from "lucide-react";
import { ReviewQueue } from "./ReviewQueue";
import { AutonomySettings } from "./AutonomySettings";
import { AutoPublishAudit } from "./AutoPublishAudit";

export default function AssetReviewCockpit() {
  return (
    <AppLayout>
      <div className="container mx-auto px-4 py-8 sm:py-12">
        <div className="mb-6">
          <h1 className="text-2xl sm:text-3xl font-display font-bold flex items-center gap-3">
            <ClipboardCheck className="text-primary w-7 h-7 sm:w-8 sm:h-8" />
            Review Cockpit
          </h1>
          <p className="text-muted-foreground font-tech mt-1">
            Batch-review pending assets, tune confidence-tiered autonomy, and
            audit auto-published work.
          </p>
        </div>

        <Tabs defaultValue="queue">
          <TabsList className="font-tech mb-5">
            <TabsTrigger value="queue" className="gap-1.5">
              <ClipboardCheck className="w-4 h-4" /> Review Queue
            </TabsTrigger>
            <TabsTrigger value="autonomy" className="gap-1.5">
              <SlidersHorizontal className="w-4 h-4" /> Autonomy
            </TabsTrigger>
            <TabsTrigger value="audit" className="gap-1.5">
              <History className="w-4 h-4" /> Audit & Rollback
            </TabsTrigger>
          </TabsList>

          <TabsContent value="queue">
            <ErrorBoundary>
              <ReviewQueue />
            </ErrorBoundary>
          </TabsContent>
          <TabsContent value="autonomy">
            <ErrorBoundary>
              <AutonomySettings />
            </ErrorBoundary>
          </TabsContent>
          <TabsContent value="audit">
            <ErrorBoundary>
              <AutoPublishAudit />
            </ErrorBoundary>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
