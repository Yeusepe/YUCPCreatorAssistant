import { type Attributes, SpanKind, SpanStatusCode, type Tracer, trace } from '@opentelemetry/api';

export type ObservableValue = string | number | boolean | undefined | null;
export type ObservableAttributes = Record<string, ObservableValue>;
export type OperationOutcome = 'success' | 'redirect' | 'client_error' | 'server_error' | 'error';

export function toSpanAttributes(input: ObservableAttributes): Attributes {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined && value !== null)
  ) as Attributes;
}

function spanKindToOperationKind(kind: SpanKind): string {
  switch (kind) {
    case SpanKind.CLIENT:
      return 'client';
    case SpanKind.SERVER:
      return 'server';
    case SpanKind.PRODUCER:
      return 'producer';
    case SpanKind.CONSUMER:
      return 'consumer';
    default:
      return 'internal';
  }
}

export function classifyHttpOperationOutcome(statusCode: number): OperationOutcome {
  if (statusCode >= 500) {
    return 'server_error';
  }
  if (statusCode >= 400) {
    return 'client_error';
  }
  if (statusCode >= 300) {
    return 'redirect';
  }
  return 'success';
}

export function setActiveSpanAttributes(attributes: ObservableAttributes): void {
  const span = trace.getActiveSpan();
  if (!span) {
    return;
  }

  for (const [key, value] of Object.entries(attributes)) {
    if (value !== undefined && value !== null) {
      span.setAttribute(key, value);
    }
  }
}

export async function withObservedSpan<T>(
  tracer: Tracer,
  name: string,
  attributes: ObservableAttributes,
  run: () => Promise<T>,
  kind: SpanKind = SpanKind.INTERNAL
): Promise<T> {
  return tracer.startActiveSpan(
    name,
    {
      kind,
      attributes: toSpanAttributes({
        'app.operation.name': name,
        'app.operation.kind': spanKindToOperationKind(kind),
        ...attributes,
      }),
    },
    async (span) => {
      try {
        const result = await run();
        span.setAttribute('app.operation.outcome', 'success');
        return result;
      } catch (error) {
        span.setAttribute('app.operation.outcome', 'error');
        if (error instanceof Error) {
          span.recordException(error);
          span.setAttribute('error.type', error.name);
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: error.message,
          });
        }
        throw error;
      } finally {
        span.end();
      }
    }
  );
}
