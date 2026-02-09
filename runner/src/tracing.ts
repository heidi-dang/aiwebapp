
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { ConsoleSpanExporter } from '@opentelemetry/sdk-trace-base';
import { trace, context, Span } from '@opentelemetry/api';

export class TracingService {
  private sdk: NodeSDK;
  private serviceName: string;

  constructor(serviceName: string) {
    this.serviceName = serviceName;
    
    const traceExporter = new ConsoleSpanExporter();
    
    this.sdk = new NodeSDK({
      serviceName,
      traceExporter,
      instrumentations: [getNodeAutoInstrumentations({
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

  getTracer() {
    return trace.getTracer(this.serviceName);
  }
}

export const tracingService = new TracingService('agentos-runner');
