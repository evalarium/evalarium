import type Anthropic from '@anthropic-ai/sdk';
import type { EnvironmentHandle, Observation } from '@evalarium/runtime';
import type { TaskDefinition } from '@evalarium/verify';

export interface EpisodeStep {
  readonly observation: Observation;
  readonly actions: readonly Record<string, unknown>[];
  readonly commentary: string;
}

export interface EpisodeNetworkSummary {
  readonly coverage: {
    readonly totalRequests: number;
    readonly exactHits: number;
    readonly fallbacks: number;
    readonly misses: number;
    readonly stubs: number;
  };
  readonly operations: Readonly<Record<string, Record<string, number>>>;
}

export interface EpisodeRecord {
  readonly taskId: string;
  readonly fixture: string;
  readonly instructions: string;
  readonly model: string;
  readonly environmentId: string;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly steps: readonly EpisodeStep[];
  readonly finished: boolean;
  readonly reward: number;
  readonly network: EpisodeNetworkSummary;
  readonly usage: {
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly cacheReadInputTokens: number;
  };
}

export const summarizeNetwork = (
  handle: EnvironmentHandle,
): EpisodeNetworkSummary => {
  const coverage = handle.coverage();
  const operations: Record<string, Record<string, number>> = {};
  for (const entry of handle.requestLog()) {
    if (entry.graphqlOperation === null) {
      continue;
    }
    const byKind = (operations[entry.graphqlOperation] ??= {});
    byKind[entry.matchKind] = (byKind[entry.matchKind] ?? 0) + 1;
  }
  return {
    coverage: {
      totalRequests: coverage.totalRequests,
      exactHits: coverage.exactHits,
      fallbacks: coverage.fallbacks,
      misses: coverage.misses,
      stubs: coverage.stubs,
    },
    operations,
  };
};

export const SYSTEM_PROMPT = `You are a browser agent operating a CRM web application
inside a frozen, deterministic evaluation environment. You interact only
through the provided tools. Observations are accessibility snapshots of the
page: elements are listed with their roles and names.

Ground rules:
- Selectors are Playwright selectors. Prefer text selectors built from the
  accessibility snapshot, e.g. text="Globex Fleet Tracking" or
  role-based css like [placeholder="Search"]. Keep selectors simple.
- After each action you receive the new observation. Re-read it before the
  next action; do not assume an action worked.
- The application opens records in a side panel rather than navigating.
- When the task is complete, call finish with a short summary. Call finish
  only when the observation shows the task's effect.`;

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'click',
    description:
      'Click the first element matching a Playwright selector, e.g. text="Tasks" or #some-id.',
    input_schema: {
      type: 'object',
      properties: { selector: { type: 'string' } },
      required: ['selector'],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: 'fill',
    description:
      'Fill the first input matching a Playwright selector with a value.',
    input_schema: {
      type: 'object',
      properties: {
        selector: { type: 'string' },
        value: { type: 'string' },
      },
      required: ['selector', 'value'],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: 'finish',
    description: 'Declare the task complete with a short summary.',
    input_schema: {
      type: 'object',
      properties: { summary: { type: 'string' } },
      required: ['summary'],
      additionalProperties: false,
    },
    strict: true,
  },
];

export const observationText = (observation: Observation): string =>
  `URL: ${observation.url}\nTITLE: ${observation.title}\n` +
  `ACCESSIBILITY SNAPSHOT:\n${observation.a11ySnapshot}`;

export const applyAction = async (
  handle: EnvironmentHandle,
  name: string,
  input: Record<string, unknown>,
): Promise<string> => {
  try {
    if (name === 'click') {
      await handle.page
        .locator(String(input.selector))
        .first()
        .click({ timeout: 10_000 });
    } else if (name === 'fill') {
      await handle.page
        .locator(String(input.selector))
        .first()
        .fill(String(input.value), { timeout: 10_000 });
    }
    await handle.page.waitForTimeout(1_500);
    return 'ok';
  } catch (error) {
    return `action failed: ${(error as Error).message.split('\n')[0] ?? 'unknown'}`;
  }
};

export interface RunEpisodeOptions {
  readonly client: Anthropic;
  readonly handle: EnvironmentHandle;
  readonly task: TaskDefinition;
  readonly model: string;
  readonly maxSteps: number;
  readonly seed: number;
  readonly verify: () => Promise<number>;
}

export const runEpisode = async (
  options: RunEpisodeOptions,
): Promise<EpisodeRecord> => {
  const { client, handle, task, model, maxSteps } = options;
  const startedAt = new Date().toISOString();
  await handle.reset(task.fixture, options.seed);
  const steps: EpisodeStep[] = [];
  const usage = { inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0 };
  let finished = false;

  const messages: Anthropic.MessageParam[] = [
    {
      role: 'user',
      content:
        `TASK: ${task.instructions}\n\n` +
        `Current page:\n${observationText(await handle.observe())}`,
    },
  ];

  for (let step = 0; step < maxSteps && !finished; step += 1) {
    const response = await client.messages.create({
      model,
      max_tokens: 4096,
      system: [
        {
          type: 'text',
          text: SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ],
      tools: TOOLS,
      messages,
      cache_control: { type: 'ephemeral' },
    });
    usage.inputTokens += response.usage.input_tokens;
    usage.outputTokens += response.usage.output_tokens;
    usage.cacheReadInputTokens += response.usage.cache_read_input_tokens ?? 0;

    const commentary = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('\n');
    const toolUses = response.content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
    );
    messages.push({ role: 'assistant', content: response.content });

    if (toolUses.length === 0) {
      messages.push({
        role: 'user',
        content:
          'No tool call received. Use click/fill to act, or finish when done.',
      });
      steps.push({
        observation: await handle.observe(),
        actions: [],
        commentary,
      });
      continue;
    }

    const results: Anthropic.ToolResultBlockParam[] = [];
    const actions: Record<string, unknown>[] = [];
    for (const toolUse of toolUses) {
      const input = toolUse.input as Record<string, unknown>;
      actions.push({ name: toolUse.name, ...input });
      if (toolUse.name === 'finish') {
        finished = true;
        results.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: 'Episode finished.',
        });
        continue;
      }
      const outcome = await applyAction(handle, toolUse.name, input);
      const observation = await handle.observe();
      results.push({
        type: 'tool_result',
        tool_use_id: toolUse.id,
        content: `${outcome}\n\nNew page state:\n${observationText(observation)}`,
        ...(outcome.startsWith('action failed') ? { is_error: true } : {}),
      });
    }
    messages.push({ role: 'user', content: results });
    steps.push({ observation: await handle.observe(), actions, commentary });
  }

  const reward = await options.verify();
  return {
    taskId: task.id,
    fixture: task.fixture,
    instructions: task.instructions,
    model,
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
