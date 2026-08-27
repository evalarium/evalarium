import { Command } from 'commander';

import { compileCommand } from './compile-command.js';
import { determinismCommand } from './determinism-command.js';
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
    .requiredOption('--script <file>')
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
    .option('--host <host>', 'bind address', '127.0.0.1')
    .option('--headed', 'show the environment browser window')
    .action(serveCommand);

  program
    .command('determinism')
    .argument('<bundle>')
    .option('--episodes <count>', 'number of episodes', '5')
    .option('--seed <integer>', 'PRNG seed', '42')
    .option('--no-shims', 'disable time and randomness shims')
    .action(determinismCommand);

  return program;
};
