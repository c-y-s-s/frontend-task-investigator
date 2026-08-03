export type PaymentPayload = { orderId: string; paymentMethodId: string };

export async function submitPayment(payload: PaymentPayload) {
  const response = await fetch("/api/payments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error("Payment failed");
  return response.json() as Promise<{ paymentId: string }>;
}

