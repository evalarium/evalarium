import type { EnvironmentHandle, Observation } from '@evalarium/runtime';

export interface BrowserGymAdapter {
  reset(fixture?: string, seed?: number): Promise<Observation>;
  attach(handle: EnvironmentHandle): Promise<void>;
  close(): Promise<void>;
}

export type BrowserGymAction =
  | { readonly kind: 'click'; readonly selector: string }
  | { readonly kind: 'fill'; readonly selector: string; readonly value: string }
  | { readonly kind: 'navigate'; readonly url: string };

export interface BrowserGymStepResult {
  readonly observation: Observation;
  readonly onTrail: boolean;
}

// Drives a frozen Evalarium environment with BrowserGym-shaped primitives:
// reset to a named fixture, apply one action, observe. The Python side (see
// python/) talks to `evalarium serve` over the control API and CDP instead
// of holding this handle directly.
export class EvalariumBrowserGymAdapter implements BrowserGymAdapter {
  #handle: EnvironmentHandle | null = null;

  async attach(handle: EnvironmentHandle): Promise<void> {
    this.#handle = handle;
  }

  async reset(fixture?: string, seed?: number): Promise<Observation> {
    const handle = this.#requireHandle();
    await handle.reset(fixture, seed);
    return handle.observe();
  }

  async step(action: BrowserGymAction): Promise<BrowserGymStepResult> {
    const handle = this.#requireHandle();
    if (action.kind === 'navigate') {
      await handle.page.goto(action.url, { waitUntil: 'load' });
    } else if (action.kind === 'fill') {
      await handle.page.locator(action.selector).first().fill(action.value);
    } else {
      await handle.page.locator(action.selector).first().click();
    }
    await handle.page.waitForTimeout(300);
    const observation = await handle.observe();
    const coverage = handle.coverage();
    return { observation, onTrail: coverage.misses === 0 };
  }

  async close(): Promise<void> {
    await this.#handle?.close();
    this.#handle = null;
  }

  #requireHandle(): EnvironmentHandle {
    if (this.#handle === null) {
      throw new Error('No environment handle attached.');
    }
    return this.#handle;
  }
}
