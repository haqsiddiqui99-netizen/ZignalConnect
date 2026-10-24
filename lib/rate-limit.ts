import { headers } from "next/headers";
import { one, run } from "@/lib/db";

export const MINUTE = 60 * 1000;
export const HOUR = 60 * MINUTE;

/**
 * The caller's address as the host's proxy reports it. Returns "" when no address is
 * known (for example on a dev machine), and callers then skip the per-address limit
 * rather than put every visitor into one shared bucket.
 */
export async function clientIp() {
  const list = await headers();
  const real = list.get("x-real-ip")?.trim();
  if (real) return real.slice(0, 64);
  const forwarded = list.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (forwarded ?? "").slice(0, 64);
}

function clean(key: string) {
  return key.slice(0, 200);
}

/** How many hits this key has had inside the window. */
export function hitsIn(key: string, windowMs: number) {
  const row = one<{ n: number }>("SELECT COUNT(*) AS n FROM rate_hits WHERE key = ? AND at > ?", clean(key), Date.now() - windowMs);
  return row?.n ?? 0;
}

export function addHit(key: string) {
  run("INSERT INTO rate_hits (key, at) VALUES (?, ?)", clean(key), Date.now());
  if (Math.random() < 0.02) run("DELETE FROM rate_hits WHERE at < ?", Date.now() - 24 * HOUR);
}

export function clearHits(key: string) {
  run("DELETE FROM rate_hits WHERE key = ?", clean(key));
}

/** True when the key has already used up `limit` hits inside the window. */
export function isBlocked(key: string, limit: number, windowMs: number) {
  return hitsIn(key, windowMs) >= limit;
}
