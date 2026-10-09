import { formatMoney } from '../lib/format.js';

export default function OrderSummary({ quote }) {
  const { currency } = quote;
  return (
    <>
      <div className="summary__row">
        <span>Subtotal</span>
        <span>{formatMoney(quote.subtotal, currency)}</span>
      </div>
      <div className="summary__row">
        <span>Tax ({+(quote.taxRate * 100).toFixed(2)}%)</span>
        <span>{formatMoney(quote.tax, currency)}</span>
      </div>
      <div className="summary__row">
        <span>Shipping</span>
        <span>{formatMoney(quote.shipping, currency)}</span>
      </div>
      <div className="summary__row summary__row--total">
        <span>Total</span>
        <span>{formatMoney(quote.total, currency)}</span>
      </div>
    </>
  );
}
