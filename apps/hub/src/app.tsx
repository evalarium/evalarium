import { useEffect, useRef, useState } from 'react';

// Every measured product claim rendered below comes from CLAIMS.md at the
// repo root. Update them together or not at all.
const claims = [
  {
    value: '100%',
    label: 'on-trail replay',
    detail: '565/566 and 645/647 exact on the two frozen CRM fixtures',
  },
  {
    value: '×5',
    label: 'identical episodes',
    detail:
      'one observation hash across five seeded replays; shims off, it diverges',
  },
  {
    value: '~2 s',
    label: 'fixture reset',
    detail: 'back to a named frozen state between episodes',
  },
  {
    value: '47 s',
    label: 'to freeze a new app',
    detail: 'record → compile → offline determinism proof, dated receipt',
  },
  {
    value: '40–80%',
    label: 'frontier baselines',
    detail: 'measured agent success sits mid-band — the suite discriminates',
  },
];

const demoVideoUrl =
  'https://mdaoqtxuzvgp0h2j.public.blob.vercel-storage.com/videos/evalarium-demo-v1.mp4';
const demoPosterUrl =
  'https://mdaoqtxuzvgp0h2j.public.blob.vercel-storage.com/videos/evalarium-demo-v1-poster.jpg';

// The Vercel function at api/subscribe.js forwards signups to
// gordon@evalarium.ai via Resend (RESEND_API_KEY in the project env;
// evalarium.ai is a verified Resend domain).
const emailFormAction: string | null = '/api/subscribe';
const contactEmail = 'gordon@evalarium.ai';

const buyerProblems = [
  {
    title: 'Staging drifts',
    text: 'Data, deployments, clocks, and third-party services move underneath every run.',
  },
  {
    title: 'Clones lie',
    text: 'A rebuilt benchmark quietly loses the frontend behavior and edge cases your agent actually faces.',
  },
  {
    title: 'Live runs do damage',
    text: 'Repeated mutations hit real systems, trigger rate limits, and make resets slow or incomplete.',
  },
];

const pilotDeliverables = [
  'Black-box capture of one authenticated web application',
  'One or two resettable, named fixtures',
  'Up to ten programmatically verified browser tasks',
  'Self-hosted Docker environment with control API and CDP',
  'Fidelity, determinism, and frontier-model baseline report',
];

const limitations = [
  {
    title: 'Captured traffic defines the universe',
    text: 'Recorded paths replay exactly. Unrecorded requests are surfaced as divergences so coverage can be expanded deliberately.',
  },
  {
    title: 'Some browser surfaces are scoped out',
    text: 'Cookies, local storage, and session storage are captured. IndexedDB data, WebSocket replay, and SSE replay are not yet supported.',
  },
  {
    title: 'Run it inside a trusted boundary',
    text: 'The self-signed capture proxy and CDP endpoint are intended for local or isolated container networks, not exposure to the public internet.',
  },
];

function Mark() {
  return (
    <span className="mark" aria-hidden="true">
      <span />
      <span />
      <span />
    </span>
  );
}

function ArrowIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16">
      <path d="M3 8h9M8.5 3.5 13 8l-4.5 4.5" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16">
      <path d="m3.2 8.2 3.1 3.1 6.5-6.6" />
    </svg>
  );
}

function ReplayCard() {
  const [activeTab, setActiveTab] = useState<'capture' | 'replay'>('replay');
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const card = cardRef.current;
    if (card === null) {
      return;
    }

    function selectTab(event: MouseEvent) {
      if (!(event.target instanceof Element)) {
        return;
      }

      const tab = event.target.closest<HTMLButtonElement>('[data-tab]');
      const nextTab = tab?.dataset.tab;
      if (nextTab === 'capture' || nextTab === 'replay') {
        setActiveTab(nextTab);
      }
    }

    card.addEventListener('click', selectTab);
    return () => card.removeEventListener('click', selectTab);
  }, []);

  return (
    <div ref={cardRef} className="replay-card">
      <div className="card-bar">
        <div className="window-controls" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <div
          className="card-tabs"
          role="tablist"
          aria-label="Environment output"
        >
          <button
            type="button"
            role="tab"
            data-tab="capture"
            aria-selected={activeTab === 'capture'}
          >
            Capture
          </button>
          <button
            type="button"
            role="tab"
            data-tab="replay"
            aria-selected={activeTab === 'replay'}
          >
            Replay
          </button>
        </div>
        <span className="live-pill">
          <i /> Offline
        </span>
      </div>

      {activeTab === 'replay' ? (
        <div className="terminal" role="tabpanel">
          <p>
            <span className="muted">$</span> evalarium run shop.evalbundle
          </p>
          <p>
            <span className="muted">→</span> restoring{' '}
            <span className="blue">default</span> fixture
          </p>
          <p>
            <span className="muted">→</span> virtual time{' '}
            <span className="green">enabled</span>
          </p>
          <p>
            <span className="muted">→</span> network{' '}
            <span className="green">frozen</span>
          </p>
          <div className="terminal-rule" />
          <div className="run-summary">
            <div>
              <span>Environment</span>
              <strong>demo-shop</strong>
            </div>
            <div>
              <span>Requests matched</span>
              <strong>48 / 48</strong>
            </div>
            <div>
              <span>Observation hash</span>
              <strong className="hash">c1a4…8f29</strong>
            </div>
          </div>
          <div className="success-line">
            <CheckIcon /> Deterministic replay ready <span>1.28s</span>
          </div>
        </div>
      ) : (
        <div className="terminal" role="tabpanel">
          <p>
            <span className="muted">$</span> evalarium record https://shop.local
          </p>
          <p>
            <span className="muted">→</span> chromium session{' '}
            <span className="green">connected</span>
          </p>
          <p>
            <span className="muted">→</span> capturing assets, storage,
            responses
          </p>
          <div className="terminal-rule" />
          <div className="capture-grid" aria-label="Capture progress">
            <span>
              JavaScript <b>12</b>
            </span>
            <span>
              API responses <b>18</b>
            </span>
            <span>
              Assets <b>31</b>
            </span>
            <span>
              Storage states <b>2</b>
            </span>
          </div>
          <div className="success-line">
            <CheckIcon /> Recording saved <span>shop.evalrec</span>
          </div>
        </div>
      )}
    </div>
  );
}

const steps = [
  {
    number: '01',
    title: 'Capture what is real',
    text: 'Record the live JavaScript, assets, storage, and API responses your application actually uses.',
    code: 'evalarium record <url>',
  },
  {
    number: '02',
    title: 'Compile the environment',
    text: 'Package the recording into one immutable, content-addressed browser environment.',
    code: 'evalarium compile app.evalrec',
  },
  {
    number: '03',
    title: 'Replay with confidence',
    text: 'Reset and run fully offline with frozen networking, virtual time, and seeded randomness.',
    code: 'evalarium run app.evalbundle',
  },
];

const features = [
  {
    index: 'A',
    title: 'Faithful by default',
    text: 'Run the real frontend and recorded bytes—not a hand-built clone that slowly drifts from production.',
  },
  {
    index: 'B',
    title: 'Deterministic by design',
    text: 'Control time, randomness, storage, and network behavior so identical actions produce identical observations.',
  },
  {
    index: 'C',
    title: 'Offline by construction',
    text: 'Every replay is isolated from the origin. Unknown requests become visible divergences, never silent passthroughs.',
  },
];

export function App() {
  const [menuOpen, setMenuOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const header = headerRef.current;
    if (header === null) {
      return;
    }

    function handleNavigation(event: MouseEvent) {
      if (!(event.target instanceof Element)) {
        return;
      }

      if (event.target.closest('[data-menu-toggle]') !== null) {
        setMenuOpen((open) => !open);
      } else if (event.target.closest('[data-menu-link]') !== null) {
        setMenuOpen(false);
      }
    }

    header.addEventListener('click', handleNavigation);
    return () => header.removeEventListener('click', handleNavigation);
  }, []);

  return (
    <>
      <header ref={headerRef} className="site-header">
        <a className="logo" href="#top" aria-label="Evalarium home">
          <Mark />
          <span>Evalarium</span>
        </a>
        <nav
          className={menuOpen ? 'nav-links open' : 'nav-links'}
          aria-label="Main navigation"
        >
          <a href="#workflow" data-menu-link>
            How it works
          </a>
          <a href="#teams" data-menu-link>
            For teams
          </a>
          <a href="#why" data-menu-link>
            Why Evalarium
          </a>
          <a href="#measured" data-menu-link>
            Measured
          </a>
          <a className="nav-cta" href="#pilot" data-menu-link>
            Start a pilot <ArrowIcon />
          </a>
        </nav>
        <button
          className="menu-button"
          type="button"
          aria-label="Toggle navigation"
          aria-expanded={menuOpen}
          data-menu-toggle
        >
          <span />
          <span />
        </button>
      </header>

      <main id="top">
        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow">
              <span /> Eval infrastructure for browser agents
            </div>
            <h1>
              Your app.
              <br />
              Captured once.
              <br />
              <em>Replayed forever.</em>
            </h1>
            <p className="hero-description">
              Turn your authenticated web product into a resettable, offline
              benchmark—real frontend, verifiable tasks, no staging drift.
            </p>
            <div className="hero-actions">
              <a className="primary-button" href="#pilot">
                Start a paid pilot <ArrowIcon />
              </a>
              <a className="text-link" href="#measured">
                Watch the 87-second demo <span>↓</span>
              </a>
            </div>
          </div>
          <div className="hero-visual">
            <div className="orbit-label orbit-label-one">
              <span /> 48 responses
            </div>
            <div className="orbit-label orbit-label-two">
              <span /> 0 live requests
            </div>
            <ReplayCard />
          </div>
        </section>

        <div className="proof-strip" aria-label="Core capabilities">
          <span>Real JavaScript</span>
          <i />
          <span>Frozen network</span>
          <i />
          <span>Resettable state</span>
          <i />
          <span>Repeatable results</span>
        </div>

        <section className="workflow section" id="workflow">
          <div className="section-heading">
            <p className="section-label">The workflow</p>
            <h2>
              From live application
              <br />
              to reliable environment.
            </h2>
          </div>
          <p className="section-intro">
            One clear path from the app you have to the repeatability your
            evaluations need.
          </p>
          <div className="steps">
            {steps.map((step) => (
              <article className="step-card" key={step.number}>
                <div className="step-top">
                  <span>{step.number}</span>
                  <i />
                </div>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
                <code>
                  <b>$</b> {step.code}
                </code>
              </article>
            ))}
          </div>
        </section>

        <section className="teams section" id="teams">
          <div className="section-heading">
            <p className="section-label">For agent and eval teams</p>
            <h2>
              Staging is an application.
              <br />
              It is not a benchmark.
            </h2>
          </div>
          <p className="section-intro">
            Evalarium is for teams whose browser agent must operate a real,
            authenticated product repeatedly without corrupting data or
            measuring environmental noise.
          </p>
          <div className="buyer-grid">
            {buyerProblems.map((problem, index) => (
              <article key={problem.title}>
                <span>0{index + 1}</span>
                <h3>{problem.title}</h3>
                <p>{problem.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="why section" id="why">
          <div className="why-visual" aria-hidden="true">
            <div className="snapshot snapshot-back">
              <span>EPISODE 04</span>
              <strong>c1a4…8f29</strong>
            </div>
            <div className="snapshot snapshot-middle">
              <span>EPISODE 03</span>
              <strong>c1a4…8f29</strong>
            </div>
            <div className="snapshot snapshot-front">
              <div>
                <span>EPISODE 05</span>
                <small>MATCH</small>
              </div>
              <strong>c1a4…8f29</strong>
              <div className="hash-track">
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
              </div>
              <p>
                Same actions.
                <br />
                Same observation.
              </p>
            </div>
          </div>
          <div className="why-copy">
            <p className="section-label">Why Evalarium</p>
            <h2>
              Evaluation should measure the agent. <em>Not the noise.</em>
            </h2>
            <div className="feature-list">
              {features.map((feature) => (
                <article key={feature.index}>
                  <span>{feature.index}</span>
                  <div>
                    <h3>{feature.title}</h3>
                    <p>{feature.text}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="measured section" id="measured">
          <div className="section-heading">
            <p className="section-label">Measured, not promised</p>
            <h2>
              Every performance claim here
              <br />
              comes from a receipt.
            </h2>
          </div>
          <div className="claim-grid">
            {claims.map((claim) => (
              <article className="claim-card" key={claim.label}>
                <strong>{claim.value}</strong>
                <h3>{claim.label}</h3>
                <p>{claim.detail}</p>
              </article>
            ))}
          </div>
          <div className="video-heading">
            <span className="live-pill">
              <i /> 87-second demo
            </span>
            <p>
              A live CRM, its backend killed on camera, and the frozen copy
              taking the same clicks offline.
            </p>
          </div>
          <div className="video-slot">
            <video
              controls
              playsInline
              preload="metadata"
              poster={demoPosterUrl}
            >
              <source src={demoVideoUrl} type="video/mp4" />
              Your browser does not support embedded MP4 video.{' '}
              <a href={demoVideoUrl}>Open the demo directly.</a>
            </video>
          </div>
        </section>

        <section className="limitations section" id="limitations">
          <div className="section-heading">
            <p className="section-label">Honest boundaries</p>
            <h2>
              A frozen universe.
              <br />
              With visible edges.
            </h2>
          </div>
          <p className="section-intro">
            Evalarium does not claim to simulate every possible application
            state. It makes the captured surface exact and every uncaptured edge
            observable.
          </p>
          <div className="limitation-grid">
            {limitations.map((limitation) => (
              <article key={limitation.title}>
                <h3>{limitation.title}</h3>
                <p>{limitation.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="quickstart section" id="pilot">
          <div>
            <p className="section-label">Founding design-partner pilot</p>
            <h2>
              Your first frozen eval,
              <br />
              <em>delivered end to end.</em>
            </h2>
            <p className="pilot-price">
              Founding pilot: $7,500 USD · 7–10 working days
            </p>
            <ul className="pilot-deliverables">
              {pilotDeliverables.map((deliverable) => (
                <li key={deliverable}>
                  <CheckIcon /> {deliverable}
                </li>
              ))}
            </ul>
          </div>
          <div className="quickstart-action">
            <p>
              Tell us which application and workflows your browser agent needs
              to master. We will reply with a concrete capture plan.
            </p>
            {emailFormAction !== null ? (
              <form
                className="signup-form"
                action={emailFormAction}
                method="post"
              >
                <label htmlFor="signup-email">Apply for a paid pilot</label>
                <div className="form-row">
                  <input
                    id="signup-email"
                    type="email"
                    name="email"
                    required
                    maxLength={254}
                    placeholder="Work email"
                    autoComplete="email"
                  />
                  <input
                    type="text"
                    name="company"
                    required
                    maxLength={100}
                    placeholder="Company"
                    autoComplete="organization"
                  />
                </div>
                <textarea
                  name="useCase"
                  required
                  maxLength={1500}
                  rows={4}
                  placeholder="What does your agent need to do in the browser?"
                />
                <div className="honeypot" aria-hidden="true">
                  <label htmlFor="company-website">Company website</label>
                  <input
                    id="company-website"
                    type="text"
                    name="website"
                    tabIndex={-1}
                    autoComplete="off"
                  />
                </div>
                <button className="primary-button" type="submit">
                  Request a pilot plan <ArrowIcon />
                </button>
                <small>
                  By submitting, you agree to the{' '}
                  <a href="#privacy">privacy notice</a>.
                </small>
              </form>
            ) : (
              <div className="signup-form">
                <label>Get the launch write-up and the demo video</label>
                <div>
                  <a
                    className="primary-button"
                    href={`mailto:${contactEmail}?subject=Keep%20me%20posted`}
                  >
                    Request a pilot plan <ArrowIcon />
                  </a>
                </div>
              </div>
            )}
            <a href={`mailto:${contactEmail}?subject=Evalarium%20pilot`}>
              Or email Gordon directly <ArrowIcon />
            </a>
          </div>
        </section>

        <section className="privacy-notice section" id="privacy">
          <p className="section-label">Privacy notice</p>
          <div>
            <h2>Your inquiry stays an inquiry.</h2>
            <p>
              Evalarium uses the email, company, and use-case details you submit
              only to respond about a pilot or product access. We do not sell
              this information or use advertising trackers. Submissions are
              processed by Vercel and Resend and retained in the Evalarium inbox
              for follow-up.
            </p>
            <p>
              To access, correct, or delete an inquiry, email{' '}
              <a href={`mailto:${contactEmail}`}>{contactEmail}</a>.
            </p>
          </div>
        </section>
      </main>

      <footer>
        <a className="logo footer-logo" href="#top">
          <Mark />
          <span>Evalarium</span>
        </a>
        <p>Real apps. Reliable runs.</p>
        <div className="footer-links">
          <a href="mailto:gordon@evalarium.ai">gordon@evalarium.ai</a>
          <a href="#privacy">Privacy</a>
          <a href="https://sabercrown.com" target="_blank" rel="noreferrer">
            Powered by sabercrown.com
          </a>
        </div>
      </footer>
    </>
  );
}
