/**
 * Creator Suite Verification API
 *
 * OAuth 2.1-protected endpoints for third-party apps to verify product entitlements.
 * Requires Bearer token with verification:read scope from "Sign in with Creator Suite".
 */

import { createLogger } from '@yucp/shared';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { api } from '../../../../convex/_generated/api';
import { getConvexClientFromUrl } from '../lib/convex';

const logger = createLogger(process.env.LOG_LEVEL ?? 'info');

const REQUIRED_SCOPE = 'verification:read';
const MAX_PRODUCT_IDS_PER_CHECK = 50;

export interface SuiteConfig {
  convexUrl: string;
  convexApiSecret: string;
  convexSiteUrl: string;
}

export interface VerifiedToken {
  sub: string;
  scope?: string;
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

/**
 * Verify Bearer token using JWKS from Convex auth.
 * Returns payload with sub (user ID) and scope, or null if invalid.
 */
async function verifyBearerToken(
  token: string,
  convexSiteUrl: string
): Promise<VerifiedToken | null> {
  try {
    const authBase = `${convexSiteUrl.replace(/\/$/, '')}/api/auth`;
    const jwksUrl = `${authBase}/jwks`;
    const issuer = authBase;

    const JWKS = createRemoteJWKSet(new URL(jwksUrl));
    const { payload } = await jwtVerify(token, JWKS, {
      issuer,
    });

    const sub = payload.sub as string | undefined;
    if (!sub) return null;

    const scope = typeof payload.scope === 'string' ? payload.scope : undefined;
    return { sub, scope };
  } catch (err) {
    logger.warn('Suite token verification failed', {
      message: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

function hasScope(scope: string | undefined, required: string): boolean {
  if (!scope) return false;
  const scopes = scope.split(/\s+/).filter(Boolean);
  return scopes.includes(required);
}

function extractBearerToken(request: Request): string | null {
  const auth = request.headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  return auth.slice(7).trim() || null;
}

/**
 * GET /api/suite/verification/status?tenantId=xxx
 */
export async function getVerificationStatus(
  request: Request,
  config: SuiteConfig
): Promise<Response> {
  const token = extractBearerToken(request);
  if (!token) {
    return errorResponse('unauthorized', 'Missing or invalid Authorization header', 401);
  }

  const verified = await verifyBearerToken(token, config.convexSiteUrl);
  if (!verified) {
    return errorResponse('unauthorized', 'Invalid or expired token', 401);
  }
  if (!hasScope(verified.scope, REQUIRED_SCOPE)) {
    return errorResponse('forbidden', 'Insufficient scope: verification:read required', 403);
  }

  const url = new URL(request.url);
  const tenantId = url.searchParams.get('tenantId');
  if (!tenantId) {
    return errorResponse('bad_request', 'tenantId query parameter is required', 400);
  }

  const convex = getConvexClientFromUrl(config.convexUrl);
  const apiSecret = config.convexApiSecret;

  const subjectResult = await convex.query(api.subjects.getSubjectByAuthId, {
    authUserId: verified.sub,
  });
  if (!subjectResult?.found || !subjectResult.subject) {
    return errorResponse('forbidden', 'Subject not found', 403);
  }

  const entitlements = await convex.query(api.entitlements.getEntitlementsBySubject, {
    apiSecret,
    tenantId,
    subjectId: subjectResult.subject._id,
    includeInactive: false,
  });

  const products = (entitlements ?? []).map(
    (e: { productId: string; status: string; grantedAt: number }) => ({
      productId: e.productId,
      status: e.status,
      grantedAt: e.grantedAt,
    })
  );

  return jsonResponse({
    verified: true,
    subjectId: subjectResult.subject._id,
    products,
  });
}

/**
 * GET /api/suite/verification/products?tenantId=xxx
 */
export async function getVerifiedProducts(
  request: Request,
  config: SuiteConfig
): Promise<Response> {
  const token = extractBearerToken(request);
  if (!token) {
    return errorResponse('unauthorized', 'Missing or invalid Authorization header', 401);
  }

  const verified = await verifyBearerToken(token, config.convexSiteUrl);
  if (!verified) {
    return errorResponse('unauthorized', 'Invalid or expired token', 401);
  }
  if (!hasScope(verified.scope, REQUIRED_SCOPE)) {
    return errorResponse('forbidden', 'Insufficient scope: verification:read required', 403);
  }

  const url = new URL(request.url);
  const tenantId = url.searchParams.get('tenantId');
  if (!tenantId) {
    return errorResponse('bad_request', 'tenantId query parameter is required', 400);
  }

  const convex = getConvexClientFromUrl(config.convexUrl);
  const apiSecret = config.convexApiSecret;

  const subjectResult = await convex.query(api.subjects.getSubjectByAuthId, {
    authUserId: verified.sub,
  });
  if (!subjectResult?.found || !subjectResult.subject) {
    return jsonResponse({ productIds: [] });
  }

  const entitlements = await convex.query(api.entitlements.getEntitlementsBySubject, {
    apiSecret,
    tenantId,
    subjectId: subjectResult.subject._id,
    includeInactive: false,
  });

  const productIds = [
    ...new Set((entitlements ?? []).map((e: { productId: string }) => e.productId)),
  ];
  return jsonResponse({ productIds });
}

/**
 * POST /api/suite/verification/check
 * Body: { tenantId: string, productIds: string[] }
 */
export async function checkVerification(request: Request, config: SuiteConfig): Promise<Response> {
  const token = extractBearerToken(request);
  if (!token) {
    return errorResponse('unauthorized', 'Missing or invalid Authorization header', 401);
  }

  const verified = await verifyBearerToken(token, config.convexSiteUrl);
  if (!verified) {
    return errorResponse('unauthorized', 'Invalid or expired token', 401);
  }
  if (!hasScope(verified.scope, REQUIRED_SCOPE)) {
    return errorResponse('forbidden', 'Insufficient scope: verification:read required', 403);
  }

  let body: { tenantId?: string; productIds?: string[] };
  try {
    body = (await request.json()) as { tenantId?: string; productIds?: string[] };
  } catch {
    return errorResponse('bad_request', 'Invalid JSON body', 400);
  }

  const { tenantId, productIds } = body;
  if (!tenantId) {
    return errorResponse('bad_request', 'tenantId is required', 400);
  }
  if (!Array.isArray(productIds) || productIds.length === 0) {
    return errorResponse('bad_request', 'productIds must be a non-empty array', 400);
  }
  if (productIds.length > MAX_PRODUCT_IDS_PER_CHECK) {
    return errorResponse(
      'bad_request',
      `productIds must not exceed ${MAX_PRODUCT_IDS_PER_CHECK} items`,
      400
    );
  }

  const convex = getConvexClientFromUrl(config.convexUrl);
  const apiSecret = config.convexApiSecret;

  const subjectResult = await convex.query(api.subjects.getSubjectByAuthId, {
    authUserId: verified.sub,
  });
  if (!subjectResult?.found || !subjectResult.subject) {
    return jsonResponse({
      results: productIds.map((productId) => ({ productId, verified: false })),
    });
  }

  const results = await Promise.all(
    productIds.map(async (productId: string) => {
      const verified = await convex.query(api.entitlements.hasActiveEntitlement, {
        apiSecret,
        tenantId,
        subjectId: subjectResult.subject._id,
        productId,
      });
      return { productId, verified: verified === true };
    })
  );

  return jsonResponse({ results });
}

/**
 * GET /api/suite/tenants/:slug
 */
export async function getTenantBySlug(
  request: Request,
  config: SuiteConfig,
  slug: string
): Promise<Response> {
  const token = extractBearerToken(request);
  if (!token) {
    return errorResponse('unauthorized', 'Missing or invalid Authorization header', 401);
  }

  const verified = await verifyBearerToken(token, config.convexSiteUrl);
  if (!verified) {
    return errorResponse('unauthorized', 'Invalid or expired token', 401);
  }
  if (!hasScope(verified.scope, REQUIRED_SCOPE)) {
    return errorResponse('forbidden', 'Insufficient scope: verification:read required', 403);
  }

  const convex = getConvexClientFromUrl(config.convexUrl);
  const apiSecret = config.convexApiSecret;

  const tenant = await convex.query(api.tenants.getTenantBySlug, {
    apiSecret,
    slug,
  });

  if (!tenant) {
    return errorResponse('not_found', 'Tenant not found', 404);
  }

  return jsonResponse({
    tenantId: tenant._id,
    name: tenant.name,
    slug: tenant.slug,
  });
}

/**
 * Create suite route handlers for the given config.
 */
export function createSuiteRoutes(config: SuiteConfig) {
  return {
    async handleRequest(request: Request, pathname: string): Promise<Response | null> {
      if (pathname === '/api/suite/verification/status' && request.method === 'GET') {
        return getVerificationStatus(request, config);
      }
      if (pathname === '/api/suite/verification/products' && request.method === 'GET') {
        return getVerifiedProducts(request, config);
      }
      if (pathname === '/api/suite/verification/check' && request.method === 'POST') {
        return checkVerification(request, config);
      }
      if (pathname.startsWith('/api/suite/tenants/') && request.method === 'GET') {
        const slug = pathname.replace(/^\/api\/suite\/tenants\//, '').split('/')[0];
        if (slug) {
          return getTenantBySlug(request, config, decodeURIComponent(slug));
        }
      }
      return null;
    },
  };
}
