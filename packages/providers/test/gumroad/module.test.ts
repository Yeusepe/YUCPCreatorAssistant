import { describe, expect, it } from 'bun:test';
import type { ProviderContext, ProviderRuntimeClient } from '../../src/contracts';
import {
  createGumroadLicenseVerification,
  createGumroadProviderModule,
} from '../../src/gumroad/module';

function makeCtx(): ProviderContext<ProviderRuntimeClient> {
  return {
    convex: {
      query: async <_QueryRef, _Args, Result>() => null as Result,
      mutation: async <_MutationRef, _Args, Result>() => null as Result,
    },
    apiSecret: 'api-secret',
    authUserId: 'user-1',
    encryptionSecret: 'enc-secret',
  };
}

const logger = {
  warn() {},
};

describe('createGumroadProviderModule', () => {
  it('fetches paginated products and strips access_token from next_page_url', async () => {
    const seenUrls: string[] = [];
    const module = createGumroadProviderModule({
      logger,
      async getEncryptedCredential() {
        return 'encrypted-token';
      },
      async decryptCredential() {
        return 'access-token';
      },
      async fetchImpl(input) {
        const url = String(input);
        seenUrls.push(url);
        if (url.includes('page=2')) {
          return new Response(
            JSON.stringify({
              success: true,
              products: [{ id: 'p2', name: 'Product 2' }],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return new Response(
          JSON.stringify({
            success: true,
            products: [{ id: 'p1', name: 'Product 1' }],
            next_page_url: 'https://api.gumroad.com/v2/products?page=2&access_token=leak',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      },
    });

    await expect(module.fetchProducts('access-token', makeCtx())).resolves.toEqual([
      { id: 'p1', name: 'Product 1' },
      { id: 'p2', name: 'Product 2' },
    ]);
    expect(seenUrls).toEqual([
      'https://api.gumroad.com/v2/products',
      'https://api.gumroad.com/v2/products?page=2',
    ]);
  });

  it('resolves relative next_page_url values against the Gumroad products endpoint', async () => {
    const seenUrls: string[] = [];
    const module = createGumroadProviderModule({
      logger,
      async getEncryptedCredential() {
        return 'encrypted-token';
      },
      async decryptCredential() {
        return 'access-token';
      },
      async fetchImpl(input) {
        const url = String(input);
        seenUrls.push(url);
        if (url.includes('page=2')) {
          return new Response(
            JSON.stringify({
              success: true,
              products: [{ id: 'p2', name: 'Product 2' }],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return new Response(
          JSON.stringify({
            success: true,
            products: [{ id: 'p1', name: 'Product 1' }],
            next_page_url: '/v2/products?page=2&access_token=leak',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      },
    });

    await expect(module.fetchProducts('access-token', makeCtx())).resolves.toEqual([
      { id: 'p1', name: 'Product 1' },
      { id: 'p2', name: 'Product 2' },
    ]);
    expect(seenUrls).toEqual([
      'https://api.gumroad.com/v2/products',
      'https://api.gumroad.com/v2/products?page=2',
    ]);
  });

  it('stops pagination when Gumroad returns an unsafe next_page_url', async () => {
    const seenUrls: string[] = [];
    const warnCalls: Array<{ message: string; meta?: Record<string, unknown> }> = [];
    const module = createGumroadProviderModule({
      logger: {
        warn(message, meta) {
          warnCalls.push({ message, meta });
        },
      },
      async getEncryptedCredential() {
        return 'encrypted-token';
      },
      async decryptCredential() {
        return 'access-token';
      },
      async fetchImpl(input) {
        const url = String(input);
        seenUrls.push(url);
        return new Response(
          JSON.stringify({
            success: true,
            products: [{ id: 'p1', name: 'Product 1' }],
            next_page_url: 'https://evil.example/products?page=2&access_token=leak',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      },
    });

    await expect(module.fetchProducts('access-token', makeCtx())).resolves.toEqual([
      { id: 'p1', name: 'Product 1' },
    ]);
    expect(seenUrls).toEqual(['https://api.gumroad.com/v2/products']);
    expect(warnCalls).toHaveLength(1);
    expect(warnCalls[0]).toMatchObject({
      message: 'Ignoring Gumroad pagination link',
      meta: { reason: 'unexpected-origin' },
    });
  });

  it('stops pagination when Gumroad repeats the next_page_url', async () => {
    const seenUrls: string[] = [];
    const warnCalls: Array<{ message: string; meta?: Record<string, unknown> }> = [];
    const module = createGumroadProviderModule({
      logger: {
        warn(message, meta) {
          warnCalls.push({ message, meta });
        },
      },
      async getEncryptedCredential() {
        return 'encrypted-token';
      },
      async decryptCredential() {
        return 'access-token';
      },
      async fetchImpl(input) {
        const url = String(input);
        seenUrls.push(url);
        if (url.includes('page=2')) {
          return new Response(
            JSON.stringify({
              success: true,
              products: [{ id: 'p2', name: 'Product 2' }],
              next_page_url: 'https://api.gumroad.com/v2/products?page=2&access_token=rotated',
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return new Response(
          JSON.stringify({
            success: true,
            products: [{ id: 'p1', name: 'Product 1' }],
            next_page_url: 'https://api.gumroad.com/v2/products?page=2&access_token=leak',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      },
    });

    await expect(module.fetchProducts('access-token', makeCtx())).resolves.toEqual([
      { id: 'p1', name: 'Product 1' },
      { id: 'p2', name: 'Product 2' },
    ]);
    expect(seenUrls).toEqual([
      'https://api.gumroad.com/v2/products',
      'https://api.gumroad.com/v2/products?page=2',
    ]);
    expect(warnCalls).toHaveLength(1);
    expect(warnCalls[0]).toMatchObject({
      message: 'Ignoring Gumroad pagination link',
      meta: { reason: 'repeated-link' },
    });
  });

  it('stops pagination when Gumroad repeats the cursor in the next_page_url', async () => {
    const seenUrls: string[] = [];
    const warnCalls: Array<{ message: string; meta?: Record<string, unknown> }> = [];
    const module = createGumroadProviderModule({
      logger: {
        warn(message, meta) {
          warnCalls.push({ message, meta });
        },
      },
      async getEncryptedCredential() {
        return 'encrypted-token';
      },
      async decryptCredential() {
        return 'access-token';
      },
      async fetchImpl(input) {
        const url = String(input);
        seenUrls.push(url);
        if (url.includes('page=2')) {
          return new Response(
            JSON.stringify({
              success: true,
              products: [{ id: 'p2', name: 'Product 2' }],
              next_page_url: 'https://api.gumroad.com/v2/products?page=3&cursor=cursor-1',
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return new Response(
          JSON.stringify({
            success: true,
            products: [{ id: 'p1', name: 'Product 1' }],
            next_page_url: 'https://api.gumroad.com/v2/products?page=2&cursor=cursor-1',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      },
    });

    await expect(module.fetchProducts('access-token', makeCtx())).resolves.toEqual([
      { id: 'p1', name: 'Product 1' },
      { id: 'p2', name: 'Product 2' },
    ]);
    expect(seenUrls).toEqual([
      'https://api.gumroad.com/v2/products',
      'https://api.gumroad.com/v2/products?page=2&cursor=cursor-1',
    ]);
    expect(warnCalls).toHaveLength(1);
    expect(warnCalls[0]).toMatchObject({
      message: 'Ignoring Gumroad pagination link',
      meta: { reason: 'repeated-cursor' },
    });
  });
});

describe('createGumroadLicenseVerification', () => {
  it('maps Gumroad verification output into provider verification output', async () => {
    const verification = createGumroadLicenseVerification({
      async fetchImpl() {
        return new Response(
          JSON.stringify({
            success: true,
            purchase: {
              email: 'buyer@example.com',
              sale_id: 'sale-1',
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      },
    });

    const result = await verification.verifyLicense('KEY', 'product-1', 'user-1', makeCtx());
    expect(result).toEqual({
      valid: true,
      externalOrderId: 'sale-1',
      providerUserId: '6a6c26195c3682faa816966af789717c3bfa834eee6c599d667d2b3429c27cfd',
    });
  });
});
