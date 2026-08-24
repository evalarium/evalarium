import { describe, expect, it } from 'vitest';

import { hashObservationStream, type Observation } from '../src/index.js';

describe('hashObservationStream', () => {
  it('hashes equivalent observations identically', () => {
    const observation: Observation = {
      url: 'https://shop.test/',
      title: 'Shop',
      a11ySnapshot: '- heading "Shop"',
      domDigest: 'abc',
    };

    expect(hashObservationStream([observation])).toBe(
      hashObservationStream([{ ...observation }]),
    );
  });
});
