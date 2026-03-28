import { afterEach, describe, expect, it } from 'bun:test';
import {
  buildAuthUserWorkspaceKey,
  extractWorkspaceKeyFromMetadata,
  getCertificateBillingConfig,
  resolveWorkspaceKeys,
} from './certificateBillingConfig';

describe('certificateBillingConfig', () => {
  const originalPolarAccessToken = process.env.POLAR_ACCESS_TOKEN;
  const originalPolarWebhookSecret = process.env.POLAR_WEBHOOK_SECRET;

  afterEach(() => {
    process.env.POLAR_ACCESS_TOKEN = originalPolarAccessToken;
    process.env.POLAR_WEBHOOK_SECRET = originalPolarWebhookSecret;
  });

  it('enables billing when Polar credentials are configured', () => {
    process.env.POLAR_ACCESS_TOKEN = 'polar-token';
    process.env.POLAR_WEBHOOK_SECRET = 'webhook-secret';

    const config = getCertificateBillingConfig();

    expect(config.enabled).toBe(true);
    expect(config.polarAccessToken).toBe('polar-token');
    expect(config.polarWebhookSecret).toBe('webhook-secret');
  });

  it('resolves workspace key metadata with creator-profile preference', () => {
    expect(resolveWorkspaceKeys('user_123', 'profile_456')).toEqual([
      'creator-profile:profile_456',
      buildAuthUserWorkspaceKey('user_123'),
    ]);
    expect(
      extractWorkspaceKeyFromMetadata(
        { workspace_key: 'creator-profile:profile_456' },
        buildAuthUserWorkspaceKey('user_123')
      )
    ).toBe('creator-profile:profile_456');
  });
});
