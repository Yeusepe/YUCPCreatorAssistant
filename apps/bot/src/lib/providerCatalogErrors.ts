export type ProviderCatalogErrorKind =
  | 'session_expired'
  | 'not_connected'
  | 'malformed_payload'
  | 'transient'
  | 'other';

const MALFORMED_PROVIDER_PAYLOAD_PATTERNS = [
  /unexpected token\b/i,
  /failed to parse\b/i,
  /\binvalid json\b/i,
  /\bmalformed\b.*\b(payload|response|json)\b/i,
  /\baccess[_ -]?token\b/i,
  /\brefresh[_ -]?token\b/i,
];

const TRANSIENT_PROVIDER_FAILURE_PATTERNS = [
  /\brate[_ -]?limited\b/i,
  /\btoo many requests\b/i,
  /\bprovider_unavailable\b/i,
  /\btemporar(?:y|ily) unavailable\b/i,
  /\bservice unavailable\b/i,
  /\btimeout\b/i,
  /\btimed out\b/i,
  /\bnetwork error\b/i,
];

export function classifyProviderCatalogError(
  error: string | null | undefined
): ProviderCatalogErrorKind | undefined {
  const trimmed = error?.trim();
  if (!trimmed) {
    return undefined;
  }
  if (trimmed === 'session_expired') {
    return 'session_expired';
  }
  if (trimmed === 'malformed_payload') {
    return 'malformed_payload';
  }
  if (/\bis not connected\b/i.test(trimmed)) {
    return 'not_connected';
  }
  if (MALFORMED_PROVIDER_PAYLOAD_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    return 'malformed_payload';
  }
  if (TRANSIENT_PROVIDER_FAILURE_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    return 'transient';
  }
  return 'other';
}
