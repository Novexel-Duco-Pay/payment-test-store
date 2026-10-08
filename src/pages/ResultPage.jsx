import { useEffect } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { formatMoney } from '../lib/format.js';

function DetailRow({ label, value }) {
  return (
    <div className="details__row">
      <dt>{label}</dt>
      <dd>{value ?? '—'}</dd>
    </div>
  );
}

export default function ResultPage() {
  const { state } = useLocation();

  useEffect(() => {
    document.title = 'Payment status · Sandbox Store';
  }, []);

  if (!state?.status) return <Navigate to="/" replace />;

  const ok = state.status === 'succeeded';
  const payload = state.payload;

  return (
    <main className="container">
      <div className={`card result result--${ok ? 'succeeded' : 'failed'}`} aria-live="polite">
        <div className="result__icon" aria-hidden="true">
          {ok ? '✓' : '✕'}
        </div>
        <h1>{ok ? 'Payment submitted' : 'Payment failed'}</h1>
        <p className="muted">{ok ? 'The order was sent to the payment gateway.' : 'The payment request did not succeed.'}</p>
        {payload && (
          <dl className="details">
            <DetailRow label="Amount" value={formatMoney(payload.total, payload.currency)} />
            <DetailRow label="Customer" value={`${payload.customer.name} · ${payload.customer.email}`} />
            <DetailRow label="Items" value={payload.items.map((l) => `${l.name} × ${l.quantity}`).join(', ')} />
          </dl>
        )}
        <div className="actions">
          <Link to="/" className="btn btn--primary">
            Continue shopping
          </Link>
          {!ok && (
            <Link to="/checkout" className="btn">
              Try again
            </Link>
          )}
        </div>
      </div>
    </main>
  );
}
