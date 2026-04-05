import { describe, expect, it } from 'bun:test';
import {
  ALL_PROVIDER_RUNTIMES,
  getProviderHooks,
  getProviderRuntime,
  listConnectPlugins,
  PROVIDER_RUNTIMES,
  resolveWebhookPlugin,
} from './index';

const KNOWN_PROVIDERS = ['gumroad', 'jinxxy', 'lemonsqueezy', 'payhip', 'vrchat'] as const;

describe('ALL_PROVIDER_RUNTIMES', () => {
  it('contains an entry for every registered provider', () => {
    const ids = ALL_PROVIDER_RUNTIMES.map((runtime) => runtime.id);
    for (const providerId of KNOWN_PROVIDERS) {
      expect(ids).toContain(providerId);
    }
  });

  it('has the correct number of runtimes', () => {
    expect(ALL_PROVIDER_RUNTIMES.length).toBe(KNOWN_PROVIDERS.length);
  });

  it('is frozen (immutable)', () => {
    expect(Object.isFrozen(ALL_PROVIDER_RUNTIMES)).toBe(true);
  });

  it('each runtime has an id property matching its registration key', () => {
    for (const runtime of ALL_PROVIDER_RUNTIMES) {
      expect(typeof runtime.id).toBe('string');
      expect(runtime.id.length).toBeGreaterThan(0);
      expect(PROVIDER_RUNTIMES.get(runtime.id)).toBe(runtime);
    }
  });
});

describe('PROVIDER_RUNTIMES', () => {
  it('contains an entry for each known provider', () => {
    for (const providerId of KNOWN_PROVIDERS) {
      expect(PROVIDER_RUNTIMES.has(providerId)).toBe(true);
    }
  });

  it('each entry has an id matching the map key', () => {
    for (const [key, runtime] of PROVIDER_RUNTIMES.entries()) {
      expect(runtime.id).toBe(key);
    }
  });
});

describe('getProviderRuntime', () => {
  it('returns the runtime for a known provider', () => {
    const runtime = getProviderRuntime('gumroad');
    expect(runtime).toBeDefined();
    expect(runtime?.id).toBe('gumroad');
  });

  it('returns undefined for an unknown provider', () => {
    expect(getProviderRuntime('nonexistent_provider')).toBeUndefined();
  });

  it('returns undefined for an empty string', () => {
    expect(getProviderRuntime('')).toBeUndefined();
  });

  it('returns a runtime with getCredential function for needsCredential providers', () => {
    const runtime = getProviderRuntime('gumroad');
    // gumroad is a credential-requiring provider
    expect(runtime).toBeDefined();
    expect(typeof runtime?.getCredential).toBe('function');
  });

  it('returns runtimes for all known providers', () => {
    for (const providerId of KNOWN_PROVIDERS) {
      const runtime = getProviderRuntime(providerId);
      expect(runtime).toBeDefined();
      expect(runtime?.id).toBe(providerId);
    }
  });
});

describe('getProviderHooks', () => {
  it('returns hooks for a known provider', () => {
    const hooks = getProviderHooks('gumroad');
    expect(hooks).toBeDefined();
  });

  it('returns undefined for an unknown provider', () => {
    expect(getProviderHooks('unknown_provider')).toBeUndefined();
  });

  it('returns hooks objects for all known providers', () => {
    for (const providerId of KNOWN_PROVIDERS) {
      const hooks = getProviderHooks(providerId);
      expect(hooks).toBeDefined();
    }
  });
});

describe('listConnectPlugins', () => {
  it('returns an array', () => {
    const plugins = listConnectPlugins();
    expect(Array.isArray(plugins)).toBe(true);
  });

  it('returns only providers that have a connect plugin', () => {
    const plugins = listConnectPlugins();
    for (const plugin of plugins) {
      expect(typeof plugin.providerId).toBe('string');
      expect(plugin.providerId.length).toBeGreaterThan(0);
    }
  });

  it('returns plugins in ascending alphabetical order by providerId', () => {
    const plugins = listConnectPlugins();
    for (let i = 1; i < plugins.length; i++) {
      expect(plugins[i - 1].providerId.localeCompare(plugins[i].providerId)).toBeLessThanOrEqual(0);
    }
  });

  it('includes gumroad (which has an OAuth connect flow)', () => {
    const plugins = listConnectPlugins();
    const ids = plugins.map((p) => p.providerId);
    expect(ids).toContain('gumroad');
  });

  it('does not include duplicate provider IDs', () => {
    const plugins = listConnectPlugins();
    const ids = plugins.map((p) => p.providerId);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });
});

describe('resolveWebhookPlugin', () => {
  it('resolves a direct provider match', () => {
    const result = resolveWebhookPlugin('gumroad');
    expect(result).toBeDefined();
    expect(result?.providerId).toBe('gumroad');
    expect(typeof result?.webhook.handle).toBe('function');
  });

  it('returns undefined for an unknown provider URL', () => {
    const result = resolveWebhookPlugin('not_a_real_provider_xyz');
    expect(result).toBeUndefined();
  });

  it('returns an object with both providerId and webhook', () => {
    const result = resolveWebhookPlugin('jinxxy');
    if (result !== undefined) {
      expect(typeof result.providerId).toBe('string');
      expect(typeof result.webhook.handle).toBe('function');
    }
  });

  it('resolves jinxxy directly', () => {
    const result = resolveWebhookPlugin('jinxxy');
    expect(result).toBeDefined();
    expect(result?.providerId).toBe('jinxxy');
  });
});