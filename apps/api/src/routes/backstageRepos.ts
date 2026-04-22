import { sha256Hex } from '@yucp/shared/crypto';
import { api } from '../../../../convex/_generated/api';
import { getConvexClientFromUrl } from '../lib/convex';
import { logger } from '../lib/logger';
import { verifyBetterAuthAccessToken } from '../lib/oauthAccessToken';

const BACKSTAGE_REPO_TOKEN_HEADER = 'X-YUCP-Repo-Token';
const BACKSTAGE_REPO_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type BackstageRepoConfig = {
  apiBaseUrl: string;
  convexApiSecret: string;
  convexSiteUrl: string;
  convexUrl: string;
};

function jsonResponse(body: object, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

function errorResponse(message: string, status: number): Response {
  return jsonResponse({ error: message }, status);
}

function buildBackstageAddRepoUrl(repositoryUrl: string, repoToken: string): string {
  const addRepoUrl = new URL('vcc://vpm/addRepo');
  addRepoUrl.searchParams.set('url', repositoryUrl);
  addRepoUrl.searchParams.append('headers[]', `${BACKSTAGE_REPO_TOKEN_HEADER}:${repoToken}`);
  return addRepoUrl.toString();
}

async function authenticateBackstageAccess(
  request: Request,
  config: BackstageRepoConfig
): Promise<{ authUserId: string } | Response> {
  const authHeader = request.headers.get('authorization')?.trim() ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return errorResponse('Authorization: Bearer <access_token> required', 401);
  }

  const verified = await verifyBetterAuthAccessToken(authHeader.slice('Bearer '.length).trim(), {
    convexSiteUrl: config.convexSiteUrl,
    audience: 'yucp-public-api',
    requiredScopes: ['products:read'],
    logger,
    logContext: 'Backstage repo access token verification failed',
  });
  if (!verified.ok) {
    if (verified.reason === 'insufficient_scope') {
      return errorResponse('Token missing required scope: products:read', 403);
    }
    return errorResponse('Invalid or expired token', 401);
  }

  return { authUserId: verified.token.sub };
}

async function resolveRepoAccess(
  request: Request,
  config: BackstageRepoConfig
): Promise<
  | {
      ok: true;
      rawToken: string;
      tokenId: string;
      authUserId: string;
      subjectId: string;
    }
  | { ok: false }
> {
  const rawToken = request.headers.get(BACKSTAGE_REPO_TOKEN_HEADER)?.trim() ?? '';
  if (!rawToken) {
    return { ok: false };
  }

  const convex = getConvexClientFromUrl(config.convexUrl);
  const access = await convex.query(api.backstageRepos.getRepoAccessByTokenForApi, {
    apiSecret: config.convexApiSecret,
    tokenHash: await sha256Hex(rawToken),
  });
  if (!access) {
    return { ok: false };
  }

  await convex.mutation(api.backstageRepos.touchRepoTokenForApi, {
    apiSecret: config.convexApiSecret,
    tokenId: access.tokenId,
  });

  return {
    ok: true,
    rawToken,
    tokenId: access.tokenId,
    authUserId: access.authUserId,
    subjectId: access.subjectId,
  };
}

async function issueRepoAccess(request: Request, config: BackstageRepoConfig): Promise<Response> {
  const auth = await authenticateBackstageAccess(request, config);
  if (auth instanceof Response) {
    return auth;
  }

  const convex = getConvexClientFromUrl(config.convexUrl);
  const subject = await convex.query(api.backstageRepos.getSubjectByAuthUserForApi, {
    apiSecret: config.convexApiSecret,
    authUserId: auth.authUserId,
  });
  if (!subject) {
    return errorResponse('No active subject found for this account', 404);
  }

  const now = Date.now();
  const issued = await convex.mutation(api.backstageRepos.issueRepoTokenForApi, {
    apiSecret: config.convexApiSecret,
    authUserId: auth.authUserId,
    subjectId: subject._id,
    label: 'VCC Backstage Repos',
    expiresAt: now + BACKSTAGE_REPO_TOKEN_TTL_MS,
  });

  const repositoryUrl = `${config.apiBaseUrl.replace(/\/$/, '')}/v1/backstage/repos/index.json`;
  const addRepoUrl = buildBackstageAddRepoUrl(repositoryUrl, issued.token);
  const requestUrl = new URL(request.url);
  if (requestUrl.searchParams.get('mode') === 'redirect') {
    return Response.redirect(addRepoUrl, 302);
  }

  return jsonResponse({
    repositoryUrl,
    addRepoUrl,
    repoTokenHeader: BACKSTAGE_REPO_TOKEN_HEADER,
    repoToken: issued.token,
    expiresAt: issued.expiresAt,
  });
}

async function serveRepositoryIndex(
  request: Request,
  config: BackstageRepoConfig
): Promise<Response> {
  const access = await resolveRepoAccess(request, config);
  if (!access.ok) {
    return errorResponse('Repository not found', 404);
  }

  const convex = getConvexClientFromUrl(config.convexUrl);
  const repository = await convex.query(api.backstageRepos.buildRepositoryForApi, {
    apiSecret: config.convexApiSecret,
    authUserId: access.authUserId,
    subjectId: access.subjectId,
    repositoryUrl: `${config.apiBaseUrl.replace(/\/$/, '')}/v1/backstage/repos/index.json`,
    packageBaseUrl: `${config.apiBaseUrl.replace(/\/$/, '')}/v1/backstage/package`,
    packageHeaders: {
      [BACKSTAGE_REPO_TOKEN_HEADER]: access.rawToken,
    },
  });

  return jsonResponse(repository);
}

async function servePackageDownload(
  request: Request,
  config: BackstageRepoConfig
): Promise<Response> {
  const access = await resolveRepoAccess(request, config);
  if (!access.ok) {
    return errorResponse('Package not found', 404);
  }

  const requestUrl = new URL(request.url);
  const packageId = requestUrl.searchParams.get('packageId')?.trim() ?? '';
  const version = requestUrl.searchParams.get('version')?.trim() ?? '';
  const channel = requestUrl.searchParams.get('channel')?.trim() ?? '';
  if (!packageId || !version || !channel) {
    return errorResponse('packageId, version, and channel are required', 400);
  }

  const convex = getConvexClientFromUrl(config.convexUrl);
  const resolved = await convex.query(api.backstageRepos.resolvePackageDownloadForApi, {
    apiSecret: config.convexApiSecret,
    authUserId: access.authUserId,
    subjectId: access.subjectId,
    packageId,
    version,
    channel,
  });
  if (!resolved) {
    return errorResponse('Package not found', 404);
  }
  return Response.redirect(resolved.downloadUrl, 302);
}

export function createBackstageRepoRoutes(config: BackstageRepoConfig) {
  return {
    async handleRequest(request: Request): Promise<Response | null> {
      const url = new URL(request.url);
      if (request.method === 'GET' && url.pathname === '/v1/backstage/repos/access') {
        return await issueRepoAccess(request, config);
      }
      if (request.method === 'GET' && url.pathname === '/v1/backstage/repos/index.json') {
        return await serveRepositoryIndex(request, config);
      }
      if (request.method === 'GET' && url.pathname === '/v1/backstage/package') {
        return await servePackageDownload(request, config);
      }
      return null;
    },
  };
}
