import type { StructuredLogger } from '@yucp/shared';
import type {
  LicenseVerificationPlugin,
  ProductRecord,
  ProviderContext,
  ProviderPurposes,
  ProviderRuntimeClient,
  ProviderRuntimeModule,
} from '../contracts';
import {
  ProviderRateLimitError,
  parseRetryAfterMs,
  withProviderRateLimitRetries,
} from '../core/rateLimit';

export const GUMROAD_PURPOSES = {
  credential: 'gumroad-oauth-access-token',
  refreshToken: 'gumroad-oauth-refresh-token',
} as const satisfies ProviderPurposes;

export const GUMROAD_DISPLAY_META = {
  dashboardSetupExperience: 'automatic',
  dashboardSetupHint: 'OAuth redirect plus managed webhook setup can continue automatically.',
  label: 'Gumroad',
  icon: 'Gumorad.png',
  color: '#ff90e8',
  shadowColor: '#ff90e8',
  textColor: '#000000',
  connectedColor: '#e269c9',
  confettiColors: ['#ff90e8', '#e269c9', '#ff70d0', '#ffffff'],
  description: 'Marketplace',
  dashboardConnectPath: '/api/connect/gumroad/begin',
  dashboardConnectParamStyle: 'camelCase',
  dashboardIconBg: '#0f0f12',
  dashboardQuickStartBg: 'rgba(255,255,255,0.05)',
  dashboardQuickStartBorder: 'rgba(255,255,255,0.1)',
  dashboardServerTileHint: 'Allow users to verify Gumroad purchases in this Discord server.',
} as const;

const GUMROAD_API_BASE = 'https://api.gumroad.com/v2';
const GUMROAD_PRODUCTS_URL = `${GUMROAD_API_BASE}/products`;
const MAX_PRODUCTS = 5000;

type GumroadRuntimeLogger = Pick<StructuredLogger, 'warn'>;

type GumroadFetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface GumroadVerificationPorts {
  fetchImpl?: GumroadFetchLike;
}

export interface GumroadRuntimePorts<
  TClient extends ProviderRuntimeClient = ProviderRuntimeClient,
> {
  readonly logger: GumroadRuntimeLogger;
  getEncryptedCredential(ctx: ProviderContext<TClient>): Promise<string | null>;
  decryptCredential(encryptedCredential: string, ctx: ProviderContext<TClient>): Promise<string>;
  fetchImpl?: GumroadFetchLike;
}

export type GumroadProviderRuntime<TClient extends ProviderRuntimeClient = ProviderRuntimeClient> =
  Omit<ProviderRuntimeModule<never, TClient>, 'backfill' | 'buyerVerification'> & {
    readonly buyerVerification?: undefined;
  };

function getFetch(ports: GumroadVerificationPorts): GumroadFetchLike {
  return ports.fetchImpl ?? fetch;
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function listGumroadProducts(
  accessToken: string,
  ports: GumroadRuntimePorts
): Promise<ProductRecord[]> {
  const products: ProductRecord[] = [];
  let nextPageUrl: string | undefined = GUMROAD_PRODUCTS_URL;
  const fetchImpl = getFetch(ports);
  const seenPageUrls = new Set<string>();
  const seenCursors = new Set<string>();

  while (nextPageUrl && products.length < MAX_PRODUCTS) {
    const parsedUrl = normalizeGumroadProductsPageUrl(nextPageUrl, ports.logger);
    if (!parsedUrl) {
      break;
    }

    const normalizedUrl = parsedUrl.toString();
    if (seenPageUrls.has(normalizedUrl)) {
      ports.logger.warn('Ignoring Gumroad pagination link', {
        reason: 'repeated-link',
      });
      break;
    }

    const cursor = parsedUrl.searchParams.get('cursor');
    if (cursor && seenCursors.has(cursor)) {
      ports.logger.warn('Ignoring Gumroad pagination link', {
        reason: 'repeated-cursor',
      });
      break;
    }

    seenPageUrls.add(normalizedUrl);
    if (cursor) {
      seenCursors.add(cursor);
    }

    // Gumroad products API reference: https://gumroad.com/api#products
    const response = await withProviderRateLimitRetries({
      providerName: 'Gumroad',
      operation: async () => {
        const result = await fetchImpl(normalizedUrl, {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
        });

        if (result.status === 429) {
          throw new ProviderRateLimitError(
            'Gumroad',
            parseRetryAfterMs(result.headers.get('Retry-After'), 5_000)
          );
        }

        return result;
      },
      getRateLimitError: (error) => (error instanceof ProviderRateLimitError ? error : null),
      onRetry: ({ waitMs, retries }) => {
        ports.logger.warn('Gumroad rate limit fetching products', {
          waitMs,
          rateLimitRetries: retries + 1,
        });
      },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Gumroad API error: ${response.status} ${text}`);
    }

    const data = (await response.json()) as {
      success: boolean;
      products?: Array<{ id: string; name: string; short_url?: string }>;
      next_page_url?: string;
      message?: string;
    };

    if (!data.success) {
      throw new Error(data.message ?? 'Gumroad API returned an error');
    }

    for (const product of data.products ?? []) {
      if (product.id && product.name) {
        products.push({
          id: product.id,
          name: product.name,
          ...(product.short_url ? { productUrl: product.short_url } : {}),
        });
      }
    }

    nextPageUrl = data.next_page_url;
    if (!nextPageUrl || (data.products ?? []).length === 0) {
      break;
    }
  }

  return products;
}

function normalizeGumroadProductsPageUrl(rawUrl: string, logger: GumroadRuntimeLogger): URL | null {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(rawUrl, GUMROAD_PRODUCTS_URL);
  } catch {
    logger.warn('Ignoring Gumroad pagination link', {
      reason: 'invalid-url',
    });
    return null;
  }

  if (parsedUrl.origin !== new URL(GUMROAD_API_BASE).origin) {
    logger.warn('Ignoring Gumroad pagination link', {
      reason: 'unexpected-origin',
    });
    return null;
  }

  if (parsedUrl.pathname !== new URL(GUMROAD_PRODUCTS_URL).pathname) {
    logger.warn('Ignoring Gumroad pagination link', {
      reason: 'unexpected-path',
    });
    return null;
  }

  parsedUrl.searchParams.delete('access_token');
  return parsedUrl;
}

export async function verifyGumroadLicense(
  licenseKey: string,
  productId: string,
  ports: GumroadVerificationPorts
): Promise<{
  valid: boolean;
  externalOrderId?: string;
  providerUserId?: string;
  error?: string;
}> {
  const fetchImpl = getFetch(ports);

  // Gumroad licenses API reference: https://gumroad.com/api#licenses
  const response = await fetchImpl(`${GUMROAD_API_BASE}/licenses/verify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams({
      product_id: productId,
      license_key: licenseKey,
    }).toString(),
  });

  const data = (await response.json()) as {
    success: boolean;
    message?: string;
    purchase?: {
      email?: string;
      sale_id?: string;
    };
  };

  if (!response.ok || !data.success) {
    return {
      valid: false,
      error: data.message ?? `HTTP ${response.status}`,
    };
  }

  return {
    valid: true,
    externalOrderId: data.purchase?.sale_id ?? undefined,
    providerUserId: data.purchase?.email ? await sha256Hex(data.purchase.email) : undefined,
  };
}

export function createGumroadLicenseVerification<
  TClient extends ProviderRuntimeClient = ProviderRuntimeClient,
>(ports: GumroadVerificationPorts): LicenseVerificationPlugin<TClient> {
  return {
    async verifyLicense(licenseKey, productId) {
      if (!productId) {
        return { valid: false, error: 'Product ID is required for Gumroad verification' };
      }

      return await verifyGumroadLicense(licenseKey, productId, ports);
    },
  };
}

export function createGumroadProviderModule<
  TClient extends ProviderRuntimeClient = ProviderRuntimeClient,
>(ports: GumroadRuntimePorts<TClient>): GumroadProviderRuntime<TClient> {
  return {
    id: 'gumroad',
    needsCredential: true,
    purposes: GUMROAD_PURPOSES,
    displayMeta: GUMROAD_DISPLAY_META,
    async getCredential(ctx) {
      const encryptedToken = await ports.getEncryptedCredential(ctx);
      if (!encryptedToken) {
        return null;
      }
      return await ports.decryptCredential(encryptedToken, ctx);
    },
    async fetchProducts(credential) {
      if (!credential) {
        return [];
      }

      return await listGumroadProducts(credential, ports);
    },
    verification: createGumroadLicenseVerification(ports),
  };
}
