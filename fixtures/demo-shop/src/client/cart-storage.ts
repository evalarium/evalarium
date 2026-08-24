import type { CartItem } from './types.js';

export const CART_STORAGE_KEY = 'evalarium-demo-cart';

const isCartItem = (value: unknown): value is CartItem => {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.productId === 'string' &&
    typeof record.quantity === 'number' &&
    Number.isInteger(record.quantity)
  );
};

export const readCart = (): readonly CartItem[] => {
  const serialized = window.localStorage.getItem(CART_STORAGE_KEY);
  if (serialized === null) {
    return [];
  }
  try {
    const value: unknown = JSON.parse(serialized);
    return Array.isArray(value) && value.every(isCartItem) ? value : [];
  } catch {
    return [];
  }
};

export const writeCart = (cart: readonly CartItem[]): void => {
  window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
};
