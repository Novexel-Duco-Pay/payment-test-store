import { CURRENCY, SHIPPING_CENTS, TAX_RATE, findProduct } from './products.js';

export function priceCart(items) {
  const merged = new Map();
  for (const item of items) {
    const product = findProduct(item.productId);
    if (!product) continue;
    const qty = Math.max(1, Math.min(20, Number(item.quantity) || 1));
    merged.set(product.id, Math.min((merged.get(product.id) ?? 0) + qty, 20));
  }

  const lines = [...merged].map(([productId, quantity]) => {
    const product = findProduct(productId);
    return {
      productId,
      name: product.name,
      image: product.image,
      unitAmount: product.price,
      quantity,
      lineTotal: product.price * quantity,
    };
  });

  const subtotal = lines.reduce((sum, l) => sum + l.lineTotal, 0);
  const tax = Math.round(subtotal * TAX_RATE);
  const shipping = lines.length ? SHIPPING_CENTS : 0;
  return {
    currency: CURRENCY,
    lines,
    subtotal,
    tax,
    taxRate: TAX_RATE,
    shipping,
    total: subtotal + tax + shipping,
  };
}
