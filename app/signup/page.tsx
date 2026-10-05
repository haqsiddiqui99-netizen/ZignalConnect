import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession, homePath } from "@/lib/auth";
import { BrandMark } from "@/components/brand-mark";
import { SignupForm } from "@/components/signup-form";

export const metadata = { title: "Open a desk" };

export default async function SignupPage() {
  const session = await getSession();
  if (session) redirect(homePath(session));

  return (
    <main className="signup">
      <header className="signup-top">
        <div className="brand-lockup">
          <BrandMark />
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
          Enter the subscriber base. Pro holds up to 500, Ultra up to 1,000, and any larger book is Premium. A smaller
          plan is refused. You can still pick a larger one.
        </p>
      </div>
      <SignupForm />
    </main>
  );
}
