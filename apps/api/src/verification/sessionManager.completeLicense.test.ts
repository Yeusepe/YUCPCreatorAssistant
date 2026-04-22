import { beforeEach, describe, expect, it, mock } from 'bun:test';
import type { VerificationConfig } from './verificationConfig';

const handleCompleteLicenseMock = mock(async (_config?: unknown, _input?: unknown) => ({
  success: true,
  provider: 'gumroad',
  entitlementIds: ['ent_123'],
}));

mock.module('./completeLicense', () => ({
  handleCompleteLicense: handleCompleteLicenseMock,
}));

const providersMock = {
  getBuyerLinkPluginByMode: mock(() => undefined),
  listBuyerLinkPlugins: mock(() => []),
  getProviderRuntime: mock(() => undefined),
};

mock.module('../providers', () => providersMock);
mock.module('../providers/index', () => providersMock);
mock.module('../providers/index.ts', () => providersMock);

const { createVerificationRoutes } = await import('./sessionManager');

const testConfig: VerificationConfig = {
  baseUrl: 'https://api.example.com',
  frontendUrl: 'https://app.example.com',
  convexUrl: 'https://convex.example',
  convexApiSecret: 'api-secret',
  gumroadClientId: 'gumroad-client-id',
  gumroadClientSecret: 'gumroad-client-secret',
};

beforeEach(() => {
  handleCompleteLicenseMock.mockReset();
  handleCompleteLicenseMock.mockResolvedValue({
    success: true,
    provider: 'gumroad',
    entitlementIds: ['ent_123'],
  });
});

describe('complete-license verification route', () => {
  it('forwards the creator lookup actor separately from the buyer link actor', async () => {
    const routes = createVerificationRoutes(testConfig);

    const response = await routes.completeLicenseVerification(
      new Request('https://api.example.com/api/verification/complete-license', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          apiSecret: 'api-secret',
          licenseKey: 'license_123',
          provider: 'gumroad',
          productId: 'product_123',
          creatorAuthUserId: 'creator_auth_user_123',
          buyerAuthUserId: 'buyer_auth_user_456',
          buyerSubjectId: 'buyer_subject_456',
        }),
      })
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      provider: 'gumroad',
      entitlementIds: ['ent_123'],
    });

    expect(handleCompleteLicenseMock).toHaveBeenCalledWith(testConfig, {
      licenseKey: 'license_123',
      provider: 'gumroad',
      productId: 'product_123',
      creatorAuthUserId: 'creator_auth_user_123',
      buyerAuthUserId: 'buyer_auth_user_456',
      buyerSubjectId: 'buyer_subject_456',
    });

    const forwardedBody = handleCompleteLicenseMock.mock.calls[0]?.[1];
    expect(forwardedBody).toBeDefined();
    expect(forwardedBody).not.toHaveProperty('authUserId');
    expect(forwardedBody).not.toHaveProperty('subjectId');
  });

  it('keeps the legacy single-actor contract only when split identities are absent', async () => {
    const routes = createVerificationRoutes(testConfig);

    await routes.completeLicenseVerification(
      new Request('https://api.example.com/api/verification/complete-license', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          apiSecret: 'api-secret',
          licenseKey: 'license_legacy',
          provider: 'gumroad',
          productId: 'product_legacy',
          authUserId: 'legacy_auth_user',
          subjectId: 'legacy_subject',
        }),
      })
    );

    expect(handleCompleteLicenseMock).toHaveBeenCalledWith(testConfig, {
      licenseKey: 'license_legacy',
      provider: 'gumroad',
      productId: 'product_legacy',
      authUserId: 'legacy_auth_user',
      subjectId: 'legacy_subject',
    });

    const forwardedBody = handleCompleteLicenseMock.mock.calls[0]?.[1];
    expect(forwardedBody).toBeDefined();
    expect(forwardedBody).not.toHaveProperty('creatorAuthUserId');
    expect(forwardedBody).not.toHaveProperty('buyerAuthUserId');
    expect(forwardedBody).not.toHaveProperty('buyerSubjectId');
  });
});
