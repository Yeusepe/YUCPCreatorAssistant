import { beforeEach, describe, expect, it } from 'vitest';
import {
  buildPrivacyPreferences,
  PRIVACY_PREFERENCES_COOKIE,
  PRIVACY_PREFERENCES_STORAGE_KEY,
  parsePrivacyPreferences,
  readStoredPrivacyPreferences,
  savePrivacyPreferences,
  serializePrivacyPreferences,
} from '../../src/lib/privacyPreferences';

describe('privacyPreferences', () => {
  beforeEach(() => {
    localStorage.clear();
    // biome-ignore lint/suspicious/noDocumentCookie: The test needs to clear the consent cookie to verify cookie fallback behavior.
    document.cookie = `${PRIVACY_PREFERENCES_COOKIE}=; Max-Age=0; Path=/`;
  });

  it('parses stored helpful diagnostics preferences', () => {
    const serialized = serializePrivacyPreferences({
      version: 1,
      choice: 'helpful-diagnostics',
      diagnosticsEnabled: true,
      diagnosticsSessionId: 'diag-123',
      source: 'banner',
      updatedAt: 123,
    });

    expect(parsePrivacyPreferences(serialized)).toEqual({
      version: 1,
      choice: 'helpful-diagnostics',
      diagnosticsEnabled: true,
      diagnosticsSessionId: 'diag-123',
      source: 'banner',
      updatedAt: 123,
    });
  });

  it('returns null for malformed preference data', () => {
    expect(parsePrivacyPreferences('{"choice":"invalid"}')).toBeNull();
  });

  it('saves preferences to localStorage and first-party cookies', () => {
    const saved = savePrivacyPreferences('necessary-only', 'account');

    expect(saved.choice).toBe('necessary-only');
    expect(saved.diagnosticsEnabled).toBe(false);
    expect(localStorage.getItem(PRIVACY_PREFERENCES_STORAGE_KEY)).toContain('necessary-only');
    expect(document.cookie).toContain(`${PRIVACY_PREFERENCES_COOKIE}=`);
  });

  it('restores preferences from cookies when localStorage is empty', () => {
    const preferences = buildPrivacyPreferences('helpful-diagnostics', 'banner');
    // biome-ignore lint/suspicious/noDocumentCookie: The test seeds the first-party consent cookie before exercising cookie restore logic.
    document.cookie = `${PRIVACY_PREFERENCES_COOKIE}=${encodeURIComponent(
      serializePrivacyPreferences(preferences)
    )}; Path=/`;

    expect(readStoredPrivacyPreferences()).toMatchObject({
      choice: 'helpful-diagnostics',
      diagnosticsEnabled: true,
      source: 'banner',
    });
    expect(localStorage.getItem(PRIVACY_PREFERENCES_STORAGE_KEY)).toContain('helpful-diagnostics');
  });
});
