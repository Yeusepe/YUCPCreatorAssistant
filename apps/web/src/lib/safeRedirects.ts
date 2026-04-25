import { getSafeRelativeRedirectTarget } from '@yucp/shared';

export function getSafeInternalRedirectTarget(redirectUrl: string): string {
  const safeTarget = getSafeRelativeRedirectTarget(redirectUrl);
  if (!safeTarget) {
    throw new Error('Unsupported redirect target');
  }

  return safeTarget;
}
