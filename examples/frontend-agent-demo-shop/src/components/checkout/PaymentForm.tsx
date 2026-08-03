"use client";
import { FormEvent } from "react";
import { usePayment } from "../../hooks/usePayment";

export function PaymentForm({ orderId }: { orderId: string }) {
  const { pay, loading, error } = usePayment();
  async function submit(event: FormEvent) {
    event.preventDefault();
    await pay({ orderId, paymentMethodId: "demo-card" });
  }
  return <form onSubmit={submit}>
    <button disabled={loading}>{loading ? "Processing…" : "Pay now"}</button>
    {error && <p role="alert">{error}</p>}
  </form>;
}

