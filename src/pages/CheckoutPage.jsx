import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import OrderSummary from '../components/OrderSummary.jsx';
import { cart, useCartItems } from '../lib/cart.js';
import { formatMoney } from '../lib/format.js';
import { PAYMENT_GATEWAY_URL, submitPayment } from '../lib/payment.js';
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

// Order matters: Verve (6500…) must be checked before Discover (65…).
const CARD_BRANDS = [
  { id: 'amex', label: 'American Express', pattern: /^3[47]/, gaps: [4, 10], lengths: [15], cvc: 4 },
  { id: 'verve', label: 'Verve', pattern: /^(506[01]|507[89]|6500)/, gaps: [4, 8, 12, 16], lengths: [16, 18, 19], cvc: 3 },
  { id: 'visa', label: 'Visa', pattern: /^4/, gaps: [4, 8, 12, 16], lengths: [13, 16, 19], cvc: 3 },
  { id: 'mastercard', label: 'Mastercard', pattern: /^(5[1-5]|222[1-9]|22[3-9]|2[3-6]|27[01]|2720)/, gaps: [4, 8, 12], lengths: [16], cvc: 3 },
  { id: 'discover', label: 'Discover', pattern: /^(6011|65|64[4-9])/, gaps: [4, 8, 12, 16], lengths: [16, 19], cvc: 3 },
];

const emptyCustomer = {
  name: '',
  email: '',
  phone: '',
  billing: { line1: '', line2: '', city: '', state: '', postalCode: '', country: 'GH' },
};

// Card data lives only in component state. It is never written to storage.
const emptyCard = { name: '', number: '', expiry: '', cvc: '' };

function readDraft() {
  try {
    return JSON.parse(sessionStorage.getItem(DRAFT_KEY) || 'null');
  } catch {
    return null;
  }
}

const onlyDigits = (value) => value.replace(/\D/g, '');

function detectBrand(digits) {
  return CARD_BRANDS.find((b) => b.pattern.test(digits)) ?? null;
}

function formatCardNumber(digits) {
  const gaps = detectBrand(digits)?.gaps ?? [4, 8, 12, 16];
  let out = '';
  [...digits].forEach((d, i) => {
    if (gaps.includes(i)) out += ' ';
    out += d;
  });
  return out;
}

function formatExpiry(value) {
  let d = onlyDigits(value).slice(0, 4);
  if (d.length === 1 && d > '1') d = `0${d}`;
  return d.length <= 2 ? d : `${d.slice(0, 2)} / ${d.slice(2)}`;
}

function parseExpiry(value) {
  const d = onlyDigits(value);
  if (d.length !== 4) return null;
  const month = Number(d.slice(0, 2));
  const year = 2000 + Number(d.slice(2));
  return month >= 1 && month <= 12 ? { month, year } : null;
}

function passesLuhn(digits) {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = digits.charCodeAt(i) - 48;
    if (double) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    double = !double;
  }
  return sum % 10 === 0;
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

function validateCard(card) {
  const errors = {};
  const digits = onlyDigits(card.number);
  const brand = detectBrand(digits);

  const lengthOk = brand ? brand.lengths.includes(digits.length) : digits.length >= 12 && digits.length <= 19;
  if (!lengthOk || !passesLuhn(digits)) errors['card.number'] = 'Enter a valid card number.';

  if (card.name.trim().length < 2) errors['card.name'] = 'Enter the name shown on the card.';

  const exp = parseExpiry(card.expiry);
  if (!exp) {
    errors['card.expiry'] = 'Enter the expiry date as MM / YY.';
  } else if (new Date(exp.year, exp.month, 1) <= new Date()) {
    // Cards are valid through the last day of their expiry month.
    errors['card.expiry'] = 'This card has expired.';
  }

  const cvcLength = brand?.cvc;
  if (!/^\d{3,4}$/.test(card.cvc) || (cvcLength && card.cvc.length !== cvcLength)) {
    errors['card.cvc'] = `Enter the ${cvcLength ?? '3- or 4'}-digit security code.`;
  }
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
  const navigate = useNavigate();
  const quote = useMemo(() => (items.length ? priceCart(items) : null), [items]);
  const [customer, setCustomer] = useState(() => readDraft() ?? emptyCustomer);
  const [card, setCard] = useState(emptyCard);
  const [fieldErrors, setFieldErrors] = useState({});
  const [alert, setAlert] = useState('');
  const [paying, setPaying] = useState(false);

  const cardDigits = onlyDigits(card.number);
  const cardBrand = detectBrand(cardDigits);

  useEffect(() => {
    document.title = 'Checkout · Sandbox Store';
  }, []);

  if (!quote) return <Navigate to="/cart" replace />;

  function updateField(name, value) {
    if (name.startsWith('billing.')) {
      const key = name.slice('billing.'.length);
      setCustomer((c) => ({ ...c, billing: { ...c.billing, [key]: value } }));
    } else {
      setCustomer((c) => ({ ...c, [name]: value }));
    }
  }

  function updateCard(name, value) {
    let next = value;
    if (name === 'number') next = formatCardNumber(onlyDigits(value).slice(0, 19));
    if (name === 'expiry') next = formatExpiry(value);
    if (name === 'cvc') next = onlyDigits(value).slice(0, 4);
    setCard((c) => ({ ...c, [name]: next }));
  }

  async function onPay(e) {
    e.preventDefault();
    const errors = { ...validateCustomer(customer), ...validateCard(card) };
    setFieldErrors(errors);
    setAlert('');
    if (Object.keys(errors).length) {
      setAlert('Please check the highlighted fields.');
      return;
    }

    const { month: expMonth, year: expYear } = parseExpiry(card.expiry);
    const payload = {
      customer,
      card: {
        brand: cardBrand?.id ?? 'unknown',
        name: card.name.trim(),
        number: cardDigits,
        expMonth,
        expYear,
        cvc: card.cvc,
      },
      currency: quote.currency,
      items: quote.lines.map(({ productId, name, quantity, unitAmount, lineTotal }) => ({
        productId,
        name,
        quantity,
        unitAmount,
        lineTotal,
      })),
      subtotal: quote.subtotal,
      tax: quote.tax,
      shipping: quote.shipping,
      total: quote.total,
    };

    // Only the customer draft is saved; card details are never persisted.
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(customer));
    } catch {
      /* ignore */
    }

    setPaying(true);
    try {
      const response = await submitPayment(payload);
      cart.clear();
      setCard(emptyCard);
      // Router state is kept in browser history, so pass a masked card only.
      const receipt = { ...payload, card: { brand: payload.card.brand, last4: cardDigits.slice(-4) } };
      navigate('/result', { state: { status: 'succeeded', payload: receipt, response } });
    } catch (err) {
      setAlert(
        err instanceof TypeError
          ? `Could not reach ${PAYMENT_GATEWAY_URL}. Check the URL and CORS.`
          : err.message || `Could not reach ${PAYMENT_GATEWAY_URL}`,
      );
      setCard((c) => ({ ...c, cvc: '' }));
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
          </div><hr />

          <div className="panel__head">
            <h2>Card details</h2>
          </div>
          <div className="form-grid">
            <Field
              id="cardNumber"
              label={
                <>
                  Card number
                  {cardBrand ? <span className="optional"> ({cardBrand.label})</span> : null}
                </>
              }
              error={fieldErrors['card.number']}
              className="field--full"
            >
              <input
                id="cardNumber"
                type="text"
                inputMode="numeric"
                autoComplete="cc-number"
                placeholder="1234 5678 9012 3456"
                required
                aria-invalid={fieldErrors['card.number'] ? 'true' : 'false'}
                value={card.number}
                onChange={(e) => updateCard('number', e.target.value)}
              />
            </Field>
            <Field id="cardName" label="Name on card" error={fieldErrors['card.name']} className="field--full">
              <input
                id="cardName"
                autoComplete="cc-name"
                required
                aria-invalid={fieldErrors['card.name'] ? 'true' : 'false'}
                value={card.name}
                onChange={(e) => updateCard('name', e.target.value)}
              />
            </Field>
            <Field id="cardExpiry" label="Expiry date" error={fieldErrors['card.expiry']}>
              <input
                id="cardExpiry"
                type="text"
                inputMode="numeric"
                autoComplete="cc-exp"
                placeholder="MM / YY"
                required
                aria-invalid={fieldErrors['card.expiry'] ? 'true' : 'false'}
                value={card.expiry}
                onChange={(e) => updateCard('expiry', e.target.value)}
              />
            </Field>
            <Field id="cardCvc" label="Security code (CVC)" error={fieldErrors['card.cvc']}>
              <input
                id="cardCvc"
                type="password"
                inputMode="numeric"
                autoComplete="cc-csc"
                placeholder={cardBrand?.cvc === 4 ? '4 digits' : '3 digits'}
                required
                aria-invalid={fieldErrors['card.cvc'] ? 'true' : 'false'}
                value={card.cvc}
                onChange={(e) => updateCard('cvc', e.target.value)}
              />
            </Field>
          </div>

          <div className="pay-area">
            <button type="submit" className="btn btn--primary btn--block btn--lg" disabled={paying}>
              {paying ? (
                <>
                  <span className="spinner" aria-hidden="true" /> Paying…
                </>
              ) : (
                `Pay ${formatMoney(quote.total, quote.currency)}`
              )}
            </button>
          </div>
        </form>

        <aside className="card summary" aria-label="Order summary">
          <h2>Order summary</h2>
          <ul className="summary__items">
            {quote.lines.map((l) => (
              <li key={l.productId} className="summary__item">
                <span>
                  {l.name} × {l.quantity}
                </span>
                <span>{formatMoney(l.lineTotal, quote.currency)}</span>
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