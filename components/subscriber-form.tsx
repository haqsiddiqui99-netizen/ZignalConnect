import { createSubscriber, updateSubscriber } from "@/lib/actions";
import { addMonths, todayISO } from "@/lib/format";
import type { Plan, Subscriber } from "@/lib/queries";
import { SubmitButton } from "@/components/submit-button";

export function SubscriberForm({
  plans,
  subscriber,
  showArea = false,
}: {
  plans: Plan[];
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
      <div className="row-2">
        <label className="field">
          <span>Plan</span>
          <select name="plan_id" defaultValue={subscriber?.plan_id ?? plans[0]?.id} required>
            {plans.map((plan) => (
              <option key={plan.id} value={plan.id}>
                {plan.name} · {plan.speed_mbps} Mbps · ₹{plan.price}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Line status</span>
          <select name="status" defaultValue={subscriber?.status ?? "active"}>
            <option value="active">Active</option>
            <option value="suspended">Paused</option>
          </select>
        </label>
      </div>
      <div className="row-2">
        <label className="field">
          <span>Renewal date</span>
          <input type="date" name="renew_date" required defaultValue={subscriber?.renew_date ?? addMonths(today, 1)} />
        </label>
        <label className="field">
          <span>Installation date</span>
          <input type="date" name="installation_date" required defaultValue={subscriber?.installation_date ?? today} />
        </label>
      </div>
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
      <div>
        <SubmitButton>{subscriber ? "Save subscriber" : "Add subscriber"}</SubmitButton>
      </div>
    </form>
  );
}
