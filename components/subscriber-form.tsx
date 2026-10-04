import Link from "next/link";
import { createSubscriber, updateSubscriber } from "@/lib/actions";
import { renewalAfterInstallation } from "@/lib/bill-cycle";
import { LINE_STATUSES } from "@/lib/line-status";
import { todayISO } from "@/lib/format";
import type { Plan, Subscriber } from "@/lib/queries";
import { AccountSchedule } from "@/components/account-schedule";
import { ChargeFields } from "@/components/charge-fields";
import { InvoiceTaxFields } from "@/components/plan-bill-fields";
import { SubmitButton } from "@/components/submit-button";

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
  return (
    <form action={subscriber ? updateSubscriber : createSubscriber} className="stack">
      {subscriber ? <input type="hidden" name="customer_id" value={subscriber.id} /> : null}
      <div className="row-2">
        <label className="field">
          <span>Name</span>
          <input name="name" required defaultValue={subscriber?.name ?? ""} />
        </label>
        <label className="field">
          <span>Portal email</span>
          <input name="email" type="email" required defaultValue={subscriber?.email ?? ""} />
        </label>
      </div>
      <div className="row-2">
        <label className="field">
          <span>Mobile</span>
          <input name="mobile" inputMode="numeric" required defaultValue={subscriber?.mobile ?? ""} placeholder="98xxxxxxxx" />
        </label>
        <label className="field">
          <span>City</span>
          <input name="city" required defaultValue={subscriber?.city ?? ""} />
        </label>
      </div>
      <label className="field">
        <span>Service address</span>
        <input name="address" required defaultValue={subscriber?.address ?? ""} />
      </label>
      {subscriber ? (
        <div className="row-2">
          <label className="field">
            <span>Internet Plan</span>
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
        <AccountSchedule
          cycle={subscriber.bill_cycle}
          reminders={subscriber.reminders ? "on" : "off"}
          installation={subscriber.installation_date}
          renewal={subscriber.renew_date}
        />
      ) : (
        <AccountSchedule cycle="monthly" reminders="on" installation={today} renewal={renewalAfterInstallation(today, "monthly")}>
          <InvoiceTaxFields />
        </AccountSchedule>
      )}
      {showArea ? (
        <label className="field">
          <span>Area or branch</span>
          <input name="area" defaultValue={subscriber?.area ?? ""} placeholder="West, Ward 12, Franchise A" />
        </label>
      ) : null}
      <label className="field">
        <span>Notes</span>
        <textarea name="notes" defaultValue={subscriber?.notes ?? ""} placeholder="Access notes, preferred contact time, equipment location" />
      </label>
      <div className="demo-row">
        <SubmitButton>{subscriber ? "Save subscriber" : "Add subscriber"}</SubmitButton>
        {subscriber ? null : (
          <Link className="btn" href="/provider/import">
            Import Subscribers
          </Link>
        )}
      </div>
      {subscriber ? null : (
        <div className="stack">
          <strong>General information</strong>
          <ul className="fine info-list">
            <li>Internet Plan frequency is weekly, bi-weekly, monthly, quarterly, bi-annual, or annual. The amount starts from that plan&apos;s price for the frequency and can be changed. Choosing 5%, 12%, 18%, or 22% fills Tax percent and locks it. That tax is printed on the invoice right after the internet plan.</li>
            <li>Internet Plan, Charge, and Discount start from the catalogue. Custom, at the bottom of each list, is typed on this account: name, amount, frequency, and tax. A catalogue charge stays one time. A custom charge can be one time or follow a bill cycle. Bill cycle, beside payment reminders, sets the renewal from the installation date. The renewal date can be changed.</li>
            <li>Tax on invoice is calculated after the plan, its tax, and every charge. It is printed last on the invoice. Tax included adds nothing extra.</li>
          </ul>
        </div>
      )}
    </form>
  );
}
