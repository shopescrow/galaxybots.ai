import { z } from "zod";
import { registerTool, type ToolContext } from "./registry";
import { db, prospectsTable, botsTable, botAssignmentsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { createNotification } from "../services/admin/notifications";
import * as cheerio from "cheerio";
import { broadcastSSE } from "../services/platform/sse";

const ProspectStatusEnum = z.enum(["new", "enriched", "review_needed", "qualified", "contacted", "rejected", "responded", "converted"]);
const ProspectErrorCategoryEnum = z.enum(["network", "parsing", "not_found", "validation"]);

type ProspectStatus = z.infer<typeof ProspectStatusEnum>;
type ProspectErrorCategory = z.infer<typeof ProspectErrorCategoryEnum>;

const ProspectContactInfoSchema = z.object({
  companyName: z.string(),
  domain: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  socialLinks: z.record(z.string()).nullable(),
  confidenceScore: z.number().min(0).max(1),
  sourceUrl: z.string(),
});

type ProspectContactInfo = z.infer<typeof ProspectContactInfoSchema>;

const ProspectSearchOutputSchema = z.object({
  success: z.boolean(),
  prospects: z.array(z.object({
    id: z.number(),
    companyName: z.string(),
    domain: z.string().nullable(),
    sourceUrl: z.string(),
    status: z.string(),
  })),
  totalFound: z.number().optional(),
  totalStored: z.number().optional(),
  parsingErrors: z.array(z.object({ url: z.string(), error: z.string() })).optional(),
  query: z.string().optional(),
  location: z.string().nullable().optional(),
  error: z.string().optional(),
  errorCategory: ProspectErrorCategoryEnum.optional(),
  message: z.string().optional(),
});

const EnrichProspectOutputSchema = z.object({
  success: z.boolean(),
  prospectId: z.number().optional(),
  companyName: z.string().optional(),
  domain: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  socialLinks: z.record(z.string()).nullable().optional(),
  confidenceScore: z.number().optional(),
  status: ProspectStatusEnum.optional(),
  fieldsFound: z.array(z.string()).optional(),
  fieldsMissing: z.array(z.string()).optional(),
  error: z.string().optional(),
  errorCategory: ProspectErrorCategoryEnum.optional(),
});

const GetProspectsOutputSchema = z.object({
  success: z.boolean(),
  count: z.number(),
  prospects: z.array(z.object({
    id: z.number(),
    companyName: z.string(),
    domain: z.string().nullable(),
    phone: z.string().nullable(),
    email: z.string().nullable(),
    socialLinks: z.record(z.string()).nullable(),
    confidenceScore: z.number(),
    status: z.string(),
    sourceUrl: z.string(),
    errorCategory: z.string().nullable(),
    extractionNotes: z.string().nullable(),
    createdAt: z.string(),
  })),
});

const QualifyProspectOutputSchema = z.object({
  success: z.boolean(),
  prospectId: z.number().optional(),
  companyName: z.string().optional(),
  previousStatus: z.string().optional(),
  newStatus: z.string().optional(),
  notes: z.string().nullable().optional(),
  error: z.string().optional(),
});

function buildConditions(...conds: ReturnType<typeof eq>[]) {
  return conds.length > 1 ? and(...conds) : conds[0];
}

const BLOCKED_HOSTNAME_PATTERNS = [
  /^localhost$/i,
  /^127\.\d+\.\d+\.\d+$/,
  /^10\.\d+\.\d+\.\d+$/,
  /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/,
  /^192\.168\.\d+\.\d+$/,
  /^0\.0\.0\.0$/,
  /^169\.254\.\d+\.\d+$/,
  /^metadata\.google\.internal$/i,
  /^\[::1\]$/,
  /^\[fe80:/i,
  /^\[fc00:/i,
  /^\[fd00:/i,
];

function isSafeUrl(urlString: string): { safe: boolean; reason?: string } {
  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    return { safe: false, reason: "Invalid URL format" };
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return { safe: false, reason: `Blocked protocol: ${parsed.protocol}` };
  }

  const hostname = parsed.hostname.toLowerCase();

  if (!hostname || hostname.length === 0) {
    return { safe: false, reason: "Empty hostname" };
  }

  for (const pattern of BLOCKED_HOSTNAME_PATTERNS) {
    if (pattern.test(hostname)) {
      return { safe: false, reason: `Blocked hostname: ${hostname}` };
    }
  }

  if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
    return { safe: false, reason: "Direct IP addresses are not allowed" };
  }

  if (parsed.port && !["80", "443", ""].includes(parsed.port)) {
    return { safe: false, reason: `Non-standard port: ${parsed.port}` };
  }

  return { safe: true };
}

registerTool({
  name: "prospect_search",
  description: "Search for potential business prospects by industry, niche, keyword, and/or location. Discovers companies via web search and stores them as new prospects in the pipeline. Returns a list of discovered prospects with their IDs.",
  outputSchema: ProspectSearchOutputSchema,
  inputSchema: z.object({
    query: z.string().describe("Industry, niche, or keyword to search for (e.g. 'dental clinics', 'SaaS startups', 'plumbing contractors')"),
    location: z.string().optional().describe("Optional geographic location to narrow results (e.g. 'Austin TX', 'Chicago')"),
    limit: z.number().optional().describe("Maximum number of prospects to return (default 10)"),
  }),
  execute: async (input, context: ToolContext) => {
    const maxResults = Math.min(input.limit ?? 10, 20);
    const searchQuery = input.location
      ? `${input.query} businesses in ${input.location}`
      : `${input.query} businesses companies`;

    let searchResults: Array<{ title: string; snippet: string; url: string }> = [];

    try {
      const htmlUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(searchQuery)}`;

      let response: Response | null = null;
      const maxRetries = 3;
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          response = await fetch(htmlUrl, {
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
              "Accept": "text/html",
            },
            signal: AbortSignal.timeout(15000),
            redirect: "follow",
          });
          if (response.ok) break;
          if (response.status >= 500 && attempt < maxRetries - 1) {
            await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
            continue;
          }
        } catch (fetchErr) {
          if (attempt < maxRetries - 1) {
            await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
            continue;
          }
          throw fetchErr;
        }
      }

      if (!response || !response.ok) {
        return {
          success: false,
          prospects: [],
          error: `Search request failed after ${maxRetries} attempts (status ${response?.status ?? "unknown"})`,
          errorCategory: "network" as ProspectErrorCategory,
        };
      }

      const html = await response.text();
      const $ = cheerio.load(html);

      $(".result").each((_i, el) => {
        const $el = $(el);
        const titleEl = $el.find(".result__a");
        const snippetEl = $el.find(".result__snippet");
        const linkEl = $el.find(".result__url");

        const title = titleEl.text().trim();
        const snippet = snippetEl.text().trim();
        let href = titleEl.attr("href") || "";

        if (href.startsWith("//duckduckgo.com/l/?uddg=")) {
          const match = href.match(/uddg=([^&]+)/);
          if (match) {
            href = decodeURIComponent(match[1]);
          }
        } else if (!href.startsWith("http")) {
          const rawUrl = linkEl.text().trim();
          if (rawUrl) {
            href = rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`;
          }
        }

        if (title && href && href.startsWith("http")) {
          try {
            const parsedUrl = new URL(href);
            const host = parsedUrl.hostname.toLowerCase();
            const skipDomains = ["duckduckgo.com", "wikipedia.org", "youtube.com", "facebook.com", "twitter.com", "reddit.com", "amazon.com", "yelp.com"];
            if (!skipDomains.some(d => host.includes(d))) {
              searchResults.push({ title, snippet, url: href });
            }
          } catch {
            // invalid URL, skip
          }
        }
      });
    } catch (err) {
      return {
        success: false,
        prospects: [],
        error: err instanceof Error ? err.message : "Network error during search",
        errorCategory: "network" as ProspectErrorCategory,
      };
    }

    searchResults = searchResults.slice(0, maxResults);

    if (searchResults.length === 0) {
      return {
        success: true,
        prospects: [],
        message: "No results found for this search query. Try broader keywords or a different location.",
      };
    }

    const prospects: Array<{ id: number; companyName: string; domain: string | null; sourceUrl: string; status: string }> = [];
    const parsingErrors: Array<{ url: string; error: string }> = [];
    const seenDomains = new Set<string>();

    for (const result of searchResults) {
      try {
        let companyName: string;
        let domain: string | null = null;

        try {
          const urlObj = new URL(result.url);
          domain = urlObj.hostname.replace(/^www\./, "");
        } catch {
          domain = null;
        }

        if (domain && seenDomains.has(domain)) {
          continue;
        }
        if (domain) {
          seenDomains.add(domain);
        }

        const $ = cheerio.load(result.snippet || result.title);
        const cleanText = $.text().trim();

        if (cleanText.length > 0) {
          companyName = cleanText.split(" - ")[0].split(" | ")[0].trim();
        } else {
          companyName = result.title.split(" - ")[0].split(" | ")[0].trim();
        }

        if (companyName.length > 100) {
          companyName = companyName.slice(0, 100);
        }

        if (!companyName || companyName.length < 2) {
          parsingErrors.push({ url: result.url, error: "Could not extract valid company name" });
          await db.insert(prospectsTable).values({
            clientId: context.clientId ?? null,
            companyName: result.title.slice(0, 100) || "Unknown",
            domain,
            sourceUrl: result.url,
            status: "new" satisfies ProspectStatus,
            confidenceScore: 0,
            attemptCount: 1,
            socialLinks: {},
            errorCategory: "parsing" as ProspectErrorCategory,
            extractionNotes: "Parsing: could not extract clean company name from search result",
          }).returning();
          continue;
        }

        const contactInfo: ProspectContactInfo = ProspectContactInfoSchema.parse({
          companyName,
          domain,
          phone: null,
          email: null,
          socialLinks: {},
          confidenceScore: 0,
          sourceUrl: result.url,
        });

        const [inserted] = await db.insert(prospectsTable).values({
          clientId: context.clientId ?? null,
          companyName: contactInfo.companyName,
          domain: contactInfo.domain,
          sourceUrl: contactInfo.sourceUrl,
          status: "new" satisfies ProspectStatus,
          confidenceScore: contactInfo.confidenceScore,
          attemptCount: 1,
          socialLinks: contactInfo.socialLinks ?? {},
        }).returning();

        prospects.push({
          id: inserted.id,
          companyName: inserted.companyName,
          domain: inserted.domain,
          sourceUrl: inserted.sourceUrl,
          status: inserted.status,
        });
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Unknown parsing error";
        parsingErrors.push({ url: result.url, error: errorMsg });

        try {
          await db.insert(prospectsTable).values({
            clientId: context.clientId ?? null,
            companyName: result.title.slice(0, 100) || "Unknown",
            domain: null,
            sourceUrl: result.url,
            status: "new" satisfies ProspectStatus,
            confidenceScore: 0,
            attemptCount: 1,
            socialLinks: {},
            errorCategory: "parsing" as ProspectErrorCategory,
            extractionNotes: `Parsing error: ${errorMsg}`,
          });
        } catch {
          // DB insert also failed; skip this result entirely
        }
      }
    }

    return {
      success: true,
      prospects,
      totalFound: searchResults.length,
      totalStored: prospects.length,
      parsingErrors: parsingErrors.length > 0 ? parsingErrors : undefined,
      query: input.query,
      location: input.location || null,
    };
  },
});

registerTool({
  name: "enrich_prospect",
  description: "Enrich a prospect by fetching their website and extracting contact information (phone, email, social links). Calculates a confidence score based on data quality. If confidence >= 0.75, status becomes 'enriched'; if < 0.75, status becomes 'review_needed'.",
  outputSchema: EnrichProspectOutputSchema,
  inputSchema: z.object({
    prospectId: z.number().optional().describe("The ID of the prospect to enrich"),
    domain: z.string().optional().describe("Domain to look up (used if prospectId not provided)"),
  }),
  execute: async (input, context: ToolContext) => {
    let prospect;

    if (input.prospectId) {
      const conditions = [eq(prospectsTable.id, input.prospectId)];
      if (context.clientId) {
        conditions.push(eq(prospectsTable.clientId, context.clientId));
      }
      const [found] = await db.select().from(prospectsTable).where(buildConditions(...conditions));
      prospect = found;
    } else if (input.domain) {
      const conditions = [eq(prospectsTable.domain, input.domain)];
      if (context.clientId) {
        conditions.push(eq(prospectsTable.clientId, context.clientId));
      }
      const [found] = await db.select().from(prospectsTable).where(buildConditions(...conditions)).limit(1);
      prospect = found;
    }

    if (!prospect) {
      return {
        success: false,
        error: "Prospect not found. Provide a valid prospectId or domain.",
        errorCategory: "not_found" as ProspectErrorCategory,
      };
    }

    const targetUrl = prospect.domain ? `https://${prospect.domain}` : prospect.sourceUrl;

    const urlCheck = isSafeUrl(targetUrl);
    if (!urlCheck.safe) {
      const errCat: ProspectErrorCategory = "validation";
      await db.update(prospectsTable).set({
        errorCategory: errCat,
        attemptCount: prospect.attemptCount + 1,
        extractionNotes: `Blocked URL: ${urlCheck.reason}`,
        updatedAt: new Date(),
      }).where(eq(prospectsTable.id, prospect.id));

      return {
        success: false,
        prospectId: prospect.id,
        error: `URL validation failed: ${urlCheck.reason}`,
        errorCategory: errCat,
      };
    }

    let html = "";

    try {
      const response = await fetch(targetUrl, {
        headers: { "User-Agent": "GalaxyBots/1.0 (Contact Enrichment)" },
        signal: AbortSignal.timeout(15000),
        redirect: "manual",
      });

      if (response.status >= 300 && response.status < 400) {
        const redirectUrl = response.headers.get("location");
        if (redirectUrl) {
          const absRedirect = redirectUrl.startsWith("http") ? redirectUrl : new URL(redirectUrl, targetUrl).href;
          const redirectCheck = isSafeUrl(absRedirect);
          if (!redirectCheck.safe) {
            const errCat: ProspectErrorCategory = "validation";
            await db.update(prospectsTable).set({
              errorCategory: errCat,
              attemptCount: prospect.attemptCount + 1,
              extractionNotes: `Blocked redirect to: ${absRedirect} (${redirectCheck.reason})`,
              updatedAt: new Date(),
            }).where(eq(prospectsTable.id, prospect.id));

            return {
              success: false,
              prospectId: prospect.id,
              error: `Redirect URL blocked: ${redirectCheck.reason}`,
              errorCategory: errCat,
            };
          }

          const redirectResponse = await fetch(absRedirect, {
            headers: { "User-Agent": "GalaxyBots/1.0 (Contact Enrichment)" },
            signal: AbortSignal.timeout(15000),
            redirect: "manual",
          });

          if (!redirectResponse.ok) {
            const errCat: ProspectErrorCategory = "network";
            await db.update(prospectsTable).set({
              errorCategory: errCat,
              attemptCount: prospect.attemptCount + 1,
              updatedAt: new Date(),
            }).where(eq(prospectsTable.id, prospect.id));

            return {
              success: false,
              prospectId: prospect.id,
              error: `Failed to fetch redirect target: HTTP ${redirectResponse.status}`,
              errorCategory: errCat,
            };
          }

          html = await redirectResponse.text();
        }
      } else if (!response.ok) {
        const errCat: ProspectErrorCategory = "network";
        await db.update(prospectsTable).set({
          errorCategory: errCat,
          attemptCount: prospect.attemptCount + 1,
          updatedAt: new Date(),
        }).where(eq(prospectsTable.id, prospect.id));

        return {
          success: false,
          prospectId: prospect.id,
          error: `Failed to fetch website: HTTP ${response.status}`,
          errorCategory: errCat,
        };
      } else {
        html = await response.text();
      }
    } catch (err) {
      const errCat: ProspectErrorCategory = "network";
      await db.update(prospectsTable).set({
        errorCategory: errCat,
        attemptCount: prospect.attemptCount + 1,
        updatedAt: new Date(),
      }).where(eq(prospectsTable.id, prospect.id));

      return {
        success: false,
        prospectId: prospect.id,
        error: err instanceof Error ? err.message : "Network error fetching website",
        errorCategory: errCat,
      };
    }

    let extractedPhone: string | null = null;
    let extractedEmail: string | null = null;
    const extractedSocialLinks: Record<string, string> = {};
    const fieldsFound: string[] = [];
    const fieldsMissing: string[] = [];

    try {
      const $ = cheerio.load(html);

      const phoneRegex = /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;
      const bodyText = $("body").text();
      const phoneMatches = bodyText.match(phoneRegex);
      if (phoneMatches && phoneMatches.length > 0) {
        extractedPhone = phoneMatches[0].trim();
        fieldsFound.push("phone");
      } else {
        fieldsMissing.push("phone");
      }

      const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
      const emailMatches = bodyText.match(emailRegex);
      const mailtoEmails = $('a[href^="mailto:"]').map((_, el) => {
        const href = $(el).attr("href") || "";
        return href.replace("mailto:", "").split("?")[0];
      }).get();

      const allEmails = [...new Set([...mailtoEmails, ...(emailMatches || [])])];
      const validEmails = allEmails.filter(e =>
        !e.includes("example.com") &&
        !e.includes("sentry") &&
        !e.endsWith(".png") &&
        !e.endsWith(".jpg") &&
        e.length < 100
      );

      if (validEmails.length > 0) {
        extractedEmail = validEmails[0];
        fieldsFound.push("email");
      } else {
        fieldsMissing.push("email");
      }

      const socialPatterns: Record<string, RegExp> = {
        facebook: /facebook\.com\/[a-zA-Z0-9._-]+/,
        twitter: /(?:twitter|x)\.com\/[a-zA-Z0-9._-]+/,
        linkedin: /linkedin\.com\/(?:company|in)\/[a-zA-Z0-9._-]+/,
        instagram: /instagram\.com\/[a-zA-Z0-9._-]+/,
        youtube: /youtube\.com\/(?:c\/|channel\/|@)[a-zA-Z0-9._-]+/,
      };

      $("a[href]").each((_, el) => {
        const href = $(el).attr("href") || "";
        for (const [platform, pattern] of Object.entries(socialPatterns)) {
          if (!extractedSocialLinks[platform] && pattern.test(href)) {
            extractedSocialLinks[platform] = href;
          }
        }
      });

      if (Object.keys(extractedSocialLinks).length > 0) {
        fieldsFound.push("socialLinks");
      } else {
        fieldsMissing.push("socialLinks");
      }
    } catch (err) {
      const errCat: ProspectErrorCategory = "parsing";
      await db.update(prospectsTable).set({
        errorCategory: errCat,
        attemptCount: prospect.attemptCount + 1,
        updatedAt: new Date(),
      }).where(eq(prospectsTable.id, prospect.id));

      return {
        success: false,
        prospectId: prospect.id,
        error: "Failed to parse website HTML",
        errorCategory: errCat,
      };
    }

    let confidenceScore = 0;
    const totalFields = 3;
    let foundCount = 0;

    if (extractedPhone) {
      const cleanPhone = extractedPhone.replace(/\D/g, "");
      if (cleanPhone.length >= 10 && cleanPhone.length <= 11) {
        foundCount += 1;
      } else {
        foundCount += 0.5;
      }
    }

    if (extractedEmail) {
      const emailParts = extractedEmail.split("@");
      if (emailParts.length === 2 && emailParts[1].includes(".")) {
        foundCount += 1;
      } else {
        foundCount += 0.3;
      }
    }

    if (Object.keys(extractedSocialLinks).length >= 2) {
      foundCount += 1;
    } else if (Object.keys(extractedSocialLinks).length === 1) {
      foundCount += 0.5;
    }

    confidenceScore = Math.round((foundCount / totalFields) * 100) / 100;
    const newStatus: ProspectStatus = confidenceScore >= 0.75 ? "enriched" : "review_needed";

    const validatedContactInfo = ProspectContactInfoSchema.parse({
      companyName: prospect.companyName,
      domain: prospect.domain,
      phone: extractedPhone,
      email: extractedEmail,
      socialLinks: extractedSocialLinks,
      confidenceScore,
      sourceUrl: prospect.sourceUrl,
    });

    await db.update(prospectsTable).set({
      phone: validatedContactInfo.phone,
      email: validatedContactInfo.email,
      socialLinks: validatedContactInfo.socialLinks ?? {},
      confidenceScore: validatedContactInfo.confidenceScore,
      status: newStatus,
      errorCategory: null,
      attemptCount: prospect.attemptCount + 1,
      extractionNotes: `Found: ${fieldsFound.join(", ")}. Missing: ${fieldsMissing.join(", ")}.`,
      updatedAt: new Date(),
    }).where(eq(prospectsTable.id, prospect.id));

    return {
      success: true,
      prospectId: prospect.id,
      companyName: validatedContactInfo.companyName,
      domain: validatedContactInfo.domain,
      phone: validatedContactInfo.phone,
      email: validatedContactInfo.email,
      socialLinks: validatedContactInfo.socialLinks,
      confidenceScore: validatedContactInfo.confidenceScore,
      status: newStatus,
      fieldsFound,
      fieldsMissing,
    };
  },
});

registerTool({
  name: "get_prospects",
  description: "Retrieve the current prospect pipeline, optionally filtered by status and/or client. Returns prospects scoped to the current client by default, ordered by most recently created.",
  outputSchema: GetProspectsOutputSchema,
  inputSchema: z.object({
    status: ProspectStatusEnum.optional().describe("Filter by prospect status"),
    clientId: z.number().optional().describe("Filter by client ID (defaults to current client context)"),
    limit: z.number().optional().describe("Maximum number of results (default 20)"),
  }),
  execute: async (input, context: ToolContext) => {
    const maxResults = Math.min(input.limit ?? 20, 100);
    const conditions = [];

    const scopedClientId = context.clientId ?? input.clientId;
    if (!scopedClientId) {
      return {
        success: false,
        count: 0,
        prospects: [],
      };
    }
    conditions.push(eq(prospectsTable.clientId, scopedClientId));

    if (input.status) {
      conditions.push(eq(prospectsTable.status, input.status));
    }

    const query = db.select().from(prospectsTable);
    const results = conditions.length > 0
      ? await query.where(buildConditions(...conditions)).orderBy(desc(prospectsTable.createdAt)).limit(maxResults)
      : await query.orderBy(desc(prospectsTable.createdAt)).limit(maxResults);

    return {
      success: true,
      count: results.length,
      prospects: results.map(p => ({
        id: p.id,
        companyName: p.companyName,
        domain: p.domain,
        phone: p.phone,
        email: p.email,
        socialLinks: p.socialLinks,
        confidenceScore: p.confidenceScore,
        status: p.status,
        sourceUrl: p.sourceUrl,
        errorCategory: p.errorCategory,
        extractionNotes: p.extractionNotes,
        createdAt: p.createdAt.toISOString(),
      })),
    };
  },
});

registerTool({
  name: "qualify_prospect",
  description: "Update a prospect's status in the pipeline and optionally add notes. Use this to mark a prospect as qualified, contacted, or rejected after review.",
  outputSchema: QualifyProspectOutputSchema,
  inputSchema: z.object({
    prospectId: z.number().describe("The ID of the prospect to update"),
    status: z.enum(["qualified", "contacted", "rejected"]).describe("New status for the prospect"),
    notes: z.string().optional().describe("Optional notes about the qualification decision"),
  }),
  execute: async (input, context: ToolContext) => {
    const qualifyConditions = [eq(prospectsTable.id, input.prospectId)];
    if (context.clientId) {
      qualifyConditions.push(eq(prospectsTable.clientId, context.clientId));
    }
    const [prospect] = await db.select().from(prospectsTable)
      .where(buildConditions(...qualifyConditions));

    if (!prospect) {
      return {
        success: false,
        error: `Prospect with ID ${input.prospectId} not found.`,
      };
    }

    const newStatus: ProspectStatus = input.status;
    const existingNotes = prospect.extractionNotes || "";
    const updatedNotes = input.notes
      ? existingNotes
        ? `${existingNotes}\n[${new Date().toISOString()}] ${input.notes}`
        : `[${new Date().toISOString()}] ${input.notes}`
      : existingNotes;

    await db.update(prospectsTable).set({
      status: newStatus,
      extractionNotes: updatedNotes,
      updatedAt: new Date(),
    }).where(eq(prospectsTable.id, input.prospectId));

    if (newStatus === "qualified" && prospect.status !== "qualified") {
      try {
        const [salesBot] = await db.select().from(botsTable)
          .where(eq(botsTable.department, "Sales"))
          .limit(1);

        if (salesBot && prospect.clientId) {
          const existingAssignments = await db.select().from(botAssignmentsTable)
            .where(and(
              eq(botAssignmentsTable.botId, salesBot.id),
              eq(botAssignmentsTable.clientId, prospect.clientId),
              eq(botAssignmentsTable.objective, `Outreach review for qualified prospect: ${prospect.companyName} (ID: ${prospect.id}). Review the prospect details and initiate outreach via email or SMS.`),
            ))
            .limit(1);

          if (existingAssignments.length === 0) {
            await db.insert(botAssignmentsTable).values({
              botId: salesBot.id,
              clientId: prospect.clientId,
              objective: `Outreach review for qualified prospect: ${prospect.companyName} (ID: ${prospect.id}). Review the prospect details and initiate outreach via email or SMS.`,
              schedule: "daily",
              isActive: "true",
              actionMode: "passive",
            });
          }
        }

        broadcastSSE("prospect-qualified", {
          prospectId: prospect.id,
          companyName: prospect.companyName,
          clientId: prospect.clientId,
          status: "qualified",
        });
      } catch {
        // Non-critical: assignment creation failed but qualification succeeded
      }

      createNotification({
        clientId: prospect.clientId,
        category: "prospect",
        severity: "info",
        title: `Prospect qualified: ${prospect.companyName}`,
        body: input.notes || `${prospect.companyName} has been marked as qualified`,
        link: "/prospects",
        metadata: { prospectId: input.prospectId },
      }).catch((e) => console.error("[notifications] Failed to create prospect-qualified notification:", e));
    }

    if (newStatus === "contacted") {
      createNotification({
        clientId: prospect.clientId,
        category: "prospect",
        severity: "info",
        title: `Prospect converted: ${prospect.companyName}`,
        body: input.notes || `${prospect.companyName} has been converted and contacted`,
        link: "/roi",
        metadata: { prospectId: input.prospectId },
      }).catch((e) => console.error("[notifications] Failed to create prospect-converted notification:", e));
    }

    return {
      success: true,
      prospectId: input.prospectId,
      companyName: prospect.companyName,
      previousStatus: prospect.status,
      newStatus,
      notes: input.notes || null,
    };
  },
});
