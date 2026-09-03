import type { EnvironmentHandle } from '@evalarium/runtime';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { actionResult, jsonResult } from '../result.js';

const selectorSchema = z.string().min(1).max(2_000);
const timeoutSchema = z.number().int().positive().max(60_000).default(10_000);

export const registerBrowserTools = (
  server: McpServer,
  environment: EnvironmentHandle,
  enqueue: <T>(operation: () => Promise<T>) => Promise<T>,
): void => {
  server.registerTool(
    'evalarium_reset',
    {
      description: 'Reset the frozen environment to a named fixture and seed.',
      inputSchema: z.object({
        fixture: z.string().min(1).optional(),
        seed: z.number().int().optional(),
      }),
      annotations: {
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    ({ fixture, seed }) =>
      enqueue(async () => {
        await environment.reset(fixture, seed);
        return jsonResult(await actionResult(environment));
      }),
  );

  server.registerTool(
    'evalarium_observe',
    {
      description: 'Read the current deterministic browser observation.',
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    () => enqueue(async () => jsonResult(await environment.observe())),
  );

  server.registerTool(
    'evalarium_click',
    {
      description: 'Click the first element matching a Playwright selector.',
      inputSchema: z.object({
        selector: selectorSchema,
        timeoutMs: timeoutSchema,
      }),
      annotations: { destructiveHint: true, openWorldHint: false },
    },
    ({ selector, timeoutMs }) =>
      enqueue(async () => {
        await environment.page
          .locator(selector)
          .first()
          .click({ timeout: timeoutMs });
        await environment.page.waitForTimeout(300);
        return jsonResult(await actionResult(environment));
      }),
  );

  server.registerTool(
    'evalarium_fill',
    {
      description: 'Fill the first element matching a Playwright selector.',
      inputSchema: z.object({
        selector: selectorSchema,
        value: z.string().max(100_000),
        timeoutMs: timeoutSchema,
      }),
      annotations: { destructiveHint: true, openWorldHint: false },
    },
    ({ selector, value, timeoutMs }) =>
      enqueue(async () => {
        await environment.page
          .locator(selector)
          .first()
          .fill(value, { timeout: timeoutMs });
        await environment.page.waitForTimeout(300);
        return jsonResult(await actionResult(environment));
      }),
  );

  server.registerTool(
    'evalarium_press',
    {
      description: 'Press a keyboard key, optionally on a selected element.',
      inputSchema: z.object({
        key: z.string().min(1).max(100),
        selector: selectorSchema.optional(),
        timeoutMs: timeoutSchema,
      }),
      annotations: { destructiveHint: true, openWorldHint: false },
    },
    ({ key, selector, timeoutMs }) =>
      enqueue(async () => {
        if (selector === undefined) {
          await environment.page.keyboard.press(key);
        } else {
          await environment.page
            .locator(selector)
            .first()
            .press(key, { timeout: timeoutMs });
        }
        await environment.page.waitForTimeout(300);
        return jsonResult(await actionResult(environment));
      }),
  );

  server.registerTool(
    'evalarium_screenshot',
    {
      description: 'Capture the current browser page as a PNG image.',
      inputSchema: z.object({ fullPage: z.boolean().default(false) }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    ({ fullPage }) =>
      enqueue(async () => {
        const screenshot = await environment.page.screenshot({
          fullPage,
          type: 'png',
        });
        return {
          content: [
            {
              type: 'image' as const,
              data: screenshot.toString('base64'),
              mimeType: 'image/png',
            },
          ],
        };
      }),
  );
};
