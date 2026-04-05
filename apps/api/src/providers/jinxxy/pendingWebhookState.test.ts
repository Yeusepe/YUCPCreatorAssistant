import { describe, expect, it } from 'bun:test';
import {
  getJinxxyWebhookTestStoreKey,
  getPendingJinxxyWebhookStoreKey,
  getPendingJinxxyWebhookTokenStoreKey,
  JINXXY_PENDING_WEBHOOK_TTL_MS,
  JINXXY_TEST_TTL_MS,
} from './pendingWebhookState';

describe('pendingWebhookState constants', () => {
  it('JINXXY_PENDING_WEBHOOK_TTL_MS is 30 minutes in milliseconds', () => {
    expect(JINXXY_PENDING_WEBHOOK_TTL_MS).toBe(30 * 60 * 1000);
  });

  it('JINXXY_TEST_TTL_MS is 60 seconds in milliseconds', () => {
    expect(JINXXY_TEST_TTL_MS).toBe(60 * 1000);
  });
});

describe('getPendingJinxxyWebhookStoreKey', () => {
  it('prefixes the authUserId with the pending webhook prefix', () => {
    const key = getPendingJinxxyWebhookStoreKey('auth_user_123');
    expect(key).toBe('jinxxy_webhook_pending:auth_user_123');
  });

  it('returns different keys for different authUserIds', () => {
    const key1 = getPendingJinxxyWebhookStoreKey('user_a');
    const key2 = getPendingJinxxyWebhookStoreKey('user_b');
    expect(key1).not.toBe(key2);
  });

  it('handles empty string without throwing', () => {
    const key = getPendingJinxxyWebhookStoreKey('');
    expect(key).toBe('jinxxy_webhook_pending:');
  });

  it('uses the correct prefix so keys are namespaced', () => {
    const key = getPendingJinxxyWebhookStoreKey('any_user');
    expect(key.startsWith('jinxxy_webhook_pending:')).toBe(true);
  });
});

describe('getPendingJinxxyWebhookTokenStoreKey', () => {
  it('prefixes the routeToken with the pending webhook token prefix', () => {
    const key = getPendingJinxxyWebhookTokenStoreKey('route_token_abc');
    expect(key).toBe('jinxxy_webhook_pending_token:route_token_abc');
  });

  it('returns different keys for different route tokens', () => {
    const key1 = getPendingJinxxyWebhookTokenStoreKey('token_1');
    const key2 = getPendingJinxxyWebhookTokenStoreKey('token_2');
    expect(key1).not.toBe(key2);
  });

  it('uses a different prefix from getPendingJinxxyWebhookStoreKey', () => {
    const webhookKey = getPendingJinxxyWebhookStoreKey('same_id');
    const tokenKey = getPendingJinxxyWebhookTokenStoreKey('same_id');
    expect(webhookKey).not.toBe(tokenKey);
  });

  it('uses the correct prefix so keys are namespaced', () => {
    const key = getPendingJinxxyWebhookTokenStoreKey('route_token');
    expect(key.startsWith('jinxxy_webhook_pending_token:')).toBe(true);
  });
});

describe('getJinxxyWebhookTestStoreKey', () => {
  it('prefixes the routeId with the test prefix', () => {
    const key = getJinxxyWebhookTestStoreKey('route_id_xyz');
    expect(key).toBe('jinxxy_test:route_id_xyz');
  });

  it('returns different keys for different route IDs', () => {
    const key1 = getJinxxyWebhookTestStoreKey('id_1');
    const key2 = getJinxxyWebhookTestStoreKey('id_2');
    expect(key1).not.toBe(key2);
  });

  it('uses a different prefix from the other key helpers', () => {
    const webhookKey = getPendingJinxxyWebhookStoreKey('id');
    const tokenKey = getPendingJinxxyWebhookTokenStoreKey('id');
    const testKey = getJinxxyWebhookTestStoreKey('id');
    expect(testKey).not.toBe(webhookKey);
    expect(testKey).not.toBe(tokenKey);
  });

  it('uses the correct prefix so keys are namespaced', () => {
    const key = getJinxxyWebhookTestStoreKey('any_id');
    expect(key.startsWith('jinxxy_test:')).toBe(true);
  });
});