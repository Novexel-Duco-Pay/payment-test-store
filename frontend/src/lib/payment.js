const apiUrl = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

export async function createCheckoutSession(payload) {
  const res = await fetch(`${apiUrl}/api/checkout-sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || data.message || `Checkout failed (${res.status})`);
  }
  if (!data.checkoutUrl) throw new Error('The payment gateway did not return a checkout URL.');
  return data;
}

export async function fetchOrder(reference) {
  const res = await fetch(`${apiUrl}/api/orders/${encodeURIComponent(reference)}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data.error || data.message || `Could not load order (${res.status})`);
    error.status = res.status;
    throw error;
  }
  return data;
}
