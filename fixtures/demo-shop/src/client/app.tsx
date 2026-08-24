import { useCallback, useEffect, useState, type FC } from 'react';

import { addCartItem, createOrder, getProducts } from './api.js';
import { readCart, writeCart } from './cart-storage.js';
import { CartSummary } from './components/cart-summary.js';
import { OrderSuccess } from './components/order-success.js';
import { ProductCard } from './components/product-card.js';
import { ShopHeader } from './components/shop-header.js';
import { ToastMessage } from './components/toast-message.js';
import type { CartItem, Order, Product } from './types.js';

export const App: FC = () => {
  const [products, setProducts] = useState<readonly Product[]>([]);
  const [cart, setCart] = useState<readonly CartItem[]>(readCart);
  const [order, setOrder] = useState<Order | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const loadProducts = async (): Promise<void> => {
      setProducts(await getProducts());
    };
    void loadProducts();
  }, []);

  const addProduct = useCallback(
    (product: Product) => async (): Promise<void> => {
      const item = { productId: product.id, quantity: 1 };
      await addCartItem(item);
      const nextCart = [...cart, item];
      writeCart(nextCart);
      setCart(nextCart);
      window.setTimeout(() => setToast(`${product.name} added`), 250);
    },
    [cart],
  );

  const checkout = useCallback(async (): Promise<void> => {
    const nextOrder = await createOrder(cart);
    setOrder(nextOrder);
    window.setTimeout(() => setToast('Order placed'), 250);
  }, [cart]);

  return (
    <main data-cy="app">
      <ShopHeader />
      <section className="store-layout">
        <div className="products" data-cy="product-list">
          {products.length === 0 && <p>Loading products…</p>}
          {products.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              onAdd={addProduct(product)}
            />
          ))}
        </div>
        <CartSummary itemCount={cart.length} onCheckout={checkout} />
      </section>
      {order !== null && <OrderSuccess order={order} />}
      {toast !== null && <ToastMessage message={toast} />}
    </main>
  );
};
