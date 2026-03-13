/**
 * Connect Plugin Architecture
 *
 * Each provider owns its own connect routes. A thin registry in `providers/connect/index.ts`
 * auto-registers them all into the connect router. Adding a new provider means:
 * 1. Create `providers/connect/{name}.ts` — implement `ConnectPlugin`
 * 2. Add import + array entry in `providers/connect/index.ts`
 * Nothing else changes (connect.ts and index.ts are untouched).
 */

import type { Auth } from '../../auth';

// ──────────────────────────────────────────────────────────────────────────────
// ConnectConfig
// ──────────────────────────────────────────────────────────────────────────────

/** Configuration for the connect infrastructure. Passed to createConnectRoutes and ConnectContext. */
export interface ConnectConfig {
  apiBaseUrl: string;
  frontendBaseUrl: string;
  /** Convex .site URL for direct auth (e.g. https://rare-squid-409.convex.site) */
  convexSiteUrl: string;
  discordClientId: string;
  discordClientSecret: string;
  /** Discord bot token for fetching guild info (name, icon) */
  discordBotToken?: string;
  convexApiSecret: string;
  convexUrl: string;
  gumroadClientId?: string;
  gumroadClientSecret?: string;
  encryptionSecret: string;
}

// ──────────────────────────────────────────────────────────────────────────────
// ConnectContext
// ──────────────────────────────────────────────────────────────────────────────

type SetupSession = { authUserId: string; guildId: string; discordUserId: string };
type AuthSession = NonNullable<Awaited<ReturnType<Auth['getSession']>>>;

/** Result of requireBoundSetupSession — discriminated union for safe narrowing */
export type BoundSetupResult =
  | { ok: true; setupSession: SetupSession; authSession: AuthSession; authDiscordUserId: string }
  | { ok: false; response: Response };

/**
 * Dependency-injection container passed to every ConnectPlugin route handler.
 *
 * Contains only the auth helpers that require closed-over state (auth instance,
 * config). Pure utilities (encrypt, getStateStore, getConvexClientFromUrl) are
 * imported directly by each handler to keep this interface minimal.
 */
export interface ConnectContext {
  /** Full connect config — provides URLs, credentials, API secrets */
  readonly config: ConnectConfig;
  /** Auth instance — for auth.getSession(request) */
  readonly auth: Auth;
  /**
   * Validates that both the setup token AND the Better Auth session are present
   * and that the Discord identity matches. Returns a ready-to-use error Response
   * when validation fails (ok: false), so callers can `return result.response`.
   */
  requireBoundSetupSession(request: Request): Promise<BoundSetupResult>;
  /**
   * Extracts the setup session token from Authorization: Bearer header or cookie.
   * Used by handlers that need to store the token in OAuth state for round-tripping.
   */
  getSetupSessionTokenFromRequest(request: Request): string | null;
  /**
   * Returns true if the creator profile at `authUserId` is owned by `sessionUserId`.
   * Used to authorise cross-tenant operations initiated from the dashboard.
   */
  isTenantOwnedBySessionUser(sessionUserId: string, authUserId: string): Promise<boolean>;
}

// ──────────────────────────────────────────────────────────────────────────────
// ConnectPlugin
// ──────────────────────────────────────────────────────────────────────────────

/** A single HTTP route contributed by a provider connect plugin */
export interface ConnectRoute {
  readonly method: 'GET' | 'POST' | 'DELETE' | 'PUT';
  readonly path: string;
  readonly handler: (request: Request, ctx: ConnectContext) => Promise<Response>;
}

/**
 * The contract every provider connect module must satisfy.
 * Add a plugin to `providers/connect/index.ts` and its routes are registered automatically.
 */
export interface ConnectPlugin {
  /** Must match the provider's ProviderPlugin.id */
  readonly providerId: string;
  readonly routes: ReadonlyArray<ConnectRoute>;
}

// ──────────────────────────────────────────────────────────────────────────────
// Shared utilities
// ──────────────────────────────────────────────────────────────────────────────

/** Cryptographically-secure hex string of `length` random bytes */
export function generateSecureRandom(length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
