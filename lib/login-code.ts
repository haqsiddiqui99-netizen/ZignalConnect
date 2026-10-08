import crypto from "crypto";
import { clearLoginChallenge, readLoginChallenge, setLoginChallenge } from "@/lib/auth";
import { one, run } from "@/lib/db";

/** Turn this on when sign-in email is connected and the code step should run. */
export const LOGIN_CODE_ENABLED = false;

const MINUTES = 10;
const MAX_ATTEMPTS = 5;

type LoginKind = "desk" | "operator";

type LoginCodeRow = {
  id: number;
  user_id: number;
  account_kind: LoginKind;
  email: string;
  code_hash: string;
  expires_at: string;
  attempts: number;
  created_at: string;
};

function hashCode(code: string) {
  return crypto.createHash("sha256").update(code).digest("hex");
}

function codesMatch(stored: string, code: string) {
  const actual = Buffer.from(stored, "hex");
  const expected = Buffer.from(hashCode(code), "hex");
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

export function maskEmail(email: string) {
  const [name, domain] = email.split("@");
  if (!name || !domain) return "your email";
  return `${name.slice(0, 1)}•••@${domain}`;
}

function freshCode() {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
}

function sweep() {
  run("DELETE FROM login_codes WHERE expires_at < ?", String(Date.now()));
}

export async function beginLoginCode(input: { userId: number; kind: LoginKind; email: string }) {
  sweep();
  const code = freshCode();
  const now = Date.now();
  run("DELETE FROM login_codes WHERE user_id = ? AND account_kind = ?", input.userId, input.kind);
  const inserted = run(
    "INSERT INTO login_codes (user_id, account_kind, email, code_hash, expires_at, attempts, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)",
    input.userId,
    input.kind,
    input.email,
    hashCode(code),
    String(now + MINUTES * 60 * 1000),
    String(now),
  );
  await setLoginChallenge(Number(inserted.lastInsertRowid));
  return code;
}

export async function dropLoginCode() {
  const id = await readLoginChallenge();
  if (id) run("DELETE FROM login_codes WHERE id = ?", id);
  await clearLoginChallenge();
}

async function currentRow() {
  const id = await readLoginChallenge();
  if (!id) return null;
  const row = one<LoginCodeRow>("SELECT id, user_id, account_kind, email, code_hash, expires_at, attempts, created_at FROM login_codes WHERE id = ?", id);
  if (!row || Number(row.expires_at) < Date.now() || row.attempts >= MAX_ATTEMPTS) {
    if (row) run("DELETE FROM login_codes WHERE id = ?", row.id);
    await clearLoginChallenge();
    return null;
  }
  return row;
}

export async function pendingLogin() {
  const row = await currentRow();
  if (!row) return null;
  return { email: maskEmail(row.email), sentAt: Number(row.created_at) };
}

export async function replaceLoginCode() {
  const row = await currentRow();
  if (!row) return { ok: false as const, reason: "expired" as const };
  if (Date.now() - Number(row.created_at) < 30_000) return { ok: false as const, reason: "soon" as const };
  const code = freshCode();
  const now = Date.now();
  run(
    "UPDATE login_codes SET code_hash = ?, expires_at = ?, attempts = 0, created_at = ? WHERE id = ?",
    hashCode(code),
    String(now + MINUTES * 60 * 1000),
    String(now),
    row.id,
  );
  await setLoginChallenge(row.id);
  return { ok: true as const, code, email: row.email };
}

export async function checkLoginCode(code: string) {
  const row = await currentRow();
  if (!row) return { ok: false as const, reason: "expired" as const };
  if (!codesMatch(row.code_hash, code)) {
    const attempts = row.attempts + 1;
    if (attempts >= MAX_ATTEMPTS) {
      run("DELETE FROM login_codes WHERE id = ?", row.id);
      await clearLoginChallenge();
      return { ok: false as const, reason: "expired" as const };
    }
    run("UPDATE login_codes SET attempts = ? WHERE id = ?", attempts, row.id);
    return { ok: false as const, reason: "mismatch" as const };
  }
  run("DELETE FROM login_codes WHERE user_id = ? AND account_kind = ?", row.user_id, row.account_kind);
  await clearLoginChallenge();
  return { ok: true as const, userId: row.user_id, kind: row.account_kind };
}
