import { one } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * For an uptime monitor and the Railway deploy check. It answers 200 only when the server is up and the
 * database opens, and it says nothing else, so it is safe to leave public.
 */
export async function GET() {
  try {
    one("SELECT 1 AS ok");
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false }, { status: 503 });
  }
}
