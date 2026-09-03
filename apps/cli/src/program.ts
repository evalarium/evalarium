import { Command } from 'commander';

import { compileCommand } from './compile-command.js';
import { determinismCommand } from './determinism-command.js';
import { inspectCommand } from './inspect-command.js';
import { mcpCommand } from './mcp-command.js';
import { recordCommand } from './record-command.js';
import { runCommand } from './run-command.js';
import { serveCommand } from './serve-command.js';
import { verifyCommand } from './verify-command.js';

export const createProgram = (): Command => {
  const program = new Command()
    .name('evalarium')
    .description(
      'Compile live web applications into deterministic frozen environments.',
    )
    .version('0.0.0');

  program
    .command('record')
    .argument('<url>')
    .option('--script <file>', 'ESM capture script')
    .option(
      '--interactive',
      'capture through a headed, operator-guided browser',
    )
    .requiredOption('--out <recording>')
    .option('--rules <file>', 'normalization rules JSON merged over defaults')
    .action(recordCommand);

  program
    .command('compile')
    .argument('<recording>')
    .requiredOption('--out <bundle>')
    .option('--fixture-name <name>', 'name of the compiled fixture', 'default')
    .action(compileCommand);

  program
    .command('run')
    .argument('<bundle>')
    .option(
      '--fixture <name>',
      'fixture to restore (defaults to the bundle fixture)',
    )
    .action(runCommand);

  program
    .command('verify')
    .argument('<bundle>')
    .requiredOption('--tasks <glob>')
    .action(verifyCommand);

  program
    .command('serve')
    .argument('<bundle>')
    .option('--port <port>', 'control API port', '3901')
    .option('--cdp-port <port>', 'Chrome DevTools protocol port', '3924')
    .option(
      '--session-cdp-start <port>',
      'first port in the managed-session CDP range',
      '5000',
    )
    .option('--max-sessions <count>', 'maximum managed sessions', '4')
    .option('--host <host>', 'bind address', '127.0.0.1')
    .option('--headed', 'show the environment browser window')
    .action(serveCommand);

  program
    .command('mcp')
    .argument('<bundle>')
    .description('serve a frozen environment over local MCP stdio')
    .option('--headed', 'show the environment browser window')
    .action(mcpCommand);

  program
    .command('inspect')
    .argument('<episodes>', 'episode JSON file or directory')
    .option('--port <port>', 'local inspector port', '5176')
    .option('--host <host>', 'bind address', '127.0.0.1')
    .action(inspectCommand);

  program
    .command('determinism')
    .argument('<bundle>')
    .option('--episodes <count>', 'number of episodes', '5')
    .option('--seed <integer>', 'PRNG seed', '42')
    .option('--no-shims', 'disable time and randomness shims')
    .action(determinismCommand);

  return program;
};
