import type { EpisodeArtifact } from '@evalarium/core';

export interface InspectedEpisode {
  readonly id: string;
  readonly sourceFile: string;
  readonly artifact: EpisodeArtifact;
}
