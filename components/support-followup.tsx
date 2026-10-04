"use client";

import { useState } from "react";
import { addSupportFollowup } from "@/lib/actions";
import { SubmitButton } from "@/components/submit-button";

export function SupportFollowup({ requestId }: { requestId: number }) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button type="button" className="btn small" style={{ marginTop: 8 }} onClick={() => setOpen(true)}>
        Follow up
      </button>
    );
  }
  return (
    <form action={addSupportFollowup} className="stack" style={{ marginTop: 8 }}>
      <input type="hidden" name="request_id" value={requestId} />
      <textarea name="message" required minLength={2} maxLength={800} rows={2} placeholder="Add what Zignal should know next." />
      <div className="demo-row">
        <SubmitButton className="btn small" pendingLabel="Sending…">
          Send follow-up
        </SubmitButton>
        <button type="button" className="btn small" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}
