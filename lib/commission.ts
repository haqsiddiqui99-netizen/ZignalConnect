import { CATALOG, isProductPlan, termQuote, type BillTerm, type ProductPlan } from "@/lib/entitlements";
import { one, run } from "@/lib/db";
import { nowStamp } from "@/lib/format";

/** Monthly commission for each desk plan. Quarterly and yearly use the same discount as the fee. */
const MONTHLY_COMMISSION: Record<ProductPlan, number> = {
  pro: 500,
  ultra: 1000,
  premium_3000: 1500,
  premium_5000: 2000,
  premium_10000: 2500,
  premium_20000: 4500,
  premium_30000: 6500,
};

export function agentCommission(plan: ProductPlan, term: BillTerm, monthlyOverride = 0) {
  const monthly = monthlyOverride > 0 ? monthlyOverride : MONTHLY_COMMISSION[plan];
  if (term === "yearly") return Math.round(monthly * 10);
  if (term === "quarterly") return Math.round(monthly * 3 * 0.9);
  return monthly;
}

export function commissionCycle(period: string, term: BillTerm) {
  const [yearText, monthText] = period.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  if (!Number.isInteger(year)) return period;
  if (term === "yearly") return String(year);
  if (term === "quarterly" && Number.isInteger(month)) return `${year}-Q${Math.floor((month - 1) / 3) + 1}`;
  return period;
}

export function bookAgentCommission(input: {
  providerId: number;
  deskPaymentId: number;
  period: string;
  plan: string;
  term: BillTerm;
  agentName: string;
  agentRate: number;
}) {
  const name = input.agentName.trim().slice(0, 80);
  if (!name || !isProductPlan(input.plan)) return;
  const cycle = commissionCycle(input.period, input.term);
  const already = one<{ id: number }>(
    "SELECT id FROM agent_commissions WHERE provider_id = ? AND cycle_key = ?",
    input.providerId,
    cycle,
  );
  if (already) return;
  const fee = termQuote(CATALOG[input.plan].price, input.term).due;
  const commission = agentCommission(input.plan, input.term, input.agentRate);
  if (commission <= 0) return;
  try {
    run(
      `INSERT INTO agent_commissions (
        provider_id, desk_payment_id, agent_name, product_plan, billing_term, plan_fee, commission, cycle_key, created_at, paid_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '')`,
      input.providerId,
      input.deskPaymentId,
      name,
      input.plan,
      input.term,
      fee,
      commission,
      cycle,
      nowStamp(),
    );
  } catch {
    /* This term was already written for the desk. */
  }
}
