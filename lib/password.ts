import crypto from "crypto";

export function hashPassword(password: string) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 32).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const actual = crypto.scryptSync(password, salt, 32);
  const expected = Buffer.from(hash, "hex");
  if (expected.length !== actual.length) return false;
  return crypto.timingSafeEqual(expected, actual);
}
