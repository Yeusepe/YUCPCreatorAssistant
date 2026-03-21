import { describe, expect, it } from 'vitest';
import {
  buildOAuthConsentLookupWhere,
  getBetterAuthPage,
} from './betterAuthAdapter';

describe('getBetterAuthPage', () => {
  it('unwraps paginated Better Auth adapter results', () => {
    expect(
      getBetterAuthPage({
        page: [
          { clientId: 'client-a' },
          { clientId: 'client-b' },
        ],
      })
    ).toEqual([{ clientId: 'client-a' }, { clientId: 'client-b' }]);
  });

  it('returns an empty array when the adapter result is missing', () => {
    expect(getBetterAuthPage(null)).toEqual([]);
    expect(getBetterAuthPage(undefined)).toEqual([]);
  });
});

describe('buildOAuthConsentLookupWhere', () => {
  it('looks up oauth consents by consent id, not client id', () => {
    expect(buildOAuthConsentLookupWhere('user_123', 'consent_456')).toEqual([
      { field: 'userId', operator: 'eq', value: 'user_123' },
      { field: '_id', operator: 'eq', value: 'consent_456', connector: 'AND' },
    ]);
  });
});
