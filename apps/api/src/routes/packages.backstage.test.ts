import { beforeEach, describe, expect, it, mock } from 'bun:test';

let mutationImpl: (...args: unknown[]) => Promise<unknown> = async () => null;
let actionImpl: (...args: unknown[]) => Promise<unknown> = async () => null;

mock.module('../../../../convex/_generated/api', () => ({
  api: {
    backstageRepos: {
      generateReleaseUploadUrlForAuthUser: 'backstageRepos.generateReleaseUploadUrlForAuthUser',
      publishUploadedReleaseForAuthUser: 'backstageRepos.publishUploadedReleaseForAuthUser',
    },
    packageRegistry: {
      listForAuthUser: 'packageRegistry.listForAuthUser',
      renameForAuthUser: 'packageRegistry.renameForAuthUser',
      archiveForAuthUser: 'packageRegistry.archiveForAuthUser',
      restoreForAuthUser: 'packageRegistry.restoreForAuthUser',
      deleteForAuthUser: 'packageRegistry.deleteForAuthUser',
    },
  },
  internal: {},
  components: {},
}));

mock.module('../lib/convex', () => ({
  getConvexClientFromUrl: () => ({
    query: async () => [],
    mutation: (...args: unknown[]) => mutationImpl(...args),
    action: (...args: unknown[]) => actionImpl(...args),
  }),
}));

mock.module('../lib/oauthAccessToken', () => ({
  verifyBetterAuthAccessToken: async () => ({
    ok: true,
    token: { sub: 'auth-user-1' },
  }),
}));

mock.module('../lib/apiActor', () => ({
  createAuthUserActorBinding: async () => 'actor-binding',
}));

const { createPackageRoutes } = await import('./packages');

describe('package Backstage publishing routes', () => {
  const routes = createPackageRoutes(
    {
      getSession: async () => null,
    } as never,
    {
      apiBaseUrl: 'https://api.test',
      frontendBaseUrl: 'https://creators.test',
      convexApiSecret: 'convex-secret',
      convexSiteUrl: 'https://convex.test',
      convexUrl: 'https://convex.cloud',
    }
  );

  beforeEach(() => {
    mutationImpl = async (ref: unknown) => {
      switch (ref) {
        case 'backstageRepos.generateReleaseUploadUrlForAuthUser':
          return 'https://upload.test/backstage';
        default:
          return null;
      }
    };
    actionImpl = async (ref: unknown) => {
      switch (ref) {
        case 'backstageRepos.publishUploadedReleaseForAuthUser':
          return {
            deliveryPackageReleaseId: 'release_1',
            artifactId: 'artifact_1',
            artifactKey: 'backstage-package:com.yucp.example',
            zipSha256: 'a'.repeat(64),
            version: '1.2.3',
            channel: 'stable',
          };
        default:
          return null;
      }
    };
  });

  it('creates upload URLs for Backstage package release uploads', async () => {
    const response = await routes.createBackstageReleaseUploadUrl(
      new Request('https://api.test/api/packages/com.yucp.example/backstage/upload-url', {
        method: 'POST',
        headers: {
          authorization: 'Bearer oauth-token',
        },
      }),
      'com.yucp.example'
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      packageId: 'com.yucp.example',
      uploadUrl: 'https://upload.test/backstage',
    });
  });

  it('publishes uploaded Backstage releases for the authenticated creator', async () => {
    const response = await routes.publishBackstageRelease(
      new Request('https://api.test/api/packages/com.yucp.example/backstage/releases', {
        method: 'POST',
        headers: {
          authorization: 'Bearer oauth-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          catalogProductId: 'product_1',
          storageId: 'storage_1',
          version: '1.2.3',
          channel: 'stable',
        }),
      }),
      'com.yucp.example'
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      deliveryPackageReleaseId: 'release_1',
      artifactId: 'artifact_1',
      version: '1.2.3',
      channel: 'stable',
    });
  });
});
