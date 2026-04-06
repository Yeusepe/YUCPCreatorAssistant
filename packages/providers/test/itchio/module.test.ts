import { describe, expect, it } from 'bun:test';
import {
  CredentialExpiredError,
  type ProviderContext,
  type ProviderRuntimeClient,
} from '../../src/contracts';
import {
  createItchioLicenseVerification,
  createItchioProviderModule,
  fetchItchioCredentialsInfo,
  fetchItchioCurrentUser,
  itchioScopeSatisfied,
} from '../../src/itchio/module';

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

describe('createItchioProviderModule', () => {
  it('lists creator games from the itch.io my-games endpoint', async () => {
    const module = createItchioProviderModule({
      logger,
      async getEncryptedCredential() {
        return 'encrypted-token';
      },
      async decryptCredential() {
        return 'access-token';
      },
      async fetchImpl(input) {
        expect(String(input)).toBe('https://itch.io/api/1/key/my-games');
        return new Response(
          JSON.stringify({
            games: [
              {
                id: 11,
                title: 'Game One',
                url: 'https://creator.itch.io/game-one',
                published: true,
              },
              {
                id: 22,
                title: 'Game Two',
                url: 'https://creator.itch.io/game-two',
                published: false,
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      },
    });

    await expect(module.fetchProducts('access-token', makeCtx())).resolves.toEqual([
      {
        id: '11',
        name: 'Game One',
        productUrl: 'https://creator.itch.io/game-one',
        published: true,
      },
      {
        id: '22',
        name: 'Game Two',
        productUrl: 'https://creator.itch.io/game-two',
        published: false,
      },
    ]);
  });

  it('throws CredentialExpiredError when the creator token is no longer valid', async () => {
    const module = createItchioProviderModule({
      logger,
      async getEncryptedCredential() {
        return 'encrypted-token';
      },
      async decryptCredential() {
        return 'access-token';
      },
      async fetchImpl() {
        return new Response(JSON.stringify({ errors: ['expired'] }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      },
    });

    await expect(module.fetchProducts('access-token', makeCtx())).rejects.toBeInstanceOf(
      CredentialExpiredError
    );
  });
});

describe('createItchioLicenseVerification', () => {
  it('validates a download key for the expected game', async () => {
    const verification = createItchioLicenseVerification({
      logger,
      async getEncryptedCredential() {
        return 'encrypted-token';
      },
      async decryptCredential() {
        return 'creator-token';
      },
      async fetchImpl(input) {
        expect(String(input)).toContain('/game/42/download_keys?download_key=DOWNLOAD-KEY');
        return new Response(
          JSON.stringify({
            download_key: {
              id: 77,
              game_id: 42,
              owner: { id: 99 },
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      },
    });

    await expect(
      verification.verifyLicense('DOWNLOAD-KEY', '42', 'user-1', makeCtx())
    ).resolves.toEqual({
      valid: true,
      externalOrderId: '77',
      providerProductId: '42',
      providerUserId: '99',
    });
  });
});

describe('itch.io OAuth helpers', () => {
  it('checks hierarchical scope grants', () => {
    expect(itchioScopeSatisfied(['profile'], 'profile:me')).toBe(true);
    expect(itchioScopeSatisfied(['game:view'], 'game:view:purchases')).toBe(true);
    expect(itchioScopeSatisfied(['profile:me'], 'profile:games')).toBe(false);
  });

  it('reads credential info and current user payloads', async () => {
    const fetchImpl = async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/credentials/info')) {
        return new Response(JSON.stringify({ scopes: ['profile:me', 'profile:games'] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      return new Response(
        JSON.stringify({
          user: {
            id: 123,
            username: 'creator',
            display_name: 'Creator',
            url: 'https://creator.itch.io',
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    };

    await expect(fetchItchioCredentialsInfo('token', { fetchImpl })).resolves.toEqual({
      scopes: ['profile:me', 'profile:games'],
    });
    await expect(fetchItchioCurrentUser('token', { fetchImpl })).resolves.toEqual({
      id: '123',
      username: 'creator',
      displayName: 'Creator',
      profileUrl: 'https://creator.itch.io',
    });
  });
});
