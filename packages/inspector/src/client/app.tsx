import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
} from 'react';

import type { InspectedEpisode } from '../shared.js';
import { ComparisonPanel } from './comparison-panel.js';
import { EpisodeDetail } from './episode-detail.js';
import { EpisodeList } from './episode-list.js';

export function App() {
  const [episodes, setEpisodes] = useState<readonly InspectedEpisode[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [comparisonId, setComparisonId] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetch('/api/episodes')
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Inspector API returned ${response.status}.`);
        }
        return (await response.json()) as readonly InspectedEpisode[];
      })
      .then((loaded) => {
        setEpisodes(loaded);
        setSelectedId(loaded[0]?.id ?? null);
      })
      .catch((reason: unknown) => setError((reason as Error).message));
  }, []);

  const selected = useMemo(
    () => episodes.find((episode) => episode.id === selectedId) ?? null,
    [episodes, selectedId],
  );
  const comparison = useMemo(
    () => episodes.find((episode) => episode.id === comparisonId) ?? null,
    [comparisonId, episodes],
  );
  const handleSelect = useCallback((id: string) => setSelectedId(id), []);
  const handleComparisonChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) =>
      setComparisonId(event.target.value),
    [],
  );

  if (error !== null) {
    return (
      <main className="state-message">Could not load episodes: {error}</main>
    );
  }
  if (selected === null) {
    return <main className="state-message">Loading episode evidence…</main>;
  }

  return (
    <div className="shell">
      <EpisodeList
        episodes={episodes}
        selectedId={selected.id}
        onSelect={handleSelect}
      />
      <main className="workspace">
        <header className="topbar">
          <div>
            <span className="eyebrow">Evalarium / episode inspector</span>
            <h1>{selected.artifact.taskId}</h1>
          </div>
          <label>
            Compare with
            <select value={comparisonId} onChange={handleComparisonChange}>
              <option value="">No comparison</option>
              {episodes
                .filter((episode) => episode.id !== selected.id)
                .map((episode) => (
                  <option key={episode.id} value={episode.id}>
                    {episode.artifact.taskId} · seed{' '}
                    {episode.artifact.seed ?? 'legacy'}
                  </option>
                ))}
            </select>
          </label>
        </header>
        {comparison === null ? null : (
          <ComparisonPanel left={selected} right={comparison} />
        )}
        <EpisodeDetail episode={selected} />
      </main>
    </div>
  );
}
