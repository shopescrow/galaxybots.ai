import { Link } from 'react-router-dom';
import { Info, ArrowUpRight } from 'lucide-react';
import { getTerm } from '@/content/explainerContent';
import { useInteractive } from './interactiveContext';

/**
 * Full-card hotspot: an absolutely-positioned link covering its (relative,
 * rounded) parent container. Shows a persistent info affordance and, on
 * hover/focus, reveals the term's short description plus a link into the
 * in-explainer definition page. Renders nothing outside interactive mode, so
 * the recorded export stays clean.
 *
 * Set `revealOnHover={false}` for short containers (e.g. pills) that are
 * already self-describing: it keeps the link + affordance without the reveal.
 */
export function TermHotspot({
  slug,
  revealOnHover = true,
}: {
  slug: string;
  revealOnHover?: boolean;
}) {
  const interactive = useInteractive();
  const term = getTerm(slug);
  if (!interactive || !term) return null;

  return (
    <Link
      to={`/define/${slug}`}
      aria-label={`Learn what ${term.term} means`}
      style={{ borderRadius: 'inherit' }}
      className="group/term absolute inset-0 z-30 block no-underline outline-none transition-colors hover:bg-[var(--color-secondary)]/[0.04] focus-visible:ring-2 focus-visible:ring-[var(--color-secondary)]"
    >
      <span
        className={`absolute z-10 text-white/30 transition-colors duration-300 group-hover/term:text-[var(--color-secondary)] group-focus-visible/term:text-[var(--color-secondary)] ${
          revealOnHover ? 'top-3 right-3' : 'right-4 top-1/2 -translate-y-1/2'
        }`}
      >
        <Info className="h-5 w-5" />
      </span>

      {revealOnHover && (
        <>
          <span
            style={{ borderRadius: 'inherit' }}
            className="absolute inset-0 bg-[#0B0F19]/[0.93] backdrop-blur-sm opacity-0 transition-opacity duration-300 group-hover/term:opacity-100 group-focus-visible/term:opacity-100"
          />
          <span className="absolute inset-0 flex translate-y-2 flex-col justify-center gap-2 px-5 text-left opacity-0 transition-all duration-300 group-hover/term:translate-y-0 group-hover/term:opacity-100 group-focus-visible/term:translate-y-0 group-focus-visible/term:opacity-100">
            <span className="font-body text-[15px] leading-snug text-white/90">
              {term.short}
            </span>
            <span className="inline-flex items-center gap-1 font-heading text-[12px] tracking-wide text-[var(--color-secondary)]">
              Open definition <ArrowUpRight className="h-3.5 w-3.5" />
            </span>
          </span>
        </>
      )}
    </Link>
  );
}

/**
 * Compact pill affordance for title scenes that have no card container.
 * Links into the term's definition page. Interactive-mode only.
 */
export function TermChip({
  slug,
  label,
  className = '',
}: {
  slug: string;
  label?: string;
  className?: string;
}) {
  const interactive = useInteractive();
  const term = getTerm(slug);
  if (!interactive || !term) return null;

  return (
    <Link
      to={`/define/${slug}`}
      className={`group/chip inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-5 py-2 font-heading text-white/70 no-underline backdrop-blur-md transition-colors hover:border-[var(--color-secondary)]/50 hover:text-white ${className}`}
    >
      <Info className="h-4 w-4 text-[var(--color-secondary)]" />
      <span className="whitespace-nowrap text-[15px] tracking-wide">
        {label ?? term.h2Label}
      </span>
      <ArrowUpRight className="h-4 w-4 -translate-x-1 opacity-0 transition-all group-hover/chip:translate-x-0 group-hover/chip:opacity-100" />
    </Link>
  );
}
