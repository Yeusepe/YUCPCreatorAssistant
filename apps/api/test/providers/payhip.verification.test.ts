/**
 * Payhip verification plugin — unit tests
 *
 * The key invariant: `verification.verifyLicense` must always return a
 * canonical `providerProductId` (the short permalink code, e.g. "KZFw0"),
 * regardless of how the credential key was stored.
 *
 * Bug scenario: if the creator added their product-secret-key before the
 * URL-normalization fix, the credential key was stored as
 * `product_key:https://payhip.com/b/KZFw0`. The `getPayhipProductSecretKeys`
 * query returns the raw suffix as `permalink`. Without normalization in the
 * verification plugin this full URL gets returned as `providerProductId`,
 * which then doesn't match the product-role rule that has `KZFw0` — so no
 * roles are granted.
 */

import { afterEach, describe, expect, it, mock } from 'bun:test';
import type { ProviderContext } from '../../src/providers/types';

// ---------------------------------------------------------------------------
// Mock @yucp/providers BEFORE importing the plugin under test
// ---------------------------------------------------------------------------

const MOCK_DATA = {
  enabled: true,
  product_link: 'KZFw0',
  license_key: 'TEST-KEY',
  buyer_email: 'test@example.com',
  uses: 1,
  date: '2026-01-01T00:00:00.000Z',
} as const;

const mockVerifyLicenseKey = mock(
  async (_licenseKey: string, productKeys: Array<{ permalink: string }>) => {
    // Simulate a successful verify: return the first key as matchedProductPermalink
    const first = productKeys[0];
    if (!first) return { valid: false as const };
    return {
      valid: true as const,
      matchedProductPermalink: first.permalink,
      data: MOCK_DATA,
    };
  }
);

mock.module('@yucp/providers', () => {
  class MockPayhipAdapter {
    verifyLicenseKey = mockVerifyLicenseKey;
  }
  return { PayhipAdapter: MockPayhipAdapter };
});

// Mock the decrypt function so any "encrypted" string decrypts to a fixed secret
mock.module('../../src/lib/encrypt', () => ({
  decrypt: async (_encrypted: string, _secret: string, _purpose: string) =>
    'product-secret-key-value',
  encrypt: async (value: string) => `encrypted:${value}`,
}));

// ---------------------------------------------------------------------------
// Now import the plugin under test (AFTER mocks are set up)
// ---------------------------------------------------------------------------

import { verification } from '../../src/providers/payhip/verification';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConvexWithKeys(keys: Array<{ permalink: string }>) {
  return {
    query: mock(async () =>
      keys.map((k) => ({
        permalink: k.permalink,
        encryptedSecretKey: `encrypted-secret-for-${k.permalink}`,
      }))
    ),
    mutation: mock(async () => ({})),
    action: mock(async () => ({})),
  };
}

const BASE_CTX = {
  apiSecret: 'test-api-secret',
  authUserId: 'test-user-id',
  encryptionSecret: 'test-encryption-secret',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

afterEach(() => {
  mockVerifyLicenseKey.mockReset();
});

describe('payhip verification plugin — providerProductId normalization', () => {
  it('returns the short permalink when credential was stored as a raw permalink', async () => {
    mockVerifyLicenseKey.mockImplementation(async (_licenseKey, productKeys) => ({
      valid: true as const,
      matchedProductPermalink: productKeys[0]?.permalink ?? '',
      data: MOCK_DATA,
    }));

    const ctx = { ...BASE_CTX, convex: makeConvexWithKeys([{ permalink: 'KZFw0' }]) };
    const result = await verification.verifyLicense(
      'TEST-KEY',
      undefined,
      'test-user-id',
      ctx as unknown as ProviderContext
    );

    expect(result?.valid).toBe(true);
    expect(result?.providerProductId).toBe('KZFw0');
  });

  it('normalizes providerProductId when credential was stored as a full Payhip URL', async () => {
    // This is the bug scenario: old credential stored as full URL
    mockVerifyLicenseKey.mockImplementation(async (_licenseKey, productKeys) => ({
      valid: true as const,
      matchedProductPermalink: productKeys[0]?.permalink ?? '',
      data: MOCK_DATA,
    }));

    const ctx = {
      ...BASE_CTX,
      convex: makeConvexWithKeys([{ permalink: 'https://payhip.com/b/KZFw0' }]),
    };
    const result = await verification.verifyLicense(
      'TEST-KEY',
      undefined,
      'test-user-id',
      ctx as unknown as ProviderContext
    );

    expect(result?.valid).toBe(true);
    // Must be the canonical permalink, not the full URL
    expect(result?.providerProductId).toBe('KZFw0');
  });

  it('normalizes providerProductId for any valid Payhip URL format', async () => {
    mockVerifyLicenseKey.mockImplementation(async (_licenseKey, productKeys) => ({
      valid: true as const,
      matchedProductPermalink: productKeys[0]?.permalink ?? '',
      data: MOCK_DATA,
    }));

    const ctx = {
      ...BASE_CTX,
      convex: makeConvexWithKeys([{ permalink: 'https://payhip.com/b/RGsF' }]),
    };
    const result = await verification.verifyLicense(
      'TEST-KEY',
      undefined,
      'test-user-id',
      ctx as unknown as ProviderContext
    );

    expect(result?.valid).toBe(true);
    expect(result?.providerProductId).toBe('RGsF');
  });

  it('preserves the original value when it cannot be parsed as a Payhip URL or permalink', async () => {
    // If something truly unparseable is in the DB, don't silently drop it
    mockVerifyLicenseKey.mockImplementation(async (_licenseKey, productKeys) => ({
      valid: true as const,
      matchedProductPermalink: productKeys[0]?.permalink ?? '',
      data: MOCK_DATA,
    }));

    const ctx = {
      ...BASE_CTX,
      convex: makeConvexWithKeys([{ permalink: 'some-weird-unparseable-value!!!' }]),
    };
    const result = await verification.verifyLicense(
      'TEST-KEY',
      undefined,
      'test-user-id',
      ctx as unknown as ProviderContext
    );

    expect(result?.valid).toBe(true);
    // Falls back to the raw value rather than silently returning undefined
    expect(result?.providerProductId).toBe('some-weird-unparseable-value!!!');
  });

  it('returns invalid result when no keys are configured', async () => {
    const ctx = { ...BASE_CTX, convex: makeConvexWithKeys([]) };
    const result = await verification.verifyLicense(
      'TEST-KEY',
      undefined,
      'test-user-id',
      ctx as unknown as ProviderContext
    );

    expect(result?.valid).toBe(false);
  });
});
