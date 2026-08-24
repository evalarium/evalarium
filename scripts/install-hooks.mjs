import { spawnSync } from 'node:child_process';

const result = spawnSync('git', ['config', 'core.hooksPath', '.githooks'], {
  stdio: 'ignore',
});

if (result.error !== undefined) {
  process.stderr.write(
    `evalarium: unable to configure Git hooks: ${result.error.message}\n`,
  );
}
