import Link from "next/link";
import { billCycleLabel } from "@/lib/bill-cycle";
import { formatDate } from "@/lib/format";
import { lineStatusLabel } from "@/lib/line-status";
import { subscriberCredit, type Subscriber } from "@/lib/queries";

function Fact({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={wide ? "wide" : undefined}>
      <dt>{label}</dt>
      <dd>{value || "—"}</dd>
    </div>
  );
}

export function SubscriberSheet({ person, showArea }: { person: Subscriber; showArea: boolean }) {
  const credit = subscriberCredit(person);
  const rated = /^([1-5]) — (.+)$/.exec(credit.value);

  return (
    <article className="card account-sheet">
      <div className="sheet-head">
        <h2>Account</h2>
        <Link className="btn" href={`/provider/subscriber/${person.id}?edit=1`}>
          Edit
        </Link>
      </div>
      <dl className="fact-grid">
        <Fact label="Name" value={person.name} />
        <Fact label="Portal email" value={person.email} />
        <Fact label="Account category" value={person.account_category || "Residential"} />
        <Fact label="Send payment reminder" value={person.reminders ? "Yes" : "No"} />
        <Fact label="Disconnect on non-pay" value={person.disconnect_unpaid ? "Yes" : "No"} />
        <Fact label="Credit rating" value={rated ? `${rated[1]} · ${rated[2]}` : credit.placeholder} />
        <Fact label="Mobile" value={person.mobile} />
        <Fact label="PIN code" value={person.pincode} />
        {showArea ? <Fact label="Area or branch" value={person.area} /> : null}
        <Fact label="Service address" value={person.address} wide />
        <Fact label="City" value={person.city} />
        <Fact label="State" value={person.state} />
        <Fact label="Country" value={person.country} />
        <Fact label="Internet plan" value={person.plan_name} />
        <Fact label="Line status" value={lineStatusLabel(person.status)} />
        <Fact label="Bill cycle" value={billCycleLabel(person.bill_cycle)} />
        <Fact label="Installation date" value={formatDate(person.installation_date)} />
        <Fact label="Renewal date" value={formatDate(person.renew_date)} />
        <Fact label="PPPoE username" value={person.line_name} />
        <Fact label="Notes" value={person.notes} wide />
      </dl>
    </article>
  );
}
