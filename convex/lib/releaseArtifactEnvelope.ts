export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

export function base64ToBytes(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return Uint8Array.from(bytes).buffer;
}

async function hmacSha256(keyBytes: ArrayBuffer, data: ArrayBuffer): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return crypto.subtle.sign('HMAC', key, data);
}

export async function sha256HexBytes(bytes: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', toArrayBuffer(bytes));
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function deriveEnvelopeKeyBytes(secret: string, purpose: string): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const secretBytes = encoder.encode(secret);
  const purposeBytes = encoder.encode(purpose);
  const salt = new Uint8Array(32);
  const prk = await hmacSha256(salt.buffer as ArrayBuffer, secretBytes.buffer as ArrayBuffer);
  const expandInput = new Uint8Array(purposeBytes.byteLength + 1);
  expandInput.set(purposeBytes);
  expandInput[purposeBytes.byteLength] = 0x01;
  return new Uint8Array(await hmacSha256(prk, expandInput.buffer as ArrayBuffer));
}

async function importAesKey(keyBytes: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    toArrayBuffer(keyBytes),
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptArtifactEnvelope(
  plaintext: Uint8Array,
  keyBytes: Uint8Array,
  ivBytes?: Uint8Array
): Promise<{
  ciphertext: Uint8Array;
  ivBase64: string;
  plaintextSha256: string;
  ciphertextSha256: string;
}> {
  const key = await importAesKey(keyBytes);
  const iv = ivBytes ?? crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(iv) },
    key,
    toArrayBuffer(plaintext)
  );
  const ciphertext = new Uint8Array(encrypted);
  return {
    ciphertext,
    ivBase64: bytesToBase64(iv),
    plaintextSha256: await sha256HexBytes(plaintext),
    ciphertextSha256: await sha256HexBytes(ciphertext),
  };
}

export async function decryptArtifactEnvelope(
  ciphertext: Uint8Array,
  keyBytes: Uint8Array,
  ivBase64: string
): Promise<Uint8Array> {
  const key = await importAesKey(keyBytes);
  const iv = base64ToBytes(ivBase64);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(iv) },
    key,
    toArrayBuffer(ciphertext)
  );
  return new Uint8Array(decrypted);
}
