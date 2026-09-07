import type { DivergenceEvent, ReplayRequestLogEntry } from '@evalarium/core';
import type { EnvironmentHandle } from '@evalarium/runtime';
import { describe, expect, it } from 'vitest';

import { createStepRecorder } from '../src/agent-loop.js';

const entry = (sequence: number): ReplayRequestLogEntry =>
  ({ sequence }) as unknown as ReplayRequestLogEntry;
const divergence = (sequence: number): DivergenceEvent =>
  ({ sequence }) as unknown as DivergenceEvent;
const observation = {
  url: 'https://example.test/',
  title: 'Example',
  a11ySnapshot: '- heading "Example"',
  domDigest: 'abc',
};

describe('createStepRecorder', () => {
  it('attributes only post-boot traffic to agent steps', () => {
    const requests = [entry(0), entry(1)];
    const divergences: DivergenceEvent[] = [];
    const handle = {
      requestLog: () => [...requests],
      divergences: () => [...divergences],
    } as unknown as EnvironmentHandle;

    // The recorder is created after reset() filled the log with boot traffic.
    const recordStep = createStepRecorder(handle);

    requests.push(entry(2));
    divergences.push(divergence(2));
    const first = recordStep(observation, [{ name: 'click' }], '');
    expect(first.network.requests).toEqual([entry(2)]);
    expect(first.network.divergences).toEqual([divergence(2)]);

    const second = recordStep(observation, [], '');
    expect(second.network.requests).toEqual([]);
    expect(second.network.divergences).toEqual([]);

    requests.push(entry(3), entry(4));
    const third = recordStep(observation, [{ name: 'fill' }], '');
    expect(third.network.requests).toEqual([entry(3), entry(4)]);
    expect(third.actions).toEqual([{ name: 'fill' }]);
  });
});
