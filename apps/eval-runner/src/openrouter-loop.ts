import type { EnvironmentHandle } from '@evalarium/runtime';
import type { TaskDefinition } from '@evalarium/verify';

import {
  SYSTEM_PROMPT,
  applyAction,
  observationText,
  summarizeNetwork,
  type EpisodeRecord,
  type EpisodeStep,
} from './agent-loop.js';

// OpenAI-format chat completion surface as OpenRouter serves it.
interface ChatMessage {
  readonly role: 'system' | 'user' | 'assistant' | 'tool';
  readonly content: string | null;
  readonly tool_calls?: readonly ToolCall[];
  readonly tool_call_id?: string;
}

interface ToolCall {
  readonly id: string;
  readonly type: 'function';
  readonly function: { readonly name: string; readonly arguments: string };
}

interface ChatCompletionResponse {
  readonly choices?: readonly {
    readonly message: ChatMessage;
    readonly finish_reason?: string;
  }[];
  readonly usage?: {
    readonly prompt_tokens?: number;
    readonly completion_tokens?: number;
    readonly prompt_tokens_details?: { readonly cached_tokens?: number };
  };
  readonly error?: { readonly message?: string };
}

const OPENROUTER_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'click',
      description:
        'Click the first element matching a Playwright selector, e.g. text="Tasks" or #some-id.',
      parameters: {
        type: 'object',
        properties: { selector: { type: 'string' } },
        required: ['selector'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'fill',
      description:
        'Fill the first input matching a Playwright selector with a value.',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string' },
          value: { type: 'string' },
        },
        required: ['selector', 'value'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'finish',
      description: 'Declare the task complete with a short summary.',
      parameters: {
        type: 'object',
        properties: { summary: { type: 'string' } },
        required: ['summary'],
        additionalProperties: false,
      },
    },
  },
];

// Serializes history for the wire with Anthropic prompt caching: the
// system prompt and the newest tool result carry cache_control breakpoints,
// so each step re-reads the stable prefix from cache instead of re-billing
// it at full price. History is never mutated — caching needs byte-stable
// prefixes.
const toCachedWire = (messages: readonly ChatMessage[]): unknown[] => {
  const lastToolIndex = messages.reduce(
    (latest, message, index) => (message.role === 'tool' ? index : latest),
    -1,
  );
  return messages.map((message, index) => {
    if (
      typeof message.content === 'string' &&
      (message.role === 'system' ||
        (message.role === 'tool' && index === lastToolIndex))
    ) {
      return {
        ...message,
        content: [
          {
            type: 'text',
            text: message.content,
            cache_control: { type: 'ephemeral' },
          },
        ],
      };
    }
    return message;
  });
};

export interface OpenRouterEpisodeOptions {
  readonly apiKey: string;
  readonly baseUrl?: string;
  readonly handle: EnvironmentHandle;
  readonly task: TaskDefinition;
  readonly model: string;
  readonly maxSteps: number;
  readonly seed: number;
  readonly verify: () => Promise<number>;
}

export const runOpenRouterEpisode = async (
  options: OpenRouterEpisodeOptions,
): Promise<EpisodeRecord> => {
  const { handle, task, model, maxSteps } = options;
  const baseUrl = options.baseUrl ?? 'https://openrouter.ai/api/v1';
  const startedAt = new Date().toISOString();
  await handle.reset(task.fixture, options.seed);
  const steps: EpisodeStep[] = [];
  const usage = { inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0 };
  let finished = false;

  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content:
        `TASK: ${task.instructions}\n\n` +
        `Current page:\n${observationText(await handle.observe())}`,
    },
  ];

  for (let step = 0; step < maxSteps && !finished; step += 1) {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${options.apiKey}`,
        'content-type': 'application/json',
        'x-title': 'evalarium-baseline',
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        messages: toCachedWire(messages),
        tools: OPENROUTER_TOOLS,
        tool_choice: 'auto',
      }),
    });
    const payload = (await response.json()) as ChatCompletionResponse;
    if (!response.ok || payload.error !== undefined) {
      throw new Error(
        `OpenRouter request failed (${response.status}): ${payload.error?.message ?? 'unknown'}`,
      );
    }
    const message = payload.choices?.[0]?.message;
    if (message === undefined) {
      throw new Error('OpenRouter response had no choices.');
    }
    usage.inputTokens += payload.usage?.prompt_tokens ?? 0;
    usage.outputTokens += payload.usage?.completion_tokens ?? 0;
    usage.cacheReadInputTokens +=
      payload.usage?.prompt_tokens_details?.cached_tokens ?? 0;

    const commentary =
      typeof message.content === 'string' ? message.content : '';
    const toolCalls = message.tool_calls ?? [];
    messages.push({
      role: 'assistant',
      content: commentary === '' ? null : commentary,
      ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
    });

    if (toolCalls.length === 0) {
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

    const actions: Record<string, unknown>[] = [];
    for (const toolCall of toolCalls) {
      let input: Record<string, unknown>;
      try {
        input = JSON.parse(toolCall.function.arguments) as Record<
          string,
          unknown
        >;
      } catch {
        input = {};
      }
      actions.push({ name: toolCall.function.name, ...input });
      if (toolCall.function.name === 'finish') {
        finished = true;
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: 'Episode finished.',
        });
        continue;
      }
      const outcome = await applyAction(handle, toolCall.function.name, input);
      const observation = await handle.observe();
      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: `${outcome}\n\nNew page state:\n${observationText(observation)}`,
      });
    }
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
