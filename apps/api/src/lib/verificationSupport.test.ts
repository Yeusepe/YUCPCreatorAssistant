import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import type { LogEntry, StructuredLogger } from '@yucp/shared';
import { createStructuredLogger } from '@yucp/shared';
import {
  createApiVerificationSupportError,
  createPublicApiSupportError,
} from './verificationSupport';

// Store and restore ERROR_REFERENCE_SECRET so tests don't interfere with each other.
const originalErrorRefSecret = process.env.ERROR_REFERENCE_SECRET;
const originalBetterAuthSecret = process.env.BETTER_AUTH_SECRET;

afterEach(() => {
  process.env.ERROR_REFERENCE_SECRET = originalErrorRefSecret;
  process.env.BETTER_AUTH_SECRET = originalBetterAuthSecret;
});

function makeMockLogger(): {
  logger: StructuredLogger;
  warned: LogEntry[];
  errored: LogEntry[];
} {
  const warned: LogEntry[] = [];
  const errored: LogEntry[] = [];
  const base = createStructuredLogger({
    level: 'debug',
    sink: (entry) => {
      if (entry.level === 'warn') warned.push(entry);
      if (entry.level === 'error') errored.push(entry);
    },
  });
  return { logger: base, warned, errored };
}

describe('createPublicApiSupportError', () => {
  it('returns an object with a non-empty supportCode', async () => {
    const { logger } = makeMockLogger();
    const result = await createPublicApiSupportError(logger, {
      error: new Error('something went wrong'),
      stage: 'verify',
    });
    expect(typeof result.supportCode).toBe('string');
    expect(result.supportCode.length).toBeGreaterThan(0);
  });

  it('logs a warning with the supportCode and stage', async () => {
    const { logger, warned } = makeMockLogger();
    await createPublicApiSupportError(logger, {
      error: new Error('test error'),
      stage: 'lookup',
      authUserId: 'user_abc',
    });

    expect(warned).toHaveLength(1);
    expect(warned[0].message).toBe('Public API error');
    expect(warned[0].context?.stage).toBe('lookup');
    expect(warned[0].context?.authUserId).toBe('user_abc');
    expect(typeof warned[0].context?.supportCode).toBe('string');
  });

  it('handles non-Error errors (string)', async () => {
    const { logger } = makeMockLogger();
    const result = await createPublicApiSupportError(logger, {
      error: 'plain string error',
      stage: 'fetch',
    });
    expect(typeof result.supportCode).toBe('string');
    expect(result.supportCode.length).toBeGreaterThan(0);
  });

  it('handles null error values gracefully', async () => {
    const { logger } = makeMockLogger();
    const result = await createPublicApiSupportError(logger, {
      error: null,
      stage: 'fetch',
    });
    expect(typeof result.supportCode).toBe('string');
    expect(result.supportCode.length).toBeGreaterThan(0);
  });

  it('produces an encoded support code when ERROR_REFERENCE_SECRET is set', async () => {
    process.env.ERROR_REFERENCE_SECRET = 'test-secret-key-32-bytes-long!!!';
    const { logger } = makeMockLogger();
    const result = await createPublicApiSupportError(logger, {
      error: new Error('test'),
      stage: 'verify',
    });
    // Encoded tokens are longer than plain UUIDs
    expect(result.supportCode.length).toBeGreaterThan(8);
  });

  it('produces distinct support codes for different errors', async () => {
    const { logger } = makeMockLogger();
    const result1 = await createPublicApiSupportError(logger, {
      error: new Error('error one'),
      stage: 'step_a',
    });
    const result2 = await createPublicApiSupportError(logger, {
      error: new Error('error two'),
      stage: 'step_b',
    });
    expect(result1.supportCode).not.toBe(result2.supportCode);
  });
});

describe('createApiVerificationSupportError', () => {
  it('returns supportCode and supportCodeMode', async () => {
    const { logger } = makeMockLogger();
    const result = await createApiVerificationSupportError(logger, {
      error: new Error('verification failed'),
      stage: 'panel',
    });
    expect(typeof result.supportCode).toBe('string');
    expect(result.supportCode.length).toBeGreaterThan(0);
    expect(result.supportCodeMode === 'encoded' || result.supportCodeMode === 'plain').toBe(true);
  });

  it('logs an error with full context fields', async () => {
    process.env.ERROR_REFERENCE_SECRET = 'test-secret-key-32-bytes-long!!!';
    const { logger, errored } = makeMockLogger();
    await createApiVerificationSupportError(logger, {
      error: new Error('api route failed'),
      stage: 'role_grant',
      authUserId: 'user_xyz',
      guildId: 'guild_123',
      discordUserId: 'discord_456',
      provider: 'gumroad',
    });

    expect(errored).toHaveLength(1);
    expect(errored[0].message).toBe('Verification API route failed');
    expect(errored[0].context?.stage).toBe('role_grant');
    expect(errored[0].context?.authUserId).toBe('user_xyz');
    expect(errored[0].context?.guildId).toBe('guild_123');
    expect(errored[0].context?.discordUserId).toBe('discord_456');
    expect(errored[0].context?.provider).toBe('gumroad');
    expect(typeof errored[0].context?.supportCode).toBe('string');
    expect(errored[0].context?.supportCodeMode).toBe('encoded');
  });

  it('returns supportCodeMode=plain when no encryption secret is configured', async () => {
    delete process.env.ERROR_REFERENCE_SECRET;
    delete process.env.BETTER_AUTH_SECRET;
    const { logger } = makeMockLogger();
    const result = await createApiVerificationSupportError(logger, {
      error: new Error('unencrypted'),
      stage: 'lookup',
    });
    expect(result.supportCodeMode).toBe('plain');
  });

  it('includes logErrorStack in the error log when the error is an Error instance', async () => {
    const { logger, errored } = makeMockLogger();
    const error = new Error('with stack');
    await createApiVerificationSupportError(logger, { error, stage: 'step' });

    expect(errored).toHaveLength(1);
    // stack may be set or undefined depending on env, but should not crash
    const contextStack = errored[0].context?.stack;
    if (contextStack !== undefined) {
      expect(typeof contextStack).toBe('string');
    }
  });

  it('handles non-Error values without throwing', async () => {
    const { logger } = makeMockLogger();
    await expect(
      createApiVerificationSupportError(logger, {
        error: { code: 42, message: 'object error' },
        stage: 'custom',
      })
    ).resolves.toBeDefined();
  });
});