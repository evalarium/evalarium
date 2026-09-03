#!/usr/bin/env node
import { runStdioMcpServer } from './stdio.js';

const bundlePath = process.argv[2];
if (bundlePath === undefined) {
  process.stderr.write('Usage: evalarium-mcp <bundle>\n');
  process.exitCode = 1;
} else {
  runStdioMcpServer(bundlePath).catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
