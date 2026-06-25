import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowUpRight, Sparkles } from 'lucide-react';
import { getTerm, TERMS, CTA, mainSiteUrl } from '@/content/explainerContent';

export default function DefinitionPage() {
  const { slug } = useParams();
  const term = getTerm(slug);

  return (
    <div className="relative min-h-screen w-full overflow-x-hidden bg-[#0B0F19] text-white">
      <div className="fixed inset-0 -z-10">
        <video
          src={`${import.meta.env.BASE_URL}videos/space-bg.mp4`}
          autoPlay
          loop
          muted
          playsInline
          className="h-full w-full object-cover opacity-20 mix-blend-screen"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#0B0F19]/60 via-[#0B0F19]/80 to-[#0B0F19]" />
      </div>

      <div className="mx-auto w-full max-w-3xl px-6 py-12 sm:py-16">
        <Link
          to="/"
          className="inline-flex items-center gap-2 font-heading text-white/60 no-underline transition-colors hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" /> Back to explainer
        </Link>

        {term ? (
          <article className="mt-10">
            <div className="inline-flex items-center gap-2 rounded-full border border-[var(--color-secondary)]/30 bg-[var(--color-secondary)]/10 px-4 py-1.5 text-[var(--color-secondary)]">
              <Sparkles className="h-4 w-4" />
              <span className="font-heading text-sm uppercase tracking-widest">
                {term.term}
              </span>
            </div>

            <h1 className="mt-6 font-display text-4xl font-bold leading-tight sm:text-5xl">
              {term.h2Label}
            </h1>

            <p className="mt-6 font-body text-lg leading-relaxed text-white/75">
              {term.long}
            </p>

            <a
              href={mainSiteUrl(term.siteUrl)}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-8 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[var(--color-primary)] to-[var(--color-secondary)] px-6 py-3 font-heading font-semibold text-[#0B0F19] no-underline transition-transform hover:scale-[1.03]"
            >
              {term.siteLabel} <ArrowUpRight className="h-5 w-5" />
            </a>

            <div className="mt-14 border-t border-white/10 pt-8">
              <h2 className="font-heading text-sm uppercase tracking-widest text-white/40">
                Explore more
              </h2>
              <div className="mt-4 flex flex-wrap gap-2">
                {TERMS.filter((t) => t.slug !== term.slug).map((t) => (
                  <Link
                    key={t.slug}
                    to={`/define/${t.slug}`}
                    className="rounded-full border border-white/10 bg-white/5 px-4 py-1.5 font-heading text-sm text-white/70 no-underline transition-colors hover:border-[var(--color-secondary)]/40 hover:text-white"
                  >
                    {t.term}
                  </Link>
                ))}
              </div>
            </div>

            <div className="mt-12 rounded-2xl border border-white/10 bg-white/5 p-6 text-center backdrop-blur-md">
              <p className="font-display text-xl">{CTA.heading}</p>
              <p className="mt-1 text-white/60">{CTA.subtext}</p>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
                <a
                  href={mainSiteUrl(CTA.primary.url)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-full bg-[var(--color-primary)] px-6 py-2.5 font-heading font-semibold text-white no-underline transition-opacity hover:opacity-90"
                >
                  {CTA.primary.label}
                </a>
                <a
                  href={mainSiteUrl(CTA.secondary.url)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-full border border-white/20 px-6 py-2.5 font-heading text-white no-underline transition-colors hover:bg-white/10"
                >
                  {CTA.secondary.label}
                </a>
              </div>
            </div>
          </article>
        ) : (
          <div className="mt-20 text-center">
            <h1 className="font-display text-3xl font-bold">Definition not found</h1>
            <p className="mt-3 text-white/60">
              We couldn't find that term. Head back to the explainer to explore.
            </p>
            <Link
              to="/"
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-[var(--color-primary)] px-6 py-3 font-heading text-white no-underline"
            >
              <ArrowLeft className="h-4 w-4" /> Back to explainer
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
