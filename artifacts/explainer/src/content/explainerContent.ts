import contentJson from './explainerContent.json';

export interface CtaLink {
  label: string;
  url: string;
}

export interface Term {
  slug: string;
  term: string;
  h2Label: string;
  scene: string;
  short: string;
  long: string;
  definitionPath: string;
  siteUrl: string;
  siteLabel: string;
}

export interface SceneInfo {
  order: number;
  key: string;
  title: string;
  summary: string;
  terms: string[];
}

export interface ExplainerContent {
  name: string;
  version: number;
  meta: {
    title: string;
    description: string;
    mainSite: string;
    explainerPath: string;
  };
  callToAction: {
    eyebrow: string;
    heading: string;
    subtext: string;
    primary: CtaLink;
    secondary: CtaLink;
  };
  scenes: SceneInfo[];
  terms: Term[];
}

export const content = contentJson as ExplainerContent;
export const TERMS: Term[] = content.terms;
export const SCENES: SceneInfo[] = content.scenes;
export const CTA = content.callToAction;
export const META = content.meta;

const BY_SLUG: Record<string, Term> = Object.fromEntries(
  TERMS.map((t) => [t.slug, t]),
);

export function getTerm(slug: string | undefined): Term | undefined {
  return slug ? BY_SLUG[slug] : undefined;
}

/**
 * Resolve a relative content path (e.g. "/pricing") to an absolute URL on the
 * main GalaxyBots.ai site, so outbound links always reach the real product
 * site regardless of where this explainer artifact is hosted.
 */
export function mainSiteUrl(path: string): string {
  const base = META.mainSite.replace(/\/+$/, '');
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${base}${suffix}`;
}
