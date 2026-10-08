import crypto from "crypto";
import fs from "fs";
import path from "path";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { one, run } from "@/lib/db";
import { isProductPlan, type ProductPlan } from "@/lib/entitlements";
import { nowClock } from "@/lib/format";
import { verifyPassword } from "@/lib/password";

export type DeskSession = {
  kind: "desk";
  uid: number;
  role: "admin" | "customer";
  name: string;
  email: string;
  providerId: number;
  isOwner: boolean;
  productPlan: ProductPlan;
  brandName: string;
  logoLetter: string;
  supportPhone: string;
  theme: "light" | "dark";
};

export type OperatorSession = {
  kind: "operator";
  uid: number;
  role: "operator";
  name: string;
  email: string;
  theme: "light" | "dark";
};

export type Session = DeskSession | OperatorSession;

export function homePath(session: Session) {
  if (session.kind === "operator") return "/zignal";
  return session.role === "admin" ? "/provider" : "/subscriber";
}

type UserRow = {
  id: number;
  email: string;
  password_hash: string;
  role: "admin" | "customer";
  name: string;
  provider_id: number | null;
  is_owner: number;
  brand_name: string | null;
  product_plan: string | null;
  logo_letter: string | null;
  support_phone: string | null;
  theme: string | null;
};

function secret() {
  const file = path.join(process.cwd(), "data", "session.secret");
  if (!fs.existsSync(file)) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, crypto.randomBytes(32).toString("hex"));
  }
  return fs.readFileSync(file, "utf8");
}

function sign(body: string) {
  return crypto.createHmac("sha256", secret()).update(body).digest("base64url");
}

export async function setSession(uid: number, kind: "desk" | "operator" = "desk") {
  const body = Buffer.from(JSON.stringify({ uid, kind, exp: Date.now() + 1000 * 60 * 60 * 12 })).toString("base64url");
  const jar = await cookies();
  jar.set("lumen_session", `${body}.${sign(body)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  if (kind === "desk") run("UPDATE users SET last_login = ? WHERE id = ?", nowClock(), uid);
}

export async function clearSession() {
  const jar = await cookies();
  jar.delete("lumen_session");
}

const LOGIN_COOKIE = "lumen_login";
const LOGIN_MINUTES = 10;

export async function setLoginChallenge(id: number) {
  const body = Buffer.from(JSON.stringify({ id, exp: Date.now() + LOGIN_MINUTES * 60 * 1000 })).toString("base64url");
  const jar = await cookies();
  jar.set(LOGIN_COOKIE, `${body}.${sign(body)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: LOGIN_MINUTES * 60,
  });
}

export async function readLoginChallenge() {
  const jar = await cookies();
  const raw = jar.get(LOGIN_COOKIE)?.value;
  if (!raw) return null;
  const [body, sig] = raw.split(".");
  if (!body || !sig) return null;
  const actual = Buffer.from(sig);
  const expected = Buffer.from(sign(body));
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as { id?: number; exp?: number };
    if (!payload.id || !payload.exp || payload.exp < Date.now()) return null;
    return payload.id;
  } catch {
    return null;
  }
}

export async function clearLoginChallenge() {
  const jar = await cookies();
  jar.delete(LOGIN_COOKIE);
}

export async function getSession(): Promise<Session | null> {
  const jar = await cookies();
  const raw = jar.get("lumen_session")?.value;
  if (!raw) return null;
  const [body, sig] = raw.split(".");
  if (!body || !sig) return null;
  const actual = Buffer.from(sig);
  const expected = Buffer.from(sign(body));
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as {
      uid?: number;
      exp?: number;
      kind?: "desk" | "operator";
    };
    if (!payload.uid || !payload.exp || payload.exp < Date.now()) return null;
    if (payload.kind === "operator") {
      const operator = one<{ id: number; email: string; name: string; theme: string | null }>(
        "SELECT id, email, name, theme FROM platform_admins WHERE id = ?",
        payload.uid,
      );
      if (!operator) return null;
      return {
        kind: "operator",
        uid: operator.id,
        role: "operator",
        name: operator.name,
        email: operator.email,
        theme: operator.theme === "dark" ? "dark" : "light",
      } satisfies OperatorSession;
    }
    const user = one<UserRow>(
      `SELECT u.id, u.email, u.password_hash, u.role, u.name, u.provider_id, u.is_owner, u.theme,
              p.name AS brand_name, p.product_plan, p.logo_letter, p.support_phone
       FROM users u
       LEFT JOIN providers p ON p.id = u.provider_id
       WHERE u.id = ?`,
      payload.uid,
    );
    if (!user || !user.provider_id) return null;
    const productPlan = user.product_plan && isProductPlan(user.product_plan) ? user.product_plan : "pro";
    return {
      kind: "desk",
      uid: user.id,
      role: user.role,
      name: user.name,
      email: user.email,
      providerId: user.provider_id,
      isOwner: user.is_owner === 1,
      productPlan,
      brandName: user.brand_name || "Your ISP",
      logoLetter: user.logo_letter || "",
      supportPhone: user.support_phone || "",
      theme: user.theme === "dark" ? "dark" : "light",
    } satisfies DeskSession;
  } catch {
    return null;
  }
}

export async function requireRole(role: DeskSession["role"]) {
  const session = await getSession();
  if (!session) redirect("/");
  if (session.kind !== "desk" || session.role !== role) redirect(homePath(session));
  return session;
}

export async function requireOperator() {
  const session = await getSession();
  if (!session) redirect("/");
  if (session.kind !== "operator") redirect(homePath(session));
  return session;
}

export function authenticate(email: string, password: string) {
  const normalized = email.trim().toLowerCase();
  const user = one<Pick<UserRow, "id" | "email" | "password_hash" | "role" | "name">>(
    "SELECT id, email, password_hash, role, name FROM users WHERE email = ?",
    normalized,
  );
  if (user && verifyPassword(password, user.password_hash)) return { ...user, kind: "desk" as const };
  const operator = one<{ id: number; email: string; password_hash: string; name: string }>(
    "SELECT id, email, password_hash, name FROM platform_admins WHERE email = ?",
    normalized,
  );
  if (!operator || !verifyPassword(password, operator.password_hash)) return null;
  return { id: operator.id, email: operator.email, role: "operator" as const, name: operator.name, kind: "operator" as const };
}
