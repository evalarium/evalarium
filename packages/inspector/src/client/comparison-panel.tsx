import { firstDifferingStep } from '../compare.js';
import type { InspectedEpisode } from '../shared.js';

interface ComparisonPanelProps {
  readonly left: InspectedEpisode;
  readonly right: InspectedEpisode;
}

export function ComparisonPanel(props: ComparisonPanelProps) {
  const differingStep = firstDifferingStep(
    props.left.artifact,
    props.right.artifact,
  );
  return (
    <section className="comparison" aria-label="Episode comparison">
      <span>Comparison</span>
      <strong>
        {differingStep === null
          ? 'DOM digests match at every recorded step'
          : `First DOM difference at step ${differingStep + 1}`}
      </strong>
      <small>
        {props.left.sourceFile} ↔ {props.right.sourceFile}
      </small>
    </section>
  );
}
