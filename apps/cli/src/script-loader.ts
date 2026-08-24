import path from 'node:path';
import { pathToFileURL } from 'node:url';

import type { CaptureScript, CaptureScriptPhase } from '@evalarium/capture';

export const loadCaptureScript = async (
  scriptPath: string,
): Promise<CaptureScript> => {
  const absolutePath = path.resolve(scriptPath);
  const module: unknown = await import(pathToFileURL(absolutePath).href);
  if (module === null || typeof module !== 'object') {
    throw new Error(
      `Recording script did not export a module: ${absolutePath}.`,
    );
  }
  const exports = module as Record<string, unknown>;
  const run = exports.run;
  if (typeof run !== 'function') {
    throw new Error(
      `Recording script must export a named run(page) function: ${absolutePath}.`,
    );
  }
  const prepare = exports.prepare;
  if (prepare !== undefined && typeof prepare !== 'function') {
    throw new Error(
      `Recording script prepare export must be a function: ${absolutePath}.`,
    );
  }
  const wrapPhase =
    (phase: unknown): CaptureScriptPhase =>
    async (page: Parameters<CaptureScriptPhase>[0]) => {
      await Reflect.apply(
        phase as (...values: unknown[]) => unknown,
        undefined,
        [page],
      );
    };
  return {
    ...(prepare === undefined ? {} : { prepare: wrapPhase(prepare) }),
    run: wrapPhase(run),
  };
};
