import { describe, expect, it } from 'bun:test';
import {
  PROVIDER_LIVE_SMOKE_CASES,
  sanitizeFixtureValue,
  sanitizeHeaders,
  sanitizeUrl,
} from './provider-live-smoke';

describe('provider-live-smoke', () => {
  it('redacts sensitive query params while preserving pagination params', () => {
    expect(
      sanitizeUrl('https://api.gumroad.com/v2/products?page=2&cursor=abc&access_token=secret')
    ).toBe('https://api.gumroad.com/v2/products?page=2&cursor=abc&access_token=%5BREDACTED%5D');
  });

  it('redacts auth headers and nested sensitive fixture fields', () => {
    expect(
      sanitizeHeaders({
        Authorization: 'Bearer secret',
        Accept: 'application/json',
      })
    ).toEqual({
      accept: 'application/json',
      authorization: '[REDACTED]',
    });

    expect(
      sanitizeFixtureValue({
        purchase: {
          email: 'buyer@example.com',
        },
        next_page_url: 'https://api.gumroad.com/v2/products?page=2&access_token=secret',
      })
    ).toEqual({
      purchase: {
        email: '[REDACTED]',
      },
      next_page_url: 'https://api.gumroad.com/v2/products?page=2&access_token=%5BREDACTED%5D',
    });
  });

  it('keeps live smoke coverage focused on low-impact Gumroad boundaries', () => {
    expect(PROVIDER_LIVE_SMOKE_CASES.map((smokeCase) => smokeCase.id)).toEqual([
      'gumroad-user',
      'gumroad-products',
      'gumroad-license-verify',
    ]);
    expect(new Set(PROVIDER_LIVE_SMOKE_CASES.map((smokeCase) => smokeCase.surface))).toEqual(
      new Set(['setup', 'catalog', 'verification'])
    );
  });
});
