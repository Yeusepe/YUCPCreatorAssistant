import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';

type SmokeStatus = 'passed' | 'failed' | 'skipped';
type SmokeSurface = 'setup' | 'catalog' | 'verification';

interface LiveSmokeRequestPlan {
  url: string;
  init: RequestInit;
  requestSummary?: {
    headers?: Record<string, string>;
    body?: unknown;
  };
}

interface ProviderLiveSmokeCase {
  id: string;
  provider: string;
  surface: SmokeSurface;
  docsUrl: string;
  fixturePath: string;
  requiredEnv: readonly string[];
  buildRequest(env: NodeJS.ProcessEnv): LiveSmokeRequestPlan;
  validate(response: Response, body: unknown): void;
  sanitizeBody(body: unknown): unknown;
}

interface LiveSmokeFixtureEnvelope {
  schemaVersion: 1;
  provider: string;
  caseId: string;
  surface: SmokeSurface;
  docsUrl: string;
  request: {
    method: string;
    url: string;
    headers: Record<string, string>;
    body?: unknown;
  };
  response: {
    status: number;
    headers: Record<string, string>;
    body: unknown;
  };
}

export interface ProviderLiveSmokeResult {
  id: string;
  provider: string;
  surface: SmokeSurface;
  status: SmokeStatus;
  docsUrl: string;
  fixturePath: string;
  httpStatus?: number;
  error?: string;
  skippedReason?: string;
  fixtureWritten?: boolean;
}

const FIXTURE_ROOT = resolve(
  process.cwd(),
  'packages',
  'providers',
  'test',
  'fixtures',
  'live-smoke'
);
const REDACTED_VALUE = '[REDACTED]';
const SENSITIVE_HEADER_KEYS = new Set(['authorization', 'cookie', 'set-cookie']);
const SENSITIVE_QUERY_KEYS = new Set([
  'access_token',
  'refresh_token',
  'token',
  'code',
  'state',
  'license_key',
]);
const SENSITIVE_BODY_KEYS = new Set([
  'access_token',
  'refresh_token',
  'token',
  'secret',
  'password',
  'email',
  'license_key',
]);

function fixturePathFor(provider: string, name: string): string {
  return resolve(FIXTURE_ROOT, provider, `${name}.json`);
}

export function sanitizeUrl(rawUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return rawUrl;
  }

  for (const key of SENSITIVE_QUERY_KEYS) {
    if (parsed.searchParams.has(key)) {
      parsed.searchParams.set(key, REDACTED_VALUE);
    }
  }
  return parsed.toString();
}

export function sanitizeHeaders(
  headers: HeadersInit | Record<string, string> | undefined
): Record<string, string> {
  if (!headers) {
    return {};
  }

  const normalized = new Headers(headers);
  const result: Record<string, string> = {};
  for (const [key, value] of normalized.entries()) {
    result[key] = SENSITIVE_HEADER_KEYS.has(key.toLowerCase()) ? REDACTED_VALUE : value;
  }
  return result;
}

export function sanitizeFixtureValue(value: unknown, key?: string): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeFixtureValue(entry));
  }

  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [entryKey, entryValue] of Object.entries(value)) {
      result[entryKey] = sanitizeFixtureValue(entryValue, entryKey);
    }
    return result;
  }

  if (typeof value === 'string') {
    if (key && SENSITIVE_BODY_KEYS.has(key.toLowerCase())) {
      return REDACTED_VALUE;
    }
    if (/^https?:\/\//i.test(value)) {
      return sanitizeUrl(value);
    }
  }

  return value;
}

function assertRecord(value: unknown, context: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${context} did not return an object`);
  }
  return value as Record<string, unknown>;
}

function assertGumroadSuccessEnvelope(body: unknown, context: string): Record<string, unknown> {
  const record = assertRecord(body, context);
  if (record.success !== true) {
    throw new Error(`${context} did not return success=true`);
  }
  return record;
}

// Gumroad API reference: https://gumroad.com/api#user
const GUMROAD_USER_CASE: ProviderLiveSmokeCase = {
  id: 'gumroad-user',
  provider: 'gumroad',
  surface: 'setup',
  docsUrl: 'https://gumroad.com/api#user',
  fixturePath: fixturePathFor('gumroad', 'user'),
  requiredEnv: ['GUMROAD_SMOKE_ACCESS_TOKEN'],
  buildRequest(env) {
    return {
      url: 'https://api.gumroad.com/v2/user',
      init: {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${env.GUMROAD_SMOKE_ACCESS_TOKEN}`,
        },
      },
      requestSummary: {
        headers: {
          Accept: 'application/json',
          Authorization: REDACTED_VALUE,
        },
      },
    };
  },
  validate(response, body) {
    if (!response.ok) {
      throw new Error(`Gumroad user call failed with HTTP ${response.status}`);
    }
    const record = assertGumroadSuccessEnvelope(body, 'Gumroad user');
    const user = assertRecord(record.user, 'Gumroad user');
    if (typeof user.user_id !== 'string' || user.user_id.length === 0) {
      throw new Error('Gumroad user response is missing user.user_id');
    }
  },
  sanitizeBody(body) {
    return sanitizeFixtureValue(body);
  },
};

// Gumroad API reference: https://gumroad.com/api#products
const GUMROAD_PRODUCTS_CASE: ProviderLiveSmokeCase = {
  id: 'gumroad-products',
  provider: 'gumroad',
  surface: 'catalog',
  docsUrl: 'https://gumroad.com/api#products',
  fixturePath: fixturePathFor('gumroad', 'products'),
  requiredEnv: ['GUMROAD_SMOKE_ACCESS_TOKEN'],
  buildRequest(env) {
    return {
      url: 'https://api.gumroad.com/v2/products',
      init: {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${env.GUMROAD_SMOKE_ACCESS_TOKEN}`,
        },
      },
      requestSummary: {
        headers: {
          Accept: 'application/json',
          Authorization: REDACTED_VALUE,
        },
      },
    };
  },
  validate(response, body) {
    if (!response.ok) {
      throw new Error(`Gumroad products call failed with HTTP ${response.status}`);
    }
    const record = assertGumroadSuccessEnvelope(body, 'Gumroad products');
    if ('products' in record && !Array.isArray(record.products)) {
      throw new Error('Gumroad products response returned a non-array products field');
    }
    if ('next_page_url' in record && typeof record.next_page_url !== 'string') {
      throw new Error('Gumroad products response returned an invalid next_page_url');
    }
  },
  sanitizeBody(body) {
    return sanitizeFixtureValue(body);
  },
};

// Gumroad API reference: https://gumroad.com/api#licenses
const GUMROAD_LICENSE_VERIFY_CASE: ProviderLiveSmokeCase = {
  id: 'gumroad-license-verify',
  provider: 'gumroad',
  surface: 'verification',
  docsUrl: 'https://gumroad.com/api#licenses',
  fixturePath: fixturePathFor('gumroad', 'license-verify'),
  requiredEnv: ['GUMROAD_SMOKE_LICENSE_PRODUCT_ID', 'GUMROAD_SMOKE_LICENSE_KEY'],
  buildRequest(env) {
    return {
      url: 'https://api.gumroad.com/v2/licenses/verify',
      init: {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          product_id: env.GUMROAD_SMOKE_LICENSE_PRODUCT_ID ?? '',
          license_key: env.GUMROAD_SMOKE_LICENSE_KEY ?? '',
        }).toString(),
      },
      requestSummary: {
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: sanitizeFixtureValue({
          product_id: env.GUMROAD_SMOKE_LICENSE_PRODUCT_ID ?? '',
          license_key: env.GUMROAD_SMOKE_LICENSE_KEY ?? '',
        }),
      },
    };
  },
  validate(response, body) {
    if (!response.ok) {
      throw new Error(`Gumroad license verify call failed with HTTP ${response.status}`);
    }
    const record = assertGumroadSuccessEnvelope(body, 'Gumroad license verify');
    if ('purchase' in record && record.purchase !== undefined) {
      assertRecord(record.purchase, 'Gumroad license verify purchase');
    }
  },
  sanitizeBody(body) {
    return sanitizeFixtureValue(body);
  },
};

export const PROVIDER_LIVE_SMOKE_CASES: readonly ProviderLiveSmokeCase[] = Object.freeze([
  GUMROAD_USER_CASE,
  GUMROAD_PRODUCTS_CASE,
  GUMROAD_LICENSE_VERIFY_CASE,
]);

async function parseResponseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    return await response.json();
  }
  return await response.text();
}

function createFixtureEnvelope(
  smokeCase: ProviderLiveSmokeCase,
  plan: LiveSmokeRequestPlan,
  response: Response,
  body: unknown
): LiveSmokeFixtureEnvelope {
  return {
    schemaVersion: 1,
    provider: smokeCase.provider,
    caseId: smokeCase.id,
    surface: smokeCase.surface,
    docsUrl: smokeCase.docsUrl,
    request: {
      method: plan.init.method ?? 'GET',
      url: sanitizeUrl(plan.url),
      headers: sanitizeHeaders(plan.requestSummary?.headers),
      ...(plan.requestSummary?.body !== undefined ? { body: plan.requestSummary.body } : {}),
    },
    response: {
      status: response.status,
      headers: sanitizeHeaders(response.headers),
      body: smokeCase.sanitizeBody(body),
    },
  };
}

function writeFixture(path: string, fixture: LiveSmokeFixtureEnvelope): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(fixture, null, 2)}\n`, 'utf8');
}

function listMissingEnv(smokeCase: ProviderLiveSmokeCase, env: NodeJS.ProcessEnv): string[] {
  return smokeCase.requiredEnv.filter((name) => {
    const value = env[name];
    return typeof value !== 'string' || value.trim().length === 0;
  });
}

async function runSmokeCase(
  smokeCase: ProviderLiveSmokeCase,
  options: { refreshFixtures: boolean }
): Promise<ProviderLiveSmokeResult> {
  const missingEnv = listMissingEnv(smokeCase, process.env);
  if (missingEnv.length > 0) {
    return {
      id: smokeCase.id,
      provider: smokeCase.provider,
      surface: smokeCase.surface,
      status: 'skipped',
      docsUrl: smokeCase.docsUrl,
      fixturePath: smokeCase.fixturePath,
      skippedReason: `missing env: ${missingEnv.join(', ')}`,
    };
  }

  try {
    const plan = smokeCase.buildRequest(process.env);
    const response = await fetch(plan.url, plan.init);
    const body = await parseResponseBody(response);
    smokeCase.validate(response, body);

    if (options.refreshFixtures) {
      writeFixture(smokeCase.fixturePath, createFixtureEnvelope(smokeCase, plan, response, body));
    }

    return {
      id: smokeCase.id,
      provider: smokeCase.provider,
      surface: smokeCase.surface,
      status: 'passed',
      docsUrl: smokeCase.docsUrl,
      fixturePath: smokeCase.fixturePath,
      httpStatus: response.status,
      fixtureWritten: options.refreshFixtures,
    };
  } catch (error) {
    return {
      id: smokeCase.id,
      provider: smokeCase.provider,
      surface: smokeCase.surface,
      status: 'failed',
      docsUrl: smokeCase.docsUrl,
      fixturePath: smokeCase.fixturePath,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function printUsage(): void {
  console.log(
    [
      'provider-live-smoke',
      '',
      'Usage:',
      '  bun run smoke:providers',
      '  bun run smoke:providers -- --provider gumroad --case gumroad-products --strict',
      '  bun run smoke:providers:refresh-fixtures -- --provider gumroad --case gumroad-products,gumroad-license-verify',
      '',
      'Options:',
      '  --provider <id>        Filter to one provider. Default: all.',
      '  --case <id,id>         Filter to one or more case ids.',
      '  --refresh-fixtures     Write sanitized fixture JSON for passing cases.',
      '  --report-path <path>   Write the run summary JSON to a file.',
      '  --strict               Fail if a selected case is skipped.',
      '  --help                 Show this message.',
      '',
      'Gumroad env:',
      '  GUMROAD_SMOKE_ACCESS_TOKEN',
      '  GUMROAD_SMOKE_LICENSE_PRODUCT_ID',
      '  GUMROAD_SMOKE_LICENSE_KEY',
    ].join('\n')
  );
}

function selectCases(providerFilter?: string, caseFilter?: string): ProviderLiveSmokeCase[] {
  const selectedCaseIds = caseFilter
    ? new Set(
        caseFilter
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean)
      )
    : null;

  return PROVIDER_LIVE_SMOKE_CASES.filter((smokeCase) => {
    if (providerFilter && providerFilter !== 'all' && smokeCase.provider !== providerFilter) {
      return false;
    }
    if (selectedCaseIds && !selectedCaseIds.has(smokeCase.id)) {
      return false;
    }
    return true;
  });
}

export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<void> {
  const { values } = parseArgs({
    args: [...argv],
    options: {
      provider: { type: 'string' },
      case: { type: 'string' },
      'refresh-fixtures': { type: 'boolean' },
      'report-path': { type: 'string' },
      strict: { type: 'boolean' },
      help: { type: 'boolean' },
    },
    strict: true,
    allowPositionals: false,
  });

  if (values.help) {
    printUsage();
    return;
  }

  const selectedCases = selectCases(values.provider, values.case);
  if (selectedCases.length === 0) {
    throw new Error('No live smoke cases matched the requested filters');
  }

  const refreshFixtures = Boolean(values['refresh-fixtures']);
  const results = await Promise.all(
    selectedCases.map((smokeCase) => runSmokeCase(smokeCase, { refreshFixtures }))
  );

  const summary = {
    results,
    totals: {
      passed: results.filter((result) => result.status === 'passed').length,
      failed: results.filter((result) => result.status === 'failed').length,
      skipped: results.filter((result) => result.status === 'skipped').length,
    },
  };

  if (values['report-path']) {
    const reportPath = resolve(process.cwd(), values['report-path']);
    mkdirSync(dirname(reportPath), { recursive: true });
    writeFileSync(reportPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  }

  console.log(JSON.stringify(summary, null, 2));

  const hasFailures = summary.totals.failed > 0;
  const hasStrictSkips = Boolean(values.strict) && summary.totals.skipped > 0;
  if (hasFailures || hasStrictSkips) {
    process.exitCode = 1;
  }
}

if (import.meta.main) {
  main().catch((error) => {
    console.error('[provider-live-smoke]', error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
