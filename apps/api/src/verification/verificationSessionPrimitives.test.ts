import { describe, expect, it } from 'bun:test';
import {
  buildVerificationCallbackUri,
  createVerificationState,
  getPkceVerifierStoreKey,
  parseVerificationState,
} from './verificationSessionPrimitives';

describe('verification session primitives', () => {
  describe('createVerificationState', () => {
    it('namespaces the state with the verification mode', () => {
      const state = createVerificationState('user_test123', 'gumroad');

      expect(state).toMatch(/^verify:gumroad:user_test123:[0-9a-f]{96}$/);
      expect(parseVerificationState(state)).toEqual({ authUserId: 'user_test123' });
    });

    it('keeps the auth user id parseable for non-gumroad modes', () => {
      const state = createVerificationState('user_test123', 'discord_role');

      expect(state).toMatch(/^verify:discord_role:user_test123:[0-9a-f]{96}$/);
      expect(parseVerificationState(state)).toEqual({ authUserId: 'user_test123' });
    });

    it('namespaces implicit-provider state the same way', () => {
      const state = createVerificationState('user_test123', 'itchio');

      expect(state).toMatch(/^verify:itchio:user_test123:[0-9a-f]{96}$/);
      expect(parseVerificationState(state)).toEqual({ authUserId: 'user_test123' });
    });
  });

  describe('parseVerificationState', () => {
    it('rejects malformed state values', () => {
      expect(parseVerificationState('missing-delimiter')).toBeNull();
    });
  });

  describe('getPkceVerifierStoreKey', () => {
    it('uses the dedicated verifier store namespace', () => {
      expect(getPkceVerifierStoreKey('test-state')).toBe('pkce_verifier:test-state');
    });
  });

  describe('buildVerificationCallbackUri', () => {
    it('uses the configured API callback path for code flows', () => {
      expect(
        buildVerificationCallbackUri(
          'https://api.example.com',
          '/api/verification/callback/gumroad'
        )
      ).toBe('https://api.example.com/api/verification/callback/gumroad');
    });

    it('uses the provider callback path for other API flows', () => {
      expect(
        buildVerificationCallbackUri(
          'https://api.example.com',
          '/api/verification/callback/discord'
        )
      ).toBe('https://api.example.com/api/verification/callback/discord');
    });

    it('uses the frontend implicit callback route when requested', () => {
      expect(
        buildVerificationCallbackUri(
          'https://api.example.com',
          '/oauth/callback/itchio',
          'https://app.example.com',
          'frontend'
        )
      ).toBe('https://app.example.com/oauth/callback/itchio');
    });
  });
});
