import { beforeEach, describe, expect, it, mock } from 'bun:test';

let mutationImpl: (...args: unknown[]) => Promise<unknown> = async () => null;
let actionImpl: (...args: unknown[]) => Promise<unknown> = async () => null;
let queryImpl: (...args: unknown[]) => Promise<unknown> = async () => null;
let lastActionArgs: unknown;

mock.module('../../../../convex/_generated/api', () => ({
  api: {
    backstageRepos: {
      getSubjectByAuthUserForApi: 'backstageRepos.getSubjectByAuthUserForApi',
      issueRepoTokenForApi: 'backstageRepos.issueRepoTokenForApi',
      generateReleaseUploadUrlForAuthUser: 'backstageRepos.generateReleaseUploadUrlForAuthUser',
      publishUploadedReleaseForAuthUser: 'backstageRepos.publishUploadedReleaseForAuthUser',
    },
    creatorProfiles: {
      getCreatorByAuthUser: 'creatorProfiles.getCreatorByAuthUser',
    },
    packageRegistry: {
      listByAuthUser: 'packageRegistry.listByAuthUser',
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
    query: (...args: unknown[]) => queryImpl(...args),
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
    queryImpl = async (ref: unknown) => {
      switch (ref) {
        case 'backstageRepos.getSubjectByAuthUserForApi':
          return { _id: 'subject_1' };
        case 'creatorProfiles.getCreatorByAuthUser':
          return { _id: 'creator_1', name: '10705330', slug: 'mapache' };
        case 'packageRegistry.listByAuthUser':
          return {
            data: [
              {
                _id: 'product_1',
                aliases: ['Backstage Bundle'],
                productId: 'gumroad-product-1',
                provider: 'gumroad',
                providerProductRef: 'gumroad-product-1',
                displayName: 'Backstage Bundle',
                canonicalSlug: 'backstage-bundle',
                status: 'active',
                supportsAutoDiscovery: true,
                updatedAt: 1_710_000_000_000,
                backstagePackages: [
                  {
                    packageId: 'com.yucp.example',
                    packageName: 'Example Package',
                    displayName: 'Example Package',
                    status: 'active',
                    repositoryVisibility: 'listed',
                    defaultChannel: 'stable',
                    latestPublishedVersion: '1.2.3',
                    latestRelease: {
                      version: '1.2.3',
                      channel: 'stable',
                      releaseStatus: 'published',
                      repositoryVisibility: 'listed',
                      artifactKey: 'artifact:example',
                      publishedAt: 1_710_000_000_000,
                    },
                  },
                ],
              },
            ],
            hasMore: false,
            nextCursor: null,
          };
        default:
          return [];
      }
    };
    lastActionArgs = undefined;
    mutationImpl = async (ref: unknown) => {
      switch (ref) {
        case 'backstageRepos.issueRepoTokenForApi':
          return {
            tokenId: 'repo_token_1',
            token: 'ybt_example',
            expiresAt: 1_710_000_000_000,
          };
        case 'backstageRepos.generateReleaseUploadUrlForAuthUser':
          return 'https://upload.test/backstage';
        default:
          return null;
      }
    };
    actionImpl = async (ref: unknown, args: unknown) => {
      lastActionArgs = args;
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

  it('issues creator repo access links from the authenticated package workspace', async () => {
    const response = await routes.getBackstageRepoAccess(
      new Request('https://api.test/api/packages/backstage/repo-access', {
        method: 'GET',
        headers: {
          authorization: 'Bearer oauth-token',
        },
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      creatorName: 'Mapache',
      creatorRepoRef: 'mapache',
      repositoryUrl: 'https://api.test/v1/backstage/repos/mapache/index.json',
      repositoryName: 'Mapache Backstage Repos',
      addRepoUrl:
        'vcc://vpm/addRepo?url=https%3A%2F%2Fapi.test%2Fv1%2Fbackstage%2Frepos%2Fmapache%2Findex.json&headers%5B%5D=X-YUCP-Repo-Token%3Aybt_example',
      repoTokenHeader: 'X-YUCP-Repo-Token',
      repoToken: 'ybt_example',
      expiresAt: 1_710_000_000_000,
    });
  });

  it('lists creator product links for the Backstage release picker', async () => {
    const response = await routes.listBackstageProducts(
      new Request('https://api.test/api/packages/backstage/products', {
        method: 'GET',
        headers: {
          authorization: 'Bearer oauth-token',
        },
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      products: [
        {
          aliases: ['Backstage Bundle'],
          backstagePackages: [
            {
              packageId: 'com.yucp.example',
              packageName: 'Example Package',
              displayName: 'Example Package',
              status: 'active',
              repositoryVisibility: 'listed',
              defaultChannel: 'stable',
              latestPublishedVersion: '1.2.3',
              latestRelease: {
                version: '1.2.3',
                channel: 'stable',
                releaseStatus: 'published',
                repositoryVisibility: 'listed',
                artifactKey: 'artifact:example',
                publishedAt: 1_710_000_000_000,
              },
            },
          ],
          canonicalSlug: 'backstage-bundle',
          catalogProductId: 'product_1',
          displayName: 'Backstage Bundle',
          productId: 'gumroad-product-1',
          provider: 'gumroad',
          providerProductRef: 'gumroad-product-1',
          status: 'active',
          supportsAutoDiscovery: true,
          updatedAt: 1_710_000_000_000,
        },
      ],
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
          catalogProductIds: ['product_1', 'product_2'],
          storageId: 'storage_1',
          version: '1.2.3',
          channel: 'stable',
          zipSha256: 'd'.repeat(64),
        }),
      }),
      'com.yucp.example'
    );

    expect(response.status).toBe(201);
    expect(lastActionArgs).toMatchObject({
      catalogProductId: 'product_1',
      catalogProductIds: ['product_1', 'product_2'],
      zipSha256: 'd'.repeat(64),
    });
    await expect(response.json()).resolves.toMatchObject({
      deliveryPackageReleaseId: 'release_1',
      artifactId: 'artifact_1',
      version: '1.2.3',
      channel: 'stable',
    });
  });

  it('publishes wrapped VPM ZIP metadata for unitypackage sources', async () => {
    const response = await routes.publishBackstageRelease(
      new Request('https://api.test/api/packages/com.yucp.example/backstage/releases', {
        method: 'POST',
        headers: {
          authorization: 'Bearer oauth-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          catalogProductIds: ['product_1'],
          storageId: 'storage_1',
          version: '4.0.0',
          zipSha256: 'e'.repeat(64),
          deliveryName: 'com.yucp.example-4.0.0.zip',
          contentType: 'application/zip',
        }),
      }),
      'com.yucp.example'
    );

    expect(response.status).toBe(201);
    expect(lastActionArgs).toMatchObject({
      deliveryName: 'com.yucp.example-4.0.0.zip',
      contentType: 'application/zip',
      zipSha256: 'e'.repeat(64),
    });
  });
});
