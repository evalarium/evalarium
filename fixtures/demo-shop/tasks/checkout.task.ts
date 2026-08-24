import { REPLAY_MATCH_KIND } from '@evalarium/core';
import { defineTask } from '@evalarium/verify';

export const checkoutTask = defineTask({
  id: 'add-to-cart-and-check-out',
  fixture: 'default',
  instructions: 'Add the Deterministic Mug to the cart and check out.',
  verify: async (context) => {
    const successVisible = await context.dom.hasText(
      '[data-cy="order-success"]',
      'Order complete',
    );
    const cartRecorded = context.network.has({
      method: 'POST',
      url: '/api/cart',
      matchKind: REPLAY_MATCH_KIND.EXACT,
    });
    const orderRecorded = context.network.has({
      method: 'POST',
      url: '/api/orders',
      matchKind: REPLAY_MATCH_KIND.EXACT,
    });
    const cachedCart = await context.storage.localStorage(
      'evalarium-demo-cart',
    );
    const cartStored = cachedCart?.includes('mug-1') ?? false;
    return successVisible && cartRecorded && orderRecorded && cartStored
      ? 1
      : 0;
  },
});
