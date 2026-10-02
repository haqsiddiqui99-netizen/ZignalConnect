import { getSession } from "@/lib/auth";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session || (session.kind === "desk" && session.role !== "admin")) return new Response("Not found", { status: 404 });
  const path =
    session.kind === "operator" ? `/zignal/receipt/${id}/file` : `/provider/receipt/desk/${id}/file`;
  return Response.redirect(new URL(path, request.url));
}
