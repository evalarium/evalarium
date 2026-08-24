import type { FC } from 'react';

export const ShopHeader: FC = () => (
  <header className="shop-header" data-cy="shop-header">
    <p className="eyebrow">Frozen storefront fixture</p>
    <h1>Evalarium Demo Shop</h1>
    <p data-cy="rendered-at">Rendered at {Date.now()}</p>
  </header>
);
