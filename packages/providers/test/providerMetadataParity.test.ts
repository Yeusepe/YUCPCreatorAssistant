import { describe, expect, it } from 'bun:test';
import {
  getProviderDescriptor as getSharedProviderDescriptor,
  CATALOG_SYNC_PROVIDER_KEYS as sharedCatalogSyncProviderKeys,
  PROVIDER_REGISTRY as sharedProviderRegistry,
} from '@yucp/shared/providers';
import {
  CATALOG_SYNC_PROVIDER_KEYS,
  getProviderDescriptor,
  PROVIDER_KEYS,
  PROVIDER_REGISTRY,
  PROVIDER_REGISTRY_BY_KEY,
} from '../src/providerMetadata';

describe('provider metadata parity', () => {
  it('matches the shared provider registry during cutover', () => {
    expect(PROVIDER_REGISTRY).toEqual(sharedProviderRegistry);
    expect(PROVIDER_KEYS).toEqual(sharedProviderRegistry.map((provider) => provider.providerKey));
    expect(CATALOG_SYNC_PROVIDER_KEYS).toEqual(sharedCatalogSyncProviderKeys);
  });

  it('resolves providers by key', () => {
    for (const provider of PROVIDER_REGISTRY) {
      expect(getProviderDescriptor(provider.providerKey)).toEqual(provider);
      expect(PROVIDER_REGISTRY_BY_KEY[provider.providerKey]).toEqual(provider);
      expect(getSharedProviderDescriptor(provider.providerKey)).toEqual(provider);
    }
  });
});
