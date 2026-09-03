import { describe, expect, it } from 'vitest';

import { inspectorPort } from '../src/inspect-command.js';
import { createProgram } from '../src/program.js';

describe('inspect command', () => {
  it('uses a loopback-only host and the private inspector port by default', () => {
    const command = createProgram().commands.find(
      (candidate) => candidate.name() === 'inspect',
    );

    expect(command?.getOptionValue('host')).toBe('127.0.0.1');
    expect(command?.getOptionValue('port')).toBe('5176');
  });

  it('rejects invalid ports', () => {
    expect(inspectorPort('5176')).toBe(5176);
    expect(() => inspectorPort('0')).toThrow('TCP port');
    expect(() => inspectorPort('abc')).toThrow('TCP port');
  });
});
