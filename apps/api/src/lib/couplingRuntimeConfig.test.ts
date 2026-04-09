import { describe, expect, it } from 'bun:test';
import { validateCouplingServiceBaseUrl } from './couplingRuntimeConfig';

describe('validateCouplingServiceBaseUrl', () => {
  it('rejects using the public API as the coupling service origin', () => {
    expect(() =>
      validateCouplingServiceBaseUrl({
        apiBaseUrl: 'https://api.creators.yucp.club',
        convexSiteUrl: 'https://rare-squid-409.convex.site',
        couplingServiceBaseUrl: 'https://api.creators.yucp.club',
      })
    ).toThrow(
      'YUCP_COUPLING_SERVICE_BASE_URL must point at the private coupling service, not the public API origin'
    );
  });

  it('rejects using the Convex site as the coupling service origin', () => {
    expect(() =>
      validateCouplingServiceBaseUrl({
        apiBaseUrl: 'https://api.creators.yucp.club',
        convexSiteUrl: 'https://rare-squid-409.convex.site',
        couplingServiceBaseUrl: 'https://rare-squid-409.convex.site',
      })
    ).toThrow(
      'YUCP_COUPLING_SERVICE_BASE_URL must point at the private coupling service, not the Convex site origin'
    );
  });

  it('allows a distinct private coupling origin', () => {
    expect(() =>
      validateCouplingServiceBaseUrl({
        apiBaseUrl: 'https://api.creators.yucp.club',
        convexSiteUrl: 'https://rare-squid-409.convex.site',
        couplingServiceBaseUrl: 'https://coupling.internal.yucp.club',
      })
    ).not.toThrow();
  });
});
