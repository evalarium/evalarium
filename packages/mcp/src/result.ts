import type { EnvironmentHandle, Observation } from '@evalarium/runtime';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export interface ActionResult {
  readonly observation: Observation;
  readonly onTrail: boolean;
}

export const actionResult = async (
  environment: EnvironmentHandle,
): Promise<ActionResult> => {
  const observation = await environment.observe();
  return {
    observation,
    onTrail: environment.coverage().misses === 0,
  };
};

export const jsonResult = (value: unknown): CallToolResult => ({
  content: [
    {
      type: 'text',
      text: JSON.stringify(value, null, 2),
    },
  ],
});
