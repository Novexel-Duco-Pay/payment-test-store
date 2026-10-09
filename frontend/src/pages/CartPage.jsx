import { useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import OrderSummary from '../components/OrderSummary.jsx';
import { cart, useCartItems } from '../lib/cart.js';
import { formatMoney } from '../lib/format.js';
import { priceCart } from '../lib/pricing.js';

export default function CartPage() {
  const items = useCartItems();
  const quote = useMemo(() => (items.length ? priceCart(items) : null), [items]);

  useEffect(() => {
    document.title = 'Cart · Sandbox Store';
  }, []);

  if (!quote) {
    return (
      <main className="container">
        <h1 className="page-title">Your cart</h1>
        <div className="card empty">
          <h2>Your cart is empty</h2>
          <p>Add a product or two to try the checkout flow.</p>
          <Link to="/" className="btn btn--primary">
            Browse products
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="container">
      <h1 className="page-title">Your cart</h1>
      <div className="layout-2col">
        <ul className="cart-list card">
          {quote.lines.map((line) => (
            <li key={line.productId} className="cart-line">
              <img className="cart-line__img" src={line.image} alt="" width={88} height={66} />
              <div>
                <p className="cart-line__name">{line.name}</p>
                <span className="muted">{formatMoney(line.unitAmount, quote.currency)} each</span>
                <div className="cart-line__controls">
                  <div className="qty">
                    <button
                      type="button"
                      aria-label={`Decrease ${line.name}`}
                      onClick={() => cart.setQuantity(line.productId, line.quantity - 1)}
                    >
                      −
                    </button>
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={line.quantity}
                      inputMode="numeric"
                      aria-label={`Quantity of ${line.name}`}
                      onChange={(e) => {
                        const n = Math.trunc(Number(e.target.value));
                        cart.setQuantity(line.productId, Number.isFinite(n) && n > 0 ? n : 1);
                      }}
                    />
                    <button
                      type="button"
                      aria-label={`Increase ${line.name}`}
                      disabled={line.quantity >= 20}
                      onClick={() => cart.setQuantity(line.productId, line.quantity + 1)}
                    >
                      +
                    </button>
                  </div>
                  <button type="button" className="btn btn--link" onClick={() => cart.remove(line.productId)}>
                    Remove
                  </button>
                </div>
              </div>
              <div className="cart-line__total">{formatMoney(line.lineTotal, quote.currency)}</div>
            </li>
          ))}
        </ul>
        <aside className="card summary">
          <h2>Order summary</h2>
          <OrderSummary quote={quote} />
          <Link to="/checkout" className="btn btn--primary btn--block btn--lg">
            Checkout
          </Link>
          <Link to="/" className="btn btn--block">
            Continue shopping
          </Link>
        </aside>
      </div>
    </main>
  );
}
