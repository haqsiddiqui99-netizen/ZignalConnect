"use client";

import { SubmitButton } from "@/components/submit-button";

export function AddPromo({
  code,
  action,
}: {
  code?: string;
  action: (formData: FormData) => void | Promise<void>;
}) {
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
