/**
 * Better Auth configuration for YUCP Creator Assistant
 * Runs on Convex with Discord OAuth and cross-domain support.
 *
 * The cross-domain plugin is required because the Bun API server (localhost:3001)
 * is on a different domain than Convex (.convex.site). It handles:
 * - Custom cookie headers (Set-Better-Auth-Cookie / Better-Auth-Cookie)
 * - One-time-token (OTT) pattern for OAuth callbacks
 * - State verification via database instead of cookies
 */

import { oauthProvider } from '@better-auth/oauth-provider';
import { createClient } from '@convex-dev/better-auth';
import type { GenericCtx } from '@convex-dev/better-auth';
import { convex, crossDomain } from '@convex-dev/better-auth/plugins';
import { betterAuth } from 'better-auth';
import type { BetterAuthOptions } from 'better-auth';
import { jwt } from 'better-auth/plugins';
import { components } from './_generated/api';
import type { DataModel } from './_generated/dataModel';
import authConfig from './auth.config';
import { vrchat } from './plugins/vrchat';

const siteUrl = process.env.SITE_URL ?? 'http://localhost:3001';
const PUBLIC_API_AUDIENCE = 'yucp-public-api';

function normalizeOrigin(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

export const authComponent = createClient<DataModel>(components.betterAuth);

function parseCachedTrustedClients(value: string | undefined): Set<string> | undefined {
  if (!value) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) {
      throw new Error('PUBLIC_OAUTH_TRUSTED_CLIENTS_JSON must be a JSON array of client IDs');
    }

    return new Set(
      parsed
        .filter((entry): entry is string => typeof entry === 'string')
        .map((entry) => entry.trim())
        .filter(Boolean)
    );
  } catch (error) {
    throw new Error(
      `Failed to parse PUBLIC_OAUTH_TRUSTED_CLIENTS_JSON: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

export const createAuth = (ctx: GenericCtx<DataModel>) => {
  const betterAuthSecret = process.env.BETTER_AUTH_SECRET;
  if (!betterAuthSecret) {
    throw new Error('BETTER_AUTH_SECRET is required');
  }

  const discordConfig =
    process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET
      ? {
          discord: {
            clientId: process.env.DISCORD_CLIENT_ID,
            clientSecret: process.env.DISCORD_CLIENT_SECRET,
          },
        }
      : {};

  const trustedOrigins = Array.from(
    new Set(
      [
        siteUrl,
        process.env.FRONTEND_URL,
        process.env.BETTER_AUTH_URL,
        'http://localhost:3000',
        'http://localhost:3001',
        'http://localhost:5173',
      ]
        .map(normalizeOrigin)
        .filter((origin): origin is string => Boolean(origin))
    )
  );

  console.log('Better Auth config', {
    siteUrl,
    betterAuthUrl: process.env.BETTER_AUTH_URL ?? null,
    frontendUrl: process.env.FRONTEND_URL ?? null,
    trustedOrigins,
  });

  const authBaseUrl = `${(process.env.CONVEX_SITE_URL ?? '').replace(/\/$/, '')}/api/auth`;
  const cachedTrustedClients = parseCachedTrustedClients(
    process.env.PUBLIC_OAUTH_TRUSTED_CLIENTS_JSON
  );

  return betterAuth({
    secret: betterAuthSecret,
    baseURL: process.env.CONVEX_SITE_URL,
    trustedOrigins,
    database: authComponent.adapter(ctx),
    socialProviders: discordConfig,
    plugins: [
      crossDomain({ siteUrl }),
      convex({ authConfig }),
      jwt({
        jwt: {
          issuer: authBaseUrl,
          audience: PUBLIC_API_AUDIENCE,
        },
        disableSettingJwtHeader: true,
      }),
      oauthProvider({
        loginPage: `${siteUrl.replace(/\/$/, '')}/oauth/login`,
        consentPage: `${siteUrl.replace(/\/$/, '')}/oauth/consent`,
        scopes: ['verification:read'],
        validAudiences: [PUBLIC_API_AUDIENCE],
        cachedTrustedClients,
        allowDynamicClientRegistration: false,
        allowUnauthenticatedClientRegistration: false,
        grantTypes: ['authorization_code', 'refresh_token'],
        customAccessTokenClaims: async ({ user, scopes }) => ({
          scope: scopes.join(' '),
          auth_user_id: user?.id,
        }),
      }),
      vrchat(),
    ],
    session: {
      expiresIn: 60 * 60 * 24 * 7, // 7 days
      updateAge: 60 * 60 * 24, // 1 day
      cookieCache: {
        enabled: true,
        maxAge: 5 * 60, // 5 minutes
      },
    },
    advanced: {
      cookiePrefix: 'yucp',
    },
  } satisfies BetterAuthOptions);
};
