import crypto from "crypto";
import fs from "fs";
import path from "path";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { one } from "@/lib/db";
import { isProductPlan, type ProductPlan } from "@/lib/entitlements";
import { verifyPassword } from "@/lib/password";

export type Session = {
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
};

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

export async function setSession(uid: number) {
  const body = Buffer.from(JSON.stringify({ uid, exp: Date.now() + 1000 * 60 * 60 * 12 })).toString("base64url");
  const jar = await cookies();
  jar.set("lumen_session", `${body}.${sign(body)}`, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
}

export async function clearSession() {
  const jar = await cookies();
  jar.delete("lumen_session");
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
    const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as { uid?: number; exp?: number };
    if (!payload.uid || !payload.exp || payload.exp < Date.now()) return null;
    const user = one<UserRow>(
      `SELECT u.id, u.email, u.password_hash, u.role, u.name, u.provider_id, u.is_owner,
              p.name AS brand_name, p.product_plan, p.logo_letter, p.support_phone
       FROM users u
       LEFT JOIN providers p ON p.id = u.provider_id
       WHERE u.id = ?`,
      payload.uid,
    );
    if (!user || !user.provider_id) return null;
    const productPlan = user.product_plan && isProductPlan(user.product_plan) ? user.product_plan : "free";
    return {
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
    };
  } catch {
    return null;
  }
}

export async function requireRole(role: Session["role"]) {
  const session = await getSession();
  if (!session) redirect("/");
  if (session.role !== role) redirect(session.role === "admin" ? "/admin" : "/portal");
  return session;
}

export function authenticate(email: string, password: string) {
  const user = one<Pick<UserRow, "id" | "email" | "password_hash" | "role" | "name">>(
    "SELECT id, email, password_hash, role, name FROM users WHERE email = ?",
    email.trim().toLowerCase(),
  );
  if (!user || !verifyPassword(password, user.password_hash)) return null;
  return user;
}
