
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { ConsoleSpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { trace, context, Span } from '@opentelemetry/api';

// For MVP, we'll output traces to console and memory
// In production, we'd use OTLP trace exporter to send to Jaeger/Tempo

export class TracingService {
  private sdk: NodeSDK;
  private serviceName: string;

  constructor(serviceName: string) {
    this.serviceName = serviceName;
    
    // Enable detailed console output for debugging
    const traceExporter = new ConsoleSpanExporter();
    
    this.sdk = new NodeSDK({
      serviceName,
      traceExporter,
      instrumentations: [getNodeAutoInstrumentations({
        // Disable noisy instrumentations for MVP
        '@opentelemetry/instrumentation-fs': { enabled: false },
        '@opentelemetry/instrumentation-express': { enabled: true },
        '@opentelemetry/instrumentation-fastify': { enabled: true },
        '@opentelemetry/instrumentation-http': { enabled: true },
      })],
    });
  }

  start() {
    this.sdk.start();
    console.log(`TracingService: Started for ${this.serviceName}`);
  }

  async shutdown() {
    await this.sdk.shutdown();
  }

  // Helper to manually start a span
  startSpan(name: string, parentSpan?: Span) {
    const tracer = trace.getTracer(this.serviceName);
    const ctx = parentSpan ? trace.setSpan(context.active(), parentSpan) : context.active();
    return tracer.startSpan(name, undefined, ctx);
  }
}

export const tracingService = new TracingService('agentos-server');
