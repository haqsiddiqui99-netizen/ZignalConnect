export const SUPPORT_STATUSES = [
  { value: "new", label: "New" },
  { value: "in_progress", label: "In-progress" },
  { value: "closed", label: "Closed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "duplicate", label: "Duplicate" },
] as const;

export type SupportStatus = (typeof SUPPORT_STATUSES)[number]["value"];

export function supportStatusLabel(value: string) {
  return SUPPORT_STATUSES.find((item) => item.value === value)?.label ?? "—";
}

export function supportIsFinished(status: string) {
  return status === "closed" || status === "cancelled" || status === "duplicate";
}

export type SupportRequest = {
  id: number;
  provider_id: number;
  provider_name: string;
  user_id: number;
  sender_name: string;
  mobile: string;
  message: string;
  status: SupportStatus;
  reply: string;
  created_at: string;
  updated_at: string;
  resolved_at: string;
  priority: string;
  topic: string;
};

export type SupportFollowup = {
  id: number;
  request_id: number;
  message: string;
  created_at: string;
  sender_name: string;
};

export const SUPPORT_PRIORITIES = [
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
] as const;

export const SUPPORT_TOPICS = [
  { value: "billing", label: "Billing" },
  { value: "bug", label: "A bug" },
  { value: "subscriber", label: "Subscriber" },
  { value: "connection", label: "Connection" },
  { value: "other", label: "Other" },
] as const;

export function supportCode(id: number) {
  return `SUP-${1000 + id}`;
}
