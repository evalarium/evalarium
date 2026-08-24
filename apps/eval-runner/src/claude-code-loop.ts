import { spawn } from 'node:child_process';

import type { EnvironmentHandle } from '@evalarium/runtime';
import type { TaskDefinition } from '@evalarium/verify';

import {
  applyAction,
  observationText,
  summarizeNetwork,
  type EpisodeRecord,
  type EpisodeStep,
} from './agent-loop.js';

// Drives episodes through the local Claude Code CLI in headless mode.
// Costs subscription quota instead of per-token dollars, at the price of a
// different harness: results are a separate baseline configuration, never
// mixed into an API-loop distribution.

const ACTION_CONTRACT = `You are operating a CRM web application inside a
frozen, deterministic evaluation environment, through exactly three
actions. Do not use any of your own tools; do not read or write files.
Respond with ONE action as a single JSON object and nothing else:
  {"action":"click","selector":"<playwright selector>"}
  {"action":"fill","selector":"<playwright selector>","value":"<text>"}
  {"action":"finish","summary":"<short summary>"}
Selectors are Playwright selectors; prefer text selectors from the
accessibility snapshot, e.g. text="Globex Fleet Tracking". Records open in
a side panel rather than navigating. Call finish only when the observation
shows the task's effect.`;

interface CliResult {
  readonly result?: string;
  readonly session_id?: string;
  readonly usage?: {
    readonly input_tokens?: number;
    readonly output_tokens?: number;
    readonly cache_read_input_tokens?: number;
  };
  readonly is_error?: boolean;
}

const runCli = async (
  prompt: string,
  model: string | undefined,
  resumeSession: string | undefined,
): Promise<CliResult> =>
  new Promise((resolve, reject) => {
    const args = [
      '-p',
      prompt,
      '--output-format',
      'json',
      '--max-turns',
      '2',
      ...(model === undefined ? [] : ['--model', model]),
      ...(resumeSession === undefined ? [] : ['--resume', resumeSession]),
    ];
    const child = spawn('claude', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code !== 0) {
        reject(new Error(`claude CLI exited ${code}: ${stderr.slice(0, 300)}`));
        return;
      }
      const parsed = parseCliJson(stdout);
      if (parsed === null) {
        reject(
          new Error(`claude CLI returned non-JSON: ${stdout.slice(0, 200)}`),
        );
        return;
      }
      resolve(parsed);
    });
  });

// The CLI can emit noise around the result object; parse tolerantly by
// trying the whole output, then each line, then the outermost brace span.
const parseCliJson = (stdout: string): CliResult | null => {
  const candidates = [stdout.trim(), ...stdout.trim().split('\n').reverse()];
  const start = stdout.indexOf('{');
  const end = stdout.lastIndexOf('}');
  if (start !== -1 && end > start) {
    candidates.push(stdout.slice(start, end + 1));
  }
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as CliResult;
      if (parsed !== null && typeof parsed === 'object') {
        return parsed;
      }
    } catch {
      /* try the next candidate */
    }
  }
  return null;
};

const parseAction = (text: string): Record<string, unknown> | null => {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) {
    return null;
  }
  try {
    return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
};

export interface ClaudeCodeEpisodeOptions {
  readonly handle: EnvironmentHandle;
  readonly task: TaskDefinition;
  readonly model?: string;
  readonly maxSteps: number;
  readonly seed: number;
  readonly verify: () => Promise<number>;
}

export const runClaudeCodeEpisode = async (
  options: ClaudeCodeEpisodeOptions,
): Promise<EpisodeRecord> => {
  const { handle, task, maxSteps } = options;
  const startedAt = new Date().toISOString();
  await handle.reset(task.fixture, options.seed);
  const steps: EpisodeStep[] = [];
  const usage = { inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0 };
  let finished = false;
  let sessionId: string | undefined;

  let prompt =
    `${ACTION_CONTRACT}\n\nTASK: ${task.instructions}\n\n` +
    `Current page:\n${observationText(await handle.observe())}`;

  for (let step = 0; step < maxSteps && !finished; step += 1) {
    let cli: CliResult;
    try {
      cli = await runCli(prompt, options.model, sessionId);
    } catch (firstError) {
      try {
        cli = await runCli(prompt, options.model, sessionId);
      } catch {
        // Persistent CLI failure ends the episode; the reward reflects
        // whatever the agent achieved before it.
        steps.push({
          observation: await handle.observe(),
          actions: [],
          commentary: `cli error: ${(firstError as Error).message.slice(0, 200)}`,
        });
        break;
      }
    }
    sessionId = cli.session_id ?? sessionId;
    usage.inputTokens += cli.usage?.input_tokens ?? 0;
    usage.outputTokens += cli.usage?.output_tokens ?? 0;
    usage.cacheReadInputTokens += cli.usage?.cache_read_input_tokens ?? 0;
    const text = cli.result ?? '';
    const action = parseAction(text);

    if (action === null || typeof action.action !== 'string') {
      steps.push({
        observation: await handle.observe(),
        actions: [],
        commentary: text.slice(0, 500),
      });
      prompt =
        'That was not a single JSON action. Respond with exactly one JSON ' +
        'object: {"action":"click"|"fill"|"finish",...}.';
      continue;
    }

    const name = action.action;
    const actions = [{ name, ...action }];
    if (name === 'finish') {
      finished = true;
      steps.push({
        observation: await handle.observe(),
        actions,
        commentary: String(action.summary ?? ''),
      });
      break;
    }
    const outcome = await applyAction(handle, name, action);
    const observation = await handle.observe();
    steps.push({ observation, actions, commentary: text.slice(0, 300) });
    prompt = `${outcome}\n\nNew page state:\n${observationText(observation)}`;
  }

  const reward = await options.verify();
  return {
    taskId: task.id,
    fixture: task.fixture,
    instructions: task.instructions,
    model: `claude-code:${options.model ?? 'default'}`,
    environmentId: handle.manifest.environmentId,
    startedAt,
    finishedAt: new Date().toISOString(),
    steps,
    finished,
    reward,
    network: summarizeNetwork(handle),
    usage,
  };
};
