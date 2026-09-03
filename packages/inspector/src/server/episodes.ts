import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

import { parseEpisodeArtifact } from '@evalarium/core';

import type { InspectedEpisode } from '../shared.js';

const discoverDirectory = async (directory: string): Promise<string[]> => {
  const entries = await readdir(directory, { withFileTypes: true });
  const discovered = await Promise.all(
    entries.map(async (entry): Promise<string[]> => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        return discoverDirectory(entryPath);
      }
      return entry.isFile() && entry.name.endsWith('.episode.json')
        ? [entryPath]
        : [];
    }),
  );
  return discovered.flat();
};

export const discoverEpisodeFiles = async (
  inputPath: string,
): Promise<readonly string[]> => {
  const resolved = path.resolve(inputPath);
  const inputStat = await stat(resolved);
  const files = inputStat.isDirectory()
    ? await discoverDirectory(resolved)
    : [resolved];
  return files.sort((left, right) => left.localeCompare(right));
};

export const loadEpisodes = async (
  inputPath: string,
): Promise<readonly InspectedEpisode[]> => {
  const files = await discoverEpisodeFiles(inputPath);
  if (files.length === 0) {
    throw new Error(`No .episode.json artifacts found in ${inputPath}.`);
  }
  return Promise.all(
    files.map(async (file, index) => {
      try {
        const value: unknown = JSON.parse(await readFile(file, 'utf8'));
        return {
          id: String(index),
          sourceFile: path.basename(file),
          artifact: parseEpisodeArtifact(value),
        };
      } catch (error) {
        throw new Error(
          `Could not load episode ${file}: ${(error as Error).message}`,
        );
      }
    }),
  );
};
