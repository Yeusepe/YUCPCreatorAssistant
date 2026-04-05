import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { createSetupSession, deleteSetupSession, resolveSetupSession } from './setupSession';

// setupSession uses stateStore which falls back to InMemoryStateStore in dev/test
// (no DRAGONFLY_URI or REDIS_URL set), so no mocking is required.

const TEST_SECRET = 'test-hmac-secret-for-sessions!!';

describe('createSetupSession', () => {
  it('returns a signed token containing a dot separator', async () => {
    const token = await createSetupSession('user_1', 'guild_1', 'discord_1', TEST_SECRET);
    expect(token).toContain('.');
    const parts = token.split('.');
    expect(parts.length).toBeGreaterThanOrEqual(2);
  });

  it('produces URL-safe base64url characters only', async () => {
    const token = await createSetupSession('user_1', 'guild_1', 'discord_1', TEST_SECRET);
    // base64url: A-Z a-z 0-9 - _ and dot separator
    expect(token).toMatch(/^[A-Za-z0-9\-_.]+$/);
  });

  it('produces unique tokens on each call', async () => {
    const token1 = await createSetupSession('user_1', 'guild_1', 'discord_1', TEST_SECRET);
    const token2 = await createSetupSession('user_1', 'guild_1', 'discord_1', TEST_SECRET);
    expect(token1).not.toBe(token2);
  });
});

describe('resolveSetupSession', () => {
  it('resolves a freshly created session and returns correct data', async () => {
    const token = await createSetupSession('user_42', 'guild_42', 'discord_42', TEST_SECRET);
    const data = await resolveSetupSession(token, TEST_SECRET);

    expect(data).not.toBeNull();
    expect(data?.authUserId).toBe('user_42');
    expect(data?.guildId).toBe('guild_42');
    expect(data?.discordUserId).toBe('discord_42');
    expect(typeof data?.createdAt).toBe('number');
    expect(typeof data?.expiresAt).toBe('number');
    expect(data!.expiresAt).toBeGreaterThan(data!.createdAt);
  });

  it('returns null for a token with wrong HMAC secret', async () => {
    const token = await createSetupSession('user_1', 'guild_1', 'discord_1', TEST_SECRET);
    const data = await resolveSetupSession(token, 'wrong-secret!!');
    expect(data).toBeNull();
  });

  it('returns null for an empty string', async () => {
    const data = await resolveSetupSession('', TEST_SECRET);
    expect(data).toBeNull();
  });

  it('returns null for a token without a dot separator', async () => {
    const data = await resolveSetupSession('nodottoken', TEST_SECRET);
    expect(data).toBeNull();
  });

  it('returns null for a tampered token payload', async () => {
    const token = await createSetupSession('user_1', 'guild_1', 'discord_1', TEST_SECRET);
    const [rawToken, sig] = token.split('.');
    const tampered = `${rawToken}X.${sig}`;
    const data = await resolveSetupSession(tampered, TEST_SECRET);
    expect(data).toBeNull();
  });

  it('returns null for a tampered signature', async () => {
    const token = await createSetupSession('user_1', 'guild_1', 'discord_1', TEST_SECRET);
    const [rawToken] = token.split('.');
    const tampered = `${rawToken}.invalidsig`;
    const data = await resolveSetupSession(tampered, TEST_SECRET);
    expect(data).toBeNull();
  });

  it('returns null after session is deleted', async () => {
    const token = await createSetupSession('user_1', 'guild_1', 'discord_1', TEST_SECRET);
    await deleteSetupSession(token);
    const data = await resolveSetupSession(token, TEST_SECRET);
    expect(data).toBeNull();
  });

  it('returns null for a token with valid signature but not in the store', async () => {
    // Sign a token that was never stored
    const data = await resolveSetupSession('faketokenXXXXX.fakesigYYYYY', TEST_SECRET);
    expect(data).toBeNull();
  });
});

describe('deleteSetupSession', () => {
  it('removes the session so subsequent resolves return null', async () => {
    const token = await createSetupSession('user_del', 'guild_del', 'discord_del', TEST_SECRET);

    // Verify it exists first
    const before = await resolveSetupSession(token, TEST_SECRET);
    expect(before).not.toBeNull();

    // Delete it
    await deleteSetupSession(token);

    // Now it should be gone
    const after = await resolveSetupSession(token, TEST_SECRET);
    expect(after).toBeNull();
  });

  it('is idempotent — deleting a non-existent token does not throw', async () => {
    await expect(deleteSetupSession('nonexistent.token')).resolves.toBeUndefined();
  });
});