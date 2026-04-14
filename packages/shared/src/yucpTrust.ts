export type YucpPinnedRoot = Readonly<{
  keyId: string;
  algorithm: 'Ed25519';
  publicKeyBase64: string;
}>;

const PINNED_ROOT_PUBLIC_KEY_BASE64 = 'y+8Zs9/mS1MFZFeF4CFjwqe0nsLW8lCcwmyvBx6H0Zo=';

const BUILTIN_PINNED_ROOTS: readonly YucpPinnedRoot[] = Object.freeze([
  {
    keyId: 'yucp-root',
    algorithm: 'Ed25519',
    publicKeyBase64: PINNED_ROOT_PUBLIC_KEY_BASE64,
  },
  {
    keyId: 'yucp-root-2025',
    algorithm: 'Ed25519',
    publicKeyBase64: PINNED_ROOT_PUBLIC_KEY_BASE64,
  },
]);

let pinnedRootsOverride: readonly YucpPinnedRoot[] | null = null;

function normalizePinnedRoot(root: YucpPinnedRoot): YucpPinnedRoot {
  return {
    keyId: root.keyId.trim(),
    algorithm: 'Ed25519',
    publicKeyBase64: root.publicKeyBase64.trim(),
  };
}

export function getPinnedYucpRoots(): readonly YucpPinnedRoot[] {
  return pinnedRootsOverride ?? BUILTIN_PINNED_ROOTS;
}

export function getPrimaryPinnedYucpRoot(): YucpPinnedRoot {
  return getPinnedYucpRoots()[0]!;
}

export function getPinnedYucpRootByKeyId(keyId: string | null | undefined): YucpPinnedRoot | null {
  if (!keyId) {
    return null;
  }

  return (
    getPinnedYucpRoots().find((root) => root.keyId === keyId.trim() && root.algorithm === 'Ed25519') ??
    null
  );
}

export function getPinnedYucpJwkSet(): Array<{
  kty: 'OKP';
  crv: 'Ed25519';
  kid: string;
  x: string;
}> {
  return getPinnedYucpRoots().map((root) => ({
    kty: 'OKP',
    crv: root.algorithm,
    kid: root.keyId,
    x: root.publicKeyBase64,
  }));
}

/**
 * Test-only hook for replacing the pinned root set with deterministic fixture keys.
 */
export function setPinnedYucpRootsForTests(roots: readonly YucpPinnedRoot[] | null): void {
  pinnedRootsOverride = roots ? roots.map(normalizePinnedRoot) : null;
}
