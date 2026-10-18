"use client";

import { useFormStatus } from "react-dom";
import { Spinner } from "@/components/spinner";

export function SubmitButton({
  children,
  pendingLabel = "Working…",
  className = "btn primary",
  name,
  value,
  formAction,
  formNoValidate,
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  className?: string;
  name?: string;
  value?: string;
  formAction?: (formData: FormData) => void | Promise<void>;
  formNoValidate?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className={className}
      disabled={pending}
      aria-busy={pending}
      name={name}
      value={value}
      formAction={formAction}
      formNoValidate={formNoValidate}
    >
      {pending ? (
        <>
          <Spinner />
          <span role="status">{pendingLabel}</span>
        </>
      ) : (
        children
      )}
    </button>
  );
}
