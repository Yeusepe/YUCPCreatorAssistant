import type { ApiActorBinding } from '@yucp/shared/apiActor';
import { api } from '../../../../convex/_generated/api';
import type { Id } from '../../../../convex/_generated/dataModel';
import type { Auth } from '../auth';
import { createAuthUserActorBinding } from '../lib/apiActor';
import { getConvexClientFromUrl } from '../lib/convex';
import { rejectCrossSiteRequest } from '../lib/csrf';
import { logger } from '../lib/logger';
import { verifyBetterAuthAccessToken } from '../lib/oauthAccessToken';

const PACKAGE_ID_RE = /^[a-z0-9\-_./:]{1,128}$/;

export type PackagesConfig = {
  apiBaseUrl: string;
  frontendBaseUrl: string;
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

function getAllowedOrigins(config: PackagesConfig): Set<string> {
  return new Set([new URL(config.apiBaseUrl).origin, new URL(config.frontendBaseUrl).origin]);
}

function assertPackageId(packageId: string): string {
  const normalized = decodeURIComponent(packageId).trim();
  if (!PACKAGE_ID_RE.test(normalized)) {
    throw new Error('Invalid packageId format');
  }
  return normalized;
}

async function resolveViewer(
  request: Request,
  auth: Auth,
  config: PackagesConfig
): Promise<{ authUserId: string; actorBinding: ApiActorBinding } | Response> {
  const authHeader = request.headers.get('authorization')?.trim() ?? '';
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice('Bearer '.length).trim();
    const verified = await verifyBetterAuthAccessToken(token, {
      convexSiteUrl: config.convexSiteUrl,
      audience: 'yucp-public-api',
      requiredScopes: ['profile:read'],
      logger,
      logContext: 'Package routes OAuth token verification failed',
    });
    if (!verified.ok) {
      return jsonResponse({ error: 'Authentication required' }, 401);
    }

    return {
      authUserId: verified.token.sub,
      actorBinding: await createAuthUserActorBinding({
        authUserId: verified.token.sub,
        source: 'oauth',
        scopes: ['profile:read'],
      }),
    };
  }

  const csrfBlock = rejectCrossSiteRequest(request, getAllowedOrigins(config));
  if (csrfBlock) {
    return csrfBlock;
  }

  const session = await auth.getSession(request);
  if (!session) {
    return jsonResponse({ error: 'Authentication required' }, 401);
  }

  return {
    authUserId: session.user.id,
    actorBinding: await createAuthUserActorBinding({
      authUserId: session.user.id,
      source: 'session',
    }),
  };
}

export function createPackageRoutes(auth: Auth, config: PackagesConfig) {
  async function listPackages(request: Request): Promise<Response> {
    const viewer = await resolveViewer(request, auth, config);
    if (viewer instanceof Response) {
      return viewer;
    }
    const convex = getConvexClientFromUrl(config.convexUrl, viewer.actorBinding);

    try {
      const includeArchived = new URL(request.url).searchParams.get('includeArchived') === 'true';
      const result = await convex.query(api.packageRegistry.listForAuthUser, {
        apiSecret: config.convexApiSecret,
        authUserId: viewer.authUserId,
        ...(includeArchived ? { includeArchived: true } : {}),
      });
      return jsonResponse(result);
    } catch (error) {
      logger.error('Failed to list creator packages', {
        authUserId: viewer.authUserId,
        error: error instanceof Error ? error.message : String(error),
      });
      return jsonResponse({ error: 'Failed to load packages' }, 500);
    }
  }

  async function renamePackage(request: Request, packageIdParam: string): Promise<Response> {
    const viewer = await resolveViewer(request, auth, config);
    if (viewer instanceof Response) {
      return viewer;
    }
    const convex = getConvexClientFromUrl(config.convexUrl, viewer.actorBinding);

    let packageId: string;
    try {
      packageId = assertPackageId(packageIdParam);
    } catch (error) {
      return jsonResponse(
        { error: error instanceof Error ? error.message : 'Invalid packageId' },
        400
      );
    }

    let body: { packageName?: string };
    try {
      body = (await request.json()) as { packageName?: string };
    } catch {
      return jsonResponse({ error: 'Invalid JSON body' }, 400);
    }

    if (!body.packageName || !body.packageName.trim()) {
      return jsonResponse({ error: 'packageName is required' }, 400);
    }

    try {
      const result = await convex.mutation(api.packageRegistry.renameForAuthUser, {
        apiSecret: config.convexApiSecret,
        authUserId: viewer.authUserId,
        packageId,
        packageName: body.packageName,
      });

      if (!result.updated) {
        const status = result.reason === 'Package not found.' ? 404 : 409;
        return jsonResponse({ error: result.reason }, status);
      }

      return jsonResponse(result);
    } catch (error) {
      logger.error('Failed to rename creator package', {
        authUserId: viewer.authUserId,
        packageId,
        error: error instanceof Error ? error.message : String(error),
      });
      return jsonResponse({ error: 'Failed to rename package' }, 500);
    }
  }

  async function archivePackage(request: Request, packageIdParam: string): Promise<Response> {
    const viewer = await resolveViewer(request, auth, config);
    if (viewer instanceof Response) {
      return viewer;
    }
    const convex = getConvexClientFromUrl(config.convexUrl, viewer.actorBinding);

    let packageId: string;
    try {
      packageId = assertPackageId(packageIdParam);
    } catch (error) {
      return jsonResponse(
        { error: error instanceof Error ? error.message : 'Invalid packageId' },
        400
      );
    }

    try {
      const result = await convex.mutation(api.packageRegistry.archiveForAuthUser, {
        apiSecret: config.convexApiSecret,
        authUserId: viewer.authUserId,
        packageId,
      });

      if (!result.archived) {
        const status = result.reason === 'Package not found.' ? 404 : 409;
        return jsonResponse({ error: result.reason }, status);
      }

      return jsonResponse(result);
    } catch (error) {
      logger.error('Failed to archive creator package', {
        authUserId: viewer.authUserId,
        packageId,
        error: error instanceof Error ? error.message : String(error),
      });
      return jsonResponse({ error: 'Failed to archive package' }, 500);
    }
  }

  async function restorePackage(request: Request, packageIdParam: string): Promise<Response> {
    const viewer = await resolveViewer(request, auth, config);
    if (viewer instanceof Response) {
      return viewer;
    }
    const convex = getConvexClientFromUrl(config.convexUrl, viewer.actorBinding);

    let packageId: string;
    try {
      packageId = assertPackageId(packageIdParam);
    } catch (error) {
      return jsonResponse(
        { error: error instanceof Error ? error.message : 'Invalid packageId' },
        400
      );
    }

    try {
      const result = await convex.mutation(api.packageRegistry.restoreForAuthUser, {
        apiSecret: config.convexApiSecret,
        authUserId: viewer.authUserId,
        packageId,
      });

      if (!result.restored) {
        const status = result.reason === 'Package not found.' ? 404 : 409;
        return jsonResponse({ error: result.reason }, status);
      }

      return jsonResponse(result);
    } catch (error) {
      logger.error('Failed to restore creator package', {
        authUserId: viewer.authUserId,
        packageId,
        error: error instanceof Error ? error.message : String(error),
      });
      return jsonResponse({ error: 'Failed to restore package' }, 500);
    }
  }

  async function deletePackage(request: Request, packageIdParam: string): Promise<Response> {
    const viewer = await resolveViewer(request, auth, config);
    if (viewer instanceof Response) {
      return viewer;
    }
    const convex = getConvexClientFromUrl(config.convexUrl, viewer.actorBinding);

    let packageId: string;
    try {
      packageId = assertPackageId(packageIdParam);
    } catch (error) {
      return jsonResponse(
        { error: error instanceof Error ? error.message : 'Invalid packageId' },
        400
      );
    }

    try {
      const result = await convex.mutation(api.packageRegistry.deleteForAuthUser, {
        apiSecret: config.convexApiSecret,
        authUserId: viewer.authUserId,
        packageId,
      });

      if (!result.deleted) {
        const status = result.reason === 'Package not found.' ? 404 : 409;
        return jsonResponse({ error: result.reason }, status);
      }

      return jsonResponse(result);
    } catch (error) {
      logger.error('Failed to delete creator package', {
        authUserId: viewer.authUserId,
        packageId,
        error: error instanceof Error ? error.message : String(error),
      });
      return jsonResponse({ error: 'Failed to delete package' }, 500);
    }
  }

  async function createBackstageReleaseUploadUrl(
    request: Request,
    packageIdParam: string
  ): Promise<Response> {
    const viewer = await resolveViewer(request, auth, config);
    if (viewer instanceof Response) {
      return viewer;
    }
    const convex = getConvexClientFromUrl(config.convexUrl, viewer.actorBinding);

    let packageId: string;
    try {
      packageId = assertPackageId(packageIdParam);
    } catch (error) {
      return jsonResponse(
        { error: error instanceof Error ? error.message : 'Invalid packageId' },
        400
      );
    }

    try {
      const uploadUrl = await convex.mutation(
        api.backstageRepos.generateReleaseUploadUrlForAuthUser,
        {
          apiSecret: config.convexApiSecret,
          actor: viewer.actorBinding,
          authUserId: viewer.authUserId,
        }
      );
      return jsonResponse({ packageId, uploadUrl });
    } catch (error) {
      logger.error('Failed to generate Backstage release upload URL', {
        authUserId: viewer.authUserId,
        packageId,
        error: error instanceof Error ? error.message : String(error),
      });
      return jsonResponse({ error: 'Failed to create upload URL' }, 500);
    }
  }

  async function publishBackstageRelease(
    request: Request,
    packageIdParam: string
  ): Promise<Response> {
    const viewer = await resolveViewer(request, auth, config);
    if (viewer instanceof Response) {
      return viewer;
    }
    const convex = getConvexClientFromUrl(config.convexUrl, viewer.actorBinding);

    let packageId: string;
    try {
      packageId = assertPackageId(packageIdParam);
    } catch (error) {
      return jsonResponse(
        { error: error instanceof Error ? error.message : 'Invalid packageId' },
        400
      );
    }

    let body: {
      catalogProductId?: string;
      storageId?: string;
      version?: string;
      channel?: string;
      packageName?: string;
      displayName?: string;
      description?: string;
      repositoryVisibility?: 'hidden' | 'listed';
      defaultChannel?: string;
      unityVersion?: string;
      metadata?: unknown;
      deliveryName?: string;
      contentType?: string;
      releaseStatus?: 'draft' | 'published' | 'revoked' | 'superseded';
    };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return jsonResponse({ error: 'Invalid JSON body' }, 400);
    }

    if (!body.catalogProductId || !body.storageId || !body.version) {
      return jsonResponse({ error: 'catalogProductId, storageId, and version are required' }, 400);
    }

    try {
      const result = await convex.action(api.backstageRepos.publishUploadedReleaseForAuthUser, {
        apiSecret: config.convexApiSecret,
        actor: viewer.actorBinding,
        authUserId: viewer.authUserId,
        catalogProductId: body.catalogProductId as Id<'product_catalog'>,
        packageId,
        storageId: body.storageId as Id<'_storage'>,
        version: body.version,
        channel: body.channel,
        packageName: body.packageName,
        displayName: body.displayName,
        description: body.description,
        repositoryVisibility: body.repositoryVisibility,
        defaultChannel: body.defaultChannel,
        unityVersion: body.unityVersion,
        metadata: body.metadata,
        deliveryName: body.deliveryName,
        contentType: body.contentType,
        releaseStatus: body.releaseStatus,
      });
      return jsonResponse(result, 201);
    } catch (error) {
      logger.error('Failed to publish Backstage release', {
        authUserId: viewer.authUserId,
        packageId,
        error: error instanceof Error ? error.message : String(error),
      });
      return jsonResponse({ error: 'Failed to publish Backstage release' }, 500);
    }
  }

  return {
    listPackages,
    renamePackage,
    archivePackage,
    restorePackage,
    deletePackage,
    createBackstageReleaseUploadUrl,
    publishBackstageRelease,
  };
}
