import { connectionId, daysUntil, dueLabel } from "@/lib/format";
import { lineStatusLabel } from "@/lib/line-status";

export function Banner({ error, notice }: { error?: string; notice?: string }) {
  if (error) return <p className="banner bad">{error}</p>;
  if (notice) return <p className="banner good">{notice}</p>;
  return null;
}

export function StatusPill({ status, renewDate }: { status: string; renewDate: string }) {
  if (status === "suspended" || status === "disconnected" || status === "write_off") {
    return <span className="pill bad">{lineStatusLabel(status)}</span>;
  }
  if (status === "collection") return <span className="pill warn">{lineStatusLabel(status)}</span>;
  const days = daysUntil(renewDate);
  if (days < 0) return <span className="pill warn">{dueLabel(renewDate)}</span>;
  if (days <= 7) return <span className="pill soon">{dueLabel(renewDate)}</span>;
  return <span className="pill ok">In service</span>;
}

export function LineId({ id }: { id: number }) {
  return <span className="fine">{connectionId(id)}</span>;
}
