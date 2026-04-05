import { base64ToBytes, bytesToBase64 } from './keys';
import { toBufferSource } from './toBufferSource';

export type Sha256Input = string | Uint8Array | ArrayBuffer;

function toBytes(input: Sha256Input): Uint8Array {
  if (typeof input === 'string') {
    return new TextEncoder().encode(input);
  }
  if (input instanceof Uint8Array) {
    return input.slice();
  }
  return new Uint8Array(input.slice(0));
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function sha256Bytes(input: Sha256Input): Promise<Uint8Array> {
  const bytes = toBytes(input);
  return new Uint8Array(await crypto.subtle.digest('SHA-256', toBufferSource(bytes)));
}

export async function sha256Hex(input: Sha256Input): Promise<string> {
  return bytesToHex(await sha256Bytes(input));
}

export function base64UrlEncode(data: Uint8Array | string): string {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  return bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function base64UrlDecodeToBytes(input: string): Uint8Array {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const padLength = (4 - (normalized.length % 4 || 4)) % 4;
  return base64ToBytes(`${normalized}${'='.repeat(padLength)}`);
}

export async function sha256Base64Url(input: Sha256Input): Promise<string> {
  return base64UrlEncode(await sha256Bytes(input));
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
