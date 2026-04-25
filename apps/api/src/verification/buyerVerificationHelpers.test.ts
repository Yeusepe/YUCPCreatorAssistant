import { describe, expect, it, mock } from 'bun:test';

mock.module('../../../../convex/_generated/api', () => ({
  api: {
    yucpLicenses: {
      lookupProductByProviderRef: 'yucpLicenses.lookupProductByProviderRef',
    },
    packageRegistry: {
      lookupRegistration: 'packageRegistry.lookupRegistration',
    },
  },
  components: {},
  internal: {
    yucpLicenses: {
      getProductByProviderRef: 'yucpLicenses.getProductByProviderRef',
    },
    packageRegistry: {
      getRegistration: 'packageRegistry.getRegistration',
    },
  },
}));

const { resolveBuyerVerificationStoreContext } = await import('./buyerVerificationHelpers');

describe('resolveBuyerVerificationStoreContext', () => {
  it('returns the creator-owned store context for buyer verification', async () => {
    const queryMock = mock(async (_ref: unknown, args: unknown) => {
      if ((args as { providerProductRef?: string }).providerProductRef === 'gumroad-product-1') {
        return {
          authUserId: 'creator_auth_user_123',
          productId: 'creator_product_123',
          displayName: 'Creator Product',
        };
      }

      return {
        yucpUserId: 'creator_auth_user_123',
      };
    });

    const result = await resolveBuyerVerificationStoreContext(
      {
        providerId: 'gumroad',
        packageId: 'package_123',
        providerProductRef: 'gumroad-product-1',
      },
      {
        convex: {
          query: queryMock,
        },
        apiSecret: 'api-secret',
      } as never
    );

    expect(result).toEqual({
      ok: true,
      creatorAuthUserId: 'creator_auth_user_123',
      creatorProductId: 'creator_product_123',
      displayName: 'Creator Product',
    });
    expect(queryMock).toHaveBeenNthCalledWith(
      1,
      'yucpLicenses.lookupProductByProviderRef',
      expect.objectContaining({
        apiSecret: 'api-secret',
        provider: 'gumroad',
        providerProductRef: 'gumroad-product-1',
      })
    );
    expect(queryMock).toHaveBeenNthCalledWith(
      2,
      'packageRegistry.lookupRegistration',
      expect.objectContaining({
        apiSecret: 'api-secret',
        packageId: 'package_123',
      })
    );
  });

  it('rejects buyer verification when the package points at a different creator store', async () => {
    const queryMock = mock(async (_ref: unknown, args: unknown) => {
      if ((args as { providerProductRef?: string }).providerProductRef === 'gumroad-product-2') {
        return {
          authUserId: 'creator_auth_user_A',
          productId: 'creator_product_A',
          displayName: 'Creator Product A',
        };
      }

      return {
        yucpUserId: 'creator_auth_user_B',
      };
    });

    const result = await resolveBuyerVerificationStoreContext(
      {
        providerId: 'gumroad',
        packageId: 'package_456',
        providerProductRef: 'gumroad-product-2',
      },
      {
        convex: {
          query: queryMock,
        },
        apiSecret: 'api-secret',
      } as never
    );

    expect(result).toEqual({
      ok: false,
      result: {
        success: false,
        errorCode: 'creator_store_mismatch',
        errorMessage:
          'This verification method points at a different creator store than the package being redeemed.',
      },
    });
    expect(queryMock).toHaveBeenCalledTimes(2);
  });
});
