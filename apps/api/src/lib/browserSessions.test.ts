import { afterEach, describe, expect, it } from 'bun:test';
import {
  buildCookie,
  clearCookie,
  getCookieValue,
  getCookieValueFromHeader,
  SETUP_SESSION_COOKIE,
} from './browserSessions';

const originalNodeEnv = process.env.NODE_ENV;

afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv;
});

describe('browserSessions', () => {
  it('reads cookie values from request headers', () => {
    const request = new Request('http://example.com', {
      headers: {
        cookie: `other=1; ${SETUP_SESSION_COOKIE}=opaque.token=value; last=2`,
      },
    });

    expect(getCookieValue(request, SETUP_SESSION_COOKIE)).toBe('opaque.token=value');
  });

  it('marks cookies as secure for forwarded https requests in development', () => {
    process.env.NODE_ENV = 'development';

    const request = new Request('http://example.com', {
      headers: {
        'x-forwarded-proto': 'https',
      },
    });

    const cookie = buildCookie('session', 'value', request, { maxAgeSeconds: 60 });

    expect(cookie).toContain('Path=/');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('Max-Age=60');
  });

  it('supports scoped cookie paths for build and clear helpers', () => {
    const request = new Request('https://example.com/api/connect/vrchat');

    const cookie = buildCookie('session', 'value', request, {
      path: '/api/connect/vrchat',
      maxAgeSeconds: 300,
    });
    const cleared = clearCookie('session', request, { path: '/api/connect/vrchat' });

    expect(cookie).toContain('Path=/api/connect/vrchat');
    expect(cookie).toContain('Max-Age=300');
    expect(cleared).toContain('Path=/api/connect/vrchat');
    expect(cleared).toContain('Max-Age=0');
  });

  it('always sets Secure in production regardless of protocol', () => {
    process.env.NODE_ENV = 'production';
    const request = new Request('http://example.com');
    const cookie = buildCookie('session', 'value', request);
    expect(cookie).toContain('Secure');
  });

  it('does not set Secure for plain http in development', () => {
    process.env.NODE_ENV = 'development';
    const request = new Request('http://example.com');
    const cookie = buildCookie('session', 'value', request);
    expect(cookie).not.toContain('Secure');
  });

  it('omits Max-Age when no maxAgeSeconds is provided', () => {
    const request = new Request('https://example.com');
    const cookie = buildCookie('session', 'value', request);
    expect(cookie).not.toContain('Max-Age');
  });
});

describe('getCookieValueFromHeader', () => {
  it('returns the cookie value from a raw header string', () => {
    const value = getCookieValueFromHeader('foo=bar; baz=qux', 'foo');
    expect(value).toBe('bar');
  });

  it('returns null for a null header', () => {
    expect(getCookieValueFromHeader(null, 'foo')).toBeNull();
  });

  it('returns null when the cookie name is not present', () => {
    expect(getCookieValueFromHeader('other=value', 'missing')).toBeNull();
  });

  it('preserves cookie values containing equals signs', () => {
    const value = getCookieValueFromHeader('token=abc=def==', 'token');
    expect(value).toBe('abc=def==');
  });

  it('trims whitespace around cookie parts', () => {
    const value = getCookieValueFromHeader(' name=val ', 'name');
    expect(value).toBe('val');
  });

  it('returns the first matching cookie when multiple share the same name', () => {
    const value = getCookieValueFromHeader('dup=first; dup=second', 'dup');
    expect(value).toBe('first');
  });

  it('returns empty string for a cookie set to empty value', () => {
    const value = getCookieValueFromHeader('empty=; other=x', 'empty');
    expect(value).toBe('');
  });
});