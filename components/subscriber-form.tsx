import { createSubscriber, updateSubscriber } from "@/lib/actions";
import { renewalAfterInstallation } from "@/lib/bill-cycle";
import { LINE_STATUSES } from "@/lib/line-status";
import { todayISO } from "@/lib/format";
import { ACCOUNT_CATEGORIES, subscriberCredit, type Plan, type Subscriber } from "@/lib/queries";
import { AccountSchedule } from "@/components/account-schedule";
import { ServiceAddressFields } from "@/components/service-address";
import { ChargeFields } from "@/components/charge-fields";
import { InvoiceTaxFields } from "@/components/plan-bill-fields";
import { ResettableForm } from "@/components/guarded-form";

function Choice({ name, yes, no, on }: { name: string; yes: string; no: string; on: boolean }) {
  return (
    <div className="segment">
      <label>
        <input type="radio" name={name} value={yes} defaultChecked={on} />
        <span>Yes</span>
      </label>
      <label>
        <input type="radio" name={name} value={no} defaultChecked={!on} />
        <span>No</span>
      </label>
    </div>
  );
}

function AccountBoard({
  subscriber,
  credit,
}: {
  subscriber?: Subscriber;
  credit: { value: string; placeholder: string };
}) {
  const remind = !subscriber || subscriber.reminders !== 0;
  const cut = Boolean(subscriber?.disconnect_unpaid);
  const rated = /^([1-5]) — (.+)$/.exec(credit.value);
  const score = rated ? Number(rated[1]) : 0;
  const tone = score >= 4 ? "high" : score === 3 ? "mid" : score > 0 ? "low" : "";

  return (
    <div className="account-board">
      <div className="policy">
        <label className="field">
          <span>
            Account category <i className="req" aria-hidden="true">*</i>
          </span>
          <select name="account_category" required defaultValue={subscriber?.account_category || "Residential"}>
            {ACCOUNT_CATEGORIES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <div className="policy-row">
          <div>
            <strong>Send payment reminder</strong>
            <small>Before the due date, and on the day.</small>
          </div>
          <Choice name="reminders" yes="on" no="off" on={remind} />
        </div>
        <div className="policy-row">
          <div>
            <strong>Disconnect on non-pay</strong>
            <small>Kept with this account when a renewal stays unpaid.</small>
          </div>
          <Choice name="disconnect_unpaid" yes="yes" no="no" on={cut} />
        </div>
      </div>
      <aside className={tone ? `credit-panel ${tone}` : "credit-panel"}>
        <span>Credit rating</span>
        <strong>{score || "—"}</strong>
        <p>{rated ? rated[2] : credit.placeholder}</p>
        <ol aria-hidden="true">
          {[1, 2, 3, 4, 5].map((mark) => (
            <li key={mark} className={score >= mark ? "on" : undefined}>
              {mark}
            </li>
          ))}
        </ol>
        <p className="credit-key">5 early · 4 on the due date · 3 a few days late · 2 often late · 1 overdue</p>
      </aside>
    </div>
  );
}

export function SubscriberForm({
  plans,
  charges = [],
  offers = [],
  subscriber,
  showArea = false,
}: {
  plans: Plan[];
  charges?: { id: number; name: string; kind: string; amount: number; taxIncluded: boolean; taxPercent: number }[];
  offers?: { id: number; name: string; applies: string; frequency: "once" | "recurring"; mode: "amount" | "percent"; value: number }[];
  subscriber?: Subscriber;
  showArea?: boolean;
}) {
  const today = todayISO();
  const credit = subscriberCredit(subscriber);
  return (
    <ResettableForm
      action={subscriber ? updateSubscriber : createSubscriber}
      className="stack"
      submitLabel={subscriber ? "Save subscriber" : "Add subscriber"}
      cancelHref={subscriber ? `/provider/subscriber/${subscriber.id}` : "/provider/subscriber"}
      after={
        subscriber ? null : (
          <details className="form-note">
            <summary>How billing on this form works</summary>
            <ul>
              <li>Plan frequency is weekly through annual. The amount starts from that plan&apos;s price and can be changed. A chosen tax percent is locked and printed after the plan.</li>
              <li>Charges and discounts start from the catalogue. Custom, at the bottom of each list, is typed on this account. Bill cycle sets the renewal from the installation date.</li>
              <li>Tax on the invoice is calculated after the plan, its tax, and every charge. Tax included adds nothing extra.</li>
            </ul>
          </details>
        )
      }
    >
      {subscriber ? <input type="hidden" name="customer_id" value={subscriber.id} /> : null}
      <section className="form-block">
        <div className="form-block-head">
          <div>
            <h2>Subscriber</h2>
            <p>Name and email open the portal login.</p>
          </div>
          <p>A star marks a required field.</p>
        </div>
        <div className="row-2">
          <label className="field">
            <span>
              Name <i className="req" aria-hidden="true">*</i>
            </span>
            <input name="name" required minLength={2} autoComplete="name" defaultValue={subscriber?.name ?? ""} placeholder="Full name" />
          </label>
          <label className="field">
            <span>
              Portal email <i className="req" aria-hidden="true">*</i>
            </span>
            <input name="email" type="email" required pattern="[^ @]+@[^ @]+[.][^ @]+" title="Enter a valid email" autoComplete="email" defaultValue={subscriber?.email ?? ""} placeholder="Email to receive notification" />
          </label>
        </div>
      </section>
      <section className="form-block">
        <div className="form-block-head">
          <div>
            <h2>Account</h2>
          </div>
        </div>
        <AccountBoard subscriber={subscriber} credit={credit} />
      </section>
      <section className="form-block">
        <div className="form-block-head">
          <div>
            <h2>Service address</h2>
          </div>
        </div>
      <ServiceAddressFields
        mobile={subscriber?.mobile ?? ""}
        address={subscriber?.address ?? ""}
        area={subscriber?.area ?? ""}
        showArea={showArea}
        city={subscriber?.city ?? ""}
        pincode={subscriber?.pincode ?? ""}
        state={subscriber?.state ?? ""}
        country={subscriber?.country || "India"}
      />
      </section>
      <section className="form-block">
        <div className="form-block-head">
          <div>
            <h2>{subscriber ? "Plan and line" : "Plan and charges"}</h2>
            <p>{subscriber ? "The plan on this account, and whether the line is up." : "Pick from the catalogue, or type a custom plan on this account."}</p>
          </div>
        </div>
        {subscriber ? (
          <div className="row-2">
            <label className="field">
              <span>
                Internet Plan <i className="req" aria-hidden="true">*</i>
              </span>
              <select name="plan_id" defaultValue={subscriber.plan_id} required>
                {plans.some((plan) => plan.id === subscriber.plan_id) ? null : (
                  <option value={subscriber.plan_id}>{subscriber.plan_name}</option>
                )}
                {plans.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name} · {plan.speed_mbps} Mbps · ₹{plan.price}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Line status</span>
              <select name="status" defaultValue={subscriber.status}>
                {LINE_STATUSES.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : (
          <ChargeFields
            plans={plans.map((plan) => ({
              id: plan.id,
              name: plan.name,
              speed_mbps: plan.speed_mbps,
              price: plan.price,
            }))}
            charges={charges}
            offers={offers}
          />
        )}
        {subscriber ? (
          <AccountSchedule cycle={subscriber.bill_cycle} installation={subscriber.installation_date} renewal={subscriber.renew_date} />
        ) : (
          <AccountSchedule cycle="monthly" installation={today} renewal={renewalAfterInstallation(today, "monthly")}>
            <InvoiceTaxFields />
          </AccountSchedule>
        )}
      </section>
      <section className="form-block">
        <div className="form-block-head">
          <div>
            <h2>Line login</h2>
            <p>Optional. Used when Settings is connected to MikroTik or RADIUS. Active turns that login on. Paused, Disconnect, Collection, and Write off turn it off.</p>
          </div>
        </div>
        <label className="field">
          <span>PPPoE username</span>
          <input name="line_name" defaultValue={subscriber?.line_name ?? ""} autoComplete="off" maxLength={64} placeholder="Login on the router or RADIUS" />
        </label>
        <label className="field">
          <span>Notes</span>
          <textarea name="notes" defaultValue={subscriber?.notes ?? ""} placeholder="Access notes, preferred contact time, equipment location" />
        </label>
      </section>
    </ResettableForm>
  );
}
