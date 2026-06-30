import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { ConsoleSpanExporter } from "@opentelemetry/sdk-trace-node";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from "@opentelemetry/semantic-conventions";
import type { SpanExporter } from "@opentelemetry/sdk-trace-node";

const otlpEndpoint = process.env["OTEL_EXPORTER_OTLP_ENDPOINT"];

const exporter: SpanExporter = otlpEndpoint
  ? (new OTLPTraceExporter({ url: `${otlpEndpoint}/v1/traces` }) as unknown as SpanExporter)
  : new ConsoleSpanExporter();

const sdk = new NodeSDK({
  resource: resourceFromAttributes({
    [ATTR_SERVICE_NAME]: "galaxybots-api",
    [ATTR_SERVICE_VERSION]: "1.0.0",
  }),
  traceExporter: exporter,
  instrumentations: [
    getNodeAutoInstrumentations({
      "@opentelemetry/instrumentation-http": { enabled: true },
      "@opentelemetry/instrumentation-express": { enabled: true },
      "@opentelemetry/instrumentation-pg": { enabled: true },
      "@opentelemetry/instrumentation-fs": { enabled: false },
    }),
  ],
});

sdk.start();

console.log(
  `[otel] OpenTelemetry SDK started — exporter=${otlpEndpoint ? `otlp → ${otlpEndpoint}` : "console (dev)"}`
);

process.on("SIGTERM", async () => {
  try {
    await sdk.shutdown();
    console.log("[otel] SDK shut down cleanly");
  } catch (err) {
    console.error("[otel] SDK shutdown error:", err);
  }
});
