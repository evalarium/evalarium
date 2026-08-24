import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import Anthropic from '@anthropic-ai/sdk';
import { openEnvironment } from '@evalarium/runtime';
import {
  createVerifyContext,
  loadTasks,
  validateReward,
} from '@evalarium/verify';
import { Command } from 'commander';

import { runEpisode, type EpisodeRecord } from './agent-loop.js';
import { runClaudeCodeEpisode } from './claude-code-loop.js';
import { runOpenRouterEpisode } from './openrouter-loop.js';

interface RunnerOptions {
  readonly tasks: string;
  readonly provider: string;
  readonly model?: string;
  readonly maxSteps: string;
  readonly seeds: string;
  readonly out: string;
  readonly task?: string;
  readonly resume: boolean;
}

const DEFAULT_MODELS: Record<string, string> = {
  openrouter: 'anthropic/claude-opus-5',
  anthropic: 'claude-opus-5',
  'claude-code': 'claude-opus-5',
};

const summarize = (episodes: readonly EpisodeRecord[]): string => {
  const byTask = new Map<string, EpisodeRecord[]>();
  for (const episode of episodes) {
    const list = byTask.get(episode.taskId) ?? [];
    list.push(episode);
    byTask.set(episode.taskId, list);
  }
  const lines: string[] = [];
  let totalReward = 0;
  for (const [taskId, taskEpisodes] of [...byTask.entries()].sort()) {
    const rewards = taskEpisodes.map((episode) => episode.reward);
    const mean = rewards.reduce((sum, r) => sum + r, 0) / rewards.length;
    totalReward += mean;
    lines.push(
      `  ${taskId}: mean=${mean.toFixed(2)} [${rewards.map((r) => r.toFixed(0)).join(',')}]`,
    );
  }
  const overall = byTask.size === 0 ? 0 : totalReward / byTask.size;
  lines.push(
    `overall success: ${(overall * 100).toFixed(1)}% across ${byTask.size} tasks, ${episodes.length} episodes`,
  );
  return lines.join('\n');
};

const program = new Command()
  .name('evalarium-eval')
  .description(
    'Run a model-driven agent against tasks in a frozen environment and record episodes.',
  )
  .argument('<bundle>')
  .requiredOption('--tasks <glob>', 'task module glob')
  .option('--task <id>', 'run only the task with this id')
  .option(
    '--provider <name>',
    'model provider: openrouter or anthropic',
    'openrouter',
  )
  .option('--model <model>', 'model id (provider-specific)')
  .option('--max-steps <count>', 'maximum agent steps per episode', '20')
  .option('--seeds <list>', 'comma-separated environment seeds', '42,7,1234')
  .option('--out <directory>', 'episode output directory', 'episodes')
  .option(
    '--resume',
    'skip task/seed pairs whose episode file already exists',
    false,
  )
  .action(async (bundlePath: string, options: RunnerOptions) => {
    const provider = options.provider;
    const model = options.model ?? DEFAULT_MODELS[provider];
    if (model === undefined) {
      throw new Error(`Unknown provider: ${provider}.`);
    }
    const seeds = options.seeds
      .split(',')
      .map((seed) => Number(seed.trim()))
      .filter((seed) => Number.isInteger(seed));
    if (seeds.length === 0) {
      throw new Error('No valid seeds given.');
    }
    const openrouterKey = process.env.OPENROUTER_API_KEY;
    if (provider === 'openrouter' && openrouterKey === undefined) {
      throw new Error('OPENROUTER_API_KEY is not set.');
    }
    if (
      provider !== 'openrouter' &&
      provider !== 'anthropic' &&
      provider !== 'claude-code'
    ) {
      throw new Error(`Unknown provider: ${provider}.`);
    }
    const anthropicClient = provider === 'anthropic' ? new Anthropic() : null;

    const tasks = (await loadTasks(options.tasks)).filter(
      (task) => options.task === undefined || task.id === options.task,
    );
    if (tasks.length === 0) {
      throw new Error('No tasks matched.');
    }
    const outDirectory = path.resolve(options.out);
    await mkdir(outDirectory, { recursive: true });
    const handle = await openEnvironment(path.resolve(bundlePath));
    const episodes: EpisodeRecord[] = [];
    try {
      for (const task of tasks) {
        for (const seed of seeds) {
          const episodePath = path.join(
            outDirectory,
            `${task.id}.seed${seed}.episode.json`,
          );
          if (options.resume) {
            try {
              const existing = JSON.parse(
                await readFile(episodePath, 'utf8'),
              ) as EpisodeRecord;
              episodes.push(existing);
              process.stdout.write(
                `SKIP ${task.id} seed=${seed} (already recorded, reward=${existing.reward.toFixed(3)})\n`,
              );
              continue;
            } catch {
              /* not recorded yet — run it */
            }
          }
          const shared = {
            handle,
            task,
            model,
            maxSteps: Number(options.maxSteps),
            seed,
            verify: async () =>
              validateReward(await task.verify(createVerifyContext(handle))),
          };
          let episode: EpisodeRecord;
          if (anthropicClient !== null) {
            episode = await runEpisode({ client: anthropicClient, ...shared });
          } else if (provider === 'claude-code') {
            episode = await runClaudeCodeEpisode(shared);
          } else {
            episode = await runOpenRouterEpisode({
              apiKey: openrouterKey ?? '',
              ...(process.env.OPENROUTER_BASE_URL === undefined
                ? {}
                : { baseUrl: process.env.OPENROUTER_BASE_URL }),
              ...shared,
            });
          }
          episodes.push(episode);
          await writeFile(episodePath, `${JSON.stringify(episode, null, 2)}\n`);
          process.stdout.write(
            `${episode.reward === 1 ? 'PASS' : 'FAIL'} ${task.id} seed=${seed} ` +
              `reward=${episode.reward.toFixed(3)} steps=${episode.steps.length} ` +
              `tokens=${episode.usage.inputTokens}in/${episode.usage.outputTokens}out\n`,
          );
        }
      }
      process.stdout.write(`${summarize(episodes)}\n`);
    } finally {
      await handle.close();
    }
  });

await program.parseAsync(process.argv);
