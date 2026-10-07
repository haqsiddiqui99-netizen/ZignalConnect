import Link from "next/link";
import {
  deleteCustomerCharge,
  deleteCustomerDiscount,
  disconnectExtraPlan,
  recordPayment,
  saveCustomerCharge,
  saveCustomerDiscount,
  saveExtraPlan,
  saveSubscriberPlan,
  updatePaymentDetails,
} from "@/lib/actions";
import { BILL_CYCLES, billCycleLabel, cycleAmount, incompleteCycleCharge } from "@/lib/bill-cycle";
import { invoiceFor } from "@/lib/charges";
import { formatDate, formatInr, formatStamp, isDate, todayISO } from "@/lib/format";
import type { CustomerCharge, CustomerDiscount, CustomerExtraPlan, Payment, Subscriber } from "@/lib/queries";
import { PlanTerm } from "@/components/plan-term";
import { SubmitButton } from "@/components/submit-button";

type PlanOption = { id: number; name: string; speed_mbps: number; price: number };
type ChargeOption = { id: number; name: string };
type OfferOption = { id: number; name: string };

const TAX_PRESETS = ["5", "12", "18", "22"];

function taxMode(included: number, percent: number) {
  if (included !== 0 || percent <= 0) return "included";
  return TAX_PRESETS.includes(String(percent)) ? String(percent) : "custom";
}

function taxText(included: number, percent: number) {
  return included !== 0 || percent <= 0 ? "Included" : `${percent}%`;
}

function showDate(value: string) {
  return isDate(value) ? formatDate(value) : "—";
}

function DateFields({ activated, renews }: { activated: string; renews?: string }) {
  return (
    <div className="row-2">
      <label className="field">
        <span>Activation date</span>
        <input name="activated_on" type="date" required defaultValue={activated} />
      </label>
      {renews !== undefined ? (
        <label className="field">
          <span>Renewal date</span>
          <input name="renews_on" type="date" required defaultValue={renews} />
        </label>
      ) : null}
    </div>
  );
}

function chargeTiming(charge: CustomerCharge) {
  if (charge.frequency === "once") return "One-time";
  return charge.bill_cycle ? billCycleLabel(charge.bill_cycle) : "Every bill";
}

function chargeStatus(charge: CustomerCharge) {
  if (charge.frequency !== "once") return "Every bill";
  return charge.billed ? "Billed" : "Unbilled";
}

function discountStatus(discount: CustomerDiscount) {
  if (discount.frequency !== "once") return "Every bill";
  return discount.billed ? "Billed" : "Unbilled";
}

function appliesLabel(value: string, plans: PlanOption[]) {
  if (value.startsWith("plan:")) {
    const plan = plans.find((item) => `plan:${item.id}` === value);
    return plan ? plan.name : "Internet plan";
  }
  if (value === "router") return "Router charge";
  if (value === "installation") return "Installation charge";
  if (value === "service") return "Service charge";
  if (value === "invoice") return "Full invoice";
  return value;
}

function TaxFields({ included, percent }: { included: number; percent: number }) {
  const mode = taxMode(included, percent);
  return (
    <>
      <label className="field">
        <span>Tax</span>
        <select name="tax" defaultValue={mode}>
          <option value="included">Tax included</option>
          {TAX_PRESETS.map((item) => (
            <option key={item} value={item}>
              Add {item}%
            </option>
          ))}
          <option value="custom">Other %</option>
        </select>
      </label>
      <label className="field">
        <span>Tax percent</span>
        <input name="tax_percent" type="number" min={1} max={100} step={1} defaultValue={mode === "included" ? "" : percent || mode} placeholder="18" />
      </label>
    </>
  );
}

function FrequencyFields({ value }: { value: string }) {
  return (
    <label className="field">
      <span>Frequency</span>
      <select name="frequency" defaultValue={value}>
        <option value="once">One-time</option>
        {BILL_CYCLES.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function PlanPicker({ plans, planId, customName }: { plans: PlanOption[]; planId: string; customName: string }) {
  return (
    <>
      <label className="field">
        <span>Internet plan</span>
        <select name="plan_id" defaultValue={planId}>
          {plans.map((plan) => (
            <option key={plan.id} value={plan.id}>
              {plan.name} · {plan.speed_mbps} Mbps · ₹{plan.price}
            </option>
          ))}
          <option value="__custom__">Custom</option>
        </select>
      </label>
      <label className="field">
        <span>Custom name</span>
        <input name="plan_custom_name" maxLength={40} defaultValue={customName} placeholder="Only when Custom is selected" />
      </label>
    </>
  );
}

function DisconnectPlan({ person, plan, cancelHref }: { person: Subscriber; plan: CustomerExtraPlan; cancelHref: string }) {
  const activated = isDate(plan.activated_on) ? plan.activated_on : person.installation_date;
  const renews = isDate(plan.renews_on) ? plan.renews_on : person.renew_date;
  const amount = plan.amount > 0 ? plan.amount : cycleAmount(plan.price, plan.bill_cycle);
  const quote = incompleteCycleCharge(activated, renews, todayISO(), amount);
  const started = todayISO() >= activated;
  const taxNote = plan.tax_included === 0 && plan.tax_percent > 0 ? ` Tax of ${plan.tax_percent}% is added on the invoice.` : "";

  return (
    <form action={disconnectExtraPlan} className="disconnect-panel stack">
      <input type="hidden" name="customer_id" value={person.id} />
      <input type="hidden" name="extra_id" value={plan.id} />
      <h3>Disconnect {plan.plan_name}</h3>
      {quote.incomplete ? (
        <>
          <p className="fine">
            This cycle runs {formatDate(activated)} to {formatDate(renews)}. {quote.usedDays} of {quote.cycleDays} days have passed.
            {taxNote}
          </p>
          <div className="settle-list">
            <label>
              <input type="radio" name="settlement" value="full" defaultChecked />
              <span>Charge the full amount for this incomplete cycle</span>
              <strong>{formatInr(quote.full)}</strong>
            </label>
            <label>
              <input type="radio" name="settlement" value="none" />
              <span>Charge nothing for this incomplete cycle</span>
              <strong>{formatInr(0)}</strong>
            </label>
            <label>
              <input type="radio" name="settlement" value="prorate" />
              <span>Charge a prorated amount for this incomplete cycle</span>
              <strong>{formatInr(quote.prorate)}</strong>
            </label>
          </div>
        </>
      ) : (
        <>
          <p className="fine">
            {started
              ? `This cycle ended on ${formatDate(renews)}. The full ${formatInr(quote.full)} stays on the open invoice, and the plan will not renew.`
              : "This plan has not started. Disconnecting removes it, and nothing is added to the invoice."}
          </p>
          <input type="hidden" name="settlement" value={started ? "full" : "none"} />
        </>
      )}
      <div className="demo-row">
        <SubmitButton pendingLabel="Disconnecting…">Disconnect</SubmitButton>
        <Link className="btn" href={cancelHref}>
          Cancel
        </Link>
      </div>
    </form>
  );
}

function LineLinks({ href, editing, label = "Edit" }: { href: string; editing: boolean; label?: string }) {
  return editing ? (
    <Link href={href.replace(/&line=[^&]+/, "")}>Close</Link>
  ) : (
    <Link href={href}>{label}</Link>
  );
}

export function SubscriberBilling({
  person,
  plans,
  chargeOptions,
  offerOptions,
  charges,
  discounts,
  extraPlans,
  payments,
  line,
  part = "invoice",
  view = "open",
}: {
  person: Subscriber;
  plans: PlanOption[];
  chargeOptions: ChargeOption[];
  offerOptions: OfferOption[];
  charges: CustomerCharge[];
  discounts: CustomerDiscount[];
  extraPlans: CustomerExtraPlan[];
  payments: Payment[];
  line: string;
  part?: "invoice" | "payment" | "plans";
  view?: "open" | "closed";
}) {
  const base = `/provider/subscriber/${person.id}?tab=${part}`;
  const bill = invoiceFor(person, charges, { discounts, extraPlans });
  const openCharges = charges.filter((charge) => charge.frequency !== "once" || !charge.billed);
  const billedCharges = charges.filter((charge) => charge.frequency === "once" && charge.billed);
  const closedInvoices = payments.filter((payment) => payment.kind !== "partial");
  const planCycle = person.plan_cycle || person.bill_cycle;
  const planAmount = person.plan_amount > 0 ? person.plan_amount : person.price;
  const today = todayISO();
  const invoiceNote =
    isDate(person.renew_date) && person.renew_date < today
      ? "Payment is overdue."
      : isDate(person.renew_date) && person.renew_date > today
        ? "Renewal date is still ahead."
        : "This invoice is still open.";

  return (
    <div className="stack">
      {part === "invoice" && view !== "closed" ? (
      <article className="card">
        <h2>Open invoice</h2>
        <p className="fine" style={{ margin: "8px 0 12px" }}>
          {invoiceNote} These lines are not on a receipt yet. The amount due is {formatInr(bill.due)}.
        </p>
        {bill.lines.length === 0 ? (
          <p>Nothing is waiting on the next bill.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Line</th>
                  <th className="num">Amount</th>
                </tr>
              </thead>
              <tbody>
                {bill.lines.map((item, index) => (
                  <tr key={`${item.description}-${index}`}>
                    <td>{item.description}</td>
                    <td className="num">{formatInr(item.amount)}</td>
                  </tr>
                ))}
                <tr>
                  <td>
                    <strong>Due</strong>
                  </td>
                  <td className="num">
                    <strong>{formatInr(bill.due)}</strong>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
        <form action={recordPayment} className="stack" style={{ marginTop: 16 }}>
          <input type="hidden" name="customer_id" value={person.id} />
          <div className="row-2">
            <label className="field">
              <span>Record payment (₹)</span>
              <input name="amount" type="number" min={1} step={1} required defaultValue={bill.due || ""} />
            </label>
            <label className="field">
              <span>Method</span>
              <select name="method" defaultValue="UPI">
                <option>UPI</option>
                <option>Card</option>
                <option>Net banking</option>
                <option>Cash</option>
                <option>Internet</option>
              </select>
            </label>
          </div>
          <label className="field">
            <span>Note</span>
            <input name="note" placeholder="Receipt number, UPI reference, who paid" />
          </label>
          <SubmitButton pendingLabel="Recording…">Record payment</SubmitButton>
        </form>
      </article>
      ) : null}
      {part === "invoice" && view === "closed" ? (
      <article className="card">
        <h2>Closed invoices</h2>
        <p className="fine" style={{ margin: "8px 0 12px" }}>
          A closed invoice is a full payment that already has a receipt.
        </p>
        {closedInvoices.length === 0 ? (
          <p>No closed invoices yet.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Method</th>
                  <th className="num">Amount</th>
                  <th>Period</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {closedInvoices.map((payment) => (
                  <tr key={payment.id}>
                    <td>
                      {formatStamp(payment.paid_at)}
                      <div className="fine">{payment.reference}</div>
                    </td>
                    <td>{payment.method}</td>
                    <td className="num">{formatInr(payment.amount)}</td>
                    <td>
                      {showDate(payment.period_start)} to {showDate(payment.period_end)}
                      {payment.note ? <div className="fine">{payment.note}</div> : null}
                    </td>
                    <td>
                      <Link href={`/provider/receipt/income/${payment.id}`}>Receipt</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </article>
      ) : null}
      {part === "plans" ? (
      <>
      <article className="card">
        <h2>Internet plans</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Plan</th>
                <th>Frequency</th>
                <th className="num">Amount</th>
                <th>Tax</th>
                <th>Activation</th>
                <th>Renewal</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  {person.plan_name}
                  <div className="fine">Main plan</div>
                </td>
                <td>{billCycleLabel(planCycle)}</td>
                <td className="num">{formatInr(planAmount)}</td>
                <td>{taxText(person.plan_tax_included, person.plan_tax_percent)}</td>
                <td>{showDate(person.installation_date)}</td>
                <td>{showDate(person.renew_date)}</td>
                <td>
                  <LineLinks href={`${base}&line=plan`} editing={line === "plan"} label="Change Plan" />
                </td>
              </tr>
              {line === "plan" ? (
                <tr>
                  <td className="plan-edit" colSpan={7}>
                    <form action={saveSubscriberPlan} className="stack">
                      <input type="hidden" name="customer_id" value={person.id} />
                      <div className="row-2">
                        <PlanPicker plans={plans} planId={person.plan_label ? "__custom__" : String(person.plan_id)} customName={person.plan_label} />
                      </div>
                      <PlanTerm
                        frequency={planCycle}
                        activated={person.installation_date}
                        amount={
                          <label className="field">
                            <span>Amount (₹)</span>
                            <input name="amount" type="number" min={1} step={1} required defaultValue={planAmount} />
                          </label>
                        }
                      >
                        <div className="row-2">
                          <TaxFields included={person.plan_tax_included} percent={person.plan_tax_percent} />
                        </div>
                      </PlanTerm>
                      <SubmitButton pendingLabel="Saving…">Save internet plan</SubmitButton>
                    </form>
                  </td>
                </tr>
              ) : null}
              {extraPlans.map((plan) => (
                <tr key={plan.id}>
                  <td>{plan.plan_name}</td>
                  <td>{billCycleLabel(plan.bill_cycle)}</td>
                  <td className="num">{formatInr(plan.amount > 0 ? plan.amount : plan.price)}</td>
                  <td>{taxText(plan.tax_included, plan.tax_percent)}</td>
                  <td>{showDate(plan.activated_on || person.installation_date)}</td>
                  <td>{showDate(plan.renews_on || person.renew_date)}</td>
                  <td>
                    <div className="demo-row">
                      <LineLinks href={`${base}&line=extra-${plan.id}`} editing={line === `extra-${plan.id}`} label="Change Plan" />
                      {line === `disconnect-${plan.id}` ? null : (
                        <Link href={`${base}&line=disconnect-${plan.id}`}>Disconnect</Link>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {extraPlans.map((plan) =>
          line === `disconnect-${plan.id}` ? (
            <DisconnectPlan key={`disconnect-${plan.id}`} person={person} plan={plan} cancelHref={base} />
          ) : null,
        )}
        {extraPlans.map((plan) =>
          line === `extra-${plan.id}` ? (
            <form key={plan.id} action={saveExtraPlan} className="stack" style={{ marginTop: 16 }}>
              <input type="hidden" name="customer_id" value={person.id} />
              <input type="hidden" name="extra_id" value={plan.id} />
              <div className="row-2">
                <PlanPicker plans={plans} planId={plan.label ? "__custom__" : String(plan.plan_id)} customName={plan.label} />
              </div>
              <PlanTerm
                frequency={plan.bill_cycle}
                activated={plan.activated_on || person.installation_date}
                amount={
                  <label className="field">
                    <span>Amount (₹)</span>
                    <input name="amount" type="number" min={1} step={1} required defaultValue={plan.amount > 0 ? plan.amount : plan.price} />
                  </label>
                }
              >
                <div className="row-2">
                  <TaxFields included={plan.tax_included} percent={plan.tax_percent} />
                </div>
              </PlanTerm>
              <SubmitButton pendingLabel="Saving…">Save internet plan</SubmitButton>
            </form>
          ) : null,
        )}
        <details className="add-fold" {...(line === "add-plan" ? { open: true } : {})}>
          <summary>Add internet plan</summary>
          <form action={saveExtraPlan} className="stack">
            <input type="hidden" name="customer_id" value={person.id} />
            <div className="row-2">
              <PlanPicker plans={plans} planId={String(plans[0]?.id ?? "__custom__")} customName="" />
            </div>
            <PlanTerm
              frequency="monthly"
              activated={person.installation_date}
              amount={
                <label className="field">
                  <span>Amount (₹)</span>
                  <input name="amount" type="number" min={1} step={1} required placeholder="699" />
                </label>
              }
            >
              <div className="row-2">
                <TaxFields included={1} percent={0} />
              </div>
            </PlanTerm>
            <SubmitButton pendingLabel="Adding…">Add internet plan</SubmitButton>
          </form>
        </details>
      </article>

      <article className="card">
        <h2>Charges</h2>
        <ChargeTable personId={person.id} base={base} line={line} title="Unbilled" rows={openCharges} activated={person.installation_date} />
        <ChargeTable personId={person.id} base={base} line={line} title="Billed" rows={billedCharges} activated={person.installation_date} />
        {charges.map((charge) =>
          line === `charge-${charge.id}` ? (
            <form key={charge.id} action={saveCustomerCharge} className="stack" style={{ marginTop: 16 }}>
              <input type="hidden" name="customer_id" value={person.id} />
              <input type="hidden" name="charge_id" value={charge.id} />
              <div className="row-2">
                <label className="field">
                  <span>Name</span>
                  <input name="label" required maxLength={40} defaultValue={charge.label} />
                </label>
                <FrequencyFields value={charge.frequency === "once" ? "once" : charge.bill_cycle || "monthly"} />
              </div>
              <div className="row-2">
                <label className="field">
                  <span>Amount (₹)</span>
                  <input name="amount" type="number" min={1} step={1} required defaultValue={charge.amount} />
                </label>
                <TaxFields included={charge.tax_included} percent={charge.tax_percent} />
              </div>
              <DateFields activated={charge.activated_on || person.installation_date} />
              <SubmitButton pendingLabel="Saving…">Save charge</SubmitButton>
            </form>
          ) : null,
        )}
        <details className="add-fold" {...(line === "add-charge" ? { open: true } : {})}>
          <summary>Add charge</summary>
          <form action={saveCustomerCharge} className="stack">
          <input type="hidden" name="customer_id" value={person.id} />
          <div className="row-2">
            <label className="field">
              <span>Catalogue charge</span>
              <select name="catalogue_charge" defaultValue="">
                <option value="">Custom charge</option>
                {chargeOptions.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Name</span>
              <input name="label" maxLength={40} placeholder="Used when Custom charge is selected" />
            </label>
          </div>
          <div className="row-2">
            <FrequencyFields value="once" />
            <label className="field">
              <span>Amount (₹)</span>
              <input name="amount" type="number" min={1} step={1} required placeholder="500" />
            </label>
          </div>
          <div className="row-2">
            <TaxFields included={1} percent={0} />
          </div>
          <DateFields activated={person.installation_date} />
          <SubmitButton pendingLabel="Adding…">Add charge</SubmitButton>
        </form>
        </details>
      </article>

      <article className="card">
        <h2>Discounts</h2>
        {discounts.length === 0 ? (
          <p>No discounts on this account.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Applies to</th>
                  <th>Frequency</th>
                  <th className="num">Value</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {discounts.map((discount) => (
                  <tr key={discount.id}>
                    <td>{discount.name}</td>
                    <td>{appliesLabel(discount.applies_to, plans)}</td>
                    <td>{discount.frequency === "once" ? "One time" : "With the plan"}</td>
                    <td className="num">{discount.mode === "percent" ? `${discount.value}%` : formatInr(discount.value)}</td>
                    <td>{discountStatus(discount)}</td>
                    <td>
                      <div className="demo-row">
                        <LineLinks href={`${base}&line=discount-${discount.id}`} editing={line === `discount-${discount.id}`} />
                        <form action={deleteCustomerDiscount}>
                          <input type="hidden" name="customer_id" value={person.id} />
                          <input type="hidden" name="discount_id" value={discount.id} />
                          <SubmitButton className="btn small">Delete</SubmitButton>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {discounts.map((discount) =>
          line === `discount-${discount.id}` ? (
            <form key={discount.id} action={saveCustomerDiscount} className="stack" style={{ marginTop: 16 }}>
              <input type="hidden" name="customer_id" value={person.id} />
              <input type="hidden" name="discount_id" value={discount.id} />
              <DiscountFields plans={plans} name={discount.name} applies={discount.applies_to} frequency={discount.frequency} mode={discount.mode} value={discount.value} />
              <SubmitButton pendingLabel="Saving…">Save discount</SubmitButton>
            </form>
          ) : null,
        )}
        <details className="add-fold" {...(line === "add-discount" ? { open: true } : {})}>
          <summary>Add discount</summary>
          <form action={saveCustomerDiscount} className="stack">
          <input type="hidden" name="customer_id" value={person.id} />
          <label className="field">
            <span>Catalogue promo</span>
            <select name="catalogue_discount" defaultValue="">
              <option value="">Custom discount</option>
              {offerOptions.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <DiscountFields plans={plans} name="" applies={plans[0] ? `plan:${plans[0].id}` : "invoice"} frequency="once" mode="amount" value={0} />
          <SubmitButton pendingLabel="Adding…">Add discount</SubmitButton>
        </form>
        </details>
      </article>
      </>
      ) : null}
      {part === "payment" ? (
      <article className="card">
        <h2>Payments</h2>
        <p className="fine" style={{ margin: "8px 0 12px" }}>
          A payment is the billed invoice. Editing the amount, method, or note updates the receipt and leaves the renewal date where it is.
        </p>
        {payments.length === 0 ? (
          <p>No payments on this line yet.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Method</th>
                  <th className="num">Amount</th>
                  <th>Covers until</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {payments.map((payment) => (
                  <tr key={payment.id}>
                    <td>
                      {formatStamp(payment.paid_at)}
                      <div className="fine">{payment.reference}</div>
                    </td>
                    <td>
                      {payment.method}
                      <div className="fine">{payment.kind === "partial" ? "Partial" : "Full cycle"}</div>
                    </td>
                    <td className="num">{formatInr(payment.amount)}</td>
                    <td>
                      {formatDate(payment.period_end)}
                      {payment.note ? <div className="fine">{payment.note}</div> : null}
                      <Link href={`/provider/receipt/income/${payment.id}`}>Receipt</Link>
                    </td>
                    <td>
                      <LineLinks href={`${base}&line=payment-${payment.id}`} editing={line === `payment-${payment.id}`} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {payments.map((payment) =>
          line === `payment-${payment.id}` ? (
            <form key={payment.id} action={updatePaymentDetails} className="stack" style={{ marginTop: 16 }}>
              <input type="hidden" name="customer_id" value={person.id} />
              <input type="hidden" name="payment_id" value={payment.id} />
              <div className="row-2">
                <label className="field">
                  <span>Amount (₹)</span>
                  <input name="amount" type="number" min={1} step={1} required defaultValue={payment.amount} />
                </label>
                <label className="field">
                  <span>Method</span>
                  <select name="method" defaultValue={payment.method}>
                    <option>UPI</option>
                    <option>Card</option>
                    <option>Net banking</option>
                    <option>Cash</option>
                <option>Internet</option>
                  </select>
                </label>
              </div>
              <label className="field">
                <span>Note</span>
                <input name="note" maxLength={200} defaultValue={payment.note} />
              </label>
              <SubmitButton pendingLabel="Saving…">Save payment</SubmitButton>
            </form>
          ) : null,
        )}
      </article>
      ) : null}
    </div>
  );
}

function ChargeTable({
  personId,
  base,
  line,
  title,
  rows,
  activated,
}: {
  personId: number;
  base: string;
  line: string;
  title: string;
  rows: CustomerCharge[];
  activated: string;
}) {
  return (
    <>
      <h3 style={{ marginTop: 12 }}>{title}</h3>
      {rows.length === 0 ? (
        <p className="fine">None.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Frequency</th>
                <th className="num">Amount</th>
                <th>Tax</th>
                <th>Activation</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((charge) => (
                <tr key={charge.id}>
                  <td>{charge.label}</td>
                  <td>{chargeTiming(charge)}</td>
                  <td className="num">{formatInr(charge.amount)}</td>
                  <td>{taxText(charge.tax_included, charge.tax_percent)}</td>
                  <td>{showDate(charge.activated_on || activated)}</td>
                  <td>{chargeStatus(charge)}</td>
                  <td>
                    <div className="demo-row">
                      <LineLinks href={`${base}&line=charge-${charge.id}`} editing={line === `charge-${charge.id}`} />
                      <form action={deleteCustomerCharge}>
                        <input type="hidden" name="customer_id" value={personId} />
                        <input type="hidden" name="charge_id" value={charge.id} />
                        <SubmitButton className="btn small">Delete</SubmitButton>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function DiscountFields({
  plans,
  name,
  applies,
  frequency,
  mode,
  value,
}: {
  plans: PlanOption[];
  name: string;
  applies: string;
  frequency: string;
  mode: string;
  value: number;
}) {
  return (
    <>
      <div className="row-2">
        <label className="field">
          <span>Name</span>
          <input name="name" maxLength={40} defaultValue={name} placeholder="Used when Custom discount is selected" />
        </label>
        <label className="field">
          <span>Applies to</span>
          <select name="applies_to" defaultValue={applies}>
            {plans.map((plan) => (
              <option key={plan.id} value={`plan:${plan.id}`}>
                {plan.name}
              </option>
            ))}
            <option value="router">Router charge</option>
            <option value="installation">Installation charge</option>
            <option value="service">Service charge</option>
            <option value="invoice">Full invoice</option>
          </select>
        </label>
      </div>
      <div className="row-2">
        <label className="field">
          <span>Frequency</span>
          <select name="frequency" defaultValue={frequency === "recurring" ? "recurring" : "once"}>
            <option value="once">One time</option>
            <option value="recurring">Always with Internet Plan</option>
          </select>
        </label>
        <label className="field">
          <span>Basis</span>
          <select name="mode" defaultValue={mode === "percent" ? "percent" : "amount"}>
            <option value="amount">Amount (₹)</option>
            <option value="percent">Percent (%)</option>
          </select>
        </label>
      </div>
      <label className="field">
        <span>Value</span>
        <input name="value" type="number" min={1} step={1} required defaultValue={value || ""} placeholder="100" />
      </label>
    </>
  );
}
