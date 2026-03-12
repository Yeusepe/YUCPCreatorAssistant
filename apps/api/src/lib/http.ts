import { createLogger } from '@yucp/shared';

const logger = createLogger(process.env.LOG_LEVEL ?? 'info');
const DEFAULT_UPSTREAM_TIMEOUT_MS = Number.parseInt(
  process.env.UPSTREAM_FETCH_TIMEOUT_MS ?? '',
  10
);
const FALLBACK_UPSTREAM_TIMEOUT_MS = 15_000;

function getTimeoutMs(timeoutMs?: number): number {
  if (typeof timeoutMs === 'number' && Number.isFinite(timeoutMs) && timeoutMs > 0) {
    return timeoutMs;
  }

  if (Number.isFinite(DEFAULT_UPSTREAM_TIMEOUT_MS) && DEFAULT_UPSTREAM_TIMEOUT_MS > 0) {
    return DEFAULT_UPSTREAM_TIMEOUT_MS;
  }

  return FALLBACK_UPSTREAM_TIMEOUT_MS;
}

function getRequestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') {
    return input;
  }

  if (input instanceof URL) {
    return input.toString();
  }

  return input.url;
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === 'AbortError'
    : error instanceof Error && error.name === 'AbortError';
}

export class UpstreamTimeoutError extends Error {
  readonly timeoutMs: number;
  readonly operation: string;
  readonly url: string;

  constructor(operation: string, timeoutMs: number, url: string) {
    super(`${operation} timed out after ${timeoutMs}ms`);
    this.name = 'UpstreamTimeoutError';
    this.operation = operation;
    this.timeoutMs = timeoutMs;
    this.url = url;
  }
}

export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit & {
    operation: string;
    timeoutMs?: number;
  }
): Promise<Response> {
  const { operation, timeoutMs, signal: upstreamSignal, ...requestInit } = init;
  const resolvedTimeoutMs = getTimeoutMs(timeoutMs);
  const requestUrl = getRequestUrl(input);
  const controller = new AbortController();

  let timedOut = false;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let abortListener: (() => void) | undefined;

  if (upstreamSignal) {
    if (upstreamSignal.aborted) {
      controller.abort(upstreamSignal.reason);
    } else {
      abortListener = () => controller.abort(upstreamSignal.reason);
      upstreamSignal.addEventListener('abort', abortListener, { once: true });
    }
  }

  timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, resolvedTimeoutMs);

  try {
    return await fetch(input, {
      ...requestInit,
      signal: controller.signal,
    });
  } catch (error) {
    if (timedOut && isAbortError(error)) {
      logger.warn('Upstream fetch timed out', {
        operation,
        timeoutMs: resolvedTimeoutMs,
        url: requestUrl,
      });
      throw new UpstreamTimeoutError(operation, resolvedTimeoutMs, requestUrl);
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
    if (upstreamSignal && abortListener) {
      upstreamSignal.removeEventListener('abort', abortListener);
    }
  }
}
