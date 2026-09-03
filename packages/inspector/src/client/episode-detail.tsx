import type { InspectedEpisode } from '../shared.js';

interface EpisodeDetailProps {
  readonly episode: InspectedEpisode;
}

export function EpisodeDetail({ episode }: EpisodeDetailProps) {
  const artifact = episode.artifact;
  const coverage = artifact.network.coverage;
  return (
    <>
      <section className="summary-grid" aria-label="Episode summary">
        <article>
          <span>Outcome</span>
          <strong className={artifact.reward === 1 ? 'pass' : 'fail'}>
            {artifact.reward === 1 ? 'PASS' : 'FAIL'} ·{' '}
            {artifact.reward.toFixed(2)}
          </strong>
        </article>
        <article>
          <span>Runtime</span>
          <strong>{artifact.model}</strong>
          <small>
            {artifact.fixture} · seed {artifact.seed ?? 'legacy'}
          </small>
        </article>
        <article>
          <span>Network</span>
          <strong>
            {coverage.exactHits}/{coverage.totalRequests} exact
          </strong>
          <small>
            {coverage.fallbacks} fallback · {coverage.misses} miss
          </small>
        </article>
        <article>
          <span>Tokens</span>
          <strong>{artifact.usage.inputTokens.toLocaleString()} in</strong>
          <small>
            {artifact.usage.outputTokens.toLocaleString()} out ·{' '}
            {artifact.usage.cacheReadInputTokens.toLocaleString()} cached
          </small>
        </article>
      </section>

      <section className="instructions">
        <span>Task instructions</span>
        <p>{artifact.instructions}</p>
      </section>

      <section className="timeline" aria-label="Episode steps">
        {artifact.steps.map((step, index) => (
          <article
            className="step"
            key={`${index}-${step.observation.domDigest}`}
          >
            <div className="step-index">
              {String(index + 1).padStart(2, '0')}
            </div>
            <div className="step-body">
              <div className="step-heading">
                <div>
                  <span>{step.observation.title || 'Untitled page'}</span>
                  <small>{step.observation.url}</small>
                </div>
                <code>{step.observation.domDigest.slice(0, 12)}</code>
              </div>
              {step.commentary === '' ? null : (
                <div className="commentary">
                  <span>Agent</span>
                  <p>{step.commentary}</p>
                </div>
              )}
              <div className="actions">
                {step.actions.length === 0 ? (
                  <span className="muted">No action</span>
                ) : (
                  step.actions.map((action, actionIndex) => (
                    <code key={actionIndex}>{JSON.stringify(action)}</code>
                  ))
                )}
              </div>
              <details>
                <summary>Accessibility observation</summary>
                <pre>{step.observation.a11ySnapshot}</pre>
              </details>
              <div className="network-row">
                {step.network.requests.length === 0 ? (
                  <span className="muted">No attributed requests</span>
                ) : (
                  step.network.requests.map((request) => (
                    <span
                      className={`network ${request.matchKind}`}
                      key={request.sequence}
                    >
                      {request.matchKind} ·{' '}
                      {request.graphqlOperation ?? request.method}
                    </span>
                  ))
                )}
              </div>
              {step.network.divergences.map((divergence) => (
                <div className="divergence" key={divergence.fingerprint}>
                  Divergence: {divergence.method} {divergence.url}
                </div>
              ))}
            </div>
          </article>
        ))}
      </section>
    </>
  );
}
