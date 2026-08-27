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

The private source checkout uses `5173` for the Hub, `3900` for the frozen-environment control API, and `3922` for its public CDP relay; the relay starts Chromium on loopback-only `3923`. `scripts/export-public.sh` assigns the generated public checkout `5174`, `3901`, `3924`, and `3925`, respectively, so both repositories can run simultaneously.

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
evalarium compile <recording.evalrec> --out <bundle.evalbundle>
evalarium run <bundle.evalbundle> --fixture default
evalarium verify <bundle.evalbundle> --tasks '<glob>'
evalarium determinism <bundle.evalbundle> --episodes 5 --seed 42
evalarium determinism <bundle.evalbundle> --episodes 5 --seed 42 --no-shims
```

A recording script is an ESM module with a named `run(page)` export. The runtime uses `playwright-core`, so it intentionally does not download a browser.

The `--no-shims` form is a diagnostic control: it keeps frozen-network replay enabled but disables virtual time and seeded randomness, so the hostile fixture's observation hashes diverge.

## Development-only proxy security

Recording and replay use a generated self-signed certificate authority and launch Chromium with proxy flags and HTTPS certificate errors ignored. This is suitable only for a trusted local development environment. Evalarium does not install the CA in the operating system trust store.

See [DECISIONS.md](./DECISIONS.md) and the [project wiki](./wiki/Home.md) for contract and operational details.
