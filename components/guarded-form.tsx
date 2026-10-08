"use client";

import Link from "next/link";
import { useState, type FormEvent, type FocusEvent, type ReactNode } from "react";
import { SubmitButton } from "@/components/submit-button";

function isField(target: EventTarget | null): target is HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement {
  return target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement;
}

function blank(field: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement) {
  if (!field.required || field.disabled || field.type === "radio" || field.type === "checkbox" || field.type === "hidden") return false;
  return field.value.trim() === "";
}

export function markBlankRequired(form: HTMLFormElement) {
  const fields = Array.from(form.elements).filter(isField);
  let first: (HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement) | null = null;
  for (const field of fields) {
    const empty = blank(field);
    field.toggleAttribute("data-empty", empty);
    if (empty && !first) first = field;
  }
  return first;
}

export function GuardedForm({
  action,
  className,
  children,
}: {
  action: (formData: FormData) => void | Promise<void>;
  className?: string;
  children: ReactNode;
}) {
  function onBlur(event: FocusEvent<HTMLFormElement>) {
    if (!isField(event.target)) return;
    event.target.toggleAttribute("data-empty", blank(event.target));
  }

  function onInput(event: FormEvent<HTMLFormElement>) {
    if (!isField(event.target)) return;
    if (!blank(event.target)) event.target.removeAttribute("data-empty");
  }

  return (
    <form action={action} className={className} onBlur={onBlur} onInput={onInput} onChange={onInput}>
      {children}
    </form>
  );
}

export function ResettableForm({
  action,
  className,
  submitLabel,
  cancelHref,
  after,
  children,
}: {
  action: (formData: FormData) => void | Promise<void>;
  className?: string;
  submitLabel: string;
  cancelHref: string;
  after?: ReactNode;
  children: ReactNode;
}) {
  const [epoch, setEpoch] = useState(0);

  return (
    <GuardedForm action={action} className={className}>
      <div key={epoch} className="contents">
        {children}
      </div>
      <div className="form-actions">
        <SubmitButton>{submitLabel}</SubmitButton>
        <Link className="btn" href={cancelHref}>
          Cancel
        </Link>
        <button type="button" className="btn reset" onClick={() => setEpoch((value) => value + 1)}>
          Reset
        </button>
      </div>
      {after}
    </GuardedForm>
  );
}
