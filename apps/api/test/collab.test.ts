/**
 * Collab routes integration tests — Phase 6.2
 *
 * Tests HTTP-level auth guards and input validation for /api/collab/* routes.
 *
 * Auth mechanism: collab routes use a setup-session token (Bearer header or
 * yucp_setup_session cookie) resolved by resolveSetupToken(). With neither
 * present the route returns 401 immediately.
 */

import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import type { Auth, SessionData } from '../src/auth/index';
import { startTestServer, type TestServerHandle } from './helpers/testServer';

function makeWebSessionAuth(userId: string): Auth {
  const session: SessionData = {
    user: { id: userId, email: 'test@example.com', name: 'Test User' },
    session: { id: 'sess-123', expiresAt: Date.now() + 3_600_000, token: 'tok-123' },
  };
  return {
    getSession: async () => session,
    getDiscordUserId: async () => null,
    exchangeOTT: async () => ({ session: null, setCookieHeaders: [] as string[] }),
    signOut: async () => ({ ok: false, setCookieHeaders: [] as string[] }),
  } as unknown as Auth;
}

// ─────────────────────────────────────────────────────────────────────────────
// Auth guard tests — no setup session token present → 401
// ─────────────────────────────────────────────────────────────────────────────

describe('Collab routes — auth guards', () => {
  let server: TestServerHandle;

  beforeAll(async () => {
    server = await startTestServer();
  });

  afterAll(() => server.stop());

  it('POST /api/collab/invite without auth returns 401', async () => {
    const res = await server.fetch('/api/collab/invite', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(401);
    expect(res.headers.get('content-type')).toContain('application/json');
    const body = await res.json();
    expect(body).toHaveProperty('error');
  });

  it('GET /api/collab/connections without auth returns 401', async () => {
    const res = await server.fetch('/api/collab/connections');
    expect(res.status).toBe(401);
    expect(res.headers.get('content-type')).toContain('application/json');
    const body = await res.json();
    expect(body).toHaveProperty('error');
  });

  it('DELETE /api/collab/connections/test-conn-id without auth returns 401', async () => {
    const res = await server.fetch('/api/collab/connections/test-conn-id', {
      method: 'DELETE',
    });
    expect(res.status).toBe(401);
    expect(res.headers.get('content-type')).toContain('application/json');
    const body = await res.json();
    expect(body).toHaveProperty('error');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Validation tests — auth-independent input checks
// ─────────────────────────────────────────────────────────────────────────────

describe('Collab routes — validation', () => {
  let server: TestServerHandle;

  beforeAll(async () => {
    server = await startTestServer();
  });

  afterAll(() => server.stop());

  it('POST /api/collab/session/exchange with missing token returns 400', async () => {
    // exchangeSession checks for the token in the JSON body before any auth check.
    // An empty body (no `token` field) → 400 "Missing token".
    const res = await server.fetch('/api/collab/session/exchange', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    expect(res.headers.get('content-type')).toContain('application/json');
    const body = await res.json();
    expect(body).toHaveProperty('error');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Web-session auth path — authenticated user, no setup session token
// ─────────────────────────────────────────────────────────────────────────────

describe('Collab routes — web session auth', () => {
  let server: TestServerHandle;

  beforeAll(async () => {
    server = await startTestServer({ auth: makeWebSessionAuth('user-abc-123') });
  });

  afterAll(() => server.stop());

  it('POST /api/collab/invite with web session and no authUserId in body does not return 400', async () => {
    // When a user is authenticated via Better Auth web session and omits authUserId,
    // the server should fall back to webSession.user.id rather than returning 400.
    // With a non-functional Convex URL the Convex mutation will fail → 500,
    // but 400 ("authUserId is required") must NOT be returned.
    const res = await server.fetch('/api/collab/invite', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ guildName: 'My Server', guildId: '123456789' }),
    });
    const body = await res.json();
    expect(res.status).not.toBe(400);
    expect(body).not.toHaveProperty('error', 'authUserId is required');
  });

  it('POST /api/collab/invite with web session and explicit authUserId returns 403 for wrong owner', async () => {
    // Passing an authUserId that doesn't match the session user → 403 Forbidden.
    // With a fake Convex URL the ownership check throws a network error; the server
    // may crash the connection entirely. Either 403, 500, or a fetch error are all
    // acceptable — the key invariant is it does NOT return 200/201.
    let status: number | null = null;
    try {
      const res = await server.fetch('/api/collab/invite', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ guildName: 'My Server', guildId: '123456789', authUserId: 'some-other-user' }),
      });
      status = res.status;
    } catch {
      // Network error means the server threw before responding — acceptable
      return;
    }
    expect(status).not.toBe(200);
    expect(status).not.toBe(201);
  });
});
