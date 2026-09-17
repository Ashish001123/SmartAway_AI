/**
 * E2EE helpers — AES-256-GCM via Web Crypto API (built into all browsers)
 *
 * Approach: conversation-scoped symmetric keys
 *  - The key for a conversation is derived from both user IDs via SHA-256
 *  - Both parties independently derive the SAME key — zero key exchange needed
 *  - Server only ever stores ciphertext (base64) — plaintext never leaves the device
 *  - Random 12-byte IV is prepended to every ciphertext for uniqueness
 */

const AES_PARAMS = { name: "AES-GCM", length: 256 };

// In-memory cache so we only derive each key once per session
const _keyCache = new Map();

/**
 * Derive a deterministic AES-GCM-256 key for the conversation between two users.
 * Deterministic: same two IDs → same key, always. No server interaction required.
 */
export async function getConversationKey(userId1, userId2) {
  const cacheKey = [userId1, userId2].sort().join("|");
  if (_keyCache.has(cacheKey)) return _keyCache.get(cacheKey);

  // SHA-256 of the sorted pair → 256-bit AES raw key material
  const raw = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(cacheKey)
  );

  const key = await crypto.subtle.importKey("raw", raw, AES_PARAMS, false, [
    "encrypt",
    "decrypt",
  ]);

  _keyCache.set(cacheKey, key);
  return key;
}

/**
 * Encrypt a UTF-8 plaintext → base64 string
 * Format stored in DB: base64( IV[12 bytes] + AES-GCM-ciphertext )
 */
export async function encryptText(plaintext, key) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const cipherBuf = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoded
  );

  // Pack IV + ciphertext into one buffer, encode as base64
  const combined = new Uint8Array(12 + cipherBuf.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(cipherBuf), 12);
  return btoa(String.fromCharCode(...combined));
}

/**
 * Decrypt a base64 ciphertext → UTF-8 plaintext (returns null on any failure)
 */
export async function decryptText(b64Ciphertext, key) {
  try {
    const combined = Uint8Array.from(atob(b64Ciphertext), (c) =>
      c.charCodeAt(0)
    );
    const iv = combined.slice(0, 12);
    const cipherBuf = combined.slice(12);
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      cipherBuf
    );
    return new TextDecoder().decode(decrypted);
  } catch {
    return null; // corrupted or wrong key
  }
}

// ─── v2: per-user ECDH keys ─────────────────────────────────────────────────
// Each user has a P-256 key pair created in the browser. The private key never leaves the
// device unencrypted: the server only stores a copy wrapped with a key derived from the
// user's chat PIN. A conversation key is ECDH(my private, their public) → HKDF → AES-GCM,
// so only the two participants can derive it.

const ECDH_PARAMS = { name: "ECDH", namedCurve: "P-256" };
const PBKDF2_ITERATIONS = 600000;
const HKDF_SALT = new TextEncoder().encode("smartway-e2ee-v2");

const toBase64 = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const fromBase64 = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

export class WrongPinError extends Error {}

// Canonical JSON so the same key always serialises to the same string
export const serializePublicKey = ({ kty, crv, x, y }) => JSON.stringify({ kty, crv, x, y });

export async function generateIdentityKeys() {
  const { privateKey, publicKey } = await crypto.subtle.generateKey(ECDH_PARAMS, true, ["deriveBits"]);
  return { privateKey, publicKey: serializePublicKey(await crypto.subtle.exportKey("jwk", publicKey)) };
}

const pinKey = async (pin, salt, iterations) => {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
};

// Returns the JSON backup string the server stores
export async function wrapPrivateKey(privateKey, pin) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const pkcs8 = await crypto.subtle.exportKey("pkcs8", privateKey);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await pinKey(pin, salt, PBKDF2_ITERATIONS),
    pkcs8
  );
  return JSON.stringify({
    v: 1,
    kdf: "PBKDF2-SHA256",
    iterations: PBKDF2_ITERATIONS,
    salt: toBase64(salt),
    iv: toBase64(iv),
    ciphertext: toBase64(ciphertext),
  });
}

export async function unwrapPrivateKey(backupJson, pin, { extractable = false } = {}) {
  const backup = JSON.parse(backupJson);
  let pkcs8;
  try {
    pkcs8 = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64(backup.iv) },
      await pinKey(pin, fromBase64(backup.salt), backup.iterations),
      fromBase64(backup.ciphertext)
    );
  } catch {
    throw new WrongPinError("That PIN is incorrect");
  }
  return crypto.subtle.importKey("pkcs8", pkcs8, ECDH_PARAMS, extractable, ["deriveBits"]);
}

// A copy that can be used but never exported again, for storing on this device
export async function toNonExtractable(privateKey) {
  const pkcs8 = await crypto.subtle.exportKey("pkcs8", privateKey);
  return crypto.subtle.importKey("pkcs8", pkcs8, ECDH_PARAMS, false, ["deriveBits"]);
}

const _sharedKeyCache = new Map();

export function clearSharedKeyCache() {
  _sharedKeyCache.clear();
}

export async function getSharedKey(myPrivateKey, theirPublicKey, userId1, userId2) {
  const ids = [userId1, userId2].map(String).sort().join("|");
  const cacheKey = `${theirPublicKey}|${ids}`;
  if (_sharedKeyCache.has(cacheKey)) return _sharedKeyCache.get(cacheKey);

  const publicKey = await crypto.subtle.importKey("jwk", JSON.parse(theirPublicKey), ECDH_PARAMS, false, []);
  const bits = await crypto.subtle.deriveBits({ name: "ECDH", public: publicKey }, myPrivateKey, 256);
  const hkdfKey = await crypto.subtle.importKey("raw", bits, "HKDF", false, ["deriveKey"]);
  // Binding both user ids means a key can't be replayed into a different conversation
  const key = await crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: HKDF_SALT, info: new TextEncoder().encode(`smartway-e2ee-v2|${ids}`) },
    hkdfKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
  _sharedKeyCache.set(cacheKey, key);
  return key;
}
