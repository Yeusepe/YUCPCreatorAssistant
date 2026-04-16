import { getRequestUrl } from '@tanstack/react-start/server';
import { createPublicRuntimeConfig, type PublicRuntimeConfig } from '@/lib/runtimeConfig';
import { getWebEnv, getWebRuntimeEnv } from '@/lib/server/runtimeEnv';

export function getPublicRuntimeConfigForRequest(): PublicRuntimeConfig {
  const env = getWebRuntimeEnv();
  const requestUrl = getRequestUrl({
    xForwardedHost: true,
    xForwardedProto: true,
  }).toString();

  return createPublicRuntimeConfig({
    requestUrl,
    frontendUrl: getWebEnv('FRONTEND_URL', env),
    siteUrl: getWebEnv('SITE_URL', env),
  });
}
