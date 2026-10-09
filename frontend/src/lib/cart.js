import { useSyncExternalStore } from 'react';

const CART_KEY = 'pts.cart.v1';
const listeners = new Set();

function read() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

let snapshot = read();
let countSnapshot = snapshot.reduce((n, i) => n + i.quantity, 0);

function emit() {
  for (const listener of listeners) listener();
}

function persist(items) {
  snapshot = items;
  countSnapshot = items.reduce((n, i) => n + i.quantity, 0);
  try {
    localStorage.setItem(CART_KEY, JSON.stringify(items));
  } catch {
    /* storage unavailable: keep in memory */
  }
  emit();
}

export const cart = {
  get() {
    return snapshot;
  },
  save(items) {
    persist(items);
  },
  add(productId, quantity = 1) {
    const items = this.get().map((i) => ({ ...i }));
    const line = items.find((i) => i.productId === productId);
    if (line) line.quantity = Math.min(line.quantity + quantity, 20);
    else items.push({ productId, quantity });
    this.save(items);
  },
  setQuantity(productId, quantity) {
    this.save(
      this.get()
        .map((i) => (i.productId === productId ? { ...i, quantity: Math.max(0, Math.min(quantity, 20)) } : i))
        .filter((i) => i.quantity > 0),
    );
  },
  remove(productId) {
    this.save(this.get().filter((i) => i.productId !== productId));
  },
  clear() {
    this.save([]);
  },
  count() {
    return countSnapshot;
  },
};

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useCartItems() {
  return useSyncExternalStore(subscribe, cart.get, cart.get);
}

export function useCartCount() {
  return useSyncExternalStore(subscribe, cart.count, () => 0);
}
