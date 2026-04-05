import { db, prospectingJobsTable, prospectsTable, confidenceConfigsTable, prospectingPatternsTable } from "@workspace/db";
import { eq, and, or, isNull, sql } from "drizzle-orm";
import { scoreConfidence } from "../../routes/prospecting/prospecting";

export class ProspectingWorker {
  private static isRunning = false;
  private static interval: NodeJS.Timeout | null = null;
  private static activeFetches = 0;
  private static MAX_CONCURRENT_FETCHES = 5;

  static start() {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log("Prospecting worker started");
    this.interval = setInterval(() => this.poll(), 5000);
  }

  static stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.isRunning = false;
  }

  private static async poll() {
    try {
      const pendingJobs = await db
        .select()
        .from(prospectingJobsTable)
        .where(or(eq(prospectingJobsTable.status, "pending"), eq(prospectingJobsTable.status, "running")))
        .limit(3);

      for (const job of pendingJobs) {
        if (job.status === "pending") {
          await this.processJob(job);
        } else if (job.status === "running") {
           // Check if it's stuck or needs further processing of prospects
           await this.processEnrichmentQueue(job);
        }
      }
    } catch (err) {
      console.error("Worker poll error:", err);
    }
  }

  private static async processJob(job: any) {
    await db.update(prospectingJobsTable)
      .set({ status: "running", updatedAt: new Date() } as any)
      .where(eq(prospectingJobsTable.id, job.id));

    try {
      // Step 1: Search / Discovery (Simplified for this task)
      // In a real scenario, this would call a search API
      console.log(`Processing job ${job.id}: ${job.query}`);
      
      // Update progress
      await db.update(prospectingJobsTable)
        .set({ 
          checkpointData: { step: "discovery", progress: 20 },
          updatedAt: new Date()
        } as any)
        .where(eq(prospectingJobsTable.id, job.id));

      // After discovery, we would have inserted "new" prospects linked to this jobId.
      // The prospect_search tool does the insertion, so here we just move to enrichment.
      
      await this.processEnrichmentQueue(job);

    } catch (err) {
      console.error(`Job ${job.id} failed:`, err);
      await db.update(prospectingJobsTable)
        .set({ status: "failed", updatedAt: new Date() } as any)
        .where(eq(prospectingJobsTable.id, job.id));
    }
  }

  private static async processEnrichmentQueue(job: any) {
    const prospects = await db.select().from(prospectsTable)
      .where(and(eq(prospectsTable.jobId, job.id), eq(prospectsTable.status, "new")));

    if (prospects.length === 0) {
      await db.update(prospectingJobsTable)
        .set({ status: "completed", completedAt: new Date(), updatedAt: new Date() } as any)
        .where(eq(prospectingJobsTable.id, job.id));
      return;
    }

    for (const prospect of prospects) {
      if (this.activeFetches >= this.MAX_CONCURRENT_FETCHES) {
        break; // Wait for next poll
      }
      this.activeFetches++;
      this.enrichProspect(prospect, job).finally(() => {
        this.activeFetches--;
      });
      
      // 1s per-domain delay (simplified)
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Check again if all done
    const remaining = await db.select({ count: sql`count(*)` }).from(prospectsTable)
      .where(and(eq(prospectsTable.jobId, job.id), eq(prospectsTable.status, "new")));
    
    if (Number(remaining[0].count) === 0 && this.activeFetches === 0) {
      await db.update(prospectingJobsTable)
        .set({ status: "completed", completedAt: new Date(), updatedAt: new Date() } as any)
        .where(eq(prospectingJobsTable.id, job.id));
    }
  }

  static async enrichProspect(prospect: any, job?: any) {
    const clientId = prospect.clientId;
    let currentStep = "navigation";
    let cost = 0;

    try {
      // Exponential backoff
      const attemptCount = prospect.attemptCount || 0;
      if (attemptCount > 0) {
        const backoffSeconds = Math.min(Math.pow(2, attemptCount), 60);
        const lastUpdated = new Date(prospect.updatedAt).getTime();
        if (Date.now() - lastUpdated < backoffSeconds * 1000) {
          return; // Skip for now
        }
      }

      // Check for patterns
      const [pattern] = await db.select().from(prospectingPatternsTable)
        .where(and(
          eq(prospectingPatternsTable.patternType, 'extraction'),
          sql`${prospect.domain} ~ ${prospectingPatternsTable.domainRegex}`
        ))
        .limit(1);

      if (pattern) {
        await db.update(prospectingPatternsTable)
          .set({ timesApplied: sql`times_applied + 1`, updatedAt: new Date() } as any)
          .where(eq(prospectingPatternsTable.id, pattern.id));
      }

      // 1. Navigation
      currentStep = "navigation";
      cost += 0.01;
      await this.updateProspectProgress(prospect.id, currentStep, cost);

      // 2. Extraction
      currentStep = "extraction";
      cost += 0.02;
      // Mock data extraction
      const extractedData = {
        email: prospect.email || `contact@${prospect.domain || "example.com"}`,
        phone: prospect.phone || "+15550109999",
        socialLinks: { linkedin: `https://linkedin.com/company/${prospect.companyName.toLowerCase().replace(/\s+/g, "")}` }
      };
      await this.updateProspectProgress(prospect.id, currentStep, cost, extractedData);

      // 3. Validation
      currentStep = "validation";
      const [config] = await db.select().from(confidenceConfigsTable).where(eq(confidenceConfigsTable.clientId, clientId));
      const confidence = scoreConfidence(extractedData, config || {});
      
      if (confidence.score < 0.6) {
        await db.update(prospectsTable)
          .set({ 
            status: "review_needed", 
            confidenceScore: confidence.score,
            errorCategory: "validation",
            updatedAt: new Date() 
          } as any)
          .where(eq(prospectsTable.id, prospect.id));
        return;
      }

      // 4. Enrichment
      currentStep = "enrichment";
      cost += 0.05;
      const enrichmentData = {
        industry: "Technology",
        size: "11-50",
        techStack: ["React", "Node.js", "PostgreSQL"]
      };

      // 5. ICP Scoring
      currentStep = "icp_scoring";
      const icpCriteria = job?.checkpointData?.icpCriteria || {};
      const icpScore = this.calculateIcpScore(enrichmentData, icpCriteria);

      await db.update(prospectingJobsTable)
        .set({
          processedCount: sql`processed_count + 1`,
          successfulCount: sql`successful_count + 1`,
          totalCostCredits: sql`total_cost_credits + ${cost}`,
          updatedAt: new Date()
        } as any)
        .where(eq(prospectingJobsTable.id, job.id));

      await db.update(prospectsTable)
        .set({
          status: "enriched",
          confidenceScore: confidence.score,
          icpScore: icpScore.toString(),
          icpCriteria: enrichmentData,
          enrichmentCostCredits: sql`enrichment_cost_credits + ${cost}`,
          updatedAt: new Date(),
          ...extractedData
        } as any)
        .where(eq(prospectsTable.id, prospect.id));

      // Pattern success track
      if (pattern) {
        await db.update(prospectingPatternsTable)
          .set({ successAfterHint: sql`success_after_hint + 1`, updatedAt: new Date() } as any)
          .where(eq(prospectingPatternsTable.id, (pattern as any).id));
      }

    } catch (err: any) {
      console.error(`Enrichment failed for prospect ${prospect.id}:`, err);
      const attemptCount = (prospect.attemptCount || 0) + 1;
      const status = attemptCount >= 3 ? "review_needed" : "new";
      
      if (job) {
        await db.update(prospectingJobsTable)
          .set({
            processedCount: sql`processed_count + 1`,
            failedCount: sql`failed_count + 1`,
            totalCostCredits: sql`total_cost_credits + ${cost}`,
            updatedAt: new Date()
          } as any)
          .where(eq(prospectingJobsTable.id, job.id));
      }

      await db.update(prospectsTable)
        .set({
          status,
          attemptCount,
          errorCategory: "network",
          updatedAt: new Date()
        } as any)
        .where(eq(prospectsTable.id, prospect.id));
    }
  }

  private static async updateProspectProgress(id: number, step: string, cost: number, data: any = {}) {
    await db.update(prospectsTable)
      .set({
        extractionNotes: sql`COALESCE(extraction_notes, '') || ${`Step ${step} completed\n`}`,
        enrichmentCostCredits: sql`enrichment_cost_credits + ${cost}`,
        updatedAt: new Date(),
        ...data
      } as any)
      .where(eq(prospectsTable.id, id));
  }

  private static calculateIcpScore(data: any, criteria: any) {
    // Simple mock ICP scoring
    let score = 0.5;
    if (criteria.industry && data.industry === criteria.industry) score += 0.2;
    if (criteria.minSize && parseInt(data.size) >= parseInt(criteria.minSize)) score += 0.2;
    return Math.min(score, 1.0);
  }
}
