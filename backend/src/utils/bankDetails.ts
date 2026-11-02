import { createCipheriv, createHash, randomBytes } from "node:crypto";

export function encryptBankAccount(accountNumber: string) {
  const secret = process.env.BANK_DETAILS_ENCRYPTION_KEY || process.env.JWT_SECRET;
  if (!secret) throw new Error("BANK_DETAILS_ENCRYPTION_KEY or JWT_SECRET must be configured to store vendor bank details");
  const key = createHash("sha256").update(secret).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(accountNumber, "utf8"), cipher.final()]);
  return {
    bank_account_number_encrypted: encrypted.toString("base64"),
    bank_account_number_iv: iv.toString("base64"),
    bank_account_number_tag: cipher.getAuthTag().toString("base64"),
    bank_account_last4: accountNumber.slice(-4),
  };
}
