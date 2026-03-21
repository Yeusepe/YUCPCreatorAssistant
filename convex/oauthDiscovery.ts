import type { GenericCtx } from '@convex-dev/better-auth';
import type { DataModel } from './_generated/dataModel';
import { createAuth } from './auth';

interface BetterAuthOAuthDiscoveryApi {
  getOAuthServerConfig(): Promise<unknown>;
}

export async function handleOAuthAuthorizationServerMetadata(
  ctx: GenericCtx<DataModel>,
  _request: Request
): Promise<Response> {
  const auth = createAuth(ctx);
  const api = auth.api as unknown as BetterAuthOAuthDiscoveryApi;
  const body = await api.getOAuthServerConfig();

  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'Cache-Control': 'public, max-age=15, stale-while-revalidate=15, stale-if-error=86400',
      'Content-Type': 'application/json',
    },
  });
}
