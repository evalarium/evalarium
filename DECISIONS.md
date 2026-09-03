# Evalarium Decision Log

Every non-trivial scaffold decision is recorded here. Newest entries appear first.

## 2026-09-03 — Concurrent serving isolates the whole runtime session

- **Decision:** Extend `evalarium serve` with a bounded collection of managed
  sessions. Each allocation receives its own environment handle, replay proxy,
  Chromium process, seed, diagnostic state, and deterministic CDP relay/browser
  port pair; the original control paths and CDP relay remain unchanged.
- **Reason:** Parallel evaluations are trustworthy only when resets, replay
  cursors, id aliases, browsers, and request logs cannot bleed between
  rollouts. Browser contexts sharing one replay proxy would not provide that
  isolation.
- **Consequence:** Four managed sessions are allowed by default, using private
  checkout ports `4000–4007` (public export `5000–5007`). Creation fails
  clearly at capacity, deletion and signal shutdown close all owned resources,
  and the Python adapter can own a managed session lifecycle.

## 2026-09-03 — MCP stays a thin, local runtime adapter

- **Decision:** Ship `@evalarium/mcp` as a stdio server backed directly by one
  `openEnvironment()` handle. Its bounded tool set covers fixture reset,
  observation, browser inputs, screenshot, bundle manifest, replay coverage,
  divergences, and request log; mutating calls return the resulting observation
  and on-trail status.
- **Reason:** MCP makes frozen environments immediately usable from compatible
  agent clients without adding a provider-specific model loop or duplicating
  runtime semantics.
- **Consequence:** Tool calls are validated and serialized within the process.
  The server is local-only and owns no accounts, model credentials, live-web
  navigation tool, or hosted state.

## 2026-09-03 — Interactive capture uses operator-marked phase boundaries

- **Decision:** `evalarium record` accepts exactly one of `--script` and
  `--interactive`. Interactive mode opens headed Chromium, lets the operator
  prepare authentication and location, then reloads and records a manually
  performed reference workflow through the existing input recorder.
- **Reason:** First captures should not require Playwright code just to cross a
  login flow. The prepare/replay boundary still has to remain explicit or
  pre-login responses can poison an authenticated fixture.
- **Consequence:** Interactive mode requires a TTY and is local-only. Failed
  captures close the prompt, browser, proxy, and writer and remove only the new
  partial recording directory; scripted capture remains unchanged for CI.

## 2026-09-03 — Episode replay becomes an eval-aware local inspector

- **Decision:** Share a versioned episode artifact contract through `core`,
  attribute replay requests and divergences to individual agent steps, and ship
  `evalarium inspect` as a loopback-only UI that loads local artifacts and
  compares their DOM digests.
- **Reason:** A generic browser recording shows what happened but not whether a
  failure came from the agent, an off-trail request, or environmental variance.
  Evalarium already records the necessary evidence; putting it on one timeline
  makes deterministic failures diagnosable without a hosted data service.
- **Consequence:** New artifacts carry schema version 1 and the environment
  seed. The parser supplies empty step-network slices and a null seed for older
  artifacts, so existing baseline evidence remains inspectable.

## 2026-08-27 — Give the public checkout a separate local port range

- **Decision:** Keep the private source checkout on Hub `5173`, control API `3900`, public CDP relay `3922`, and derived loopback browser endpoint `3923`. `scripts/export-public.sh` rewrites those host-facing defaults in the generated public tree to `5174`, `3901`, `3924`, and `3925`, respectively.
- **Reason:** The private source and public export are commonly present on the same workstation. Distinct defaults let both repositories run simultaneously and keep the cross-project port inventory collision-free.
- **Consequence:** The generated public Docker interface, CLI defaults, BrowserGym example, Docker smoke test, and Hub config use the public checkout's range. Callers can still override the control and CDP ports explicitly.

## 2026-08-23 — Pin collision-free local service ports

- **Decision:** Pin the Hub to Vite `5173` with `strictPort`, keep the frozen-environment control API on `3900`, and move its public CDP relay from Chrome's conventional `9222` to Evalarium's `3922` slot (with the derived loopback browser endpoint on `3923`).
- **Reason:** An unpinned Vite server can silently drift, while Chrome commonly already owns `9222`; both behaviors make the fleet port map unreliable and can make `evalarium serve` fail after launching its browser.
- **Consequence:** The Docker interface, default CLI option, BrowserGym example, and operations runbook all use `3922`. Callers can still override both public ports explicitly.

## 2026-08-19 — The no-shims control re-scopes to traces where determinism has work to do

- **Decision:** The control claim ("disable the shims and episodes diverge") is measured per fixture: it holds on the mutation-bearing pipeline-review trace (each unshimmed episode leaves the recorded trail with 15–17 misses and hashes scatter) and on demo-shop (absolute DOM timestamps), and it no longer holds on the read-only crm-baseline trace after the warm-up boot fix.
- **Reason:** crm-baseline's pre-fix divergence came from the cold-boot render variance the warm-up fix removed; its digest surfaces no wall-clock below relative-date granularity, so with a frozen network and a warmed process there is nothing left for the shims to pin on that trace. The e2e gate asserts the control on demo-shop; asserting it on crm-baseline would now fail by design.
- **Consequence:** CLAIMS.md states the control per fixture. The demo video's control beat uses pipeline-review.

- **Decision:** `openEnvironment` performs one warm-up boot of the default fixture — reset, the same boot settle the trace player runs before an episode's first observation, then the context is discarded — before handing out the environment.
- **Reason:** A cold Chromium process renders the first episode on different timing than every later one. Observed on pipeline-review after a browser update: the first observation intermittently captured a company avatar still showing its fallback letter (the logo swap is a JS-side preload that `document.images` settling cannot see), producing a bimodal episode-1 hash — two stable attractors, episodes 2–5 always identical. Determinism runs on 2026-08-18 passed, so the race sat inside timing that environment drift shifted.
- **Consequence:** Every measured episode starts from the warmed process state — the same state a served environment lives in after its first reset. Opening an environment costs one extra boot (~5 s); episode hashes pin to the warmed attractor.

- **Decision:** The open core is the toolchain — `packages/`, `apps/`, `fixtures/` (demo-shop), the allowlisted `scripts/`, and the root documentation — licensed Apache-2.0 (root `LICENSE` + `NOTICE`). Private and never published: `environments/` (normalization-rules corpora, capture and seed scripts, tasks, database snapshots), `wiki/`, `scripts/score-baseline.sh`, and every compiled artifact. The public repository is produced by `scripts/export-public.sh` as a fresh-history `git archive` of the allowlist; this monorepo is never flipped public.
- **Reason:** The moat is the rules corpora plus the accumulated capture know-how for real applications; this repository's git history contains both, so publishing history would ship them. The toolchain itself is the adoption surface and loses nothing by being open.
- **Consequence:** The export script guards against private-path leaks and can self-verify (`--verify` runs install, build, tests in the export). The public lockfile is pruned on first install because the private environment workspaces are absent.

## 2026-08-19 — Frozen bundles inherit the captured application's license

- **Decision:** A frozen bundle contains the captured application's frontend build, so its distribution follows that application's license, independent of the toolchain's. Twenty CRM (AGPL-3.0): bundles stay private and demonstration-only (video, hosted evals), never redistributed. Medusa (MIT): bundles may be redistributed with upstream's MIT license text and attribution included.
- **Reason:** Redistributing an AGPL frontend build would bind the distribution to AGPL terms; MIT permits redistribution with notice. Keeping the rule per-environment lets each future capture make this call explicitly.

## 2026-08-18 — Prepare traffic is context, not replay content

- **Decision:** Recorded requests carry a capture phase (`prepare` before the post-prepare reload, `replay` after). When a fingerprint has instances in both phases, replay cursors start at the first replay-phase instance, and fallbacks prefer replay-phase candidates.
- **Reason:** Auth-state-dependent endpoints (a 401 before login and a 200 after) share a fingerprint because headers are excluded; serving the pre-login answer at replay bounces the app to its login screen.
- **Consequence:** Recording schema change; existing recordings regenerate.

## 2026-08-18 — Capture disables the browser cache

- **Decision:** The capture browser records with the network cache disabled so every response is stored with its full body.
- **Reason:** A fresh replay context cannot use recorded 304s; dev servers that revalidate (Vite) would otherwise freeze bodiless responses.

## 2026-08-18 — Environment #2 receipt: Medusa admin in 47 seconds

- **Decision:** The second environment is the Medusa v2 admin dashboard, captured black-box; the dated receipt (`environments/medusa-admin/artifacts/RECEIPT.md`) records 47 seconds from record to a 3-episode determinism proof at 177/177 exact.
- **Reason:** The sales story needs a timed demonstration that standing up a new environment is fast once the toolchain exists.

## 2026-08-18 — Freeze Twenty CRM as environment #1, strictly black-box

- **Decision:** The first real environment is Twenty CRM v2.31.1 run from unmodified official docker images; all seeding and fixture shaping happens through the app's public UI and REST surface.
- **Reason:** The thesis test only counts if the tooling never depends on application internals.
- **Consequence:** `environments/twenty-crm` holds the origin compose file, normalization rules, seed and capture scripts, ten verified tasks, and a build script that reproduces both fixtures from a fresh origin.

## 2026-08-18 — GraphQL fingerprints key on operation name plus variables hash

- **Decision:** For declared GraphQL endpoints, the body key is `operationName` plus a hash of variables with declared volatile paths removed; the raw query text never participates. Replay fallback distance and the request log are operation-aware.
- **Reason:** GraphQL-heavy apps send every request to one URL, so URL-keyed fingerprints collapse.
- **Consequence:** Normalization rules are per-environment (`--rules`), serialized into the recording, and the start of the private rules corpus.

## 2026-08-18 — Fixtures are authenticated snapshots taken after a prepare phase

- **Decision:** Capture scripts gain a `prepare(page)` phase (login, navigation) that runs before the initial storage snapshot; capture reloads the page after prepare so the document request and boot traffic are recorded exactly as replay issues them; snapshots record the URL they were taken at and reset navigates there.
- **Reason:** A fixture is state plus location, and JWT auth replays cleanly when the frozen clock starts inside the token's validity window.
- **Consequence:** The trace records only post-prepare inputs, with timestamps rebased.

## 2026-08-18 — Traces replay causes, not consequences

- **Decision:** Navigations within two seconds of a click are dropped from the trace (replaying the click reproduces them); recorded selectors must be unique in the document and never use React useId values; dropdown option clicks anchor on the listbox.
- **Reason:** SPA routing races the input recorder, and ambiguous or minted selectors replay against the wrong element silently.

## 2026-08-18 — Scoped-out subscriptions answer with deterministic stubs

- **Decision:** Unmatched GraphQL subscription operations get a synthetic `{"data": null}` response counted in a dedicated `stubs` coverage bucket that does not affect the on-trail rate.
- **Reason:** WebSocket replay is out of scope; the client's HTTP fallback attempts must neither fail nor count as divergence.

## 2026-08-18 — Randomness is seeded per call site

- **Decision:** The shim seeds `Math.random`, `crypto.getRandomValues`, and `crypto.randomUUID` with one stream per JS call site (keyed by stack) instead of one global stream.
- **Reason:** Consumers with timing-dependent call counts (socket-retry jitter) must not shift the values that order-stable consumers (record-id generation) receive across episodes.

## 2026-08-18 — Replay aliases client-generated record ids

- **Decision:** When a create mutation matches via an ignored `input.id`, the replay index maps the replay-local id to the recorded id and substitutes it in subsequent request bodies and URLs.
- **Reason:** Follow-up queries about a created record must stay on the recorded trail even though each episode mints a different client id.

## 2026-08-18 — Observation digests mask minted identifiers

- **Decision:** The DOM digest masks UUID literals and React useId tokens in attribute values; the accessibility snapshot stays unmasked.
- **Reason:** Per-instance ids are render-timing artifacts no assertion can rely on; record identity remains covered by snapshot URLs and the network trail.

## 2026-08-18 — Virtual time advances on a fixed schedule

- **Decision:** The trace player pumps the manual clock in fixed steps with real-time gaps, settles images in real time only, and never adapts step counts to observed state. Verify and run replay under the manual clock.
- **Reason:** Pages derive DOM content from the clock, so adaptive pumping diverges across episodes, while the auto clock races replayed inputs.

## 2026-08-18 — Bundles carry named fixtures

- **Decision:** `evalarium compile --fixture-name` names the compiled fixture; tasks reference fixtures by name and reset defaults to the bundle's first fixture.
- **Reason:** Two named fixtures (`crm-baseline`, `pipeline-review`) are distinct frozen states with their own recordings.

## 2026-08-18 — Delivery is docker run plus a control API and CDP

- **Decision:** `evalarium serve` exposes a bundle over an HTTP control API (reset/observe/coverage) and relays Chromium's loopback-only CDP port for external agents; `packages/packager/docker` builds the container.
- **Reason:** Consumers attach any Playwright-based agent stack over CDP without installing the toolchain.

## 2026-08-18 — Episodes are recorded JSON artifacts

- **Decision:** `@evalarium/eval-runner` drives Claude against tasks with click/fill/finish tools and writes per-task episode files (observations, actions, token usage, reward).
- **Reason:** A baseline is only credible with a replayable record of what the model saw and did.

## 2026-08-18 — Host the public Hub on Vercel

- **Decision:** Deploy the static `@evalarium/hub` build to the Vercel project `evalarium`, serve it at `evalarium.ai`, and retain Cloudflare as the authoritative DNS provider.
- **Reason:** The Hub is a static Vite application, so Vercel provides a small production surface with automatic TLS and no application server to operate.
- **Consequence:** The root `vercel.json` is the deployment contract. Production deployments build only the Hub workspace, while Cloudflare must point the apex domain to Vercel.

## 2026-08-18 — Rename the product and public contracts to Evalarium

- **Decision:** Rename the product, repository, CLI, npm scope, browser globals, HTTP headers, environment variables, recordings, and bundles from the old `envc` vocabulary to Evalarium. The public forms are `evalarium`, `@evalarium/*`, `__evalarium*`, `x-evalarium-*`, `EVALARIUM_*`, `.evalrec`, and `.evalbundle`.
- **Reason:** The old name collided with `.envrc`, direnv, environment-variable tooling, and existing npm packages. Evalarium describes a controlled habitat for agent evaluation and had a clear exact-name search, GitHub organization, npm scope, domains, and no public X profile at selection time.
- **Consequence:** This is an intentional pre-1.0 contract break with no compatibility aliases. All examples, fixtures, tests, generated artifacts, and integrations use the new vocabulary.

## 2026-08-17 — Override vulnerable transitive build tooling

- **Decision:** Pin transitive `esbuild` to `0.28.2` at the workspace level.
- **Reason:** The otherwise-current Vite, Vitest, and tsup graph selected `0.27.7`, which has a low-severity Windows development-server file-read advisory; `0.28.2` is the current patched release.
- **Consequence:** The override is covered by build, unit, and e2e gates and can be removed once every upstream range selects a patched version directly.

## 2026-08-17 — Keep no-shims as a determinism diagnostic

- **Decision:** `evalarium determinism --no-shims` keeps offline replay active, disables only the in-page determinism runtime, and expects episode hashes to differ.
- **Reason:** This proves that the hostile fixture exercises the shims rather than passing accidentally.
- **Consequence:** The normal determinism command remains strict about identical hashes; the control command is strict about divergence.

## 2026-08-17 — Establish the walking-skeleton rollback point

- **Decision:** Commit the complete green record/compile/run/verify/determinism path before attempting `--no-shims`, WebSocket work, or a real-site capture.
- **Reason:** The first end-to-end path is the stable recovery point for higher-risk work.
- **Consequence:** Stretch work is isolated in later commits.

## 2026-08-17 — Keep environment compilation out of Turbo for v1

- **Decision:** The demo e2e script invokes compilation directly.
- **Future:** Environment compilation will become a cached Turbo task with `recording/**` and `rules/**` inputs.

## 2026-08-17 — Use a directory-shaped `.evalrec`

- **Decision:** `<name>.evalrec/manifest.sqlite` is the relational manifest and `<name>.evalrec/blobs/<sha256>` stores raw bodies without extensions.
- **Reason:** SQLite remains inspectable while large or repeated bodies stay deduplicated.
- **Consequence:** Capture is the only writer and compiler is the only reader of this boundary.

## 2026-08-17 — Capture initial and final storage states

- **Decision:** Storage snapshots have named `initial` and `final` phases; the compiled `default` fixture restores `initial`.
- **Reason:** Deterministic episodes must replay actions from pre-action state, while final state remains available for inspection.
- **Consequence:** IndexedDB is represented by a reserved `null` field only.

## 2026-08-17 — Compile recording rows to JSON

- **Decision:** A frozen bundle contains `manifest.json`, `evalarium.config.json`, `shim.js`, and referenced blobs rather than the mutable recording database.
- **Reason:** Runtime must not depend on the capture database and can validate one immutable config at startup.
- **Consequence:** The environment ID is derived from canonical compiled content.

## 2026-08-17 — Fingerprints exclude headers in v1

- **Decision:** Fingerprints hash uppercase method, normalized URL, and normalized body. Header-ignore rules are serialized for forward compatibility and header normalization, but headers do not affect the v1 hash.
- **Reason:** This follows the explicit recording contract and avoids volatile browser headers.

## 2026-08-17 — Replay exact raw bodies and sanitize transport headers

- **Decision:** Record encoded bytes, then replay them as raw bytes after removing hop-by-hop and length headers that the proxy must regenerate.
- **Reason:** Application-visible content stays frozen without emitting invalid proxy transport metadata.

## 2026-08-17 — Determinism uses manual virtual time

- **Decision:** The shim defaults to 1× real-time auto mode. The determinism runner selects manual mode and advances by recorded event deltas plus a fixed post-action settle window.
- **Reason:** Auto mode is ergonomic for normal runs; manual mode eliminates scheduling jitter from hashed observations.

## 2026-08-17 — Replay never passes through

- **Decision:** Record mode has one passthrough rule; replay mode has only a dynamic response rule and no upstream networking path.
- **Reason:** A frozen environment must work after the source app is gone.
- **Consequence:** Unknown requests are recorded as divergences and use deterministic nearest-URL fallback, or a local 502 if no recording exists.

## 2026-08-17 — Reuse processes across resets

- **Decision:** `openEnvironment` starts one browser and replay proxy. `reset` clears replay state and creates a fresh browser context.
- **Reason:** This preserves isolation while keeping reset latency in seconds.

## 2026-08-17 — Use host Chrome with playwright-core

- **Decision:** Resolve Chromium from `EVALARIUM_CHROMIUM_PATH`, Chrome channels, or standard platform paths.
- **Reason:** The fixed stack explicitly uses `playwright-core`, which does not install browsers.

## 2026-08-17 — Pin exact, compatible tool versions

- **Decision:** All direct packages and the package manager are exactly pinned. TypeScript stays on the latest 5.x release, and ESLint stays on the latest 9.x version supported by the React lint plugin.
- **Reason:** Reproducible installs take precedence over semver ranges.

## 2026-08-17 — Add supporting development dependencies

- **Decision:** ESLint, TypeScript ESLint, React lint plugins, Prettier, type declarations, `@vitejs/plugin-react`, `@rolldown/plugin-babel`, Babel core, and `babel-plugin-react-compiler` supplement the fixed product stack.
- **Reason:** They provide the requested lint presets, strict typechecking, formatting, React Compiler, and typed Express/React APIs; none alter the product architecture.

## 2026-08-17 — Keep Git hooks dependency-free

- **Decision:** A tracked `.githooks/pre-commit` runs lint, format checking, tests, build, and a vulnerability audit at low severity; a small Node prepare script configures it.
- **Reason:** This avoids adding a hook manager dependency.

## 2026-08-17 — Keep unsupported protocols honest

- **Decision:** WebSocket/SSE replay, IndexedDB data, OCI output, BrowserGym/MCP behavior, product UIs, remote caching, and synthesized responses remain documented stubs or reserved interfaces.
- **Reason:** They are outside the walking-skeleton acceptance criteria.
