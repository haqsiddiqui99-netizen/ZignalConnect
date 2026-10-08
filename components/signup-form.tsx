"use client";

import Link from "next/link";
import { useActionState, useEffect, useState, type FocusEvent, type FormEvent } from "react";
import { registerProvider } from "@/lib/actions";
import { Banner } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { IspPincodeFields } from "@/components/service-address";
import { SignupPassword } from "@/components/signup-password";
import { SignupPlans } from "@/components/signup-plans";
import { markBlankRequired } from "@/components/guarded-form";

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

  function onBlur(event: FocusEvent<HTMLFormElement>) {
    const field = event.target;
    if (!(field instanceof HTMLInputElement || field instanceof HTMLSelectElement || field instanceof HTMLTextAreaElement)) return;
    const empty = field.required && !field.disabled && field.type !== "radio" && field.type !== "checkbox" && field.type !== "hidden" && field.value.trim() === "";
    field.toggleAttribute("data-empty", empty);
  }

  function onInput(event: FormEvent<HTMLFormElement>) {
    const field = event.target;
    if (!(field instanceof HTMLInputElement || field instanceof HTMLSelectElement || field instanceof HTMLTextAreaElement)) return;
    if (field.value.trim() !== "") field.removeAttribute("data-empty");
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    const form = event.currentTarget;
    const first = markBlankRequired(form);
    if (first) {
      event.preventDefault();
      first.focus();
      return;
    }
    const bad = Array.from(form.elements).find(
      (item): item is HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement =>
        (item instanceof HTMLInputElement || item instanceof HTMLSelectElement || item instanceof HTMLTextAreaElement) &&
        !item.disabled &&
        item.willValidate &&
        !item.checkValidity(),
    );
    if (!bad) return;
    event.preventDefault();
    bad.reportValidity();
  }

  return (
    <form action={formAction} className="stack" noValidate onBlur={onBlur} onInput={onInput} onChange={onInput} onSubmit={onSubmit}>
      <Banner error={state?.error} />
      <div className="signup-fields">
        <label className="field">
          <span>
            ISP name <i className="req" aria-hidden="true">*</i>
          </span>
          <input name="isp_name" required value={isp} onChange={(event) => setIsp(event.target.value)} placeholder="ISP name" />
        </label>
        <label className="field">
          <span>
            Your name <i className="req" aria-hidden="true">*</i>
          </span>
          <input name="name" required value={name} onChange={(event) => setName(event.target.value)} placeholder="Full name" />
        </label>
        <label className="field">
          <span>
            Email <i className="req" aria-hidden="true">*</i>
          </span>
          <input name="email" type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email to receive notification" />
        </label>
        <label className="field">
          <span>Support mobile</span>
          <input name="support_phone" inputMode="numeric" value={phone} onChange={(event) => setPhone(event.target.value)} />
        </label>
        <label className="field">
          <span>GSTIN (optional)</span>
          <input name="gstin" autoCapitalize="characters" value={gstin} onChange={(event) => setGstin(event.target.value)} />
        </label>
        <label className="field">
          <span>
            Logo letter <i className="req" aria-hidden="true">*</i>
          </span>
          <input
            name="logo_letter"
            required
            minLength={2}
            maxLength={2}
            pattern="[A-Za-z]{2}"
            autoCapitalize="characters"
            value={logo}
            onChange={(event) => setLogo(event.target.value)}
          />
          <p className="fine">These letters are used to create the logo on the invoices subscribers receive.</p>
        </label>
      </div>
      <IspPincodeFields addressLabel="Office address" required openDesk country="India" addressValue={address} onAddress={setAddress} examples={false} />
      <SignupPassword />
      <SignupPlans />
      <div className="signup-submit">
        <p className="fine">
          Opening a desk means you agree to the <Link href="/terms">Terms</Link>, the <Link href="/privacy">Privacy</Link> page,
          and the <Link href="/refund">Refund</Link> page.
        </p>
        <SubmitButton>Open this desk</SubmitButton>
      </div>
    </form>
  );
}
