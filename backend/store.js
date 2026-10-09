import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const DELIVERY_TTL_MS = 48 * 60 * 60 * 1000;

export function createStore(root) {
  const file = join(root, 'data', 'orders.json');
  let db = load(file);
  let chain = Promise.resolve();

  function mutate(fn) {
    const run = chain.then(() => {
      const result = fn(db);
      pruneDeliveries(db);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, JSON.stringify(db, null, 2));
      return result;
    });
    chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  return {
    createOrder(order) {
      return mutate((state) => {
        state.orders[order.reference] = order;
        if (order.paymentIntentId) state.byPaymentIntent[order.paymentIntentId] = order.reference;
        return order;
      });
    },

    getOrder(reference) {
      return db.orders[reference] ?? null;
    },

    updateOrder(reference, patch) {
      return mutate((state) => {
        const order = state.orders[reference];
        if (!order) return null;
        Object.assign(order, patch, { updatedAt: new Date().toISOString() });
        if (patch.paymentIntentId) state.byPaymentIntent[patch.paymentIntentId] = reference;
        return order;
      });
    },

    applyWebhook({ deliveryId, eventType, event }) {
      return mutate((state) => {
        if (!deliveryId) return { duplicate: false, missingId: true };
        if (state.deliveries[deliveryId]) return { duplicate: true };

        const order = findOrder(state, eventType, event);
        if (!order) {
          state.deliveries[deliveryId] = { at: Date.now(), eventType, ignored: true };
          return { ignored: true };
        }

        const incomingVersion = typeof event.version === 'number' ? event.version : null;
        const currentVersion = typeof order.paymentVersion === 'number' ? order.paymentVersion : null;
        const stale = incomingVersion !== null && currentVersion !== null && incomingVersion < currentVersion;

        if (!stale) {
          const canDowngrade =
            incomingVersion !== null && (currentVersion === null || incomingVersion > currentVersion);
          if (incomingVersion !== null) {
            order.paymentVersion = Math.max(currentVersion ?? incomingVersion, incomingVersion);
          }
          applyEvent(order, eventType, event, canDowngrade);
          order.updatedAt = new Date().toISOString();
        }

        state.deliveries[deliveryId] = { at: Date.now(), eventType, reference: order.reference, stale };
        return { ok: true, reference: order.reference, status: order.status, stale };
      });
    },
  };
}

function load(file) {
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    return {
      orders: parsed.orders ?? {},
      byPaymentIntent: parsed.byPaymentIntent ?? {},
      deliveries: parsed.deliveries ?? {},
    };
  } catch {
    return { orders: {}, byPaymentIntent: {}, deliveries: {} };
  }
}

function pruneDeliveries(state) {
  const cutoff = Date.now() - DELIVERY_TTL_MS;
  for (const [id, delivery] of Object.entries(state.deliveries)) {
    if (!delivery?.at || delivery.at < cutoff) delete state.deliveries[id];
  }
}

function findOrder(state, eventType, event) {
  const paymentIntentId =
    eventType === 'CheckoutSessionCreated' || eventType === 'InvoicePaymentLinkCreated'
      ? event.payment_intent_id
      : event.id;
  const reference = paymentIntentId && state.byPaymentIntent[paymentIntentId];
  return reference ? state.orders[reference] : null;
}

function applyEvent(order, eventType, event, canDowngrade) {
  if (eventType === 'PaymentIntentSucceeded') {
    order.status = 'paid';
    order.paidAt = order.paidAt || new Date().toISOString();
    order.attemptId = event.attempt_id || order.attemptId || null;
    order.confirmedBy = 'webhook';
    order.failureReason = null;
    return;
  }

  if (order.status === 'paid' && !canDowngrade) return;

  if (eventType === 'PaymentIntentFailed') {
    order.status = 'failed';
    order.failureReason = event.error || 'Payment failed';
    order.confirmedBy = 'webhook';
    return;
  }

  if (eventType === 'PaymentIntentCanceled') {
    order.status = 'canceled';
    order.failureReason = event.reason || 'customer_requested';
    order.confirmedBy = 'webhook';
    return;
  }

  if (eventType === 'CheckoutSessionCreated' && event.expires_at) {
    order.expiresAt = event.expires_at;
  }
}

export function publicOrder(order) {
  if (!order) return null;
  return {
    reference: order.reference,
    status: order.status,
    currency: order.currency,
    description: order.description,
    customer: order.customer,
    items: order.items,
    subtotal: order.subtotal,
    tax: order.tax,
    taxRate: order.taxRate,
    shipping: order.shipping,
    total: order.total,
    checkoutSessionId: order.checkoutSessionId,
    paymentIntentId: order.paymentIntentId,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    paidAt: order.paidAt,
    expiresAt: order.expiresAt,
    failureReason: order.failureReason,
    confirmedBy: order.confirmedBy,
    sessionStatus: order.sessionStatus,
  };
}
