"use client";

import { useEffect, useRef, useState } from "react";
import { replySupport } from "@/lib/actions";
import { SubmitButton } from "@/components/submit-button";
import { formatStamp } from "@/lib/format";
import {
  SUPPORT_PRIORITIES,
  SUPPORT_STATUSES,
  SUPPORT_TOPICS,
  supportCode,
  supportIsFinished,
  supportStatusLabel,
  type SupportFollowup,
  type SupportRequest,
} from "@/lib/support";

export function ZignalTickets({
  tickets,
  notes,
  openId,
}: {
  tickets: SupportRequest[];
  notes: SupportFollowup[];
  openId: number | null;
}) {
  const [selected, setSelected] = useState<number | null>(openId);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const ticket = tickets.find((item) => item.id === selected) ?? null;
  const thread = notes.filter((note) => note.request_id === ticket?.id);

  useEffect(() => {
    setSelected(openId);
  }, [openId]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (ticket && !dialog.open) dialog.showModal();
    if (!ticket && dialog.open) dialog.close();
  }, [ticket]);

  function close() {
    setSelected(null);
  }

  return (
    <>
      <div className="table-wrap">
        <table className="support-table">
          <thead>
            <tr>
              <th>Support id</th>
              <th>Provider</th>
              <th>Description</th>
              <th>Priority</th>
              <th>About</th>
              <th>Status</th>
              <th>From</th>
              <th>Mobile</th>
              <th>Created</th>
              <th>Resolved</th>
            </tr>
          </thead>
          <tbody>
            {tickets.map((item) => (
              <tr
                key={item.id}
                className="ticket-row"
                tabIndex={0}
                onClick={() => setSelected(item.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setSelected(item.id);
                  }
                }}
              >
                <td>{supportCode(item.id)}</td>
                <td>{item.provider_name}</td>
                <td className="desc">
                  <span className="ticket-preview">{item.message}</span>
                </td>
                <td>
                  <span className={priorityClass(item.priority)}>{labelOf(SUPPORT_PRIORITIES, item.priority)}</span>
                </td>
                <td>{labelOf(SUPPORT_TOPICS, item.topic)}</td>
                <td>
                  <span className={statusClass(item.status)}>{supportStatusLabel(item.status)}</span>
                </td>
                <td>{item.sender_name}</td>
                <td>{item.mobile}</td>
                <td>{formatStamp(item.created_at)}</td>
                <td>{item.resolved_at ? formatStamp(item.resolved_at) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <dialog
        ref={dialogRef}
        className="ticket-dialog"
        aria-labelledby="ticket-title"
        onClose={close}
        onClick={(event) => {
          if (event.target === dialogRef.current) close();
        }}
      >
        {ticket ? (
          <form action={replySupport} className="ticket-sheet">
            <input type="hidden" name="request_id" value={ticket.id} />
            <div className="ticket-sheet-head">
              <div>
                <p className="fine">
                  {supportCode(ticket.id)} · {labelOf(SUPPORT_PRIORITIES, ticket.priority)} · {labelOf(SUPPORT_TOPICS, ticket.topic)} ·{" "}
                  {formatStamp(ticket.created_at)}
                </p>
                <h2 id="ticket-title">{ticket.provider_name}</h2>
              </div>
              <button type="button" className="btn small" onClick={close}>
                Close
              </button>
            </div>
            <p className="fine">
              {ticket.sender_name} · {ticket.mobile}
            </p>
            <p>{ticket.message}</p>
            {thread.map((note) => (
              <p key={note.id} className="fine follow">
                Follow-up · {note.sender_name} · {formatStamp(note.created_at)} — {note.message}
              </p>
            ))}
            <StatusPick value={ticket.status} />
            <label className="field">
              <span>Reply</span>
              <textarea name="reply" maxLength={800} rows={3} defaultValue={ticket.reply} />
            </label>
            <SubmitButton className="btn small" pendingLabel="Saving…">
              Save reply
            </SubmitButton>
          </form>
        ) : null}
      </dialog>
    </>
  );
}

function StatusPick({ value }: { value: string }) {
  const [status, setStatus] = useState(value);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    setStatus(value);
    setOpen(false);
  }, [value]);

  return (
    <div className="field status-menu">
      <span>Status</span>
      <input type="hidden" name="status" value={status} />
      <button type="button" className="status-menu-button" aria-expanded={open} aria-haspopup="listbox" onClick={() => setOpen((current) => !current)}>
        {supportStatusLabel(status)}
      </button>
      {open ? (
        <ul className="status-menu-list" role="listbox">
          {SUPPORT_STATUSES.map((item) => (
            <li key={item.value}>
              <button
                type="button"
                role="option"
                aria-selected={item.value === status}
                onClick={() => {
                  setStatus(item.value);
                  setOpen(false);
                }}
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function statusClass(status: string) {
  if (status === "new") return "pill warn";
  if (status === "in_progress") return "pill soon";
  if (supportIsFinished(status)) return "pill";
  return "pill warn";
}

function priorityClass(priority: string) {
  if (priority === "high") return "pill bad";
  if (priority === "low") return "pill";
  if (priority === "medium") return "pill soon";
  return "fine";
}

function labelOf(list: readonly { value: string; label: string }[], value: string) {
  return list.find((item) => item.value === value)?.label ?? "—";
}
