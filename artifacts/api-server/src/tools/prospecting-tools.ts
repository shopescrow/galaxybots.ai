import { z } from "zod";
import { registerTool, type ToolContext } from "./registry";
import { db, prospectingJobsTable, prospectsTable, platformAuditLogTable, prospectingPatternsTable } from "@workspace/db";
import { eq, and, desc, sql, gte, isNotNull } from "drizzle-orm";
import { ProspectingWorker } from "../services/prospecting-worker";

// 1. prospect_search tool
registerTool({
  name: "prospect_search",
  description: "Search for new prospects matching a query and location. This starts an asynchronous discovery and enrichment job.",
  inputSchema: z.object({
    query: z.string().describe("The search query (e.g., 'roofing companies')"),
    location: z.string().optional().describe("The location (e.g., 'Calgary')"),
    limit: z.number().optional().default(10).describe("Maximum number of prospects to find"),
    icpCriteria: z.record(z.any()).optional().describe("Optional ICP criteria for scoring"),
  }),
  execute: async (input, context: ToolContext) => {
    if (!context.clientId) throw new Error("Client context required");

    const idempotencyKey = `search_${context.clientId}_${Date.now()}`;
    
    const [job] = await db.insert(prospectingJobsTable).values({
      clientId: context.clientId,
      query: input.query,
      location: input.location,
      limit: input.limit,
      idempotencyKey,
      status: "pending",
      checkpointData: { icpCriteria: input.icpCriteria || {} },
      requestedBy: context.botName || "bot"
    }).returning();

    // Mocking discovery: insert a few prospects immediately to be enriched by the worker
    const mockProspects = [
      { 
        clientId: context.clientId, 
        companyName: `${input.query} Alpha`, 
        domain: "alpha.example.com", 
        sourceUrl: "https://google.com/search?q=" + encodeURIComponent(input.query),
        jobId: job.id,
        status: "new" as const
      },
      { 
        clientId: context.clientId, 
        companyName: `${input.query} Beta`, 
        domain: "beta.example.com", 
        sourceUrl: "https://google.com/search?q=" + encodeURIComponent(input.query),
        jobId: job.id,
        status: "new" as const
      }
    ].slice(0, input.limit);

    await db.insert(prospectsTable).values(mockProspects);

    return {
      message: `Job #${job.id} started. I've discovered ${mockProspects.length} initial prospects and started the enrichment pipeline. I'll update you when they are ready.`,
      jobId: job.id,
      initialCount: mockProspects.length
    };
  }
});

// 2. enrich_prospect tool
registerTool({
  name: "enrich_prospect",
  description: "Trigger the enrichment pipeline for a specific prospect by ID.",
  inputSchema: z.object({
    prospectId: z.number().describe("The ID of the prospect to enrich"),
  }),
  execute: async (input, context: ToolContext) => {
    if (!context.clientId) throw new Error("Client context required");

    const [prospect] = await db.select().from(prospectsTable)
      .where(and(eq(prospectsTable.id, input.prospectId), eq(prospectsTable.clientId, context.clientId)));

    if (!prospect) throw new Error("Prospect not found");

    // We call the worker method directly or let it pick it up. 
    // The requirement says "returns immediately with job ID".
    // If it's a single prospect not part of a job, we might need a dummy job or just return a success message.
    
    // For compliance with "returns immediately", we'll just trigger it and return.
    ProspectingWorker.enrichProspect(prospect).catch(console.error);

    return {
      message: `Enrichment started for prospect #${prospect.id} (${prospect.companyName}).`,
      prospectId: prospect.id
    };
  }
});

// 3. get_prospects tool
registerTool({
  name: "get_prospects",
  description: "Retrieve prospects with optional filtering by status, job, or ICP score.",
  inputSchema: z.object({
    status: z.string().optional().describe("Filter by status (e.g., 'enriched', 'qualified')"),
    jobId: z.number().optional().describe("Filter by a specific job ID"),
    icpScoreMin: z.number().optional().describe("Minimum ICP score (0-1)"),
    limit: z.number().optional().default(20),
  }),
  execute: async (input, context: ToolContext) => {
    if (!context.clientId) throw new Error("Client context required");

    const conditions = [eq(prospectsTable.clientId, context.clientId)];
    
    if (input.status) {
      conditions.push(eq(prospectsTable.status, input.status as any));
    } else {
      // Never return review_needed unless explicitly requested
      conditions.push(sql`${prospectsTable.status} != 'review_needed'`);
    }

    if (input.jobId !== undefined) {
      conditions.push(eq(prospectsTable.jobId, input.jobId));
    }

    if (input.icpScoreMin !== undefined) {
      conditions.push(gte(prospectsTable.icpScore, input.icpScoreMin.toString()));
    }

    const limit = input.limit || 20;

    const results = await db.select().from(prospectsTable)
      .where(and(...conditions))
      .limit(limit)
      .orderBy(desc(prospectsTable.createdAt));

    const totalCost = results.reduce((sum, p) => sum + parseFloat(p.enrichmentCostCredits || "0"), 0);

    return {
      prospects: results.map(p => ({
        id: p.id,
        companyName: p.companyName,
        domain: p.domain,
        email: p.email,
        phone: p.phone,
        confidenceScore: p.confidenceScore,
        icpScore: p.icpScore,
        status: p.status,
        cost: p.enrichmentCostCredits,
        createdAt: p.createdAt
      })),
      summary: {
        count: results.length,
        totalCostCredits: totalCost.toFixed(2)
      }
    };
  }
});

// 4. qualify_prospect tool
registerTool({
  name: "qualify_prospect",
  description: "Update the status of a prospect (e.g., to 'qualified', 'contacted', 'rejected').",
  inputSchema: z.object({
    prospectId: z.number().describe("The ID of the prospect"),
    status: z.enum(["qualified", "contacted", "rejected"]).describe("The new status"),
    notes: z.string().optional().describe("Optional notes"),
  }),
  execute: async (input, context: ToolContext) => {
    if (!context.clientId) throw new Error("Client context required");

    const [prospect] = await db.select().from(prospectsTable)
      .where(and(eq(prospectsTable.id, input.prospectId), eq(prospectsTable.clientId, context.clientId)));

    if (!prospect) throw new Error("Prospect not found");

    if (prospect.status === "new" || prospect.status === "review_needed") {
      throw new Error("Prospect must be enriched before qualification");
    }

    const [updated] = await db.update(prospectsTable)
      .set({ 
        status: input.status, 
        extractionNotes: input.notes ? sql`COALESCE(extraction_notes, '') || ${`Qualification Note: ${input.notes}\n`}` : undefined,
        updatedAt: new Date() 
      } as any)
      .where(eq(prospectsTable.id, input.prospectId))
      .returning();

    return {
      success: true,
      prospect: {
        id: updated.id,
        companyName: updated.companyName,
        status: updated.status
      }
    };
  }
});

// 5. analyze_prospecting_patterns tool
registerTool({
  name: "analyze_prospecting_patterns",
  description: "Analyze recent prospecting failures to identify domain-specific extraction patterns and suggest hints.",
  inputSchema: z.object({}),
  execute: async (input, context: ToolContext) => {
    // Group failures by error category and domain pattern
    const failures = await db.select({
      domain: prospectsTable.domain,
      errorCategory: prospectsTable.errorCategory,
      count: sql<number>`count(*)::int`
    })
    .from(prospectsTable)
    .where(and(
      eq(prospectsTable.status, 'review_needed'),
      isNotNull(prospectsTable.domain)
    ))
    .groupBy(prospectsTable.domain, prospectsTable.errorCategory)
    .orderBy(desc(sql`count(*)`))
    .limit(10);

    const patternsFound = [];
    for (const f of failures) {
      if (!f.domain) continue;
      // Simple pattern generation: use the domain itself as a regex for now
      const domainRegex = f.domain.replace(/\./g, "\\.");
      
      const [existing] = await db.select().from(prospectingPatternsTable)
        .where(eq(prospectingPatternsTable.domainRegex, domainRegex));

      if (!existing) {
        const [newPattern] = await db.insert(prospectingPatternsTable).values({
          patternType: "extraction",
          domainRegex: domainRegex,
          hintText: `Extraction failure on ${f.domain}. Check for anti-scraping or non-standard HTML.`,
          timesApplied: 0,
          successAfterHint: 0
        } as any).returning();
        patternsFound.push(newPattern);
      } else {
        patternsFound.push(existing);
      }
    }

    return {
      summary: `Analyzed failures. Identified ${patternsFound.length} patterns for optimization.`,
      patterns: patternsFound
    };
  }
});
