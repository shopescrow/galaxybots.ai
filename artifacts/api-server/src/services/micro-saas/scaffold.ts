import type { MicroSaasSpec } from "./spec";

/**
 * Micro-SaaS scaffold pipeline (task #264).
 *
 * Defines — deterministically, with no AI — how an APPROVED spec becomes a new
 * standalone web artifact wired to shared AI model access. This produces a
 * reviewable scaffold *plan* (a manifest of files + service wiring), it does NOT
 * write files or register an artifact. Fully-automated generation of arbitrary
 * tools is intentionally out of scope: a human reviews the plan, then the
 * platform creates the artifact from it (the bundled example tool, "Caption
 * Forge", was built by hand following exactly this plan to prove the pipeline).
 */

export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "micro-tool"
  );
}

export interface ScaffoldFile {
  path: string;
  purpose: string;
}

export interface ScaffoldPlan {
  /** kebab-case artifact slug (createArtifact `slug`). */
  slug: string;
  artifactType: "react-vite";
  /** URL prefix the artifact serves at. */
  previewPath: string;
  title: string;
  /** The public AI endpoint the frontend calls. */
  endpoint: {
    method: "POST";
    path: string;
    /** The shared, governed model access this endpoint runs through. */
    aiAccess: "callWithFallback (services/ai-safety/model-fallback)";
    promptLogic: string;
  };
  /** Files a human/agent creates to realize the artifact. */
  files: ScaffoldFile[];
  /** Pricing/subscription intent carried over from the spec. */
  pricing: MicroSaasSpec["pricing"];
  reviewNote: string;
}

/**
 * Build the scaffold plan for a spec. Deterministic and side-effect free so it
 * can be stored on the asset, diffed, and reviewed before anything is created.
 */
export function buildScaffoldPlan(spec: MicroSaasSpec): ScaffoldPlan {
  const slug = slugify(spec.name);
  const previewPath = `/${slug}/`;
  const endpointPath = `/api/v1/micro-tools/${slug}`;

  return {
    slug,
    artifactType: "react-vite",
    previewPath,
    title: spec.name,
    endpoint: {
      method: "POST",
      path: endpointPath,
      aiAccess: "callWithFallback (services/ai-safety/model-fallback)",
      promptLogic: spec.aiPromptLogic,
    },
    files: [
      {
        path: `artifacts/${slug}/src/App.tsx`,
        purpose:
          "Single-purpose tool UI: render the spec's inputFields, POST to the endpoint, show AI output.",
      },
      {
        path: `artifacts/${slug}/src/index.css`,
        purpose: "Tailwind theme tokens for the standalone tool.",
      },
      {
        path: `artifacts/api-server/src/routes/micro-tools.ts`,
        purpose:
          "Add a public POST handler at the endpoint path that runs the spec's promptLogic via callWithFallback.",
      },
      {
        path: `artifacts/api-server/src/app.ts`,
        purpose:
          "Ensure '/micro-tools/' is in PUBLIC_PREFIX_SUFFIXES so the standalone tool can call it unauthenticated.",
      },
    ],
    pricing: spec.pricing,
    reviewNote:
      "Human review required before creation. After approval: run createArtifact(react-vite, slug, previewPath, title), implement App.tsx from inputFields, and add the endpoint handler wired to callWithFallback.",
  };
}
