"use client";

import { useActionState, useEffect, useState } from "react";
import { registerProvider } from "@/lib/actions";
import { Banner } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { IspPincodeFields } from "@/components/service-address";
import { SignupPassword } from "@/components/signup-password";
import { SignupPlans } from "@/components/signup-plans";

export function SignupForm() {
  const [state, formAction] = useActionState(registerProvider, null);
  const [isp, setIsp] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [gstin, setGstin] = useState("");
  const [logo, setLogo] = useState("");
  const [address, setAddress] = useState("");

  useEffect(() => {
    if (!state?.error) return;
    document.querySelector(".signup .banner")?.scrollIntoView({ block: "nearest" });
  }, [state]);

  return (
    <form action={formAction} className="stack">
      <Banner error={state?.error} />
      <div className="signup-fields">
        <label className="field">
          <span>ISP name</span>
          <input name="isp_name" required placeholder="Harbour Fibre" value={isp} onChange={(event) => setIsp(event.target.value)} />
        </label>
        <label className="field">
          <span>Your name</span>
          <input name="name" required value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <label className="field">
          <span>Email</span>
          <input name="email" type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} />
        </label>
        <label className="field">
          <span>Support mobile</span>
          <input name="support_phone" inputMode="numeric" placeholder="98xxxxxxxx" value={phone} onChange={(event) => setPhone(event.target.value)} />
        </label>
        <label className="field">
          <span>GSTIN (optional)</span>
          <input name="gstin" placeholder="22AAAAA0000A1Z5" autoCapitalize="characters" value={gstin} onChange={(event) => setGstin(event.target.value)} />
        </label>
        <label className="field">
          <span>Logo letter</span>
          <input
            name="logo_letter"
            required
            minLength={2}
            maxLength={2}
            pattern="[A-Za-z]{2}"
            placeholder="HF"
            autoCapitalize="characters"
            value={logo}
            onChange={(event) => setLogo(event.target.value)}
          />
          <p className="fine">These letters are used to create the logo on the invoices subscribers receive.</p>
        </label>
      </div>
      <IspPincodeFields addressLabel="Office address" required openDesk country="India" addressValue={address} onAddress={setAddress} />
      <SignupPassword />
      <SignupPlans />
      <div>
        <SubmitButton>Open this desk</SubmitButton>
      </div>
    </form>
  );
}
