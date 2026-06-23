type LabelSet = Record<string, string>;

class Counter {
  private counts = new Map<string, number>();

  inc(labels: LabelSet = {}, value = 1): void {
    const key = JSON.stringify(labels);
    this.counts.set(key, (this.counts.get(key) ?? 0) + value);
  }

  getAll(): Array<{ labels: LabelSet; value: number }> {
    return Array.from(this.counts.entries()).map(([k, v]) => ({
      labels: JSON.parse(k) as LabelSet,
      value: v,
    }));
  }
}

class Histogram {
  private buckets: number[];
  private counts = new Map<string, number[]>();
  private sums = new Map<string, number>();
  private totals = new Map<string, number>();

  constructor(buckets: number[]) {
    this.buckets = [...buckets, Infinity];
  }

  observe(value: number, labels: LabelSet = {}): void {
    const key = JSON.stringify(labels);
    if (!this.counts.has(key)) {
      this.counts.set(key, new Array(this.buckets.length).fill(0));
      this.sums.set(key, 0);
      this.totals.set(key, 0);
    }
    const bucketCounts = this.counts.get(key)!;
    for (let i = 0; i < this.buckets.length; i++) {
      if (value <= this.buckets[i]) bucketCounts[i]++;
    }
    this.sums.set(key, (this.sums.get(key) ?? 0) + value);
    this.totals.set(key, (this.totals.get(key) ?? 0) + 1);
  }

  getAll(): Array<{ labels: LabelSet; buckets: Array<{ le: number | string; count: number }>; sum: number; count: number }> {
    return Array.from(this.counts.entries()).map(([k, bucketCounts]) => ({
      labels: JSON.parse(k) as LabelSet,
      buckets: this.buckets.map((b, i) => ({ le: b === Infinity ? "+Inf" : b, count: bucketCounts[i] })),
      sum: this.sums.get(k) ?? 0,
      count: this.totals.get(k) ?? 0,
    }));
  }
}

class Gauge {
  private values = new Map<string, number>();

  set(value: number, labels: LabelSet = {}): void {
    this.values.set(JSON.stringify(labels), value);
  }

  inc(labels: LabelSet = {}): void {
    const key = JSON.stringify(labels);
    this.values.set(key, (this.values.get(key) ?? 0) + 1);
  }

  dec(labels: LabelSet = {}): void {
    const key = JSON.stringify(labels);
    this.values.set(key, (this.values.get(key) ?? 0) - 1);
  }

  getAll(): Array<{ labels: LabelSet; value: number }> {
    return Array.from(this.values.entries()).map(([k, v]) => ({
      labels: JSON.parse(k) as LabelSet,
      value: v,
    }));
  }
}

export const agentMetrics = {
  loopTotal: new Counter(),
  loopDurationMs: new Histogram([500, 1000, 2000, 5000, 10000, 30000, 60000, 120000]),
  loopCostCents: new Histogram([1, 5, 10, 25, 50, 100, 250, 500]),
  loopIterations: new Histogram([1, 2, 3, 5, 7, 10]),
  toolCallsTotal: new Counter(),
  failuresTotal: new Counter(),
  circuitBreakerState: new Gauge(),
  selfEvaluationScore: new Histogram([0.3, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0]),
  qualityGateRetries: new Counter(),
};

export type AgentMetrics = typeof agentMetrics;

export function renderPrometheusMetrics(): string {
  const lines: string[] = [];

  function renderCounter(name: string, counter: Counter, help: string): void {
    lines.push(`# HELP ${name} ${help}`);
    lines.push(`# TYPE ${name} counter`);
    for (const { labels, value } of counter.getAll()) {
      const labelStr = Object.entries(labels).map(([k, v]) => `${k}="${v}"`).join(",");
      lines.push(`${name}{${labelStr}} ${value}`);
    }
    if (counter.getAll().length === 0) {
      lines.push(`${name} 0`);
    }
  }

  function renderHistogram(name: string, hist: Histogram, help: string): void {
    lines.push(`# HELP ${name} ${help}`);
    lines.push(`# TYPE ${name} histogram`);
    for (const { labels, buckets, sum, count } of hist.getAll()) {
      const baseLabelStr = Object.entries(labels).map(([k, v]) => `${k}="${v}"`).join(",");
      for (const { le, count: c } of buckets) {
        const leLabel = baseLabelStr ? `${baseLabelStr},le="${le}"` : `le="${le}"`;
        lines.push(`${name}_bucket{${leLabel}} ${c}`);
      }
      const suffix = baseLabelStr ? `{${baseLabelStr}}` : "";
      lines.push(`${name}_sum${suffix} ${sum}`);
      lines.push(`${name}_count${suffix} ${count}`);
    }
  }

  function renderGauge(name: string, gauge: Gauge, help: string): void {
    lines.push(`# HELP ${name} ${help}`);
    lines.push(`# TYPE ${name} gauge`);
    for (const { labels, value } of gauge.getAll()) {
      const labelStr = Object.entries(labels).map(([k, v]) => `${k}="${v}"`).join(",");
      lines.push(`${name}{${labelStr}} ${value}`);
    }
  }

  renderCounter("galaxybots_agent_loop_total", agentMetrics.loopTotal, "Total agentic loop executions by termination reason and status");
  renderHistogram("galaxybots_agent_loop_duration_ms", agentMetrics.loopDurationMs, "Agentic loop execution duration in milliseconds");
  renderHistogram("galaxybots_agent_loop_cost_cents", agentMetrics.loopCostCents, "Agentic loop cost in cents");
  renderHistogram("galaxybots_agent_loop_iterations", agentMetrics.loopIterations, "Agentic loop iteration count per execution");
  renderCounter("galaxybots_agent_tool_calls_total", agentMetrics.toolCallsTotal, "Total tool calls by tool name and status");
  renderCounter("galaxybots_agent_failures_total", agentMetrics.failuresTotal, "Total loop failures by category");
  renderGauge("galaxybots_agent_circuit_breaker_state", agentMetrics.circuitBreakerState, "Circuit breaker state (0=closed, 1=open) by provider");
  renderHistogram("galaxybots_agent_self_evaluation_score", agentMetrics.selfEvaluationScore, "Self-evaluation scores from quality gate");
  renderCounter("galaxybots_agent_quality_gate_retries_total", agentMetrics.qualityGateRetries, "Quality gate retry counts");

  return lines.join("\n") + "\n";
}
