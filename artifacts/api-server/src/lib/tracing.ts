import { trace, context, propagation, SpanStatusCode, type Span, type Tracer } from "@opentelemetry/api";

export const SERVICE_NAME = "galaxybots-api";

export function getTracer(): Tracer {
  return trace.getTracer(SERVICE_NAME, "1.0.0");
}

export function getCurrentTraceId(): string | undefined {
  const span = trace.getActiveSpan();
  if (!span) return undefined;
  const ctx = span.spanContext();
  if (!ctx.isRemote && ctx.traceId === "00000000000000000000000000000000") return undefined;
  return ctx.traceId;
}

export function getCurrentSpanId(): string | undefined {
  const span = trace.getActiveSpan();
  if (!span) return undefined;
  return span.spanContext().spanId;
}

export function setSpanError(span: Span, err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err);
  span.setStatus({ code: SpanStatusCode.ERROR, message: msg });
  if (err instanceof Error) {
    span.recordException(err);
  }
}

export function captureTraceContext(): Record<string, string> {
  const carrier: Record<string, string> = {};
  propagation.inject(context.active(), carrier);
  return carrier;
}

export function restoreTraceContext(carrier: Record<string, string>) {
  return propagation.extract(context.active(), carrier);
}

export { context as otelContext, SpanStatusCode };
export type { Span };
