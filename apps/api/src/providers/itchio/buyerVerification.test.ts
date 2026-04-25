import { afterAll, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import type { BuyerVerificationCapabilityDescriptor } from '../../providers/types';

const resolveBuyerVerificationStoreContextMock = mock(async () => ({
  ok: true as const,
  creatorAuthUserId: 'creator_auth_user_123',
  creatorProductId: 'creator_product_123',
  displayName: 'Creator Product',
}));
const createManualLicenseCapabilityMock = mock(
  (providerId: string): BuyerVerificationCapabilityDescriptor => ({
    methodKind: 'manual_license',
    completion: 'immediate',
    actionLabel: 'Verify license',
    defaultTitle: `${providerId} license`,
    defaultDescription: `${providerId} description`,
    input: {
      kind: 'license_key',
      label: 'License Key',
      masked: true,
      submitLabel: 'Verify license',
    },
  })
);
const decryptMock = mock(async () => 'creator-access-token');
const verifyItchioDownloadKeyMock = mock(async () => ({
  valid: true,
}));

const apiMock = {
  providerConnections: {
    getConnectionForBackfill: 'providerConnections.getConnectionForBackfill',
  },
} as const;

mock.module('@yucp/providers/itchio/module', () => ({
  ITCHIO_PURPOSES: {
    credential: 'itchio-oauth-access-token',
  },
  verifyItchioDownloadKey: verifyItchioDownloadKeyMock,
}));

mock.module('../../../../../convex/_generated/api', () => ({
  api: apiMock,
  internal: {},
  components: {},
}));

mock.module('../../lib/encrypt', () => ({
  decrypt: decryptMock,
}));

const buyerVerificationHelpersModule = await import('../../verification/buyerVerificationHelpers');
spyOn(buyerVerificationHelpersModule, 'createManualLicenseCapability').mockImplementation(
  createManualLicenseCapabilityMock
);
spyOn(buyerVerificationHelpersModule, 'resolveBuyerVerificationStoreContext').mockImplementation(
  resolveBuyerVerificationStoreContextMock
);

const { buyerVerification } = await import('./buyerVerification');

afterAll(() => {
  mock.restore();
});

beforeEach(() => {
  resolveBuyerVerificationStoreContextMock.mockReset();
  resolveBuyerVerificationStoreContextMock.mockResolvedValue({
    ok: true,
    creatorAuthUserId: 'creator_auth_user_123',
    creatorProductId: 'creator_product_123',
    displayName: 'Creator Product',
  });
  createManualLicenseCapabilityMock.mockClear();
  decryptMock.mockReset();
  decryptMock.mockResolvedValue('creator-access-token');
  verifyItchioDownloadKeyMock.mockReset();
  verifyItchioDownloadKeyMock.mockResolvedValue({
    valid: true,
  });
});

describe('itch.io buyer verification adapter', () => {
  it('loads creator-owned credentials from the resolved store context before verifying buyer proof', async () => {
    const queryMock = mock(async () => ({
      credentials: {
        oauth_access_token: 'encrypted-creator-token',
      },
    }));

    const result = await buyerVerification.verify(
      {
        methodKind: 'manual_license',
        packageId: 'package_123',
        providerProductRef: 'itch-product-123',
        licenseKey: 'download-key-123',
      } as never,
      {
        convex: {
          query: queryMock,
        },
        apiSecret: 'api-secret',
        encryptionSecret: 'encrypt-secret',
      } as never
    );

    expect(result).toEqual({ success: true });
    expect(resolveBuyerVerificationStoreContextMock).toHaveBeenCalledWith(
      {
        providerId: 'itchio',
        packageId: 'package_123',
        providerProductRef: 'itch-product-123',
      },
      expect.anything()
    );
    expect(queryMock).toHaveBeenCalledWith(apiMock.providerConnections.getConnectionForBackfill, {
      apiSecret: 'api-secret',
      authUserId: 'creator_auth_user_123',
      provider: 'itchio',
    });
    expect(decryptMock).toHaveBeenCalledWith(
      'encrypted-creator-token',
      'encrypt-secret',
      'itchio-oauth-access-token'
    );
    expect(verifyItchioDownloadKeyMock).toHaveBeenCalledWith(
      'download-key-123',
      'itch-product-123',
      'creator-access-token',
      {}
    );
  });
});
