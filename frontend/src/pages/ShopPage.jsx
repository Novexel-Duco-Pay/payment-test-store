import { useEffect } from 'react';
import { products } from '../data/products.js';
import { cart } from '../lib/cart.js';
import { formatMoney } from '../lib/format.js';
import { useStore } from '../store.jsx';

export default function ShopPage() {
  const { toast } = useStore();

  useEffect(() => {
    document.title = 'Products · Sandbox Store';
  }, []);

  return (
    <main className="container">
      <h1 className="page-title">Products</h1>
      <p className="lede">Add a few items and check out.</p>
      <div className="grid">
        {products.map((p) => (
          <article key={p.id} className="card product">
            <img className="product__image" src={p.image} alt={p.name} width={400} height={300} loading="lazy" />
            <div className="product__body">
              <h2 className="product__name">{p.name}</h2>
              <p className="product__desc">{p.description}</p>
              <div className="product__footer">
                <span className="price">{formatMoney(p.price, p.currency)}</span>
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={() => {
                    cart.add(p.id);
                    toast(`Added ${p.name} to cart`);
                  }}
                >
                  Add to cart
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </main>
  );
}
