import { beforeEach, describe, expect, it, mock } from 'bun:test';

let verifyAccessTokenImpl: (token: string, options: unknown) => Promise<unknown>;

const verifyAccessTokenMock = mock((token: string, options: unknown) =>
  verifyAccessTokenImpl(token, options)
);

mock.module('better-auth/oauth2', () => ({
  verifyAccessToken: verifyAccessTokenMock,
}));

const { verifyBetterAuthAccessToken } = await import('./oauthAccessToken');

describe('verifyBetterAuthAccessToken', () => {
  const debug = mock(() => {});
  const warn = mock(() => {});
  const options = {
    audience: 'yucp-public-api',
    convexSiteUrl: 'https://test.convex.site',
    logger: { debug, warn },
    logContext: 'OAuth token verification failed',
  };

  beforeEach(() => {
    verifyAccessTokenMock.mockClear();
    debug.mockClear();
    warn.mockClear();
    verifyAccessTokenImpl = async () => ({ sub: 'user_123', scope: 'profile:read' });
  });

  it('logs expected invalid-token verifier failures at debug instead of warn', async () => {
    verifyAccessTokenImpl = async () => {
      const error = new Error('no applicable key found in the JSON Web Key Set');
      error.name = 'JWKSNoMatchingKey';
      throw error;
    };

    const result = await verifyBetterAuthAccessToken('bad-token', options);

    expect(result).toEqual({ ok: false, reason: 'invalid' });
    expect(debug).toHaveBeenCalledTimes(1);
    expect(warn).not.toHaveBeenCalled();
  });

  it('keeps unexpected verifier failures at warn', async () => {
    verifyAccessTokenImpl = async () => {
      const error = new Error('network timeout while fetching jwks');
      error.name = 'TypeError';
      throw error;
    };

    const result = await verifyBetterAuthAccessToken('bad-token', options);

    expect(result).toEqual({ ok: false, reason: 'invalid' });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(debug).not.toHaveBeenCalled();
  });
});
