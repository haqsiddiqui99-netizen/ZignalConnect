"use client";

import { useState } from "react";

type RazorpayResponse = {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
};

type RazorpayOptions = {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  prefill?: { name?: string; email?: string };
  theme?: { color?: string };
  handler: (response: RazorpayResponse) => void;
  modal?: { ondismiss?: () => void };
};

type RazorpayWindow = Window & {
  Razorpay?: new (options: RazorpayOptions) => { open: () => void; on: (event: string, cb: (response: { error?: { description?: string } }) => void) => void };
};

const SCRIPT = "https://checkout.razorpay.com/v1/checkout.js";

function loadScript() {
  return new Promise<boolean>((resolve) => {
    if ((window as RazorpayWindow).Razorpay) return resolve(true);
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT}"]`);
    const script = existing ?? document.createElement("script");
    script.addEventListener("load", () => resolve(true), { once: true });
    script.addEventListener("error", () => resolve(false), { once: true });
    if (!existing) {
      script.src = SCRIPT;
      script.async = true;
      document.body.appendChild(script);
    }
  });
}

export function RazorpayPay({
  orderId,
  amountLabel,
  ready,
  doneHref,
}: {
  orderId: number;
  amountLabel: string;
  ready: boolean;
  doneHref: string;
}) {
  const [state, setState] = useState<"idle" | "starting" | "paying" | "confirming">("idle");
  const [message, setMessage] = useState("");

  async function start() {
    setMessage("");
    setState("starting");
    try {
      const loaded = await loadScript();
      const Razorpay = (window as RazorpayWindow).Razorpay;
      if (!loaded || !Razorpay) throw new Error("Razorpay could not be loaded. Check your connection and try again.");

      const started = await fetch("/api/razorpay/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId }),
      });
      const order = await started.json();
      if (!started.ok || !order.ok) throw new Error(order.error || "Razorpay could not start this payment.");

      const checkout = new Razorpay({
        key: order.keyId,
        amount: order.amount,
        currency: order.currency,
        name: order.name,
        description: order.description,
        order_id: order.gatewayOrderId,
        prefill: order.prefill,
        theme: { color: "#14261e" },
        modal: {
          ondismiss: () => {
            setState((current) => (current === "confirming" ? current : "idle"));
          },
        },
        handler: async (response) => {
          setState("confirming");
          try {
            const confirmed = await fetch("/api/razorpay/verify", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ orderId, ...response }),
            });
            const result = await confirmed.json();
            if (!confirmed.ok || !result.ok) throw new Error(result.error || "The payment could not be confirmed.");
            window.location.assign(doneHref);
          } catch (error) {
            setMessage(error instanceof Error ? error.message : "The payment could not be confirmed.");
            setState("idle");
          }
        },
      });
      checkout.on("payment.failed", (failure) => {
        setMessage(failure.error?.description || "The payment failed. Nothing was charged. You can try again.");
        setState("idle");
      });
      setState("paying");
      checkout.open();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Razorpay could not start this payment.");
      setState("idle");
    }
  }

  if (!ready) {
    return (
      <p className="pay-note">
        The payment gateway is not connected yet. Nothing was charged, and this desk stays on its current plan.
      </p>
    );
  }

  const busy = state !== "idle";
  const label =
    state === "starting" ? "Starting payment…" : state === "paying" ? "Complete the payment in the Razorpay window…" : state === "confirming" ? "Confirming your payment…" : `Pay ${amountLabel}`;

  return (
    <>
      <button type="button" className="btn primary pay-submit" onClick={start} disabled={busy}>
        {label}
      </button>
      {message ? (
        <p className="pay-note" role="alert">
          {message}
        </p>
      ) : null}
      <p className="pay-note">Payments are taken securely by Razorpay: UPI, cards, net banking and wallets. Zignal never sees your card details.</p>
    </>
  );
}
