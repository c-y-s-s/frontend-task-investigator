import { useState } from "react";
import { submitPayment, PaymentPayload } from "../lib/paymentApi";

export function usePayment() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pay(payload: PaymentPayload) {
    setLoading(true); setError(null);
    try { return await submitPayment(payload); }
    catch { setError("Payment failed. Refresh to try again."); return null; }
    finally { setLoading(false); }
  }
  return { pay, loading, error };
}

