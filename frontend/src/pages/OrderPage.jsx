import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import OrderSummary from '../components/OrderSummary.jsx';
import { cart } from '../lib/cart.js';
import { fetchOrder } from '../lib/payment.js';

const TERMINAL = new Set(['paid', 'failed', 'canceled', 'expired']);

function DetailRow({ label, value }) {
  return (
    <div className="details__row">
      <dt>{label}</dt>
      <dd>{value ?? '—'}</dd>
    </div>
  );
}

function tone(status) {
  if (status === 'paid') return 'succeeded';
  if (status === 'pending') return 'pending';
  return 'failed';
}

function title(status) {
  if (status === 'paid') return 'Payment confirmed';
  if (status === 'pending') return 'Waiting for confirmation';
  if (status === 'expired') return 'Checkout expired';
  if (status === 'canceled') return 'Payment canceled';
  return 'Payment failed';
}

function message(order) {
  if (order.status === 'paid') {
    return order.confirmedBy === 'webhook'
      ? 'Duco confirmed this payment with a signed webhook.'
      : 'Duco marked the checkout session as paid.';
  }
  if (order.status === 'pending') {
    return 'Card details are entered on Duco. This page updates when the signed webhook arrives. The return visit alone does not complete the order.';
  }
  return order.failureReason || 'The payment was not completed.';
}

export default function OrderPage() {
  const { reference } = useParams();
  const [order, setOrder] = useState(null);
  const [error, setError] = useState('');
  const statusRef = useRef('');

  useEffect(() => {
    document.title = 'Order · Sandbox Store';
  }, []);

  useEffect(() => {
    let stop = false;

    async function tick() {
      try {
        const next = await fetchOrder(reference);
        if (stop) return;
        statusRef.current = next.status;
        setOrder(next);
        setError('');
        if (next.status === 'paid') cart.clear();
      } catch (err) {
        if (!stop) setError(err.message || 'Could not load this order.');
      }
    }

    statusRef.current = '';
    tick();
    const timer = setInterval(() => {
      if (!TERMINAL.has(statusRef.current)) tick();
    }, 2000);

    return () => {
      stop = true;
      clearInterval(timer);
    };
  }, [reference]);

  const status = order?.status;
  const view = tone(status);

  return (
    <main className="container">
      <div className={`card result result--${order ? view : 'pending'}`} aria-live="polite">
        <div className="result__icon" aria-hidden="true">
          {status === 'paid' ? '✓' : status && status !== 'pending' ? '✕' : <span className="spinner" />}
        </div>
        <h1>{error && !order ? 'Order unavailable' : title(status || 'pending')}</h1>
        <p className="muted">{error && !order ? error : order ? message(order) : 'Checking the order with the store.'}</p>
        {order && (
          <>
            <dl className="details">
              <DetailRow label="Order" value={order.reference} />
              <DetailRow label="Customer" value={`${order.customer.name} · ${order.customer.email}`} />
              <DetailRow label="Items" value={order.items.map((line) => `${line.name} × ${line.quantity}`).join(', ')} />
              <DetailRow label="Payment" value={order.paymentIntentId} />
            </dl>
            <OrderSummary quote={order} />
          </>
        )}
        <div className="actions">
          <Link to="/" className="btn btn--primary">
            Continue shopping
          </Link>
          {status && status !== 'paid' && status !== 'pending' && (
            <Link to="/checkout" className="btn">
              Try again
            </Link>
          )}
        </div>
      </div>
    </main>
  );
}
