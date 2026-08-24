import type { FC } from 'react';

import type { Product } from '../types.js';

interface ProductCardProps {
  readonly product: Product;
  readonly onAdd: () => void;
}

export const ProductCard: FC<ProductCardProps> = ({ product, onAdd }) => (
  <article className="product-card" data-cy={`product-${product.id}`}>
    <h2>{product.name}</h2>
    <p>{product.description}</p>
    <strong data-cy={`price-${product.id}`}>
      ${(product.priceCents / 100).toFixed(2)}
    </strong>
    <button data-cy={`add-${product.id}`} type="button" onClick={onAdd}>
      Add to cart
    </button>
  </article>
);
