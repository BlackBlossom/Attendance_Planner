import crypto from "node:crypto";

const CIPHER_KEY_B64 = "NPdLWA5w7yFQhPeUuKmO/A==";
const CIPHER_IV_B64 = "bV5V6nK4phvQG9ZhkAjugQ==";

/**
 * Encrypts plain text (like roll number or password) using CyberVidya's
 * AES-128-CBC algorithm with PKCS7 padding.
 */
export function encryptCyberVidya(plainText: string): string {
  const key = Buffer.from(CIPHER_KEY_B64, "base64");
  const iv = Buffer.from(CIPHER_IV_B64, "base64");
  const cipher = crypto.createCipheriv("aes-128-cbc", key, iv);
  let encrypted = cipher.update(plainText, "utf8", "base64");
  encrypted += cipher.final("base64");
  return encrypted;
}
