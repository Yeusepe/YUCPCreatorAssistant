import { initSDK } from '@hyperdx/node-opentelemetry';
import { getRequestHeaders } from '@tanstack/react-start/server';
import {
  context,
  propagation,
  ROOT_CONTEXT,
  SpanKind,
  SpanStatusCode,
  trace,
} from '@opentelemetry/api';
import {
  applyNodeHyperdxDefaults,
  detectServerObservabilityRuntime,
  initBunServerObservability,
  toSpanAttributes,
  withObservedSpan,
} from '@yucp/shared';

const tracer = trace.getTracer('yucp-web-server');
let initialized = false;

type ObservableValue = string | number | boolean | undefined;

export function buildIncomingTraceCarrier(headers: Headers): Record<string, string> {
  const traceparent = headers.get('traceparent')?.trim();
  const tracestate = headers.get('tracestate')?.trim();
  const baggage = headers.get('baggage')?.trim();

  return Object.fromEntries(
    [
      ['traceparent', traceparent],
      ['tracestate', tracestate],
      ['baggage', baggage],
    ].filter((entry): entry is [string, string] => Boolean(entry[1]))
  );
}

function initWebServerObservability(env: NodeJS.ProcessEnv = process.env) {
  if (detectServerObservabilityRuntime() === 'bun-manual') {
    const resolved = initBunServerObservability({
      env,
      serviceName: 'yucp-web-server',
      resourceAttributes: {
        'deployment.environment': env.NODE_ENV ?? 'development',
        'service.namespace': 'yucp',
        'service.version': env.BUILD_ID ?? 'dev',
      },
    });
    initialized ||= resolved.hasOtelAuth;
    return resolved;
  }

  const resolved = applyNodeHyperdxDefaults(env, 'yucp-web-server');
  if (initialized || !resolved.hasOtelAuth) {
    return resolved;
  }

  initSDK({
    consoleCapture: true,
    additionalResourceAttributes: {
      'deployment.environment': env.NODE_ENV ?? 'development',
      'service.namespace': 'yucp',
      'service.version': env.BUILD_ID ?? 'dev',
    },
  });

  initialized = true;
  return resolved;
}

function getIncomingRequestCarrier(): Record<string, string> {
  try {
    return buildIncomingTraceCarrier(getRequestHeaders());
  } catch {
    return {};
  }
}

export async function withWebServerSpan<T>(
  name: string,
  attributes: Record<string, ObservableValue>,
  run: () => Promise<T>,
  kind: SpanKind = SpanKind.INTERNAL
): Promise<T> {
  initWebServerObservability(process.env);

  if (trace.getActiveSpan()) {
    return withObservedSpan(tracer, name, attributes, run, kind);
  }

  const parentContext = propagation.extract(ROOT_CONTEXT, getIncomingRequestCarrier());
  return context.with(parentContext, () => withObservedSpan(tracer, name, attributes, run, kind));
}

export async function withWebServerRequestSpan<T>(
  name: string,
  attributes: Record<string, ObservableValue>,
  run: () => Promise<T>
): Promise<T> {
  return withWebServerSpan(name, attributes, run, SpanKind.SERVER);
}

export function getActiveWebServerTraceId(): string | undefined {
  return trace.getActiveSpan()?.spanContext().traceId;
}

export function annotateWebServerError(spanError: unknown): void {
  const span = trace.getActiveSpan();
  if (!span || !(spanError instanceof Error)) {
    return;
  }

  span.recordException(spanError);
  span.setStatus({
    code: SpanStatusCode.ERROR,
    message: spanError.message,
  });
}

export function toWebServerAttributes(
  attributes: Record<string, ObservableValue>
): Record<string, ObservableValue> {
  return toSpanAttributes(attributes) as Record<string, ObservableValue>;
}
