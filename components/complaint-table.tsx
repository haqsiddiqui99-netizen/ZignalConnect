"use client";

import Link from "next/link";
import { useState } from "react";
import { updateComplaint } from "@/lib/actions";
import { SubmitButton } from "@/components/submit-button";
import {
  COMPLAINT_CATEGORIES,
  COMPLAINT_STATUSES,
  complaintCode,
  complaintStatusLabel,
  slaLabel,
} from "@/lib/complaints";
import { formatStamp } from "@/lib/format";
import type { Complaint } from "@/lib/queries";

const PILL: Record<string, string> = {
  new: "pill warn",
  assigned: "pill soon",
  pending: "pill warn",
  resolved: "pill",
};

type Field = "status" | "assignee" | "note";

export function ComplaintTable({
  tickets,
  staff,
}: {
  tickets: Complaint[];
  staff: { id: number; name: string }[];
}) {
  const [editing, setEditing] = useState<{ id: number; field: Field } | null>(null);
  const open = (id: number, field: Field) => setEditing({ id, field });
  const close = () => setEditing(null);
  const isEditing = (id: number, field: Field) => editing?.id === id && editing.field === field;

  return (
    <div className="table-wrap">
      <table className="complaint-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Subscriber</th>
            <th>Complaint</th>
            <th>Status</th>
            <th>Assignee</th>
            <th>Created</th>
            <th>Resolved</th>
            <th>SLA</th>
            <th>Description</th>
            <th>Note</th>
          </tr>
        </thead>
        <tbody>
          {tickets.map((ticket) => {
            const sla = slaLabel(ticket.created_at, ticket.resolved_at, ticket.sla_hours);
            return (
              <tr key={ticket.id}>
                <td>{complaintCode(ticket.id)}</td>
                <td>
                  <Link className="rowlink" href={`/provider/subscriber/${ticket.customer_id}`}>
                    {ticket.customer_name}
                  </Link>
                </td>
                <td style={{ whiteSpace: "nowrap" }}>
                  {COMPLAINT_CATEGORIES[ticket.category] ?? ticket.category}
                </td>
                <td>
                  {isEditing(ticket.id, "status") ? (
                    <EditForm ticket={ticket} field="status" onCancel={close}>
                      <select name="status" defaultValue={ticket.status}>
                        {COMPLAINT_STATUSES.map((item) => (
                          <option key={item.value} value={item.value}>
                            {item.label}
                          </option>
                        ))}
                      </select>
                    </EditForm>
                  ) : (
                    <CellValue
                      onEdit={() => open(ticket.id, "status")}
                      label={`Edit status for ${complaintCode(ticket.id)}`}
                    >
                      <span className={PILL[ticket.status] ?? "pill"}>{complaintStatusLabel(ticket.status)}</span>
                    </CellValue>
                  )}
                </td>
                <td>
                  {isEditing(ticket.id, "assignee") ? (
                    <EditForm ticket={ticket} field="assignee" onCancel={close}>
                      <select name="assignee_id" defaultValue={ticket.assignee_id ?? ""}>
                        <option value="">Unassigned</option>
                        {staff.map((person) => (
                          <option key={person.id} value={person.id}>
                            {person.name}
                          </option>
                        ))}
                      </select>
                    </EditForm>
                  ) : (
                    <CellValue
                      onEdit={() => open(ticket.id, "assignee")}
                      label={`Edit assignee for ${complaintCode(ticket.id)}`}
                    >
                      {ticket.assignee_name || "Unassigned"}
                    </CellValue>
                  )}
                </td>
                <td>{formatStamp(ticket.created_at)}</td>
                <td>{ticket.resolved_at ? formatStamp(ticket.resolved_at) : "—"}</td>
                <td style={sla.breached ? { color: "var(--bad)" } : undefined}>{sla.text}</td>
                <td className="fold-cell">
                  <FoldText text={ticket.details} label={`Description for ${complaintCode(ticket.id)}`} />
                </td>
                <td className="fold-cell">
                  {isEditing(ticket.id, "note") ? (
                    <EditForm ticket={ticket} field="note" onCancel={close}>
                      <input
                        name="provider_note"
                        maxLength={400}
                        defaultValue={ticket.provider_note}
                        placeholder="Update from the assignee"
                      />
                    </EditForm>
                  ) : (
                    <div className="demo-row" style={{ alignItems: "center", flexWrap: "nowrap" }}>
                      <FoldText text={ticket.provider_note} label={`Note for ${complaintCode(ticket.id)}`} />
                      <button
                        type="button"
                        className="btn small"
                        onClick={() => open(ticket.id, "note")}
                        aria-label={`Edit note for ${complaintCode(ticket.id)}`}
                      >
                        Edit
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function FoldText({ text, label }: { text: string; label: string }) {
  const [open, setOpen] = useState(false);
  if (!text) return <>—</>;
  return (
    <button
      type="button"
      className="fold-toggle"
      aria-expanded={open}
      aria-label={label}
      onClick={() => setOpen((value) => !value)}
    >
      <span className={open ? "fold-full" : "fold-clip"}>{text}</span>
      <span className="fold-mark" aria-hidden="true">
        {open ? "▴" : "▾"}
      </span>
    </button>
  );
}

function CellValue({
  children,
  onEdit,
  label,
}: {
  children: React.ReactNode;
  onEdit: () => void;
  label: string;
}) {
  return (
    <div className="demo-row" style={{ alignItems: "center", flexWrap: "nowrap" }}>
      <span>{children}</span>
      <button type="button" className="btn small" onClick={onEdit} aria-label={label}>
        Edit
      </button>
    </div>
  );
}

function EditForm({
  ticket,
  field,
  onCancel,
  children,
}: {
  ticket: Complaint;
  field: Field;
  onCancel: () => void;
  children: React.ReactNode;
}) {
  return (
    <form action={updateComplaint} className="stack">
      <input type="hidden" name="complaint_id" value={ticket.id} />
      {field === "status" ? null : <input type="hidden" name="status" value={ticket.status} />}
      {field === "assignee" ? null : <input type="hidden" name="assignee_id" value={ticket.assignee_id ?? ""} />}
      {field === "note" ? null : <input type="hidden" name="provider_note" value={ticket.provider_note} />}
      {children}
      <div className="demo-row">
        <SubmitButton className="btn small" pendingLabel="Saving…">
          Save
        </SubmitButton>
        <button type="button" className="btn small" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
