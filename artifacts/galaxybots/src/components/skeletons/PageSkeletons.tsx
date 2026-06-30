import { Skeleton } from "@/components/ui/skeleton";

function SkeletonBlock({ className }: { className?: string }) {
  return <Skeleton className={`shimmer-sweep ${className ?? ""}`} />;
}

export function PageSkeleton() {
  return (
    <div className="min-h-screen flex flex-col gap-6 p-6 lg:p-10 bg-background">
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-2">
          <SkeletonBlock className="h-8 w-48" />
          <SkeletonBlock className="h-4 w-72" />
        </div>
        <SkeletonBlock className="h-10 w-32 rounded-lg" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-border/30 bg-card p-5 flex flex-col gap-3">
            <SkeletonBlock className="h-5 w-32" />
            <SkeletonBlock className="h-4 w-full" />
            <SkeletonBlock className="h-4 w-3/4" />
            <SkeletonBlock className="h-9 w-full mt-2 rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function BotRosterSkeleton() {
  return (
    <div className="container mx-auto px-4 py-12">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
        <div className="flex flex-col gap-2">
          <SkeletonBlock className="h-9 w-56" />
          <SkeletonBlock className="h-5 w-72" />
        </div>
        <SkeletonBlock className="h-11 w-full md:w-72 rounded-lg" />
      </div>
      <div className="flex gap-2 mb-10">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonBlock key={i} className="h-11 w-28 rounded-full" />
        ))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-border/30 bg-card p-5 flex flex-col gap-4">
            <div className="flex justify-between items-start">
              <SkeletonBlock className="h-12 w-12 rounded-xl" />
              <SkeletonBlock className="h-6 w-20 rounded-full" />
            </div>
            <SkeletonBlock className="h-5 w-3/4" />
            <SkeletonBlock className="h-4 w-24" />
            <div className="flex flex-col gap-1.5">
              <SkeletonBlock className="h-3.5 w-full" />
              <SkeletonBlock className="h-3.5 w-full" />
              <SkeletonBlock className="h-3.5 w-2/3" />
            </div>
            <SkeletonBlock className="h-7 w-20 rounded-full mt-auto" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function ClientsCardsSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-border/30 bg-card p-5 flex flex-col gap-3">
          <div className="flex justify-between items-start pb-3 border-b border-border/30">
            <div className="flex flex-col gap-2">
              <SkeletonBlock className="h-5 w-36" />
              <SkeletonBlock className="h-4 w-20 rounded-full" />
            </div>
            <SkeletonBlock className="h-6 w-16 rounded-full" />
          </div>
          <div className="flex flex-col gap-2 pt-1">
            {Array.from({ length: 3 }).map((_, j) => (
              <div key={j} className="flex justify-between">
                <SkeletonBlock className="h-4 w-16" />
                <SkeletonBlock className="h-4 w-28" />
              </div>
            ))}
          </div>
          <SkeletonBlock className="h-9 w-full rounded-lg mt-2" />
        </div>
      ))}
    </div>
  );
}

export function ReferralsTableSkeleton() {
  return (
    <div className="space-y-2 p-2">
      <div className="grid grid-cols-4 gap-4 pb-2 border-b border-border/30">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonBlock key={i} className="h-3.5 w-full" />
        ))}
      </div>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="grid grid-cols-4 gap-4 py-2">
          <SkeletonBlock className="h-4 w-full" />
          <SkeletonBlock className="h-4 w-4/5" />
          <SkeletonBlock className="h-5 w-16 rounded-full" />
          <SkeletonBlock className="h-4 w-3/4" />
        </div>
      ))}
    </div>
  );
}

export function AeoHealthTableSkeleton() {
  return (
    <div className="p-6 space-y-2">
      <div className="grid grid-cols-5 gap-4 pb-3 border-b border-border/30 px-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <SkeletonBlock key={i} className="h-3.5 w-full" />
        ))}
      </div>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="grid grid-cols-5 gap-4 py-3 px-2">
          <div className="col-span-2">
            <SkeletonBlock className="h-4 w-3/4" />
          </div>
          <SkeletonBlock className="h-6 w-12 self-center rounded" />
          <SkeletonBlock className="h-4 w-8 self-center" />
          <SkeletonBlock className="h-5 w-16 rounded-full self-center" />
        </div>
      ))}
    </div>
  );
}

export function BillingSkeleton() {
  return (
    <div className="container mx-auto px-4 py-16 sm:py-24">
      <div className="text-center max-w-3xl mx-auto mb-16 flex flex-col items-center gap-4">
        <SkeletonBlock className="h-7 w-40 rounded-full" />
        <SkeletonBlock className="h-12 w-96 max-w-full" />
        <SkeletonBlock className="h-5 w-full max-w-xl" />
        <SkeletonBlock className="h-5 w-3/4 max-w-xl" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className={`rounded-2xl border border-border/30 bg-card p-6 flex flex-col gap-4 ${i === 1 ? "scale-105 border-primary/30" : ""}`}
          >
            <SkeletonBlock className="h-8 w-8 rounded-lg" />
            <SkeletonBlock className="h-7 w-28" />
            <SkeletonBlock className="h-4 w-full" />
            <SkeletonBlock className="h-10 w-32 mt-2" />
            <div className="flex flex-col gap-3 mt-2">
              {Array.from({ length: 5 }).map((_, j) => (
                <div key={j} className="flex items-center gap-3">
                  <SkeletonBlock className="h-5 w-5 rounded-full shrink-0" />
                  <SkeletonBlock className="h-4 flex-1" />
                </div>
              ))}
            </div>
            <SkeletonBlock className="h-11 w-full rounded-lg mt-auto" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function ProspectorSkeleton() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-8">
        <div className="flex flex-col gap-2">
          <SkeletonBlock className="h-9 w-40" />
          <SkeletonBlock className="h-4 w-80" />
        </div>
        <SkeletonBlock className="h-10 w-28 rounded-lg" />
      </div>
      <div className="flex gap-2 mb-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <SkeletonBlock key={i} className="h-10 w-40 rounded-lg" />
        ))}
      </div>
      <div className="rounded-2xl border border-border/30 bg-card overflow-hidden">
        <div className="p-5 border-b border-border/30 flex flex-col gap-2">
          <SkeletonBlock className="h-6 w-44" />
          <SkeletonBlock className="h-4 w-72" />
        </div>
        <div className="p-5">
          <div className="grid grid-cols-6 gap-4 pb-3 border-b border-border/30 mb-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonBlock key={i} className="h-4 w-full" />
            ))}
          </div>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="grid grid-cols-6 gap-4 py-3 border-b border-border/10 last:border-0">
              <div className="col-span-1 flex flex-col gap-1">
                <SkeletonBlock className="h-4 w-full" />
                <SkeletonBlock className="h-3 w-3/4" />
              </div>
              <div className="flex flex-col gap-1">
                <SkeletonBlock className="h-4 w-full" />
                <SkeletonBlock className="h-3 w-2/3" />
              </div>
              <SkeletonBlock className="h-6 w-full rounded-full self-center" />
              <SkeletonBlock className="h-6 w-16 rounded-full self-center" />
              <SkeletonBlock className="h-6 w-20 rounded-full self-center" />
              <SkeletonBlock className="h-4 w-full self-center" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ObservabilityTabSkeleton() {
  return (
    <div className="space-y-6 p-2">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-border/30 bg-card p-5 flex flex-col gap-3">
            <SkeletonBlock className="h-4 w-28" />
            <SkeletonBlock className="h-8 w-20" />
            <SkeletonBlock className="h-2 w-full rounded-full" />
            <SkeletonBlock className="h-3 w-24" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-border/30 bg-card p-5 flex flex-col gap-4">
            <SkeletonBlock className="h-5 w-40" />
            {Array.from({ length: 4 }).map((_, j) => (
              <div key={j} className="flex flex-col gap-1.5">
                <div className="flex justify-between">
                  <SkeletonBlock className="h-3.5 w-24" />
                  <SkeletonBlock className="h-3.5 w-8" />
                </div>
                <SkeletonBlock className="h-2 w-full rounded-full" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
