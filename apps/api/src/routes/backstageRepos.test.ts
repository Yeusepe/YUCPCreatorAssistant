import { beforeEach, describe, expect, it, mock } from 'bun:test';

let queryImpl: (...args: unknown[]) => Promise<unknown> = async () => null;
let mutationImpl: (...args: unknown[]) => Promise<unknown> = async () => null;

mock.module('../../../../convex/_generated/api', () => ({
  api: {
    backstageRepos: {
      getSubjectByAuthUserForApi: 'backstageRepos.getSubjectByAuthUserForApi',
      issueRepoTokenForApi: 'backstageRepos.issueRepoTokenForApi',
      getRepoAccessByTokenForApi: 'backstageRepos.getRepoAccessByTokenForApi',
      touchRepoTokenForApi: 'backstageRepos.touchRepoTokenForApi',
      buildRepositoryForApi: 'backstageRepos.buildRepositoryForApi',
      resolvePackageDownloadForApi: 'backstageRepos.resolvePackageDownloadForApi',
    },
  },
  internal: {},
  components: {},
}));

mock.module('../lib/convex', () => ({
  getConvexClientFromUrl: () => ({
    query: (...args: unknown[]) => queryImpl(...args),
    mutation: (...args: unknown[]) => mutationImpl(...args),
  }),
}));

mock.module('../lib/oauthAccessToken', () => ({
  verifyBetterAuthAccessToken: async () => ({
    ok: true,
    token: { sub: 'auth-user-1' },
  }),
}));

const { createBackstageRepoRoutes } = await import('./backstageRepos');

describe('backstage repo routes', () => {
  const routes = createBackstageRepoRoutes({
    apiBaseUrl: 'https://api.test',
    convexApiSecret: 'convex-secret',
    convexSiteUrl: 'https://convex.test',
    convexUrl: 'https://convex.cloud',
  });

  beforeEach(() => {
    queryImpl = async (ref: unknown) => {
      switch (ref) {
        case 'backstageRepos.getSubjectByAuthUserForApi':
          return { _id: 'subject_1' };
        case 'backstageRepos.getRepoAccessByTokenForApi':
          return {
            tokenId: 'token_1',
            authUserId: 'auth-user-1',
            subjectId: 'subject_1',
            status: 'active',
          };
        case 'backstageRepos.buildRepositoryForApi':
          return {
            name: 'Backstage Repos',
            packages: {
              'com.yucp.example': {
                versions: {
                  '1.2.3': {
                    name: 'com.yucp.example',
                    version: '1.2.3',
                  },
                },
              },
            },
          };
        case 'backstageRepos.resolvePackageDownloadForApi':
          return {
            artifactKey: 'backstage-package:com.yucp.example',
            downloadUrl: 'https://downloads.example/package.zip',
            deliveryName: 'example-1.2.3.zip',
            contentType: 'application/zip',
            version: '1.2.3',
            channel: 'stable',
          };
        default:
          return null;
      }
    };
    mutationImpl = async (ref: unknown) => {
      switch (ref) {
        case 'backstageRepos.issueRepoTokenForApi':
          return {
            token: 'ybt_example',
            tokenId: 'token_1',
            expiresAt: 1_700_000_000_000,
          };
        case 'backstageRepos.touchRepoTokenForApi':
          return null;
        default:
          return null;
      }
    };
  });

  it('issues a VCC add-repo link for authenticated users', async () => {
    const response = await routes.handleRequest(
      new Request('https://api.test/v1/backstage/repos/access', {
        headers: {
          authorization: 'Bearer oauth-token',
        },
      })
    );

    expect(response?.status).toBe(200);
    await expect(response?.json()).resolves.toMatchObject({
      repositoryUrl: 'https://api.test/v1/backstage/repos/index.json',
      repoToken: 'ybt_example',
      repoTokenHeader: 'X-YUCP-Repo-Token',
    });
  });

  it('serves an entitled VPM repository document when the repo token header is present', async () => {
    const response = await routes.handleRequest(
      new Request('https://api.test/v1/backstage/repos/index.json', {
        headers: {
          'X-YUCP-Repo-Token': 'ybt_example',
        },
      })
    );

    expect(response?.status).toBe(200);
    await expect(response?.json()).resolves.toMatchObject({
      name: 'Backstage Repos',
      packages: {
        'com.yucp.example': {
          versions: {
            '1.2.3': {
              name: 'com.yucp.example',
            },
          },
        },
      },
    });
  });

  it('redirects entitled package downloads through the signed artifact URL', async () => {
    const response = await routes.handleRequest(
      new Request(
        'https://api.test/v1/backstage/package?packageId=com.yucp.example&version=1.2.3&channel=stable',
        {
          headers: {
            'X-YUCP-Repo-Token': 'ybt_example',
          },
        }
      )
    );

    expect(response?.status).toBe(302);
    expect(response?.headers.get('location')).toBe('https://downloads.example/package.zip');
  });
});
