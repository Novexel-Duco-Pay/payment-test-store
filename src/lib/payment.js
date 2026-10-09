export const PAYMENT_GATEWAY_URL = "https://my-payment-gateway.com";

export async function submitPayment(payload) {
  const res = await fetch(PAYMENT_GATEWAY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      data.error || data.message || `Payment failed (${res.status})`,
    );
  }
  return data;
}
