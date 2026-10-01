"use client";

import { useFormStatus } from "react-dom";

export function SubmitButton({
  children,
  pendingLabel = "Working…",
  className = "btn primary",
  name,
  value,
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  className?: string;
  name?: string;
  value?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending} name={name} value={value}>
      {pending ? pendingLabel : children}
    </button>
  );
}
