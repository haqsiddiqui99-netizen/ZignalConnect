"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type Reply = { question: string; text: string; href: string; label: string };
type Message = { from: "bot" | "you"; text: string; href?: string; label?: string };

function catalogueLine(count: number, singular: string, plural: string, names: string) {
  if (count === 0) return `This desk has no ${plural} yet. Add them on the Catalogue page.`;
  const noun = count === 1 ? singular : plural;
  return `This desk has ${count} ${noun}${names ? `: ${names}` : ""}.`;
}

function answersFor(catalogue: { plans: number; planNames: string; charges: number; chargeNames: string; discounts: number; discountNames: string }): Reply[] {
  return [
    {
      question: "Add a subscriber",
      text: "Add a subscriber from the Subscribers page. You need a name, portal email, 10-digit mobile, 6-digit PIN, address, and a plan. That creates the line and the portal login. The starting password is welcome123.",
      href: "/provider/subscriber/new",
      label: "Add a subscriber",
    },
    {
      question: "Import a spreadsheet",
      text: "Open Import Subscribers and download the template. The same email ties the Account, Internet plan, charge, and discount rows together. Upload it again to update a subscriber who is already on the desk.",
      href: "/provider/import",
      label: "Open import",
    },
    {
      question: "Record a payment",
      text: "Open the subscriber and record the payment as cash, UPI, or internet. A payment that covers the bill moves the renewal date. A smaller amount stays partial.",
      href: "/provider/subscriber",
      label: "Open subscribers",
    },
    {
      question: "Find a receipt",
      text: "Each saved payment has a receipt. On the overview, use the receipt link on a recent payment. On a subscriber, open Billing and the payment row.",
      href: "/provider",
      label: "Back to overview",
    },
    {
      question: "How many internet plans?",
      text: catalogueLine(catalogue.plans, "internet plan", "internet plans", catalogue.planNames),
      href: "/provider/plans",
      label: "Open catalogue",
    },
    {
      question: "How many charges?",
      text: catalogueLine(catalogue.charges, "charge", "charges", catalogue.chargeNames),
      href: "/provider/plans",
      label: "Open catalogue",
    },
    {
      question: "How many discounts and promos?",
      text: catalogueLine(catalogue.discounts, "discount", "discounts and promos", catalogue.discountNames),
      href: "/provider/plans",
      label: "Open catalogue",
    },
  ];
}

const GREETING: Message = { from: "bot", text: "Choose a question. Zignal AI is coming soon." };

export function DeskChat({
  plans,
  planNames,
  charges,
  chargeNames,
  discounts,
  discountNames,
}: {
  plans: number;
  planNames: string;
  charges: number;
  chargeNames: string;
  discounts: number;
  discountNames: string;
}) {
  const answers = answersFor({ plans, planNames, charges, chargeNames, discounts, discountNames });
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([GREETING]);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages, open]);

  function shut() {
    setOpen(false);
    setMessages([GREETING]);
  }

  function ask(answer: Reply) {
    setMessages((current) => [
      ...current,
      { from: "you", text: answer.question },
      { from: "bot", text: answer.text, href: answer.href, label: answer.label },
    ]);
  }

  return (
    <div className="desk-chat no-print">
      {open ? (
        <section className="desk-chat-panel" aria-label="Zignal chat">
          <header className="desk-chat-head">
            <span className="desk-chat-avatar" aria-hidden="true">
              <svg viewBox="0 0 32 32">
                <path d="M7 21c4.2-7.5 13.8-7.5 18 0" fill="none" stroke="#e2b15a" strokeWidth="2" />
                <circle cx="16" cy="13.5" r="2.2" fill="#f4efe6" />
              </svg>
            </span>
            <div>
              <strong>Zignal</strong>
              <span>Zignal AI coming soon</span>
            </div>
            <button type="button" className="desk-chat-close" onClick={shut} aria-label="Close chat">
              Close
            </button>
          </header>
          <div className="desk-chat-log" ref={listRef}>
            {messages.map((message, index) => (
              <article key={index} className={message.from === "you" ? "mine" : "theirs"}>
                {message.from === "bot" ? (
                  <span className="desk-chat-avatar" aria-hidden="true">
                    <svg viewBox="0 0 32 32">
                      <path d="M7 21c4.2-7.5 13.8-7.5 18 0" fill="none" stroke="#e2b15a" strokeWidth="2" />
                      <circle cx="16" cy="13.5" r="2.2" fill="#f4efe6" />
                    </svg>
                  </span>
                ) : null}
                <div>
                  <p>{message.text}</p>
                  {message.href ? <Link href={message.href}>{message.label}</Link> : null}
                </div>
              </article>
            ))}
          </div>
          <div className="desk-chat-starters">
            {answers.map((answer) => (
              <button key={answer.question} type="button" onClick={() => ask(answer)}>
                {answer.question}
              </button>
            ))}
          </div>
        </section>
      ) : null}
      <button
        type="button"
        className="desk-chat-btn"
        aria-expanded={open}
        aria-label={open ? "Close Zignal chat" : "Open Zignal chat"}
        onClick={() => (open ? shut() : setOpen(true))}
      >
        <svg viewBox="0 0 32 32" aria-hidden="true">
          <path d="M7 21c4.2-7.5 13.8-7.5 18 0" fill="none" stroke="#e2b15a" strokeWidth="2" />
          <circle cx="16" cy="13.5" r="2.2" fill="#f4efe6" />
        </svg>
      </button>
    </div>
  );
}
