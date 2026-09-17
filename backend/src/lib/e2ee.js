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
