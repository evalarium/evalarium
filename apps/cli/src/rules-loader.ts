import { readFile } from 'node:fs/promises';
import path from 'node:path';

import {
  DEFAULT_NORMALIZATION_RULES,
  NormalizationRulesSchema,
  type NormalizationRules,
} from '@evalarium/core';

export const loadNormalizationRules = async (
  rulesPath: string | undefined,
): Promise<NormalizationRules> => {
  if (rulesPath === undefined) {
    return DEFAULT_NORMALIZATION_RULES;
  }
  const absolutePath = path.resolve(rulesPath);
  const raw: unknown = JSON.parse(await readFile(absolutePath, 'utf8'));
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(
      `Normalization rules must be a JSON object: ${absolutePath}.`,
    );
  }
  return NormalizationRulesSchema.parse({
    ...DEFAULT_NORMALIZATION_RULES,
    ...raw,
  });
};
