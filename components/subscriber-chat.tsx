"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { raiseChatComplaint } from "@/lib/actions";

type Reply = { question: string; text: string; href: string; label: string };
type Ticket = { question: string; kind: "slow" | "not_working" | "down" };
type Message = { from: "bot" | "you"; text: string; href?: string; label?: string };

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
  const greeting = `${name} here. Choose a question about your line. Zignal AI is coming soon.`;
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([{ from: "bot", text: greeting }]);
  const [busy, setBusy] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages, open]);

  function shut() {
    setOpen(false);
    setMessages([{ from: "bot", text: greeting }]);
    setBusy("");
  }

  function ask(reply: Reply) {
    if (busy) return;
    setMessages((current) => [
      ...current,
      { from: "you", text: reply.question },
      { from: "bot", text: reply.text, href: reply.href, label: reply.label },
    ]);
  }

  async function report(ticket: Ticket) {
    if (busy) return;
    setBusy(ticket.kind);
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
                  {message.href ? <Link href={message.href}>{message.label}</Link> : null}
                </div>
              </article>
            ))}
          </div>
          <div className="desk-chat-starters">
            {replies.map((reply) => (
              <button key={reply.question} type="button" disabled={Boolean(busy)} onClick={() => ask(reply)}>
                {reply.question}
              </button>
            ))}
            {tickets.map((ticket) => (
              <button key={ticket.kind} type="button" disabled={Boolean(busy)} onClick={() => report(ticket)}>
                {busy === ticket.kind ? "Sending…" : ticket.question}
              </button>
            ))}
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
