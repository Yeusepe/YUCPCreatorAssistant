/**
 * Shared credential key constants for the generic credential system.
 *
 * AUTH_MODE_CREDENTIAL_KEY maps the authMode stored on a provider_connection
 * to the credentialKey used in provider_credentials.
 * Adding a new auth mode only requires an entry here — no per-provider code needed.
 */
export const AUTH_MODE_CREDENTIAL_KEY: Record<string, string> = {
  oauth: 'oauth_access_token',
  api_key: 'api_key',
  api_token: 'api_token',
  session: 'vrchat_session',
};
