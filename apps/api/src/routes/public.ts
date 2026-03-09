import { createLogger } from '@yucp/shared';
import { api } from '../../../../convex/_generated/api';
import type { Id } from '../../../../convex/_generated/dataModel';
import { getConvexClientFromUrl } from '../lib/convex';
import { hashPublicApiKey } from '../lib/publicApiKeys';

const logger = createLogger(process.env.LOG_LEVEL ?? 'info');
const VERIFICATION_SCOPE = 'verification:read';
const SUBJECTS_SCOPE = 'subjects:read';
const MAX_PRODUCT_IDS_PER_CHECK = 50;

export interface PublicRouteConfig {
  convexUrl: string;
  convexApiSecret: string;
  convexSiteUrl: string;
  publicApiKeyPepper: string;
  oauthAudience?: string;
}

export interface SubjectSelectorById {
  subjectId: string;
}

export interface SubjectSelectorByAuthUserId {
  authUserId: string;
}

export interface SubjectSelectorByDiscordUserId {
  discordUserId: string;
}

export interface SubjectSelectorByExternalAccount {
  externalAccount: {
    provider: string;
    providerUserId: string;
  };
}

export type SubjectSelector =
  | SubjectSelectorById
  | SubjectSelectorByAuthUserId
  | SubjectSelectorByDiscordUserId
  | SubjectSelectorByExternalAccount;

interface PublicRouteDependencies {
  createConvexClient?: typeof getConvexClientFromUrl;
  verifyAccessToken?: (
    token: string,
    config: PublicRouteConfig,
    scopes: string[]
  ) => Promise<{ sub: string } | null>;
}

interface PublicEntitlement {
  grantedAt: number;
  productId: string;
  sourceProvider: string;
  status: string;
}

interface PublicSubject {
  _id: Id<'subjects'>;
  authUserId?: string;
  primaryDiscordUserId: string;
  status: 'active' | 'suspended' | 'quarantined' | 'deleted';
}

interface PublicApiKeyRecord {
  _id: Id<'public_api_keys'>;
  expiresAt?: number;
  scopes?: string[];
  tenantId: string;
}

function jsonResponse(body: object, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function errorResponse(error: string, message: string, status: number): Response {
  return jsonResponse({ error, message }, status);
}

function extractBearerToken(request: Request): string | null {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.slice(7).trim() || null;
}

function extractApiKey(request: Request): string | null {
  const apiKey = request.headers.get('x-api-key')?.trim();
  return apiKey || null;
}

export function parseSubjectSelector(value: unknown): SubjectSelector | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const raw = value as Record<string, unknown>;
  const keys = ['subjectId', 'authUserId', 'discordUserId', 'externalAccount'].filter(
    (key) => raw[key] !== undefined
  );
  if (keys.length !== 1) {
    return null;
  }

  if (typeof raw.subjectId === 'string' && raw.subjectId.trim()) {
    return { subjectId: raw.subjectId.trim() };
  }
  if (typeof raw.authUserId === 'string' && raw.authUserId.trim()) {
    return { authUserId: raw.authUserId.trim() };
  }
  if (typeof raw.discordUserId === 'string' && raw.discordUserId.trim()) {
    return { discordUserId: raw.discordUserId.trim() };
  }
  if (raw.externalAccount && typeof raw.externalAccount === 'object') {
    const externalAccount = raw.externalAccount as Record<string, unknown>;
    if (
      typeof externalAccount.provider === 'string' &&
      externalAccount.provider.trim() &&
      typeof externalAccount.providerUserId === 'string' &&
      externalAccount.providerUserId.trim()
    ) {
      return {
        externalAccount: {
          provider: externalAccount.provider.trim(),
          providerUserId: externalAccount.providerUserId.trim(),
        },
      };
    }
  }

  return null;
}

function hasScopes(grantedScopes: string[], requiredScopes: string[]): boolean {
  return requiredScopes.every((scope) => grantedScopes.includes(scope));
}

async function defaultVerifyAccessToken(
  token: string,
  config: PublicRouteConfig,
  scopes: string[]
): Promise<{ sub: string } | null> {
  try {
    const { verifyAccessToken } = await import('better-auth/oauth2');
    const authBase = `${config.convexSiteUrl.replace(/\/$/, '')}/api/auth`;
    const verified = await verifyAccessToken(token, {
      verifyOptions: {
        issuer: authBase,
        audience: config.oauthAudience ?? 'yucp-public-api',
      },
      jwksUrl: `${authBase}/jwks`,
    });

    const grantedScopes =
      typeof (verified as { scope?: unknown }).scope === 'string'
        ? (verified as { scope: string }).scope.split(/\s+/).filter(Boolean)
        : [];
    if (!verified || typeof verified.sub !== 'string' || !hasScopes(grantedScopes, scopes)) {
      return null;
    }

    return { sub: verified.sub };
  } catch (error) {
    logger.warn('Public API OAuth token verification failed', {
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

async function getVerificationStatusResponse(
  convex: ReturnType<typeof getConvexClientFromUrl>,
  config: PublicRouteConfig,
  tenantId: string,
  subjectId: string
): Promise<Response> {
  const entitlements = (await convex.query(api.entitlements.getEntitlementsBySubject, {
    apiSecret: config.convexApiSecret,
    tenantId,
    subjectId,
    includeInactive: false,
  })) as PublicEntitlement[];

  const products = (entitlements ?? []).map((entitlement) => ({
    productId: entitlement.productId,
    status: entitlement.status,
    grantedAt: entitlement.grantedAt,
    sourceProvider: entitlement.sourceProvider,
  }));

  return jsonResponse({
    verified: products.length > 0,
    subjectId,
    products,
  });
}

async function resolveSubjectOrResponse(
  convex: ReturnType<typeof getConvexClientFromUrl>,
  config: PublicRouteConfig,
  tenantId: string,
  selector: SubjectSelector,
  notFoundStatus = 404
): Promise<{ subject: PublicSubject } | { response: Response }> {
  const resolved = (await convex.query(api.subjects.resolveSubjectForPublicApi, {
    apiSecret: config.convexApiSecret,
    tenantId,
    selector,
  })) as { found?: boolean; subject?: PublicSubject | null } | null;

  if (!resolved?.found || !resolved.subject) {
    return { response: errorResponse('not_found', 'Subject not found', notFoundStatus) };
  }

  if (resolved.subject.status !== 'active') {
    return { response: errorResponse('forbidden', 'Subject is not active', 403) };
  }

  return { subject: resolved.subject };
}

async function authenticateServiceKey(
  request: Request,
  config: PublicRouteConfig,
  convex: ReturnType<typeof getConvexClientFromUrl>,
  tenantId: string,
  requiredScopes: string[]
): Promise<{ key: PublicApiKeyRecord } | { response: Response }> {
  const apiKey = extractApiKey(request);
  if (!apiKey) {
    return { response: errorResponse('unauthorized', 'Missing x-api-key header', 401) };
  }

  const keyHash = hashPublicApiKey(apiKey, config.publicApiKeyPepper);
  const key = (await convex.query(api.publicApiKeys.getActivePublicApiKeyByHash, {
    apiSecret: config.convexApiSecret,
    keyHash,
  })) as PublicApiKeyRecord | null;

  if (!key) {
    return { response: errorResponse('unauthorized', 'Invalid API key', 401) };
  }
  if (key.tenantId !== tenantId) {
    return { response: errorResponse('forbidden', 'API key is not valid for this tenant', 403) };
  }
  if (key.expiresAt && key.expiresAt <= Date.now()) {
    return { response: errorResponse('unauthorized', 'API key expired', 401) };
  }
  if (!hasScopes(key.scopes ?? [], requiredScopes)) {
    return { response: errorResponse('forbidden', 'Insufficient API key scope', 403) };
  }

  await convex.mutation(api.publicApiKeys.touchPublicApiKeyLastUsed, {
    apiSecret: config.convexApiSecret,
    keyId: key._id,
  });

  return { key };
}

export function createPublicRoutes(config: PublicRouteConfig, deps: PublicRouteDependencies = {}) {
  const createConvexClient = deps.createConvexClient ?? getConvexClientFromUrl;
  const verifyAccessToken = deps.verifyAccessToken ?? defaultVerifyAccessToken;

  async function getTenantBySlug(_request: Request, slug: string): Promise<Response> {
    const convex = createConvexClient(config.convexUrl);
    const tenant = (await convex.query(api.tenants.getTenantBySlug, {
      apiSecret: config.convexApiSecret,
      slug,
    })) as { _id: string; name: string; slug: string } | null;

    if (!tenant) {
      return errorResponse('not_found', 'Tenant not found', 404);
    }

    return jsonResponse({
      tenantId: tenant._id,
      name: tenant.name,
      slug: tenant.slug,
    });
  }

  async function getMeVerificationStatus(request: Request): Promise<Response> {
    const token = extractBearerToken(request);
    if (!token) {
      return errorResponse('unauthorized', 'Missing or invalid Authorization header', 401);
    }

    const verified = await verifyAccessToken(token, config, [VERIFICATION_SCOPE]);
    if (!verified) {
      return errorResponse('unauthorized', 'Invalid or expired access token', 401);
    }

    const tenantId = new URL(request.url).searchParams.get('tenantId');
    if (!tenantId) {
      return errorResponse('bad_request', 'tenantId query parameter is required', 400);
    }

    const convex = createConvexClient(config.convexUrl);
    const resolved = await resolveSubjectOrResponse(convex, config, tenantId, {
      authUserId: verified.sub,
    });

    if ('response' in resolved) {
      return resolved.response;
    }

    return getVerificationStatusResponse(convex, config, tenantId, resolved.subject._id);
  }

  async function getVerificationStatus(request: Request): Promise<Response> {
    let body: { tenantId?: string; subject?: unknown };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return errorResponse('bad_request', 'Invalid JSON body', 400);
    }

    const tenantId = body.tenantId?.trim();
    if (!tenantId) {
      return errorResponse('bad_request', 'tenantId is required', 400);
    }

    const subject = parseSubjectSelector(body.subject);
    if (!subject) {
      return errorResponse('bad_request', 'subject selector is required', 400);
    }

    const convex = createConvexClient(config.convexUrl);
    const auth = await authenticateServiceKey(request, config, convex, tenantId, [
      VERIFICATION_SCOPE,
    ]);
    if ('response' in auth) {
      return auth.response;
    }

    const resolved = await resolveSubjectOrResponse(convex, config, tenantId, subject);
    if ('response' in resolved) {
      return resolved.response;
    }

    return getVerificationStatusResponse(convex, config, tenantId, resolved.subject._id);
  }

  async function checkVerification(request: Request): Promise<Response> {
    let body: { tenantId?: string; subject?: unknown; productIds?: string[] };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return errorResponse('bad_request', 'Invalid JSON body', 400);
    }

    const tenantId = body.tenantId?.trim();
    if (!tenantId) {
      return errorResponse('bad_request', 'tenantId is required', 400);
    }

    const subject = parseSubjectSelector(body.subject);
    if (!subject) {
      return errorResponse('bad_request', 'subject selector is required', 400);
    }
    if (!Array.isArray(body.productIds) || body.productIds.length === 0) {
      return errorResponse('bad_request', 'productIds must be a non-empty array', 400);
    }
    if (body.productIds.length > MAX_PRODUCT_IDS_PER_CHECK) {
      return errorResponse(
        'bad_request',
        `productIds must not exceed ${MAX_PRODUCT_IDS_PER_CHECK} items`,
        400
      );
    }

    const convex = createConvexClient(config.convexUrl);
    const auth = await authenticateServiceKey(request, config, convex, tenantId, [
      VERIFICATION_SCOPE,
    ]);
    if ('response' in auth) {
      return auth.response;
    }

    const resolved = await resolveSubjectOrResponse(convex, config, tenantId, subject, 200);
    if ('response' in resolved) {
      return jsonResponse({
        results: body.productIds.map((productId) => ({ productId, verified: false })),
      });
    }

    const results = await Promise.all(
      body.productIds.map(async (productId) => {
        const verified = await convex.query(api.entitlements.hasActiveEntitlement, {
          apiSecret: config.convexApiSecret,
          tenantId,
          subjectId: resolved.subject._id,
          productId,
        });

        return { productId, verified: verified === true };
      })
    );

    return jsonResponse({ results });
  }

  async function resolveSubject(request: Request): Promise<Response> {
    let body: { tenantId?: string; subject?: unknown };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return errorResponse('bad_request', 'Invalid JSON body', 400);
    }

    const tenantId = body.tenantId?.trim();
    if (!tenantId) {
      return errorResponse('bad_request', 'tenantId is required', 400);
    }

    const subjectSelector = parseSubjectSelector(body.subject);
    if (!subjectSelector) {
      return errorResponse('bad_request', 'subject selector is required', 400);
    }

    const convex = createConvexClient(config.convexUrl);
    const auth = await authenticateServiceKey(request, config, convex, tenantId, [SUBJECTS_SCOPE]);
    if ('response' in auth) {
      return auth.response;
    }

    const resolved = await resolveSubjectOrResponse(convex, config, tenantId, subjectSelector);
    if ('response' in resolved) {
      return resolved.response;
    }

    const subjectWithAccounts = (await convex.query(api.subjects.getSubjectWithAccounts, {
      apiSecret: config.convexApiSecret,
      subjectId: resolved.subject._id,
      tenantId,
    })) as {
      externalAccounts: unknown[];
      found?: boolean;
      subject?: {
        _id: Id<'subjects'>;
        authUserId?: string;
        primaryDiscordUserId: string;
      } | null;
    } | null;

    if (!subjectWithAccounts?.found || !subjectWithAccounts.subject) {
      return errorResponse('not_found', 'Subject not found', 404);
    }

    return jsonResponse({
      found: true,
      subjectId: subjectWithAccounts.subject._id,
      authUserId: subjectWithAccounts.subject.authUserId,
      discordUserId: subjectWithAccounts.subject.primaryDiscordUserId,
      externalAccounts: subjectWithAccounts.externalAccounts,
    });
  }

  return {
    async handleRequest(request: Request, pathname: string): Promise<Response | null> {
      if (pathname === '/api/public/me/verification/status' && request.method === 'GET') {
        return getMeVerificationStatus(request);
      }
      if (pathname === '/api/public/verification/status' && request.method === 'POST') {
        return getVerificationStatus(request);
      }
      if (pathname === '/api/public/verification/check' && request.method === 'POST') {
        return checkVerification(request);
      }
      if (pathname === '/api/public/subjects/resolve' && request.method === 'POST') {
        return resolveSubject(request);
      }
      if (pathname.startsWith('/api/public/tenants/') && request.method === 'GET') {
        const slug = pathname.replace(/^\/api\/public\/tenants\//, '').split('/')[0];
        if (slug) {
          return getTenantBySlug(request, decodeURIComponent(slug));
        }
      }

      return null;
    },
  };
}
