import { createServerFn } from '@tanstack/react-start';
import { getSession, getToken } from '../auth-server';
import { withWebServerRequestSpan } from './observability';

/**
 * Server function to get the current auth token during SSR.
 * Used in protected route `beforeLoad` hooks for SSR auth.
 */
export const getAuthToken = createServerFn({ method: 'GET' }).handler(async () => {
  return withWebServerRequestSpan(
    'serverFn.auth.token',
    {
      'tanstack.serverfn': 'getAuthToken',
    },
    async () => getToken()
  );
});

/**
 * Server function to read lightweight Better Auth session state from request
 * cookies without forcing the Convex token exchange used for authenticated SSR.
 */
export const getAuthSession = createServerFn({ method: 'GET' }).handler(async () => {
  return withWebServerRequestSpan(
    'serverFn.auth.session',
    {
      'tanstack.serverfn': 'getAuthSession',
    },
    async () => getSession()
  );
});
