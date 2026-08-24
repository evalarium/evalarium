import { glob } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { isTaskDefinition } from './task.js';
import type { TaskDefinition } from './types.js';

export const loadTasks = async (
  pattern: string,
): Promise<readonly TaskDefinition[]> => {
  const matchedFiles: string[] = [];
  for await (const match of glob(pattern, { cwd: process.cwd() })) {
    matchedFiles.push(path.isAbsolute(match) ? match : path.resolve(match));
  }
  matchedFiles.sort();
  const tasks: TaskDefinition[] = [];
  for (const filePath of matchedFiles) {
    const module: unknown = await import(pathToFileURL(filePath).href);
    if (module === null || typeof module !== 'object') {
      continue;
    }
    const exportedTasks = Object.values(module).filter(isTaskDefinition);
    tasks.push(...exportedTasks);
  }
  if (tasks.length === 0) {
    throw new Error(`No evalarium tasks matched: ${pattern}.`);
  }
  return tasks;
};
