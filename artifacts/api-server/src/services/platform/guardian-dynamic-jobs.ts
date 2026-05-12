const dynamicJobIntervals = new Map<string, ReturnType<typeof setInterval>>();
const PATROL_INTERVAL_MS = 60 * 60 * 1000;

export function registerDynamicJob(
  name: string,
  fn: () => Promise<void>,
  intervalMs: number = PATROL_INTERVAL_MS,
): void {
  if (dynamicJobIntervals.has(name)) return;
  const timer = setInterval(() => {
    fn().catch((err) => console.error(`[dynamic-job:${name}]`, err));
  }, intervalMs);
  dynamicJobIntervals.set(name, timer);
  console.log(`[scheduler] Dynamic patrol job registered: ${name} (interval=${intervalMs}ms)`);
}

export function hasDynamicJob(name: string): boolean {
  return dynamicJobIntervals.has(name);
}

export function clearDynamicJob(name: string): void {
  const timer = dynamicJobIntervals.get(name);
  if (timer !== undefined) {
    clearInterval(timer);
    dynamicJobIntervals.delete(name);
  }
}
