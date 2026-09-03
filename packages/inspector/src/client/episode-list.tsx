import type { InspectedEpisode } from '../shared.js';
import type { MouseEvent } from 'react';
import { useCallback } from 'react';

interface EpisodeListProps {
  readonly episodes: readonly InspectedEpisode[];
  readonly selectedId: string;
  readonly onSelect: (id: string) => void;
}

export function EpisodeList({
  episodes,
  selectedId,
  onSelect,
}: EpisodeListProps) {
  const handleSelect = useCallback(
    (event: MouseEvent<HTMLButtonElement>): void => {
      const id = event.currentTarget.dataset.episodeId;
      if (id !== undefined) {
        onSelect(id);
      }
    },
    [onSelect],
  );

  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="mark" aria-hidden="true" />
        <strong>Evalarium</strong>
      </div>
      <p className="sidebar-label">Episode artifacts</p>
      <nav aria-label="Episode artifacts">
        {episodes.map((episode) => {
          const artifact = episode.artifact;
          return (
            <button
              className={
                episode.id === selectedId ? 'episode active' : 'episode'
              }
              data-episode-id={episode.id}
              key={episode.id}
              type="button"
              onClick={handleSelect}
            >
              <span>{artifact.taskId}</span>
              <small>
                seed {artifact.seed ?? 'legacy'} ·{' '}
                {artifact.reward === 1 ? 'pass' : 'fail'}
              </small>
            </button>
          );
        })}
      </nav>
      <p className="local-note">Local evidence only. Nothing is uploaded.</p>
    </aside>
  );
}
