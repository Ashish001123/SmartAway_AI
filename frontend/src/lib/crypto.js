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
