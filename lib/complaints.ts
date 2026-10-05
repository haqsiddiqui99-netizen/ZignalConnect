export const COMPLAINT_STATUSES = [
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In-progress" },
  { value: "closed", label: "Closed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "duplicate", label: "Duplicate" },
] as const;

export type ComplaintStatus = (typeof COMPLAINT_STATUSES)[number]["value"];

export const COMPLAINT_CATEGORIES: Record<string, string> = {
  no_internet: "No internet",
  slow: "Slow connection",
  drops: "Connection drops",
  other: "Other",
};

export function isComplaintStatus(value: string): value is ComplaintStatus {
  return COMPLAINT_STATUSES.some((item) => item.value === value);
}

export function complaintStatusLabel(value: string) {
  return COMPLAINT_STATUSES.find((item) => item.value === value)?.label ?? "Open";
}

export function complaintIsFinished(status: string) {
  return status === "closed" || status === "cancelled" || status === "duplicate";
}

export function complaintCode(id: number) {
  return `CMP-${1000 + id}`;
}

export function slaHoursFor(category: string) {
  if (category === "no_internet") return 4;
  if (category === "drops") return 8;
  if (category === "slow") return 24;
  return 48;
}

function stampMillis(stamp: string) {
  const [date, time = "00:00"] = stamp.split(" ");
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  return new Date(year, month - 1, day, hour || 0, minute || 0).getTime();
}

export function slaLabel(createdAt: string, resolvedAt: string, hours: number, now = Date.now()) {
  const due = stampMillis(createdAt) + hours * 60 * 60 * 1000;
  const end = resolvedAt ? stampMillis(resolvedAt) : now;
  if (end > due) return { text: `${hours}h · Breached`, breached: true };
  if (resolvedAt) return { text: `${hours}h · Met`, breached: false };
  const leftHours = Math.max(1, Math.ceil((due - now) / (60 * 60 * 1000)));
  return { text: `${hours}h · ${leftHours}h left`, breached: false };
}
