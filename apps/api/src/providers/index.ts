/**
 * Provider registry
 *
 * This remains a temporary API-side composition root while provider runtime
 * modules are still being cut over into @yucp/providers. Keep the registry
 * keyed by provider id so imports, runtime ids, and dispatch stay aligned.
 */

import type { ProviderKey } from '@yucp/providers/types';
import gumroad from './gumroad/index';
import jinxxy from './jinxxy/index';
import lemonsqueezy from './lemonsqueezy/index';
import payhip from './payhip/index';
import type { ProviderPlugin } from './types';
import vrchat from './vrchat/index';

function defineProviderRegistry<TRegistry extends Partial<Record<ProviderKey, ProviderPlugin>>>(
  registry: TRegistry
): TRegistry {
  for (const [providerKey, provider] of Object.entries(registry)) {
    if (provider.id !== providerKey) {
      throw new Error(
        `Provider registry key "${providerKey}" does not match plugin id "${provider.id}"`
      );
    }
  }
  return registry;
}

const PROVIDER_PLUGINS = defineProviderRegistry({
  gumroad,
  jinxxy,
  lemonsqueezy,
  payhip,
  vrchat,
});

const ALL_PROVIDERS = Object.freeze(Object.values(PROVIDER_PLUGINS));

export { ALL_PROVIDERS };

export const PROVIDERS: ReadonlyMap<string, ProviderPlugin> = new Map(
  Object.entries(PROVIDER_PLUGINS).map(([providerKey, provider]) => [providerKey, provider])
);

export function getProvider(id: string): ProviderPlugin | undefined {
  return PROVIDERS.get(id);
}
