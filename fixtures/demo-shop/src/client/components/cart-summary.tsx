import type { FC } from 'react';

interface CartSummaryProps {
  readonly itemCount: number;
  readonly onCheckout: () => void;
}

export const CartSummary: FC<CartSummaryProps> = ({
  itemCount,
  onCheckout,
}) => (
  <section className="cart-summary" data-cy="cart-summary">
    <h2>Cart</h2>
    <p data-cy="cart-count">{itemCount} item(s)</p>
    <button
      data-cy="checkout-button"
      disabled={itemCount === 0}
      type="button"
      onClick={onCheckout}
    >
      Check out
    </button>
  </section>
);
