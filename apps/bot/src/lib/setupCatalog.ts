import { providerLabel } from '@yucp/providers/providerMetadata';
import type { ProviderKey } from '@yucp/providers/types';

export type SetupCatalogProduct = {
  id: string;
  name: string;
  provider: ProviderKey;
  productUrl?: string;
};

export type SetupCatalogProviderResult = {
  provider: ProviderKey;
  products: Array<{ id: string; name: string; productUrl?: string }>;
  error?: string;
};

export type SetupCatalogSummary = {
  products: SetupCatalogProduct[];
  sessionExpiredProviders: ProviderKey[];
  providerErrors: Array<{ provider: ProviderKey; error: string }>;
};

export function summarizeSetupCatalogResults(
  results: SetupCatalogProviderResult[]
): SetupCatalogSummary {
  const seen = new Set<string>();
  const products: SetupCatalogProduct[] = [];
  const sessionExpiredProviders: ProviderKey[] = [];
  const providerErrors: Array<{ provider: ProviderKey; error: string }> = [];

  for (const result of results) {
    if (result.error) {
      providerErrors.push({ provider: result.provider, error: result.error });
      if (result.error === 'session_expired') {
        sessionExpiredProviders.push(result.provider);
      }
    }

    for (const product of result.products) {
      const key = `${result.provider}:${product.id}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      products.push({
        id: product.id,
        name: product.name,
        provider: result.provider,
        productUrl: product.productUrl,
      });
    }
  }

  return {
    products,
    sessionExpiredProviders,
    providerErrors,
  };
}

function formatProviderLabels(providers: ProviderKey[]): string {
  const labels = providers.map((provider) => providerLabel(provider));
  if (labels.length <= 1) {
    return labels[0] ?? 'your store';
  }
  if (labels.length === 2) {
    return `${labels[0]} and ${labels[1]}`;
  }
  return `${labels.slice(0, -1).join(', ')}, and ${labels.at(-1)}`;
}

export function buildMigrationEmptyCatalogReason(summary: SetupCatalogSummary): string {
  if (summary.sessionExpiredProviders.length > 0) {
    const providers = formatProviderLabels(summary.sessionExpiredProviders);
    const noun = summary.sessionExpiredProviders.length === 1 ? 'store session' : 'store sessions';
    return `YUCP could not read products from ${providers} because the ${noun} expired. Reconnect ${summary.sessionExpiredProviders.length === 1 ? 'that store' : 'those stores'}, then run migration again.`;
  }

  return 'YUCP did not find any active products it could analyze. If your stores are already connected, reconnect them and try migration again.';
}

export function buildMigrationEmptyCatalogEventMessage(summary: SetupCatalogSummary): string {
  if (summary.sessionExpiredProviders.length > 0) {
    const providers = formatProviderLabels(summary.sessionExpiredProviders);
    return `Migration analysis could not read products because the connection expired for ${providers}.`;
  }

  return 'Migration analysis completed, but no active store products were available to map.';
}
