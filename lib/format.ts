export function formatISO(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function todayISO() {
  return formatISO(new Date());
}

export function nowStamp() {
  const date = new Date();
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${formatISO(date)} ${hh}:${mm}`;
}

export function addDays(iso: string, days: number) {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  return formatISO(date);
}

export function addMonths(iso: string, months: number) {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1 + months, 1);
  const last = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  date.setDate(Math.min(d, last));
  return formatISO(date);
}

export function daysUntil(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  const target = new Date(y, m - 1, d).getTime();
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((target - today) / 86_400_000);
}

export function dueLabel(iso: string) {
  const days = daysUntil(iso);
  if (days < 0) {
    const n = Math.abs(days);
    return `${n} day${n === 1 ? "" : "s"} overdue`;
  }
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  return `Due in ${days} days`;
}

export function formatDate(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatStamp(stamp: string) {
  const [date, time] = stamp.split(" ");
  return time ? `${formatDate(date)} · ${time}` : formatDate(date);
}

export function formatInr(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatSpeed(mbps: number) {
  if (mbps >= 1000 && mbps % 1000 === 0) return `${mbps / 1000} Gbps`;
  return `${mbps} Mbps`;
}

export function connectionId(id: number) {
  return `LN-${1000 + id}`;
}

export function monthBounds(today = todayISO()) {
  const start = `${today.slice(0, 7)}-01`;
  return { start, next: addMonths(start, 1) };
}

export function renewalAfterPayment(currentRenew: string, today = todayISO()) {
  const base = currentRenew > today ? currentRenew : today;
  return addMonths(base, 1);
}

export function makeRef() {
  const stamp = todayISO().replaceAll("-", "");
  const n = Math.floor(1000 + Math.random() * 9000);
  return `ZIG${stamp}${n}`;
}

export function isDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}
