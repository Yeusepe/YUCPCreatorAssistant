import { afterAll, beforeEach, describe, expect, it, mock } from 'bun:test';

const handleProviderProductsMock = mock(async () => new Response(null, { status: 200 }));

const { listProviderProductsViaApi } = await import('./router');

describe('listProviderProductsViaApi', () => {
  beforeEach(() => {
    handleProviderProductsMock.mockReset();
  });

  afterAll(() => {
    mock.restore();
  });

  it('normalizes sanitized 500 route payloads instead of throwing transport errors', async () => {
    handleProviderProductsMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ products: [], error: 'Could not load gumroad products right now.' }),
        {
          status: 500,
          headers: {
            'content-type': 'application/json',
          },
        }
      )
    );

    await expect(
      listProviderProductsViaApi(
        {
          apiBaseUrl: 'https://api.example.com',
          convexApiSecret: 'convex-secret',
        },
        {
          provider: 'gumroad',
          authUserId: 'creator-user',
        },
        handleProviderProductsMock
      )
    ).resolves.toEqual({
      products: [],
      error: 'Could not load gumroad products right now.',
    });
  });

  it('stably normalizes malformed product entries from 500 route payloads', async () => {
    handleProviderProductsMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          products: [
            {
              id: 'prod_1',
              name: 'Creator Pack',
              collaboratorName: 'Alice',
              productUrl: 'https://gumroad.com/l/prod_1',
              ignored: 'value',
            },
            null,
            {
              name: 'Missing Id',
            },
          ],
          error: 'Could not load gumroad products right now.',
          apiSecret: 'should-not-survive-normalization',
        }),
        {
          status: 500,
          headers: {
            'content-type': 'application/json',
          },
        }
      )
    );

    await expect(
      listProviderProductsViaApi(
        {
          apiBaseUrl: 'https://api.example.com',
          convexApiSecret: 'convex-secret',
        },
        {
          provider: 'gumroad',
          authUserId: 'creator-user',
        },
        handleProviderProductsMock
      )
    ).resolves.toEqual({
      products: [
        {
          id: 'prod_1',
          name: 'Creator Pack',
          collaboratorName: 'Alice',
          productUrl: 'https://gumroad.com/l/prod_1',
        },
        {
          id: undefined,
          name: undefined,
          collaboratorName: undefined,
          productUrl: undefined,
        },
        {
          id: undefined,
          name: 'Missing Id',
          collaboratorName: undefined,
          productUrl: undefined,
        },
      ],
      error: 'Could not load gumroad products right now.',
    });
  });
});
