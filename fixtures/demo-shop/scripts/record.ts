import type { CaptureScriptPhase } from '@evalarium/capture';

export const run: CaptureScriptPhase = async (page) => {
  await page.locator('[data-cy="product-mug-1"]').waitFor({ state: 'visible' });
  await Promise.all([
    page.waitForResponse((response) => response.url().endsWith('/api/cart')),
    page.locator('[data-cy="add-mug-1"]').click(),
  ]);
  await page
    .locator('[data-cy="cart-count"]')
    .filter({ hasText: '1 item(s)' })
    .waitFor();
  await Promise.all([
    page.waitForResponse((response) => response.url().endsWith('/api/orders')),
    page.locator('[data-cy="checkout-button"]').click(),
  ]);
  await page.locator('[data-cy="order-success"]').waitFor({ state: 'visible' });
  await page.locator('[data-cy="toast-message"]').waitFor({ state: 'visible' });
};
