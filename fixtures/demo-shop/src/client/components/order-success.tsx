import type { FC } from 'react';

import type { Order } from '../types.js';

interface OrderSuccessProps {
  readonly order: Order;
}

export const OrderSuccess: FC<OrderSuccessProps> = ({ order }) => (
  <section className="order-success" data-cy="order-success" role="status">
    <h2>Order complete</h2>
    <p data-cy="order-id">Order {order.orderId}</p>
  </section>
);
