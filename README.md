# Evalarium

> **We freeze running applications; we do not rebuild or clone them.** Evalarium captures the real JavaScript, assets, storage, and API responses of a live application, then replays that recording behind a deterministic network and browser runtime.

Evalarium produces resettable, instrumented browser environments for agent evaluation and training.

## Quickstart

Requirements:

- Node.js 22.23.2
- pnpm 11.22.0
- A locally installed Chromium or Google Chrome

```sh
pnpm install
pnpm build
pnpm typecheck
pnpm test
pnpm e2e
```

Set `EVALARIUM_CHROMIUM_PATH` if Chrome is not installed in a standard location.

The end-to-end command starts the bundled demo shop, records a scripted checkout, stops the origin, compiles the recording, and runs replay, verification, and five determinism episodes fully offline.

The private source checkout uses `5173` for the Hub, `3900` for the
frozen-environment control API, and `3922` for its compatibility CDP relay;
managed session CDP relay/browser pairs occupy `4000–4007`. The generated
public checkout uses `5174`, `3901`, `3924`, and `5000–5007`, so both
repositories can run simultaneously.

## Architecture

```text
                                .evalrec contract
  live app ──► MITM record proxy ──► SQLite + sha256 blobs
                    ▲                         │
                    │                         ▼
               capture/CDP               compiler
                    │                         │
                    └─ Chromium          frozen bundle
                                              │
                                              ▼
                                  replay proxy + shims
                                              │
                                              ▼
                                   runtime ──► verifier
```

The enforced dependency spine is:

```text
core ← {capture, proxy, shims} ← compiler ← runtime ← {verify, adapters} ← apps
```

Lower layers never import higher layers, apps never import apps, and `core` has no runtime dependency except Zod. The shims package may use only type imports from `core`, and its IIFE has no imports or `require` calls.

## CLI

```sh
evalarium record <url> --script <module.js> --out <recording.evalrec>
evalarium record <url> --interactive --out <recording.evalrec>
evalarium compile <recording.evalrec> --out <bundle.evalbundle>
evalarium run <bundle.evalbundle> --fixture default
evalarium verify <bundle.evalbundle> --tasks '<glob>'
evalarium serve <bundle.evalbundle> --max-sessions 4
evalarium mcp <bundle.evalbundle>
evalarium inspect <episode-file-or-directory>
evalarium determinism <bundle.evalbundle> --episodes 5 --seed 42
evalarium determinism <bundle.evalbundle> --episodes 5 --seed 42 --no-shims
```

A recording script is an ESM module with a named `run(page)` export. The runtime uses `playwright-core`, so it intentionally does not download a browser.

Interactive recording opens headed Chromium and pauses twice: first so an
operator can sign in and navigate to the fixture state, then so the operator
can perform the reference workflow to capture. It requires a TTY; scripted
recording remains the CI interface. Recordings contain browser storage and may
contain authenticated response bodies, so keep them out of source control and
handle them as credentials.

The `--no-shims` form is a diagnostic control: it keeps frozen-network replay enabled but disables virtual time and seeded randomness, so the hostile fixture's observation hashes diverge.

`evalarium inspect` serves a loopback-only, local UI for model episode
artifacts. It shows actions, observations, per-step replay traffic,
divergences, reward, token usage, and the first differing DOM step between two
episodes. Inspector data stays on the machine running the command.

`evalarium mcp` serves one frozen bundle to MCP-compatible clients over local
stdio. It exposes reset, browser action, observation, screenshot, manifest, and
replay-diagnostic tools; mutating tools report whether the session remains on
the recorded network trail. The adapter contains no model loop or remote
service. See [`packages/mcp`](./packages/mcp/README.md) for client configuration.

`evalarium serve` retains the original `/reset`, `/observation`, diagnostics,
and `--cdp-port` interface. For isolated concurrent rollouts, `POST /sessions`
with an optional `fixture` and `seed`; use the returned id under
`/sessions/:id/{reset,observation,coverage,divergences,request-log,manifest}`
and `DELETE /sessions/:id` when done. `GET /sessions` lists live sessions.
Each session owns a replay proxy, browser, CDP relay pair, and diagnostic state.
The default maximum is four managed sessions in addition to the compatibility
session.

## Development-only proxy security

Recording and replay use a generated self-signed certificate authority and launch Chromium with proxy flags and HTTPS certificate errors ignored. This is suitable only for a trusted local development environment. Evalarium does not install the CA in the operating system trust store.

See [DECISIONS.md](./DECISIONS.md) and the [project wiki](./wiki/Home.md) for contract and operational details.
