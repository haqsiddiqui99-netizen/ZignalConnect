import { reopenDesk, requestDeskClose } from "@/lib/actions";
import type { DeskQuit } from "@/lib/desk-close";
import { latestQuitDate } from "@/lib/desk-close";
import { SubmitButton } from "@/components/submit-button";
import { formatDate, todayISO } from "@/lib/format";

const SHOWN = 8;

export function DeskQuitPanel({ owner, quit }: { owner: boolean; quit: DeskQuit }) {
  const today = todayISO();
  const latest = latestQuitDate();
  const count = quit.open.length;
  const shown = quit.open.slice(0, SHOWN);
  const rest = count - shown.length;
  const scheduled = quit.phase === "scheduled" || quit.phase === "waiting";
  const canReopen = quit.phase === "scheduled";

  return (
    <section className="quit-card">
      <p className="quit-kicker">Leave Zignal</p>
      <h2>Close this desk</h2>
      <p>
        Pick the last day this desk should stay open, and say why you are leaving. The desk does not close early. Every
        subscriber payment that is due on or before that day has to be recorded first. A renewal that is still ahead does
        not block you. Written-off lines are already closed.
      </p>
      <p>
        The trial does not charge a card, so there is nothing to return. Subscriber payments stay in your office. They are
        not held here. You can re-open the desk any day before the quit date. After that day, the request cannot be taken
        back. Once the desk closes, you, your staff, and your subscribers cannot sign in. The subscriber list stays on
        this desk. It is not copied onto the Zignal page.
      </p>
      {scheduled ? (
        <>
          <div className="quit-steps">
            <article>
              <span>Quit date</span>
              <strong>{formatDate(quit.quitOn)}</strong>
            </article>
            <article>
              <span>Reason</span>
              <strong>{quit.reason}</strong>
            </article>
            <article>
              <span>Payments</span>
              <strong>{count === 0 ? "All closed" : `${count} still open`}</strong>
            </article>
          </div>
          {quit.phase === "waiting" ? (
            <p>
              This date has arrived, so the desk can no longer be re-opened. It stays open until the payments below are
              closed, then sign-in stops.
            </p>
          ) : count === 0 ? (
            <p>
              Payments due by this day are already closed. The desk closes on {formatDate(quit.quitOn)}. You can re-open
              it any day before then.
            </p>
          ) : (
            <p>
              Close these payments before {formatDate(quit.quitOn)}. You can also re-open the desk any day before then.
            </p>
          )}
          {count > 0 ? (
            <div className="quit-list">
              {shown.map((payment) => (
                <a key={payment.id} href={`/provider/subscriber/${payment.id}?tab=invoice&view=open`}>
                  <span>{payment.name}</span>
                  <em>{payment.detail}</em>
                </a>
              ))}
              {rest > 0 ? <p>{rest} more still need a payment recorded.</p> : null}
            </div>
          ) : null}
        </>
      ) : null}
      {owner && canReopen ? (
        <form action={requestDeskClose} className="stack">
          <label className="field">
            <span>
              Quit date <em className="req">*</em>
            </span>
            <input type="date" name="quit_on" required min={today} max={latest} defaultValue={quit.quitOn || today} />
          </label>
          <label className="field">
            <span>
              Reason <em className="req">*</em>
            </span>
            <textarea name="reason" required minLength={4} maxLength={400} rows={3} defaultValue={quit.reason} placeholder="Why this desk is closing" />
          </label>
          <label className="field">
            <span>
              Your password <em className="req">*</em>
            </span>
            <input name="password" type="password" autoComplete="current-password" required />
          </label>
          <div className="quit-actions">
            <SubmitButton className="btn light" pendingLabel="Saving…">
              Update quit date
            </SubmitButton>
          </div>
        </form>
      ) : null}
      {owner && !scheduled ? (
        <form action={requestDeskClose} className="stack">
          <label className="field">
            <span>
              Quit date <em className="req">*</em>
            </span>
            <input type="date" name="quit_on" required min={today} max={latest} defaultValue={today} />
          </label>
          <label className="field">
            <span>
              Reason <em className="req">*</em>
            </span>
            <textarea name="reason" required minLength={4} maxLength={400} rows={3} placeholder="Why this desk is closing" />
          </label>
          <label className="field">
            <span>
              Your password <em className="req">*</em>
            </span>
            <input name="password" type="password" autoComplete="current-password" required />
          </label>
          <div className="quit-actions">
            <SubmitButton className="btn light" pendingLabel="Saving…">
              Schedule close
            </SubmitButton>
          </div>
        </form>
      ) : null}
      {!owner ? (
        <p>
          {canReopen
            ? `Only the owner can re-open this desk, and only before ${formatDate(quit.quitOn)}.`
            : quit.phase === "waiting"
              ? "The quit date has arrived. This desk can no longer be re-opened."
              : "Only the owner of this desk can close it."}
        </p>
      ) : null}
      {owner && canReopen ? (
        <form action={reopenDesk} className="quit-reopen">
          <div>
            <h3>Re-open this desk</h3>
            <p>Take the close request back. This is available only before {formatDate(quit.quitOn)}.</p>
          </div>
          <label className="field">
            <span>
              Your password <em className="req">*</em>
            </span>
            <input name="password" type="password" autoComplete="current-password" required />
          </label>
          <SubmitButton className="btn light" pendingLabel="Re-opening…">
            Re-open this desk
          </SubmitButton>
        </form>
      ) : null}
    </section>
  );
}
