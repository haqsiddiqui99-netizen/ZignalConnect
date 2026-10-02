import { getSession } from "@/lib/auth";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session || session.kind !== "desk") return new Response("Not found", { status: 404 });
  const path =
    session.role === "admin"
      ? `/provider/receipt/income/${id}/file`
      : `/subscriber/receipt/${id}/file`;
  return Response.redirect(new URL(path, request.url));
}
