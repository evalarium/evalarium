import type { ReplayCoverage } from '@evalarium/core';

export const formatCoverage = (coverage: ReplayCoverage): string => {
  const percent = (coverage.exactRate * 100).toFixed(0);
  const stubSuffix =
    coverage.stubs > 0 ? `, ${coverage.stubs} subscription stubs` : '';
  return `Replay coverage ${percent}% on-trail (${coverage.exactHits}/${coverage.totalRequests} exact, ${coverage.fallbacks} fallbacks${stubSuffix})`;
};
