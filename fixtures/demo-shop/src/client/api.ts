import type { CartItem, Order, Product } from './types.js';

const expectOk = async (response: Response): Promise<Response> => {
  if (!response.ok) {
    throw new Error(`Demo API returned ${response.status}.`);
  }
  return response;
};

export const getProducts = async (): Promise<readonly Product[]> => {
  const response = await expectOk(await fetch('/api/products'));
  return (await response.json()) as Product[];
};

export const addCartItem = async (item: CartItem): Promise<void> => {
  await expectOk(
    await fetch('/api/cart', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(item),
    }),
  );
};

export const createOrder = async (
  cart: readonly CartItem[],
): Promise<Order> => {
  const response = await expectOk(
    await fetch('/api/orders', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ cart }),
    }),
  );
  return (await response.json()) as Order;
};
