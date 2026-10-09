import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import OrderSummary from '../components/OrderSummary.jsx';
import { cart } from '../lib/cart.js';
import { fetchOrder } from '../lib/payment.js';

const TERMINAL = new Set(['paid', 'failed', 'canceled', 'expired']);
const POLL_MS = 3000;
const POLL_LIMIT_MS = 120000;

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

function title(status, timedOut) {
  if (status === 'paid') return 'Payment confirmed';
  if (timedOut && (!status || status === 'pending')) return 'Still waiting';
  if (status === 'pending') return 'Waiting for confirmation';
  if (status === 'expired') return 'Checkout expired';
  if (status === 'canceled') return 'Payment canceled';
  return 'Payment failed';
}

function message(order, timedOut) {
  if (order.status === 'paid') {
    return order.confirmedBy === 'webhook'
      ? 'Duco confirmed this payment with a signed webhook.'
      : 'Duco confirmed this payment.';
  }
  if (order.status === 'pending' && timedOut) {
    return 'No final status arrived within 2 minutes. You can check again, or return to checkout if the payment did not go through.';
  }
  if (order.status === 'pending') {
    return 'Duco is confirming the payment. This page checks the payment status every few seconds.';
  }
  return order.failureReason || 'The payment was not completed.';
}

export default function OrderPage() {
  const { reference } = useParams();
  const [order, setOrder] = useState(null);
  const [error, setError] = useState('');
  const [timedOut, setTimedOut] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const statusRef = useRef('');

  useEffect(() => {
    document.title = 'Order · Sandbox Store';
  }, []);

  useEffect(() => {
    let stop = false;
    const started = Date.now();
    setTimedOut(false);
    statusRef.current = '';

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

    tick();
    const timer = setInterval(() => {
      if (TERMINAL.has(statusRef.current)) {
        clearInterval(timer);
        return;
      }
      if (Date.now() - started >= POLL_LIMIT_MS) {
        setTimedOut(true);
        clearInterval(timer);
        return;
      }
      tick();
    }, POLL_MS);

    return () => {
      stop = true;
      clearInterval(timer);
    };
  }, [reference, attempt]);

  const status = order?.status;
  const view = tone(status);
  const waiting = !status || status === 'pending';

  return (
    <main className="container">
      <div className={`card result result--${order ? view : 'pending'}`} aria-live="polite">
        <div className="result__icon" aria-hidden="true">
          {status === 'paid' ? '✓' : status && status !== 'pending' ? '✕' : <span className="spinner" />}
        </div>
        <h1>{error && !order ? 'Order unavailable' : title(status || 'pending', timedOut)}</h1>
        <p className="muted">{error && !order ? error : order ? message(order, timedOut) : 'Checking the payment with Duco.'}</p>
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
          {timedOut && waiting && (
            <button type="button" className="btn" onClick={() => setAttempt((value) => value + 1)}>
              Check again
            </button>
          )}
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
