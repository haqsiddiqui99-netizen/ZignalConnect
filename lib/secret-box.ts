import crypto from "crypto";
import fs from "fs";
import path from "path";

/**
 * Seals the few values that would do harm if a copy of the database leaked: a desk's bank account
 * number, its PAN, and the router or billing-database secrets.
 *
 * The key is DATA_KEY from the host's variables when it is set. Otherwise a random key is made once
 * and kept in data/data.key beside the database. A key that sits next to the database only helps when
 * the database file alone is copied, so DATA_KEY on Railway is the stronger choice. Both keys are tried
 * when reading, and anything sealed under the other key is re-sealed on the next start.
 */

const PREFIX = "enc1:";

function fileKeyPath() {
  return path.join(process.cwd(), "data", "data.key");
}

function envKey() {
  const raw = (process.env.DATA_KEY ?? "").trim();
  if (raw.length < 16) return null;
  return crypto.createHash("sha256").update(`zignal-data-v1:${raw}`).digest();
}

function fileKey(create: boolean) {
  const file = fileKeyPath();
  if (!fs.existsSync(file)) {
    if (!create) return null;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, crypto.randomBytes(32).toString("hex"), { mode: 0o600 });
  }
  const text = fs.readFileSync(file, "utf8").trim();
  return text ? crypto.createHash("sha256").update(`zignal-file-v1:${text}`).digest() : null;
}

/** The key new values are sealed with. */
function primaryKey() {
  return envKey() ?? fileKey(true)!;
}

/** Every key a stored value might have been sealed with, newest first. */
function readKeys() {
  const keys: Buffer[] = [];
  const env = envKey();
  if (env) keys.push(env);
  const file = fileKey(false);
  if (file) keys.push(file);
  return keys;
}

function sealWith(key: Buffer, plain: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return PREFIX + Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url");
}

function openWith(key: Buffer, stored: string) {
  const raw = Buffer.from(stored.slice(PREFIX.length), "base64url");
  if (raw.length < 29) return null;
  try {
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

export function isSealed(value: string) {
  return value.startsWith(PREFIX);
}

/** Seal a value for storage. An empty value stays empty. */
export function seal(plain: string) {
  if (!plain) return "";
  return sealWith(primaryKey(), plain);
}

/**
 * Read a stored value. A value saved before sealing existed is returned as it is, and the next start seals it.
 * A sealed value that no key can open reads as empty, so the owner is asked to enter it again.
 */
export function open(stored: string | null | undefined) {
  if (!stored) return "";
  if (!isSealed(stored)) return stored;
  for (const key of readKeys()) {
    const plain = openWith(key, stored);
    if (plain !== null) return plain;
  }
  console.error("secret-box: a stored value could not be opened. Check DATA_KEY.");
  return "";
}

/** True when the value is plain, or sealed with a key other than the current one. */
export function needsSealing(stored: string | null | undefined) {
  if (!stored) return false;
  if (!isSealed(stored)) return true;
  return openWith(primaryKey(), stored) === null && open(stored) !== "";
}
