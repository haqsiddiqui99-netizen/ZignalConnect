export const LINE_STATUSES = [
  { value: "active", label: "Active" },
  { value: "suspended", label: "Paused" },
  { value: "disconnected", label: "Disconnect" },
  { value: "collection", label: "Collection" },
  { value: "write_off", label: "Write off" },
] as const;

export type LineStatus = (typeof LINE_STATUSES)[number]["value"];

export function isLineStatus(value: string): value is LineStatus {
  return LINE_STATUSES.some((item) => item.value === value);
}

export function lineStatusLabel(value: string) {
  return LINE_STATUSES.find((item) => item.value === value)?.label ?? value;
}

const IMPORT_STATUS: Record<string, LineStatus> = {
  active: "active",
  paused: "suspended",
  suspended: "suspended",
  disconnect: "disconnected",
  disconnected: "disconnected",
  collection: "collection",
  "write off": "write_off",
  writeoff: "write_off",
  write_off: "write_off",
};

export function lineStatusFromImport(value: string): LineStatus {
  return IMPORT_STATUS[value.trim().toLowerCase()] ?? "active";
}
