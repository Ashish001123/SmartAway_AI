import crypto from "crypto";

// Encrypts third-party tokens (e.g. Google refresh tokens) before they're stored in the database
const encryptionKey = () =>
  crypto
    .createHash("sha256")
    .update(`token-encryption:${process.env.TOKEN_ENCRYPTION_KEY || process.env.JWT_SECRET}`)
    .digest();

export const encryptSecret = (plaintext) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64");
};

export const decryptSecret = (payload) => {
  const buffer = Buffer.from(payload, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), buffer.subarray(0, 12));
  decipher.setAuthTag(buffer.subarray(12, 28));
  return Buffer.concat([decipher.update(buffer.subarray(28)), decipher.final()]).toString("utf8");
};
