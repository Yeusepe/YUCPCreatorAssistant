import { api } from '../../../../convex/_generated/api';
import type { Auth } from '../auth';
import { BetterAuthEndpointError } from '../auth';
import { getConvexClientFromUrl } from '../lib/convex';
import { logger } from '../lib/logger';

interface AccountSecurityRoutesConfig {
  convexUrl: string;
  convexApiSecret: string;
}

function jsonResponse(body: unknown, status = 200) {
  return Response.json(body, { status });
}

async function readJsonBody<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

function getSafeErrorMessage(error: unknown, fallback: string) {
  if (error instanceof BetterAuthEndpointError && error.status >= 400 && error.status < 500) {
    return fallback;
  }
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return fallback;
}

export function createAccountSecurityRoutes(auth: Auth, config: AccountSecurityRoutesConfig) {
  const convex = getConvexClientFromUrl(config.convexUrl);

  async function startRecovery(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
      return jsonResponse({ error: 'Method not allowed' }, 405);
    }

    const body = await readJsonBody<{ email?: string }>(request);
    const email = body?.email?.trim();
    if (!email) {
      return jsonResponse({ error: 'Email is required' }, 400);
    }

    try {
      const resolution = await convex.query(api.accountSecurity.resolveRecoveryLookupForApi, {
        apiSecret: config.convexApiSecret,
        email,
      });

      if (resolution?.authUserId && resolution.emailDeliveryMethod && resolution.targetEmail) {
        await auth.sendEmailOtp({
          email: resolution.targetEmail,
          type: 'forget-password',
        });
        await convex.mutation(api.accountSecurity.beginEmailRecoveryForApi, {
          apiSecret: config.convexApiSecret,
          authUserId: resolution.authUserId,
          lookupEmail: email,
          deliveryMethod: resolution.emailDeliveryMethod,
          targetEmail: resolution.targetEmail,
        });
      }
    } catch (error) {
      logger.warn('Account recovery start failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return jsonResponse({
      success: true,
      message:
        'If that account can recover by email, a recovery code has been sent. Backup codes and support recovery remain available.',
    });
  }

  async function verifyRecoveryEmail(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
      return jsonResponse({ error: 'Method not allowed' }, 405);
    }

    const body = await readJsonBody<{ email?: string; otp?: string }>(request);
    const email = body?.email?.trim();
    const otp = body?.otp?.trim();
    if (!email || !otp) {
      return jsonResponse({ error: 'Email and code are required' }, 400);
    }

    try {
      const pending = await convex.query(api.accountSecurity.getPendingEmailRecoveryForApi, {
        apiSecret: config.convexApiSecret,
        email,
      });

      if (!pending?.targetEmail) {
        return jsonResponse({ error: 'Invalid or expired recovery code' }, 400);
      }

      await auth.checkEmailOtp({
        email: pending.targetEmail,
        type: 'forget-password',
        otp,
      });

      const completed = await convex.mutation(api.accountSecurity.consumeEmailRecoveryForApi, {
        apiSecret: config.convexApiSecret,
        email,
      });

      if (!completed) {
        return jsonResponse({ error: 'Invalid or expired recovery code' }, 400);
      }

      return jsonResponse({
        success: true,
        recoveryPasskeyContext: completed.recoveryPasskeyContext,
        expiresAt: completed.expiresAt,
      });
    } catch (error) {
      return jsonResponse(
        {
          error: getSafeErrorMessage(error, 'Invalid or expired recovery code'),
        },
        400
      );
    }
  }

  async function verifyRecoveryBackupCode(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
      return jsonResponse({ error: 'Method not allowed' }, 405);
    }

    const body = await readJsonBody<{ email?: string; backupCode?: string }>(request);
    const email = body?.email?.trim();
    const backupCode = body?.backupCode?.trim();
    if (!email || !backupCode) {
      return jsonResponse({ error: 'Email and backup code are required' }, 400);
    }

    try {
      const completed = await convex.mutation(api.accountSecurity.consumeBackupCodeRecoveryForApi, {
        apiSecret: config.convexApiSecret,
        email,
        backupCode,
      });

      if (!completed) {
        return jsonResponse({ error: 'Invalid backup code' }, 400);
      }

      return jsonResponse({
        success: true,
        recoveryPasskeyContext: completed.recoveryPasskeyContext,
        expiresAt: completed.expiresAt,
      });
    } catch (error) {
      return jsonResponse(
        {
          error: getSafeErrorMessage(error, 'Invalid backup code'),
        },
        400
      );
    }
  }

  return {
    startRecovery,
    verifyRecoveryEmail,
    verifyRecoveryBackupCode,
  };
}
