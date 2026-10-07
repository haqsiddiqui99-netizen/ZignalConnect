"use client";

import { useState } from "react";
import { SubmitButton } from "@/components/submit-button";

export function AddPromo({
  code,
  action,
}: {
  code?: string;
  action: (formData: FormData) => void | Promise<void>;
}) {
  const [open, setOpen] = useState(Boolean(code));
  if (!open) {
    return (
      <button type="button" className="promo-toggle" onClick={() => setOpen(true)}>
        Have a promo code
      </button>
    );
  }
  return (
    <div className="promo-row">
      <label className="field">
        <span>Promo code (optional)</span>
        <input name="promo" defaultValue={code ?? ""} placeholder="Enter a code" autoComplete="off" />
      </label>
      <SubmitButton className="btn small" formAction={action} formNoValidate pendingLabel="Checking…">
        Apply
      </SubmitButton>
    </div>
  );
}
