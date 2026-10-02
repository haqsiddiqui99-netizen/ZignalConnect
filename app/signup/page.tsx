import Link from "next/link";
import { redirect } from "next/navigation";
import { registerProvider } from "@/lib/actions";
import { getSession, homePath } from "@/lib/auth";
import { Banner } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { SignupPlans, type SignupPlan } from "@/components/signup-plans";
import { CATALOG, PLAN_ORDER, PLAN_POINTS, limitLabel, overflowLimit, planFamily } from "@/lib/entitlements";
import { formatInr } from "@/lib/format";

export const metadata = { title: "Open a desk" };

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await getSession();
  if (session) redirect(homePath(session));
  const { error } = await searchParams;
  const plans: SignupPlan[] = PLAN_ORDER.map((plan) => {
    const item = CATALOG[plan];
    return {
      id: plan,
      label: item.label,
      price: formatInr(item.price),
      customers: item.customers,
      blurb: item.blurb,
      line: `${limitLabel(item.customers)} customers · ${limitLabel(item.reminders)} reminders · ${limitLabel(item.staff)} staff · ${item.trialDays}-day trial`,
      overflow: `Overflow to ${limitLabel(overflowLimit(plan))} at ₹3 each. Extra messages ₹0.50.`,
      points: PLAN_POINTS.filter((point) => point.plans.includes(planFamily(plan))).map((point) => point.label),
    };
  });

  return (
    <main className="signup">
      <header className="signup-top">
        <div className="brand-lockup">
          <div className="brand-mark">Z</div>
          <div>
            <strong>ZIGNAL</strong>
            <span className="signup-mark">Connect</span>
          </div>
        </div>
        <p className="fine">
          Already have a desk? <Link href="/">Sign in</Link>
        </p>
      </header>
      <div className="signup-intro">
        <h1>Open your desk</h1>
        <p>
          Enter the subscriber base, then choose a plan that can hold it. You can pick a larger tier. A smaller one is
          refused. Premium runs from 3,000 to 30,000 subscribers.
        </p>
      </div>
      <Banner error={error} />
      <form action={registerProvider} className="stack">
        <div className="signup-fields">
          <label className="field">
            <span>ISP name</span>
            <input name="isp_name" required placeholder="Harbour Fibre" />
          </label>
          <label className="field">
            <span>Your name</span>
            <input name="name" required />
          </label>
          <label className="field">
            <span>Email</span>
            <input name="email" type="email" autoComplete="username" required />
          </label>
          <label className="field">
            <span>Password</span>
            <input name="password" type="password" autoComplete="new-password" required minLength={6} />
          </label>
          <label className="field">
            <span>Support mobile</span>
            <input name="support_phone" inputMode="numeric" placeholder="98xxxxxxxx" />
          </label>
        </div>
        <SignupPlans plans={plans} />
        <div>
          <SubmitButton>Open this desk</SubmitButton>
        </div>
      </form>
    </main>
  );
}
