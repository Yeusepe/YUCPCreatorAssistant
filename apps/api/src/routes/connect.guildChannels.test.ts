/**
 * Tests for GET /api/connect/guild/channels
 *
 * Covers auth-guard behaviour without standing up a full Convex backend.
 * Session resolution uses the in-memory StateStore (no Redis needed in CI).
 */

import { describe, expect, it } from 'bun:test';
import { createAuth } from '../auth';
import { createSetupSession } from '../lib/setupSession';
import { createConnectRoutes, type ConnectConfig } from './connect';

const ENCRYPTION_SECRET = 'test-encryption-secret-32chars!!';

const testConfig: ConnectConfig = {
  apiBaseUrl: 'http://localhost:3001',
  frontendBaseUrl: 'http://localhost:3000',
  convexSiteUrl: 'http://localhost:3210',
  discordClientId: 'test-client-id',
  discordClientSecret: 'test-client-secret',
  discordBotToken: undefined,
  convexApiSecret: 'test-convex-secret',
  convexUrl: 'http://localhost:3210',
  encryptionSecret: ENCRYPTION_SECRET,
};

const auth = createAuth({
  baseUrl: testConfig.apiBaseUrl,
  convexSiteUrl: testConfig.convexSiteUrl,
});

const routes = createConnectRoutes(auth, testConfig);

describe('GET /api/connect/guild/channels', () => {
  it('returns 401 when no setup session token is present', async () => {
    const req = new Request('http://localhost:3001/api/connect/guild/channels');
    const res = await routes.getGuildChannels(req);
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/setup session/i);
  });

  it('returns 401 when setup session token is present but no auth session', async () => {
    // Create a real signed session token using the in-memory store
    const token = await createSetupSession(
      'user-test-001',
      'guild-test-001',
      'discord-user-001',
      ENCRYPTION_SECRET
    );
    const req = new Request('http://localhost:3001/api/connect/guild/channels', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const res = await routes.getGuildChannels(req);
    // Auth session (Better Auth cookie) is absent → 401
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/authentication required/i);
  });
});
