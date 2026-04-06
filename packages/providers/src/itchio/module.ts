import type { StructuredLogger } from '@yucp/shared';
import {
  CredentialExpiredError,
  type LicenseVerificationPlugin,
  type ProductRecord,
  type ProviderContext,
  type ProviderPurposes,
  type ProviderRuntimeClient,
  type ProviderRuntimeModule,
} from '../contracts';

export const ITCHIO_PURPOSES = {
  credential: 'itchio-oauth-access-token',
} as const satisfies ProviderPurposes;

export const ITCHIO_DISPLAY_META = {
  label: 'itch.io',
  icon: 'ItchIo.png',
  color: '#fa5c5c',
  shadowColor: '#fa5c5c',
  textColor: '#ffffff',
  connectedColor: '#d94b4b',
  confettiColors: ['#fa5c5c', '#d94b4b', '#ffd5d5', '#ffffff'],
  description: 'Marketplace',
  dashboardConnectPath: '/api/connect/itchio/begin',
  dashboardConnectParamStyle: 'snakeCase',
  dashboardIconBg: '#fa5c5c',
  dashboardQuickStartBg: 'rgba(250,92,92,0.12)',
  dashboardQuickStartBorder: 'rgba(250,92,92,0.32)',
  dashboardServerTileHint: 'Allow users to verify itch.io download keys in this Discord server.',
} as const;

const ITCHIO_SERVER_API_BASE = 'https://itch.io/api/1/key';

type ItchioRuntimeLogger = Pick<StructuredLogger, 'warn'>;
type ItchioFetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface ItchioCredentialsInfo {
  scopes?: string[];
  expires_at?: string;
}

export interface ItchioCurrentUser {
  id: string;
  username?: string;
  displayName?: string;
  profileUrl?: string;
}

export interface ItchioRuntimePorts<TClient extends ProviderRuntimeClient = ProviderRuntimeClient> {
  readonly logger: ItchioRuntimeLogger;
  getEncryptedCredential(authUserId: string, ctx: ProviderContext<TClient>): Promise<string | null>;
  decryptCredential(encryptedCredential: string, ctx: ProviderContext<TClient>): Promise<string>;
  fetchImpl?: ItchioFetchLike;
}

export type ItchioProviderRuntime<TClient extends ProviderRuntimeClient = ProviderRuntimeClient> =
  Omit<ProviderRuntimeModule<never, TClient>, 'backfill' | 'buyerVerification'> & {
    readonly buyerVerification?: undefined;
  };

function getFetch(ports: Pick<ItchioRuntimePorts, 'fetchImpl'>): ItchioFetchLike {
  return ports.fetchImpl ?? fetch;
}

function buildItchioApiUrl(path: string, searchParams?: Record<string, string>): string {
  const url = new URL(`${ITCHIO_SERVER_API_BASE}${path}`);
  for (const [key, value] of Object.entries(searchParams ?? {})) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

function extractItchioError(data: { errors?: string[] }, status: number): string {
  return data.errors?.[0] ?? `itch.io API error: HTTP ${status}`;
}

async function readItchioJson<T extends { errors?: string[] }>(
  response: Response,
  options: { treatUnauthorizedAsExpired?: boolean } = {}
): Promise<T> {
  if (response.status === 401 && options.treatUnauthorizedAsExpired) {
    throw new CredentialExpiredError('itchio');
  }

  const data = (await response.json()) as T;
  if (!response.ok) {
    throw new Error(extractItchioError(data, response.status));
  }
  return data;
}

export function itchioScopeSatisfied(
  grantedScopes: readonly string[],
  requiredScope: string
): boolean {
  return grantedScopes.some(
    (grantedScope) => grantedScope === requiredScope || requiredScope.startsWith(`${grantedScope}:`)
  );
}

export async function fetchItchioCredentialsInfo(
  accessToken: string,
  ports: Pick<ItchioRuntimePorts, 'fetchImpl'> = {}
): Promise<ItchioCredentialsInfo> {
  // itch.io OAuth and server-side API docs:
  // https://itch.io/docs/api/oauth
  // https://itch.io/docs/api/serverside#reference/httpsitchioapi1keycredentialsinfo
  const response = await getFetch(ports)(buildItchioApiUrl('/credentials/info'), {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
  });

  return await readItchioJson<ItchioCredentialsInfo & { errors?: string[] }>(response, {
    treatUnauthorizedAsExpired: true,
  });
}

export async function fetchItchioCurrentUser(
  accessToken: string,
  ports: Pick<ItchioRuntimePorts, 'fetchImpl'> = {}
): Promise<ItchioCurrentUser> {
  // itch.io server-side API docs:
  // https://itch.io/docs/api/serverside#reference/profileme-httpsitchioapi1keyme
  const response = await getFetch(ports)(buildItchioApiUrl('/me'), {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const data = await readItchioJson<{
    errors?: string[];
    user?: {
      id?: number;
      username?: string;
      display_name?: string;
      url?: string;
    };
  }>(response, { treatUnauthorizedAsExpired: true });

  const userId = data.user?.id;
  if (userId == null) {
    throw new Error('itch.io API response did not include a user id');
  }

  return {
    id: String(userId),
    username: data.user?.username,
    displayName: data.user?.display_name,
    profileUrl: data.user?.url,
  };
}

async function listItchioGames(
  accessToken: string,
  ports: Pick<ItchioRuntimePorts, 'fetchImpl'>
): Promise<ProductRecord[]> {
  // itch.io server-side API docs:
  // https://itch.io/docs/api/serverside#reference/profilegames-httpsitchioapi1keymy-games
  const response = await getFetch(ports)(buildItchioApiUrl('/my-games'), {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const data = await readItchioJson<{
    errors?: string[];
    games?: Array<{
      id?: number;
      title?: string;
      url?: string;
      published?: boolean;
    }>;
  }>(response, { treatUnauthorizedAsExpired: true });

  return (data.games ?? [])
    .filter((game): game is NonNullable<typeof game> & { id: number } => game?.id != null)
    .map((game) => ({
      id: String(game.id),
      name: game.title,
      productUrl: game.url,
      published: game.published ?? false,
    }));
}

export async function verifyItchioDownloadKey(
  downloadKey: string,
  gameId: string,
  accessToken: string,
  ports: Pick<ItchioRuntimePorts, 'fetchImpl'> = {}
): Promise<{
  valid: boolean;
  externalOrderId?: string;
  providerProductId?: string;
  providerUserId?: string;
  error?: string;
}> {
  // itch.io server-side API docs:
  // https://itch.io/docs/api/serverside#reference/gameviewpurchases-httpsitchioapi1keygamegame-iddownload-keys
  const response = await getFetch(ports)(
    buildItchioApiUrl(`/game/${encodeURIComponent(gameId)}/download_keys`, {
      download_key: downloadKey,
    }),
    {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  const data = (await response.json()) as {
    errors?: string[];
    download_key?: {
      id?: number;
      game_id?: number;
      owner?: { id?: number };
    };
  };

  if (response.status === 401) {
    throw new CredentialExpiredError('itchio');
  }

  if (!response.ok || data.errors?.length) {
    return {
      valid: false,
      error: extractItchioError(data, response.status),
    };
  }

  return {
    valid: true,
    externalOrderId: data.download_key?.id != null ? String(data.download_key.id) : undefined,
    providerProductId:
      data.download_key?.game_id != null ? String(data.download_key.game_id) : undefined,
    providerUserId:
      data.download_key?.owner?.id != null ? String(data.download_key.owner.id) : undefined,
  };
}

export function createItchioLicenseVerification<
  TClient extends ProviderRuntimeClient = ProviderRuntimeClient,
>(ports: ItchioRuntimePorts<TClient>): LicenseVerificationPlugin<TClient> {
  return {
    async verifyLicense(downloadKey, productId, authUserId, ctx) {
      if (!productId) {
        return { valid: false, error: 'Game ID is required for itch.io verification' };
      }

      const encryptedToken = await ports.getEncryptedCredential(authUserId, ctx);
      if (!encryptedToken) {
        return {
          valid: false,
          error: 'itch.io is not connected for this creator. Ask them to reconnect and try again.',
        };
      }

      try {
        const accessToken = await ports.decryptCredential(encryptedToken, ctx);
        return await verifyItchioDownloadKey(downloadKey, productId, accessToken, ports);
      } catch (error) {
        if (error instanceof CredentialExpiredError) {
          return {
            valid: false,
            error:
              'The creator itch.io connection has expired. Ask them to reconnect the store and try again.',
          };
        }
        throw error;
      }
    },
  };
}

export function createItchioProviderModule<
  TClient extends ProviderRuntimeClient = ProviderRuntimeClient,
>(ports: ItchioRuntimePorts<TClient>): ItchioProviderRuntime<TClient> {
  return {
    id: 'itchio',
    needsCredential: true,
    purposes: ITCHIO_PURPOSES,
    displayMeta: ITCHIO_DISPLAY_META,
    async getCredential(ctx) {
      const encryptedToken = await ports.getEncryptedCredential(ctx.authUserId, ctx);
      if (!encryptedToken) {
        return null;
      }
      return await ports.decryptCredential(encryptedToken, ctx);
    },
    async fetchProducts(credential): Promise<ProductRecord[]> {
      if (!credential) {
        return [];
      }

      return await listItchioGames(credential, ports);
    },
    verification: createItchioLicenseVerification(ports),
  };
}
