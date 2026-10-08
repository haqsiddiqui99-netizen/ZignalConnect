import { saveDeskMail, sendDeskMail } from "@/lib/actions";
import { requireOperator } from "@/lib/auth";
import { SubmitButton } from "@/components/submit-button";
import { Banner } from "@/components/ui";
import { formatStamp } from "@/lib/format";
import { DESK_MAIL_DEFAULTS, deskMailSettings, listDeskMailLog, listOpenDesks } from "@/lib/queries";

export const metadata = { title: "Desk mail" };

export default async function DeskMailPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  await requireOperator();
  const query = await searchParams;
  const settings = deskMailSettings();
  const desks = listOpenDesks();
  const sent = listDeskMailLog();

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Desk mail</h1>
          <p>These notes go to the ISP owner. The ISP receives them and cannot change them.</p>
        </div>
      </header>
      <Banner error={query.error} notice={query.notice} />
      <article className="card">
        <h2>Automatic notes</h2>
        <p className="fine" style={{ margin: "8px 0 16px" }}>
          A welcome email goes out when a desk opens. The two notes below go 3 days before the desk fee, and on the due
          date. Use {"{name}"}, {"{plan}"}, {"{date}"}, {"{amount}"}, and {"{isp}"}. No card is charged.
        </p>
        <form action={saveDeskMail} className="stack">
          <label className="field">
            <span>Fee reminders</span>
            <select name="desk_mail_on" defaultValue={settings.on ? "1" : "0"}>
              <option value="1">On</option>
              <option value="0">Off</option>
            </select>
          </label>
          <label className="field">
            <span>3 days before — title</span>
            <input name="soon_title" required maxLength={80} defaultValue={settings.soonTitle || DESK_MAIL_DEFAULTS.soonTitle} />
          </label>
          <label className="field">
            <span>3 days before — message</span>
            <textarea name="soon_body" required maxLength={400} rows={3} defaultValue={settings.soonBody || DESK_MAIL_DEFAULTS.soonBody} />
          </label>
          <label className="field">
            <span>Due date — title</span>
            <input name="due_title" required maxLength={80} defaultValue={settings.dueTitle || DESK_MAIL_DEFAULTS.dueTitle} />
          </label>
          <label className="field">
            <span>Due date — message</span>
            <textarea name="due_body" required maxLength={400} rows={3} defaultValue={settings.dueBody || DESK_MAIL_DEFAULTS.dueBody} />
          </label>
          <SubmitButton className="btn small">Save automatic notes</SubmitButton>
        </form>
      </article>
      <article className="card" style={{ marginTop: 14 }}>
        <h2>Send a note</h2>
        <p className="fine" style={{ margin: "8px 0 16px" }}>
          Send now to one open desk, or to every open desk. Email is the only medium connected. Message and WhatsApp are
          not connected yet.
        </p>
        <form action={sendDeskMail} className="stack">
          <div className="row-2">
            <label className="field">
              <span>Desk</span>
              <select name="provider_id" defaultValue="all">
                <option value="all">Every open desk</option>
                {desks.map((desk) => (
                  <option key={desk.id} value={desk.id}>
                    {desk.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Medium</span>
              <select name="channel" defaultValue="email">
                <option value="email">Email</option>
              </select>
            </label>
          </div>
          <label className="field">
            <span>Title</span>
            <input name="title" required maxLength={80} placeholder="Plan change, trial ending, visit booked" />
          </label>
          <label className="field">
            <span>Message</span>
            <textarea name="body" required maxLength={400} rows={3} placeholder="This is emailed to the desk owner." />
          </label>
          <SubmitButton className="btn small" pendingLabel="Sending…">
            Send note
          </SubmitButton>
        </form>
      </article>
      <article className="card" style={{ marginTop: 14 }}>
        <h2>Notes sent</h2>
        {sent.length === 0 ? (
          <p className="fine">Nothing has been sent yet.</p>
        ) : (
          <div className="list">
            {sent.map((note) => (
              <div className="reminder" key={note.id}>
                <strong>{note.title}</strong>
                <span className="fine">
                  {note.isp} · {formatStamp(note.created_at)} · {note.channel}
                </span>
                <p>{note.body}</p>
              </div>
            ))}
          </div>
        )}
      </article>
    </>
  );
}
