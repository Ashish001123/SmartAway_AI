import crypto from "crypto";

// Decrypts E2EE text messages on the backend for AI auto-reply processing and email previews
export function decryptText(b64Ciphertext, senderId, receiverId) {
  try {
    if (!b64Ciphertext) return "";
    const cacheKey = [senderId.toString(), receiverId.toString()].sort().join("|");
    const key = crypto.createHash("sha256").update(cacheKey).digest();

    const buffer = Buffer.from(b64Ciphertext, "base64");
    if (buffer.length < 28) {
      return "";
    }

    const iv = buffer.subarray(0, 12);
    const encryptedData = buffer.subarray(12);

    const ciphertext = encryptedData.subarray(0, encryptedData.length - 16);
    const authTag = encryptedData.subarray(encryptedData.length - 16);

    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final()
    ]);

    return decrypted.toString("utf8");
  } catch (err) {
    console.error("Backend E2EE decryption failed:", err.message);
    return "";
  }
}

// ─── E2EE v2 (per-user ECDH keys) ───────────────────────────────────────────
// The server never sees private keys or plaintext; it only checks that uploaded
// key material is well-formed so a bad client can't store garbage for others.

const BASE64URL_P256_COORDINATE = /^[A-Za-z0-9_-]{43}$/;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
const MIN_PBKDF2_ITERATIONS = 100000;

const parseJson = (value) => {
  try {
    return typeof value === "string" ? JSON.parse(value) : null;
  } catch {
    return null;
  }
};

// Public key: canonical JSON of a P-256 JWK {kty, crv, x, y}
export const isValidPublicKey = (value) => {
  if (typeof value !== "string" || value.length > 300) return false;
  const jwk = parseJson(value);
  return (
    jwk?.kty === "EC" &&
    jwk.crv === "P-256" &&
    BASE64URL_P256_COORDINATE.test(jwk.x) &&
    BASE64URL_P256_COORDINATE.test(jwk.y) &&
    Object.keys(jwk).length === 4
  );
};

// Private key backup: the key wrapped client-side with a PIN-derived key
export const isValidKeyBackup = (value) => {
  if (typeof value !== "string" || value.length > 4000) return false;
  const backup = parseJson(value);
  return (
    backup?.v === 1 &&
    backup.kdf === "PBKDF2-SHA256" &&
    Number.isInteger(backup.iterations) &&
    backup.iterations >= MIN_PBKDF2_ITERATIONS &&
    [backup.salt, backup.iv, backup.ciphertext].every((field) => typeof field === "string" && BASE64.test(field))
  );
};
