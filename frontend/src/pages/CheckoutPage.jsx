import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import OrderSummary from '../components/OrderSummary.jsx';
import { useCartItems } from '../lib/cart.js';
import { formatMoney } from '../lib/format.js';
import { createCheckoutSession } from '../lib/payment.js';
import { priceCart } from '../lib/pricing.js';

const DRAFT_KEY = 'pts.checkout.customer';
const COUNTRIES = [
  ['NG', 'Nigeria'],
  ['GH', 'Ghana'],
  ['KE', 'Kenya'],
  ['ZA', 'South Africa'],
  ['US', 'United States'],
  ['CA', 'Canada'],
  ['GB', 'United Kingdom'],
  ['DE', 'Germany'],
  ['FR', 'France'],
  ['IN', 'India'],
  ['AU', 'Australia'],
];

const emptyCustomer = {
  name: '',
  email: '',
  phone: '',
  billing: { line1: '', line2: '', city: '', state: '', postalCode: '', country: 'GH' },
};

function readDraft() {
  try {
    return JSON.parse(sessionStorage.getItem(DRAFT_KEY) || 'null');
  } catch {
    return null;
  }
}

function validateCustomer(customer) {
  const errors = {};
  if (customer.name.trim().length < 2) errors.name = 'Enter your full name.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(customer.email.trim())) errors.email = 'Enter a valid email address.';
  if (!customer.billing.line1.trim()) errors['billing.line1'] = 'Enter your street address.';
  if (!customer.billing.city.trim()) errors['billing.city'] = 'Enter your city.';
  if (!/^[A-Z]{2}$/.test(customer.billing.country)) errors['billing.country'] = 'Choose a country.';
  return errors;
}

function Field({ id, label, optional, error, className = '', children }) {
  return (
    <div className={`field ${className}`.trim()}>
      <label htmlFor={id}>
        {label}
        {optional ? <span className="optional"> (optional)</span> : null}
      </label>
      {children}
      <span className="field__error">{error}</span>
    </div>
  );
}

export default function CheckoutPage() {
  const items = useCartItems();
  const quote = useMemo(() => (items.length ? priceCart(items) : null), [items]);
  const [customer, setCustomer] = useState(() => readDraft() ?? emptyCustomer);
  const [fieldErrors, setFieldErrors] = useState({});
  const [alert, setAlert] = useState('');
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    document.title = 'Checkout · Sandbox Store';
  }, []);

  if (!quote) return <Navigate to="/cart" replace />;

  function updateField(name, value) {
    if (name.startsWith('billing.')) {
      const key = name.slice('billing.'.length);
      setCustomer((current) => ({ ...current, billing: { ...current.billing, [key]: value } }));
    } else {
      setCustomer((current) => ({ ...current, [name]: value }));
    }
  }

  async function onPay(e) {
    e.preventDefault();
    const errors = validateCustomer(customer);
    setFieldErrors(errors);
    setAlert('');
    if (Object.keys(errors).length) {
      setAlert('Please check the highlighted fields.');
      return;
    }

    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(customer));
    } catch {
      /* ignore */
    }

    setPaying(true);
    try {
      const session = await createCheckoutSession({
        customer,
        items: quote.lines.map(({ productId, quantity }) => ({ productId, quantity })),
      });
      window.location.assign(session.checkoutUrl);
    } catch (err) {
      setAlert(err.message || 'Could not start checkout.');
      setPaying(false);
    }
  }

  return (
    <main className="container">
      <h1 className="page-title">Checkout</h1>
      <div className="layout-2col">
        <form className="card panel" onSubmit={onPay} noValidate>
          <div className="panel__head">
            <h2>Customer &amp; billing details</h2>
          </div>
          {alert && (
            <p className="alert alert--error" role="alert">
              {alert}
            </p>
          )}
          <p className="alert alert--info">
            Card numbers are entered on Duco’s hosted checkout page. This store only sends the order total and your contact details.
          </p>
          <div className="form-grid">
            <Field id="name" label="Full name" error={fieldErrors.name} className="field--full">
              <input
                id="name"
                autoComplete="name"
                required
                aria-invalid={fieldErrors.name ? 'true' : 'false'}
                value={customer.name}
                onChange={(e) => updateField('name', e.target.value)}
              />
            </Field>
            <Field id="email" label="Email" error={fieldErrors.email}>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                aria-invalid={fieldErrors.email ? 'true' : 'false'}
                value={customer.email}
                onChange={(e) => updateField('email', e.target.value)}
              />
            </Field>
            <Field id="phone" label="Phone" optional>
              <input id="phone" type="tel" autoComplete="tel" value={customer.phone} onChange={(e) => updateField('phone', e.target.value)} />
            </Field>
            <Field id="line1" label="Billing address" error={fieldErrors['billing.line1']} className="field--full">
              <input
                id="line1"
                autoComplete="billing address-line1"
                required
                aria-invalid={fieldErrors['billing.line1'] ? 'true' : 'false'}
                value={customer.billing.line1}
                onChange={(e) => updateField('billing.line1', e.target.value)}
              />
            </Field>
            <Field id="line2" label="Apartment, suite, etc." optional className="field--full">
              <input
                id="line2"
                autoComplete="billing address-line2"
                value={customer.billing.line2}
                onChange={(e) => updateField('billing.line2', e.target.value)}
              />
            </Field>
            <Field id="city" label="City" error={fieldErrors['billing.city']}>
              <input
                id="city"
                autoComplete="billing address-level2"
                required
                aria-invalid={fieldErrors['billing.city'] ? 'true' : 'false'}
                value={customer.billing.city}
                onChange={(e) => updateField('billing.city', e.target.value)}
              />
            </Field>
            <Field id="state" label="State / region" optional>
              <input
                id="state"
                autoComplete="billing address-level1"
                value={customer.billing.state}
                onChange={(e) => updateField('billing.state', e.target.value)}
              />
            </Field>
            <Field id="postalCode" label="Postal code" optional>
              <input
                id="postalCode"
                autoComplete="billing postal-code"
                value={customer.billing.postalCode}
                onChange={(e) => updateField('billing.postalCode', e.target.value)}
              />
            </Field>
            <Field id="country" label="Country" error={fieldErrors['billing.country']}>
              <select
                id="country"
                autoComplete="billing country"
                required
                aria-invalid={fieldErrors['billing.country'] ? 'true' : 'false'}
                value={customer.billing.country}
                onChange={(e) => updateField('billing.country', e.target.value)}
              >
                <option value="">Select…</option>
                {COUNTRIES.map(([code, label]) => (
                  <option key={code} value={code}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="pay-area">
            <button type="submit" className="btn btn--primary btn--block btn--lg" disabled={paying}>
              {paying ? (
                <>
                  <span className="spinner" aria-hidden="true" /> Redirecting…
                </>
              ) : (
                `Continue to pay ${formatMoney(quote.total, quote.currency)}`
              )}
            </button>
            <p className="secure-note">Visa and Mastercard are collected by Duco, including 3D Secure.</p>
          </div>
        </form>

        <aside className="card summary" aria-label="Order summary">
          <h2>Order summary</h2>
          <ul className="summary__items">
            {quote.lines.map((line) => (
              <li key={line.productId} className="summary__item">
                <span>
                  {line.name} × {line.quantity}
                </span>
                <span>{formatMoney(line.lineTotal, quote.currency)}</span>
              </li>
            ))}
          </ul>
          <OrderSummary quote={quote} />
          <Link to="/cart" className="btn btn--block">
            Back to cart
          </Link>
        </aside>
      </div>
    </main>
  );
}
