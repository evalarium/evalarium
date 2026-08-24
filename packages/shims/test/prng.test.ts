import { describe, expect, it } from 'vitest';

import { createSeededGenerator } from '../src/prng.js';

describe('createSeededGenerator', () => {
  it('repeats a sequence for the same seed', () => {
    const first = createSeededGenerator(42);
    const second = createSeededGenerator(42);

    expect([first.next(), first.next(), first.next()]).toEqual([
      second.next(),
      second.next(),
      second.next(),
    ]);
  });
});
