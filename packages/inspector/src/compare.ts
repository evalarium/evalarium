import type { EpisodeArtifact } from '@evalarium/core';

export const firstDifferingStep = (
  left: EpisodeArtifact,
  right: EpisodeArtifact,
): number | null => {
  const sharedLength = Math.min(left.steps.length, right.steps.length);
  for (let index = 0; index < sharedLength; index += 1) {
    if (
      left.steps[index]?.observation.domDigest !==
      right.steps[index]?.observation.domDigest
    ) {
      return index;
    }
  }
  return left.steps.length === right.steps.length ? null : sharedLength;
};
