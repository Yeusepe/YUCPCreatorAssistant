export interface BetterAuthPageResult<T> {
  page: T[];
}

export function getBetterAuthPage<T>(
  result: BetterAuthPageResult<T> | null | undefined
): T[] {
  return result?.page ?? [];
}

export function buildOAuthConsentLookupWhere(authUserId: string, consentId: string) {
  return [
    { field: 'userId', operator: 'eq' as const, value: authUserId },
    { field: '_id', operator: 'eq' as const, value: consentId, connector: 'AND' as const },
  ];
}
