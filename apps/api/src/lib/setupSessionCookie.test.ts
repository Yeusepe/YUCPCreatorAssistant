import { afterEach, describe, expect, it } from 'bun:test';
import { SETUP_SESSION_COOKIE } from './browserSessions';
import {
  buildSetupSessionCookie,
  clearSetupSessionCookie,
  readSetupSessionCookie,
  stripSetupParams,
} from './setupSessionCookie';

const originalNodeEnv = process.env.NODE_ENV;

afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv;
});

describe('readSetupSessionCookie', () => {
  it('reads the setup session cookie from request headers', () => {
    const request = new Request('http://example.com', {
      headers: {
        cookie: `${SETUP_SESSION_COOKIE}=abc.def`,
      },
    });
    expect(readSetupSessionCookie(request)).toBe('abc.def');
  });

  it('returns null when the cookie is absent', () => {
    const request = new Request('http://example.com');
    expect(readSetupSessionCookie(request)).toBeNull();
  });

  it('returns null when other cookies are present but not the session cookie', () => {
    const request = new Request('http://example.com', {
      headers: { cookie: 'other=value; another=thing' },
    });
    expect(readSetupSessionCookie(request)).toBeNull();
  });

  it('handles cookie values that contain equals signs (opaque tokens)', () => {
    const tokenValue = 'opaque.token=extra=padding';
    const request = new Request('http://example.com', {
      headers: { cookie: `${SETUP_SESSION_COOKIE}=${tokenValue}` },
    });
    expect(readSetupSessionCookie(request)).toBe(tokenValue);
  });
});

describe('buildSetupSessionCookie', () => {
  it('sets the correct cookie name and value', () => {
    const request = new Request('https://example.com');
    const cookie = buildSetupSessionCookie(request, 'token.sig');
    expect(cookie).toContain(`${SETUP_SESSION_COOKIE}=token.sig`);
  });

  it('includes default HttpOnly, SameSite=Lax, and Path=/ attributes', () => {
    const request = new Request('https://example.com');
    const cookie = buildSetupSessionCookie(request, 'token.sig');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Path=/');
  });

  it('uses the provided maxAgeSeconds', () => {
    const request = new Request('https://example.com');
    const cookie = buildSetupSessionCookie(request, 'tok', 1800);
    expect(cookie).toContain('Max-Age=1800');
  });

  it('uses default maxAgeSeconds of 3600 when not provided', () => {
    const request = new Request('https://example.com');
    const cookie = buildSetupSessionCookie(request, 'tok');
    expect(cookie).toContain('Max-Age=3600');
  });

  it('adds Secure for https requests', () => {
    const request = new Request('https://example.com');
    const cookie = buildSetupSessionCookie(request, 'tok');
    expect(cookie).toContain('Secure');
  });

  it('omits Secure for http requests in development', () => {
    process.env.NODE_ENV = 'development';
    const request = new Request('http://example.com');
    const cookie = buildSetupSessionCookie(request, 'tok');
    expect(cookie).not.toContain('Secure');
  });
});

describe('clearSetupSessionCookie', () => {
  it('sets Max-Age=0 to expire the cookie', () => {
    const request = new Request('https://example.com');
    const cookie = clearSetupSessionCookie(request);
    expect(cookie).toContain('Max-Age=0');
  });

  it('uses the correct cookie name', () => {
    const request = new Request('https://example.com');
    const cookie = clearSetupSessionCookie(request);
    expect(cookie).toContain(`${SETUP_SESSION_COOKIE}=`);
  });

  it('includes HttpOnly and SameSite=Lax attributes', () => {
    const request = new Request('https://example.com');
    const cookie = clearSetupSessionCookie(request);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
  });
});

describe('stripSetupParams', () => {
  it('removes the s, token, and tenant params from the URL', () => {
    const url = new URL('https://example.com/setup?s=abc&token=xyz&tenant_id=t1');
    const stripped = stripSetupParams(url);
    expect(stripped.searchParams.has('s')).toBe(false);
    expect(stripped.searchParams.has('token')).toBe(false);
    expect(stripped.searchParams.has('tenant_id')).toBe(false);
  });

  it('removes tenantId, authUserId, auth_user_id, guild_id, and guildId params', () => {
    const url = new URL(
      'https://example.com/setup?tenantId=t&authUserId=u&auth_user_id=u2&guild_id=g&guildId=g2'
    );
    const stripped = stripSetupParams(url);
    expect(stripped.searchParams.has('tenantId')).toBe(false);
    expect(stripped.searchParams.has('authUserId')).toBe(false);
    expect(stripped.searchParams.has('auth_user_id')).toBe(false);
    expect(stripped.searchParams.has('guild_id')).toBe(false);
    expect(stripped.searchParams.has('guildId')).toBe(false);
  });

  it('preserves unrelated query parameters', () => {
    const url = new URL('https://example.com/setup?s=abc&next=/dashboard&foo=bar');
    const stripped = stripSetupParams(url);
    expect(stripped.searchParams.get('next')).toBe('/dashboard');
    expect(stripped.searchParams.get('foo')).toBe('bar');
  });

  it('returns a new URL object and does not mutate the original', () => {
    const url = new URL('https://example.com/setup?s=abc');
    const stripped = stripSetupParams(url);
    expect(stripped).not.toBe(url);
    expect(url.searchParams.has('s')).toBe(true);
  });

  it('handles a URL with no query parameters gracefully', () => {
    const url = new URL('https://example.com/setup');
    const stripped = stripSetupParams(url);
    expect(stripped.search).toBe('');
  });
});