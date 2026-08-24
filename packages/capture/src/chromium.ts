import { access } from 'node:fs/promises';
import path from 'node:path';

import { constants } from 'node:fs';

const STANDARD_EXECUTABLES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
];

const PATH_EXECUTABLE_NAMES = [
  'google-chrome-stable',
  'google-chrome',
  'chromium',
  'chromium-browser',
];

const isExecutable = async (candidate: string): Promise<boolean> => {
  try {
    await access(candidate, constants.X_OK);
    return true;
  } catch {
    return false;
  }
};

export const resolveChromiumExecutable = async (
  explicitPath?: string,
): Promise<string> => {
  const configuredPath = explicitPath ?? process.env.EVALARIUM_CHROMIUM_PATH;
  if (configuredPath !== undefined) {
    if (await isExecutable(configuredPath)) {
      return configuredPath;
    }
    throw new Error(`Configured Chromium is not executable: ${configuredPath}`);
  }

  const pathDirectories = (process.env.PATH ?? '').split(path.delimiter);
  const candidates = [
    ...STANDARD_EXECUTABLES,
    ...pathDirectories.flatMap((directory) =>
      PATH_EXECUTABLE_NAMES.map((name) => path.join(directory, name)),
    ),
  ];
  for (const candidate of candidates) {
    if (await isExecutable(candidate)) {
      return candidate;
    }
  }
  throw new Error(
    'No Chromium executable found. Install Chrome/Chromium or set EVALARIUM_CHROMIUM_PATH.',
  );
};
