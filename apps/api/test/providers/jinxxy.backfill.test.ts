import { afterEach, describe, expect, it, mock } from 'bun:test';
import { backfill } from '../../src/providers/jinxxy/backfill';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('Jinxxy backfill fetchPage', () => {
  it('maps non-active license statuses to cancelled lifecycle records', async () => {
    globalThis.fetch = mock(async (url: string) => {
      expect(url).toContain('/licenses');
      return new Response(
        JSON.stringify({
          results: [
            {
              id: 'license-active',
              key: 'KEY-ACTIVE',
              product_id: 'product-1',
              customer_id: 'customer-1',
              status: 'active',
              created_at: '2024-01-01T00:00:00.000Z',
              activation_count: 0,
              max_activations: 1,
              order_id: 'order-1',
            },
            {
              id: 'license-revoked',
              key: 'KEY-REVOKED',
              product_id: 'product-1',
              customer_id: 'customer-2',
              status: 'revoked',
              created_at: '2024-01-02T00:00:00.000Z',
              activation_count: 0,
              max_activations: 1,
              order_id: 'order-2',
            },
          ],
          pagination: { has_next: false },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }) as unknown as typeof fetch;

    const result = await backfill.fetchPage('api-key', 'product-1', null, 50, '');

    expect(result.facts).toEqual([
      {
        authUserId: '',
        provider: 'jinxxy',
        externalOrderId: 'order-1',
        buyerEmailHash: undefined,
        providerUserId: 'customer-1',
        providerProductId: 'product-1',
        paymentStatus: 'completed',
        lifecycleStatus: 'active',
        purchasedAt: new Date('2024-01-01T00:00:00.000Z').getTime(),
      },
      {
        authUserId: '',
        provider: 'jinxxy',
        externalOrderId: 'order-2',
        buyerEmailHash: undefined,
        providerUserId: 'customer-2',
        providerProductId: 'product-1',
        paymentStatus: 'completed',
        lifecycleStatus: 'cancelled',
        purchasedAt: new Date('2024-01-02T00:00:00.000Z').getTime(),
      },
    ]);
    expect(result.nextCursor).toBeNull();
  });
});
