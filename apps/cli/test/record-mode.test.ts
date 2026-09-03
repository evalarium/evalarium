import { describe, expect, it, vi } from 'vitest';

import {
  resolveRecordMode,
  type InteractivePrompter,
  type RecordModeDependencies,
} from '../src/record-mode.js';

const dependencies = (
  events: string[],
): RecordModeDependencies & { readonly prompter: InteractivePrompter } => {
  const prompter = {
    wait: vi.fn(async (message: string) => {
      events.push(message);
    }),
    close: vi.fn(() => events.push('closed')),
  };
  return {
    prompter,
    createPrompter: () => prompter,
    loadScript: vi.fn(async () => ({
      run: async () => undefined,
    })),
  };
};

describe('recording modes', () => {
  it('requires exactly one of script and interactive', async () => {
    const deps = dependencies([]);
    await expect(resolveRecordMode({}, deps)).rejects.toThrow('exactly one');
    await expect(
      resolveRecordMode({ script: 'record.js', interactive: true }, deps),
    ).rejects.toThrow('exactly one');
  });

  it('keeps scripted capture headless', async () => {
    const deps = dependencies([]);
    const mode = await resolveRecordMode({ script: 'record.js' }, deps);

    expect(mode.headless).toBe(true);
    expect(deps.loadScript).toHaveBeenCalledWith('record.js');
  });

  it('orders interactive preparation, workflow, and cleanup', async () => {
    const events: string[] = [];
    const deps = dependencies(events);
    const mode = await resolveRecordMode({ interactive: true }, deps);

    expect(mode.headless).toBe(false);
    const page = {} as Parameters<typeof mode.script.run>[0];
    await mode.script.prepare?.(page);
    await mode.script.run(page);
    mode.close();

    expect(events[0]).toMatch(/^Preparation:/u);
    expect(events[1]).toMatch(/^Reference workflow:/u);
    expect(events[2]).toBe('closed');
  });
});
