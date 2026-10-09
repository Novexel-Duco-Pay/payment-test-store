import crypto from "node:crypto";
import { createServer } from "node:http";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { priceCart } from "./lib/pricing.js";
import {
  createCheckoutSession,
  getCheckoutSession,
  getPaymentIntent,
  merchantKey,
  verifyWebhookSignature,
  webhookSecret,
} from "./duco.js";
import { loadEnv } from "./env.js";
import { createStore, publicOrder } from "./store.js";

const root = dirname(fileURLToPath(import.meta.url));
loadEnv(root);

const store = createStore(root);
const port = Number(process.env.PORT || process.env.API_PORT || 3001);
const allowedOrigins = (process.env.APP_ORIGIN || "http://localhost:5173")
  .split(",")
  .map((value) => value.trim().replace(/\/$/, ""))
  .filter(Boolean);
const appOrigin = allowedOrigins[0];

const server = createServer(async (req, res) => {
  try {
    applyCors(req, res);
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    if (req.method === "GET" && url.pathname === "/") {
      return send(res, 200, { ok: true });
    }
    if (req.method === "GET" && url.pathname === "/api/health") {
      return send(res, 200, {
        ok: true,
        merchantKey: Boolean(merchantKey()),
        webhookSecret: Boolean(webhookSecret()),
      });
    }
    if (req.method === "POST" && url.pathname === "/api/checkout-sessions") {
      return await handleCheckout(req, res);
    }
    const orderMatch = url.pathname.match(/^\/api\/orders\/([^/]+)$/);
    if (req.method === "GET" && orderMatch) {
      return await handleOrder(res, decodeURIComponent(orderMatch[1]));
    }
    if (req.method === "POST" && url.pathname === "/webhooks/duco") {
      return await handleWebhook(req, res);
    }
    send(res, 404, { error: "Not found" });
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error(err);
    send(res, status, { error: err.message || "Server error" });
  }
});

server.listen(port, "0.0.0.0", () => {
  console.log(`API listening on port ${port}`);
  console.log(`Webhook endpoint: POST /webhooks/duco`);
  console.log(`Merchant key: ${merchantKey() ? "configured" : "missing"}`);
  console.log(`Webhook secret: ${webhookSecret() ? "configured" : "missing"}`);
});

async function handleCheckout(req, res) {
  let body;
  try {
    body = JSON.parse((await readBody(req)).toString("utf8") || "{}");
  } catch {
    return send(res, 400, { error: "Invalid JSON." });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return send(res, 400, { error: "Invalid JSON." });
  }
  const customer = normalizeCustomer(body.customer);
  const customerErrors = validateCustomer(customer);
  if (Object.keys(customerErrors).length) {
    return send(res, 400, {
      error: "Check the customer details.",
      fields: customerErrors,
    });
  }

  const items = Array.isArray(body.items) ? body.items : [];
  const quote = priceCart(items);
  if (!quote.lines.length)
    return send(res, 400, { error: "The cart is empty." });

  const reference = newReference();
  const description = quote.lines
    .map((line) => `${line.name} × ${line.quantity}`)
    .join(", ")
    .slice(0, 200);
  const now = new Date().toISOString();

  const session = await createCheckoutSession(
    {
      amount_minor: quote.total,
      currency: quote.currency,
      merchant_reference: reference,
      description,
      return_url: `${appOrigin}/orders/${reference}`,
      expires_in_seconds: 1800,
      metadata: {
        customer_email: customer.email,
        customer_name: customer.name,
        customer_phone: customer.phone || "",
      },
    },
    reference,
  );

  if (!session.checkout_url || !session.payment_intent_id) {
    return send(res, 502, { error: "Duco did not return a checkout URL." });
  }

  await store.createOrder({
    reference,
    status: "pending",
    currency: quote.currency,
    description,
    customer,
    items: quote.lines.map(
      ({ productId, name, quantity, unitAmount, lineTotal }) => ({
        productId,
        name,
        quantity,
        unitAmount,
        lineTotal,
      }),
    ),
    subtotal: quote.subtotal,
    tax: quote.tax,
    taxRate: quote.taxRate,
    shipping: quote.shipping,
    total: quote.total,
    checkoutSessionId: session.id,
    paymentIntentId: session.payment_intent_id,
    expiresAt: session.expires_at || null,
    createdAt: now,
    updatedAt: now,
    paidAt: null,
    failureReason: null,
    confirmedBy: null,
    sessionStatus: session.status || "active",
    paymentVersion: null,
    attemptId: null,
  });

  send(res, 201, {
    reference,
    checkoutUrl: session.checkout_url,
    checkoutSessionId: session.id,
    paymentIntentId: session.payment_intent_id,
  });
}

async function handleOrder(res, reference) {
  if (!/^ORD-[A-Z0-9]+$/.test(reference))
    return send(res, 400, { error: "Invalid order reference." });
  let order = store.getOrder(reference);
  if (!order) return send(res, 404, { error: "Order not found." });

  if (order.status === "pending" && merchantKey()) {
    try {
      order = (await refreshPaymentStatus(order)) || order;
    } catch (err) {
      console.error(`Payment status lookup failed for ${reference}: ${err.message}`);
    }
  }

  send(res, 200, publicOrder(order));
}

async function refreshPaymentStatus(order) {
  const [sessionResult, intentResult] = await Promise.allSettled([
    order.checkoutSessionId ? getCheckoutSession(order.checkoutSessionId) : null,
    order.paymentIntentId ? getPaymentIntent(order.paymentIntentId) : null,
  ]);
  if (sessionResult.status === "rejected") {
    console.error(`Checkout session lookup failed for ${order.reference}: ${sessionResult.reason?.message}`);
  }
  if (intentResult.status === "rejected") {
    console.error(`Payment intent lookup failed for ${order.reference}: ${intentResult.reason?.message}`);
  }

  const session = sessionResult.status === "fulfilled" ? sessionResult.value : null;
  const intent = intentResult.status === "fulfilled" ? intentResult.value : null;
  if (!session && !intent) return order;

  const sessionStatus = String(session?.status || "").toLowerCase();
  const intentStatus = String(intent?.status || "").toLowerCase();
  const patch = {};
  if (sessionStatus) patch.sessionStatus = sessionStatus;
  if (session?.expires_at) patch.expiresAt = session.expires_at;
  if (Number.isFinite(session?.poll_after_ms)) patch.pollAfterMs = session.poll_after_ms;
  if (intentStatus) patch.paymentStatus = intentStatus;

  const intentPaid = intentStatus === "succeeded" && amountsMatch(order, intent);
  const sessionPaid = sessionStatus === "consumed" && amountsMatch(order, session);

  if (intentPaid || sessionPaid) {
    patch.status = "paid";
    patch.paidAt = order.paidAt || new Date().toISOString();
    patch.confirmedBy = order.confirmedBy === "webhook" ? "webhook" : intentPaid ? "payment_intent" : "checkout_session";
    patch.failureReason = null;
    if (intent?.latest_attempt?.id) patch.attemptId = intent.latest_attempt.id;
  } else if (intentStatus === "failed") {
    patch.status = "failed";
    patch.failureReason = failureMessage(intent);
    patch.confirmedBy = "payment_intent";
  } else if (intentStatus === "canceled" || intentStatus === "cancelled") {
    patch.status = "canceled";
    patch.failureReason = "The payment was canceled.";
    patch.confirmedBy = "payment_intent";
  } else if (sessionStatus === "expired") {
    patch.status = "expired";
    patch.failureReason = "The checkout session expired before payment.";
  } else if (sessionStatus === "revoked") {
    patch.status = "canceled";
    patch.failureReason = "The checkout session was canceled.";
  }

  return store.updateOrder(order.reference, patch);
}

function amountsMatch(order, resource) {
  if (!resource) return false;
  const amount = minorAmount(resource.amount_minor);
  if (amount === null) return true;
  if (amount !== order.total) return false;
  if (resource.currency && String(resource.currency).toUpperCase() !== String(order.currency).toUpperCase()) return false;
  return true;
}

function minorAmount(value) {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
  return null;
}

function failureMessage(intent) {
  const attempt = intent?.latest_attempt;
  const value = attempt?.error || attempt?.failure_message || intent?.error || "Payment failed";
  return typeof value === "string" ? value : "Payment failed";
}

async function handleWebhook(req, res) {
  const rawBody = await readBody(req);
  const secret = webhookSecret();
  if (!secret)
    return send(res, 500, { error: "DUCO_WEBHOOK_SECRET is not set." });

  const signature = header(req, "webhook-signature");
  if (!verifyWebhookSignature(rawBody, signature, secret)) {
    return sendText(res, 400, "Invalid signature");
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString("utf8"));
  } catch {
    return sendText(res, 400, "Invalid JSON");
  }

  const deliveryId = header(req, "webhook-id");
  const eventType = header(req, "webhook-event-type");
  if (!deliveryId || !eventType || !event || typeof event.id !== "string") {
    return sendText(res, 200, "ignored");
  }

  await store.applyWebhook({ deliveryId, eventType, event });
  sendText(res, 200, "ok");
}

function applyCors(req, res) {
  const origin = req.headers.origin;
  if (!origin || !allowedOrigins.includes(origin.replace(/\/$/, ""))) return;
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function normalizeCustomer(input) {
  const billing = input?.billing ?? {};
  return {
    name: String(input?.name ?? "").trim(),
    email: String(input?.email ?? "").trim(),
    phone: String(input?.phone ?? "").trim(),
    billing: {
      line1: String(billing.line1 ?? "").trim(),
      line2: String(billing.line2 ?? "").trim(),
      city: String(billing.city ?? "").trim(),
      state: String(billing.state ?? "").trim(),
      postalCode: String(billing.postalCode ?? "").trim(),
      country: String(billing.country ?? "")
        .trim()
        .toUpperCase(),
    },
  };
}

function validateCustomer(customer) {
  const errors = {};
  if (customer.name.length < 2) errors.name = "Enter your full name.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(customer.email))
    errors.email = "Enter a valid email address.";
  if (!customer.billing.line1)
    errors["billing.line1"] = "Enter your street address.";
  if (!customer.billing.city) errors["billing.city"] = "Enter your city.";
  if (!/^[A-Z]{2}$/.test(customer.billing.country))
    errors["billing.country"] = "Choose a country.";
  return errors;
}

function newReference() {
  return `ORD-${Date.now().toString(36).toUpperCase()}${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}

function header(req, name) {
  const value = req.headers[name];
  return Array.isArray(value) ? value[0] : value || "";
}

function readBody(req, limit = 1_000_000) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        req.destroy();
        const error = new Error("Payload too large");
        error.status = 413;
        reject(error);
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function send(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    "Cache-Control": "no-store",
  });
  res.end(payload);
}

function sendText(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(body);
}
