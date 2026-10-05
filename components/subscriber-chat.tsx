"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { raiseChatComplaint } from "@/lib/actions";

type Fact = { label: string; value: string };
type Reply = { question: string; text: string; href: string; label: string; facts?: Fact[] };
type Ticket = { question: string; kind: "slow" | "not_working" | "down" };
type Message = { from: "bot" | "you"; text: string; href?: string; label?: string; facts?: Fact[] };

export function SubscriberChat({
  ispName,
  replies,
  tickets,
}: {
  ispName: string;
  replies: Reply[];
  tickets: Ticket[];
}) {
  const name = ispName.trim() || "Your provider";
  const greeting = `${name} here. Ask about your line and I'll look it up.`;
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([{ from: "bot", text: greeting }]);
  const [typing, setTyping] = useState(false);
  const [busy, setBusy] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const waitRef = useRef<number | null>(null);

  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages, open, typing]);

  useEffect(() => {
    return () => {
      if (waitRef.current) window.clearTimeout(waitRef.current);
    };
  }, []);

  function shut() {
    if (waitRef.current) window.clearTimeout(waitRef.current);
    setOpen(false);
    setMessages([{ from: "bot", text: greeting }]);
    setTyping(false);
    setBusy("");
  }

  function ask(reply: Reply) {
    if (busy || typing) return;
    setMessages((current) => [...current, { from: "you", text: reply.question }]);
    setTyping(true);
    waitRef.current = window.setTimeout(() => {
      setMessages((current) => [
        ...current,
        { from: "bot", text: reply.text, facts: reply.facts, href: reply.href, label: reply.label },
      ]);
      setTyping(false);
    }, 700);
  }

  async function report(ticket: Ticket) {
    if (busy) return;
    setBusy(ticket.kind);
    setTyping(true);
    setMessages((current) => [...current, { from: "you", text: ticket.question }]);
    try {
      const result = await raiseChatComplaint(ticket.kind);
      const text = result.ok
        ? result.opened
          ? `Complaint ${result.code} is open with your provider.`
          : `Complaint ${result.code} is already open for this. Your provider has it.`
        : result.error;
      setMessages((current) => [
        ...current,
        { from: "bot", text, href: "/subscriber/complaints", label: "Open complaints" },
      ]);
    } catch {
      setMessages((current) => [
        ...current,
        { from: "bot", text: "The complaint could not be sent. Try again from Complaints." },
      ]);
    } finally {
      setTyping(false);
      setBusy("");
    }
  }

  return (
    <div className="desk-chat no-print">
      {open ? (
        <section className="desk-chat-panel" aria-label={`${name} AI chat`}>
          <header className="desk-chat-head">
            <span className="desk-chat-avatar" aria-hidden="true">
              <svg viewBox="0 0 32 32">
                <path d="M7 21c4.2-7.5 13.8-7.5 18 0" fill="none" stroke="#e2b15a" strokeWidth="2" />
                <circle cx="16" cy="13.5" r="2.2" fill="#f4efe6" />
              </svg>
            </span>
            <div>
              <strong>{name}</strong>
              <span>AI chat</span>
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
                  {message.facts && message.facts.length > 0 ? (
                    <dl className="chat-facts">
                      {message.facts.map((fact) => (
                        <div key={fact.label}>
                          <dt>{fact.label}</dt>
                          <dd>{fact.value}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : null}
                  {message.href ? <Link href={message.href}>{message.label}</Link> : null}
                </div>
              </article>
            ))}
            {typing ? (
              <article className="theirs" aria-label="Looking that up">
                <span className="desk-chat-avatar" aria-hidden="true">
                  <svg viewBox="0 0 32 32">
                    <path d="M7 21c4.2-7.5 13.8-7.5 18 0" fill="none" stroke="#e2b15a" strokeWidth="2" />
                    <circle cx="16" cy="13.5" r="2.2" fill="#f4efe6" />
                  </svg>
                </span>
                <div className="chat-typing" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </div>
              </article>
            ) : null}
          </div>
          <div className="chat-prompts">
            <p>Ask about your line</p>
            {replies.map((reply) => (
              <button key={reply.question} type="button" disabled={Boolean(busy) || typing} onClick={() => ask(reply)}>
                {reply.question}
              </button>
            ))}
            <p>Something wrong?</p>
            <div className="chat-prompts-row">
              {tickets.map((ticket) => (
                <button key={ticket.kind} type="button" disabled={Boolean(busy) || typing} onClick={() => report(ticket)}>
                  {busy === ticket.kind ? "Sending…" : ticket.question}
                </button>
              ))}
            </div>
          </div>
        </section>
      ) : null}
      <button
        type="button"
        className="desk-chat-btn"
        aria-expanded={open}
        aria-label={open ? `Close ${name} chat` : `Open ${name} chat`}
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
