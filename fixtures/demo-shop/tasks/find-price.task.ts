import { defineTask } from '@evalarium/verify';

export const findPriceTask = defineTask({
  id: 'find-deterministic-mug-price',
  fixture: 'default',
  instructions: 'Find the price of the Deterministic Mug.',
  verify: async (context) => {
    const productVisible = await context.dom.hasText(
      '[data-cy="product-mug-1"]',
      'Deterministic Mug',
    );
    const priceVisible = await context.dom.hasText(
      '[data-cy="price-mug-1"]',
      '$19.99',
    );
    return productVisible && priceVisible ? 1 : 0;
  },
});
