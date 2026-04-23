import { afterEach, describe, expect, it, mock } from 'bun:test';
import {
  createPayhipLicenseVerification,
  createPayhipProviderModule,
} from '../../src/payhip/module';

const logger = {
  info: mock(() => {}),
  warn: mock(() => {}),
};

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const baseCtx = {
  convex: {
    query: mock(async () => {
      throw new Error('query not configured');
    }),
    mutation: mock(async () => {
      throw new Error('mutation not configured');
    }),
  },
  apiSecret: 'api-secret',
  authUserId: 'user-1',
  encryptionSecret: 'encryption-secret',
};

describe('createPayhipProviderModule', () => {
  it('maps stored product entries into provider product records', async () => {
    const module = createPayhipProviderModule({
      logger,
      async listProducts() {
        return [
          {
            permalink: 'RGsF',
            displayName: 'Starter Pack',
            productPermalink: undefined,
            hasSecretKey: true,
          },
        ];
      },
      async upsertProductName() {},
      async listProductSecretKeys() {
        return [];
      },
      async decryptProductSecretKey() {
        throw new Error('not used');
      },
      async verifyLicenseKey() {
        throw new Error('not used');
      },
    });

    const products = await module.fetchProducts(null, baseCtx);
    expect(products).toEqual([
      {
        id: 'RGsF',
        name: 'Starter Pack',
        productUrl: 'https://payhip.com/b/RGsF',
        hasSecretKey: true,
      },
    ]);
  });

  it('normalizes full Payhip URLs before backfilling product names for manual product credentials', async () => {
    let upserted:
      | {
          authUserId: string;
          permalink: string;
          displayName: string;
        }
      | undefined;

    globalThis.fetch = mock(async (url: string) => {
      const expectedTarget = encodeURIComponent('https://payhip.com/b/KZFw0');
      if (!url.includes(expectedTarget)) {
        return new Response('', { status: 404 });
      }

      return new Response(JSON.stringify({ meta: { title: 'Starter Pack' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as unknown as typeof fetch;

    const module = createPayhipProviderModule({
      logger,
      async listProducts() {
        return [];
      },
      async upsertProductName(input) {
        upserted = input;
      },
      async listProductSecretKeys() {
        return [];
      },
      async decryptProductSecretKey() {
        throw new Error('not used');
      },
      async verifyLicenseKey() {
        throw new Error('not used');
      },
    });

    await module.onProductCredentialAdded?.(
      'https://payhip.com/b/KZFw0?utm_source=creator',
      baseCtx
    );

    expect(upserted).toEqual({
      authUserId: 'user-1',
      permalink: 'KZFw0',
      displayName: 'Starter Pack',
    });
  });
});

describe('createPayhipLicenseVerification', () => {
  it('normalizes full Payhip URLs to canonical permalinks', async () => {
    const verification = createPayhipLicenseVerification({
      logger,
      async listProducts() {
        return [];
      },
      async upsertProductName() {},
      async listProductSecretKeys() {
        return [
          {
            permalink: 'https://payhip.com/b/KZFw0',
            encryptedSecretKey: 'enc-1',
          },
        ];
      },
      async decryptProductSecretKey() {
        return 'secret-key';
      },
      async verifyLicenseKey(_licenseKey, productKeys) {
        return {
          valid: true,
          matchedProductPermalink: productKeys[0]?.permalink,
        };
      },
    });

    const result = await verification.verifyLicense('TEST-KEY', undefined, 'user-1', baseCtx);

    expect(result).toEqual({
      valid: true,
      error: undefined,
      providerProductId: 'KZFw0',
    });
  });
});
