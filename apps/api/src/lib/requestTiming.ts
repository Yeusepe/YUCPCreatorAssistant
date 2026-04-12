import { annotateApiSpan } from './observability';

export interface RequestTimingEntry {
  name: string;
  durationMs: number;
  description?: string;
}

function sanitiseMetricName(name: string): string {
  const trimmed = name.trim().toLowerCase();
  if (!trimmed) {
    return 'step';
  }

  const sanitised = trimmed.replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');
  return sanitised || 'step';
}

function formatDuration(durationMs: number): string {
  return Number(durationMs.toFixed(2)).toString();
}

function escapeDescription(description: string): string {
  return description.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

export class RouteTimingCollector {
  private readonly startedAt = performance.now();
  private readonly entries: RequestTimingEntry[] = [];

  record(name: string, durationMs: number, description?: string): void {
    if (!Number.isFinite(durationMs) || durationMs < 0) {
      return;
    }

    const metricName = sanitiseMetricName(name);
    const roundedDurationMs = Number(durationMs.toFixed(2));

    this.entries.push({
      name: metricName,
      durationMs: roundedDurationMs,
      description,
    });
    annotateApiSpan({
      [`timing.${metricName}.ms`]: roundedDurationMs,
    });
  }

  async measure<T>(name: string, operation: () => Promise<T>, description?: string): Promise<T> {
    const startedAt = performance.now();
    try {
      return await operation();
    } finally {
      this.record(name, performance.now() - startedAt, description);
    }
  }

  measureSync<T>(name: string, operation: () => T, description?: string): T {
    const startedAt = performance.now();
    try {
      return operation();
    } finally {
      this.record(name, performance.now() - startedAt, description);
    }
  }

  toServerTimingHeader(): string {
    const totalDurationMs = Number((performance.now() - this.startedAt).toFixed(2));
    annotateApiSpan({
      'timing.total.ms': totalDurationMs,
      'timing.stage_count': this.entries.length,
    });

    const entries = [
      ...this.entries,
      {
        name: 'total',
        durationMs: totalDurationMs,
        description: 'end-to-end request duration',
      },
    ];

    return entries
      .map((entry) => {
        const descriptionPart = entry.description
          ? `;desc="${escapeDescription(entry.description)}"`
          : '';
        return `${entry.name};dur=${formatDuration(entry.durationMs)}${descriptionPart}`;
      })
      .join(', ');
  }

  attachToResponse(response: Response): Response {
    const headers = new Headers(response.headers);
    headers.set('Server-Timing', this.toServerTimingHeader());
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }
}

export function buildTimedResponse(
  timing: RouteTimingCollector,
  buildResponse: () => Response,
  description = 'serialize response'
): Response {
  const response = timing.measureSync('serialize', buildResponse, description);
  return timing.attachToResponse(response);
}
