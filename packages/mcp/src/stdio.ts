import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import {
  openEvalariumMcpSession,
  type EvalariumMcpSession,
  type OpenEvalariumMcpOptions,
} from './server.js';

export const runStdioMcpServer = async (
  bundlePath: string,
  options: OpenEvalariumMcpOptions = {},
): Promise<EvalariumMcpSession> => {
  const session = await openEvalariumMcpSession(bundlePath, options);
  try {
    await session.connect(new StdioServerTransport());
    return session;
  } catch (error) {
    await session.close();
    throw error;
  }
};
