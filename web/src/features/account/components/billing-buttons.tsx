"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/surface";
import { cancelPlanAction, confirmCheckoutAction, startCheckoutAction } from "@/features/billing/actions";

type RzpResponse = { razorpay_payment_id: string; razorpay_subscription_id: string; razorpay_signature: string };
type RzpCtor = new (opts: Record<string, unknown>) => { open: () => void; on: (ev: string, cb: (r: { error?: { description?: string } }) => void) => void };

const SCRIPT = "https://checkout.razorpay.com/v1/checkout.js";

function loadCheckout(): Promise<RzpCtor> {
  const w = window as unknown as { Razorpay?: RzpCtor };
  if (w.Razorpay) return Promise.resolve(w.Razorpay);
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SCRIPT;
    s.async = true;
    s.onload = () => (w.Razorpay ? resolve(w.Razorpay) : reject(new Error("Checkout didn't load.")));
    s.onerror = () => reject(new Error("Couldn't load Razorpay. Check your connection or ad blocker."));
    document.head.appendChild(s);
  });
}

export function SubscribeButton({ label }: { label: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ tone: "error" | "success"; text: string } | null>(null);

  const go = () =>
    start(async () => {
      setMsg(null);
      const r = await startCheckoutAction();
      if (!r.ok) return setMsg({ tone: "error", text: r.error });
      try {
        const Razorpay = await loadCheckout();
        const rzp = new Razorpay({
          key: r.keyId,
          subscription_id: r.subscriptionId,
          name: "Shryxa Ads",
          description: "Starter plan · monthly",
          prefill: { email: r.email },
          theme: { color: getComputedStyle(document.documentElement).getPropertyValue("--color-tomato-600").trim() || undefined },
          handler: async (resp: RzpResponse) => {
            const c = await confirmCheckoutAction(resp);
            setMsg({ tone: c.ok ? "success" : "error", text: c.message });
            router.refresh();
          },
        });
        rzp.on("payment.failed", (e) => setMsg({ tone: "error", text: e.error?.description ?? "Payment failed." }));
        rzp.open();
      } catch (e) {
        setMsg({ tone: "error", text: e instanceof Error ? e.message : "Checkout failed." });
      }
    });

  return (
    <div className="flex flex-col items-start gap-3">
      <Button onClick={go} disabled={pending}>
        {pending ? "Opening checkout…" : label}
      </Button>
      {msg && <Callout tone={msg.tone}>{msg.text}</Callout>}
    </div>
  );
}

export function CancelPlanButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; message: string } | null>(null);
  return (
    <div className="flex flex-col items-start gap-2">
      {confirming ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[14px]">Cancel at the end of this billing period?</span>
          <Button
            variant="danger"
            size="sm"
            disabled={pending}
            onClick={() =>
              start(async () => {
                setMsg(await cancelPlanAction());
                setConfirming(false);
                router.refresh();
              })
            }
          >
            Yes, cancel
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
            Keep plan
          </Button>
        </div>
      ) : (
        <Button variant="ghost" size="sm" onClick={() => setConfirming(true)}>
          Cancel plan
        </Button>
      )}
      {msg && <Callout tone={msg.ok ? "success" : "error"}>{msg.message}</Callout>}
    </div>
  );
}
