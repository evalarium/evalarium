import { runStdioMcpServer } from '@evalarium/mcp';

export interface McpCommandOptions {
  readonly headed?: boolean;
}

export const mcpCommand = async (
  bundlePath: string,
  options: McpCommandOptions,
): Promise<void> => {
  await runStdioMcpServer(bundlePath, { headless: options.headed !== true });
};
