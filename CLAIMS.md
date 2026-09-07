# Evalarium claims sheet

The single source of truth for every number quoted in any Evalarium asset
(landing page, video, emails, posts). If a number is not on this sheet, it
is not a claim. All measurements dated 2026-08-18, macOS arm64, toolchain at
the commit that froze them.

## Speed

- **47 seconds** from `evalarium record` to a passing 3-episode determinism
  proof on a brand-new environment (Medusa v2 admin dashboard, captured
  black-box). Dated receipt: `environments/medusa-admin/artifacts/RECEIPT.md`
  (record 17s, compile 1s, offline replay 8s, determinism ×3 21s).
- **~2 seconds** to reset a frozen environment to a named fixture (fresh
  browser context; processes reused).

## Fidelity (Twenty CRM v2.31.1, black-box docker origin)

- **100% on-trail replay** with **zero fallbacks and zero misses** on both
  named fixtures: `crm-baseline` 565/566 exact (1 subscription stub),
  `pipeline-review` 645/647 exact (2 subscription stubs; re-verified
  2026-08-19 on the final hardened recording). Subscription stubs are
  deterministic answers to scoped-out WebSocket subscriptions, counted
  outside the on-trail rate.
- **14/14 verified tasks** across difficulty levels (re-verified
  2026-08-19): 3 reads on crm-baseline; on pipeline-review a status
  completion, an overdue-task read, a biggest-deal read, an amount
  update, an assignment, a record creation, a global search, and four
  long-horizon compositions — reads and mutations both replay.

## Determinism

- **Hash-identical observation streams across 5 seeded episodes** on both
  fixtures (re-verified 2026-09-03 on Chrome 152.0.7977.65: crm-baseline
  `43012eb4…`, pipeline-review `f8d1c9a1…`; on 2026-08-19 they were
  `43012eb4…` and `7f648fa9…`), replaying the full input trace under the
  manual virtual clock. Absolute hash values are stable for a given
  bundle and Chromium build — a browser update or a re-record shifts
  them without breaking the cross-episode identity, which is the claim.
  The pipeline-review shift between those dates is the browser build; the
  replay path did not change.
- **Identity holds under concurrent sessions** (measured 2026-09-03): two
  determinism runs started at the same moment on one machine, each owning
  its own replay proxy and Chromium exactly as managed sessions do,
  produced the same hash as each other and as an uncontended run on both
  fixtures (5 episodes each, seed 42). The offline e2e now starts two
  determinism processes at once on the demo shop and requires both to
  reproduce the sequential hash.
- **The no-shims control diverges where determinism has work to do**
  (re-measured 2026-08-19, 5 episodes each): on the mutation-bearing
  `pipeline-review` trace, disabling the determinism runtime sends every
  episode off the recorded trail (15–17 misses per episode, zero when
  shimmed) and all five hashes differ; on the demo-shop fixture (absolute
  timestamps in the DOM) all five hashes differ too. The read-only
  `crm-baseline` trace no longer diverges with shims off once the
  warm-up boot removed cold-start render variance — its digest surfaces
  no sub-minute time — which is itself evidence the divergence sources
  are understood, not incidental.

## Delivery

- **`docker run` serves a frozen environment**: control HTTP API plus a
  CDP endpoint any Playwright-based agent stack can attach to. Container
  smoke test: **473/473 exact** boot requests on reset, exact rate 1.0.
- Python client (`packages/adapter-browsergym/python`) drives it over the
  control API + `connect_over_cdp`.

## Frontier baselines (measured 2026-08-18/19, final 14-task suite)

Two configurations, same bundles, same variables-precise verifiers, three
seeds per task (42, 7, 1234), 25-step cap:

- **Raw API agent loop — anthropic/claude-opus-5 via OpenRouter: 69.0%**
  over the complete 14 tasks × 3 seeds (42 episodes; grid completed
  2026-08-19).
- **Claude Code agent harness (claude-opus-5): 66.7%** over the complete
  14 tasks × 3 seeds (42 episodes), at zero marginal API cost
  (subscription quota).
- **Claude Code agent harness (claude-fable-5-1): 83.3%** over the
  complete 14 tasks × 3 seeds (42 episodes; measured 2026-09-03/04 on the
  unchanged bundles, verifiers, seeds, and 25-step cap; zero marginal API
  cost). 35 passes, 342 steps, 64 minutes wall clock; every episode ended
  with an explicit finish. Opus 5 on the same harness used 396 steps and
  91 minutes.

Per-tier shape (both Opus 5 configs): the read tier is saturated (100%),
single-mutation tasks mostly pass with real variance (assign 67-100%,
create 0-33%), and the long-horizon tier discriminates hard
(close-overdue-tasks 0%, staff-and-expand 0%, full-pipeline-review 33%,
globex-account-sweep 0-33%).

Per-tier shape (Fable 5.1, Claude Code harness): read tier 100%; every
single-mutation task 100% except create-vantage-company at 67%; the
long-horizon tier splits — full-pipeline-review 100% (from 33%) and
globex-account-sweep 100% (from 0%), while close-overdue-tasks and
staff-and-expand stay at 0% on all three seeds. Those two fail with the
same signature Opus 5 showed: the agent calls finish and reports success
while the committing mutation never reaches the network. In
close-overdue-tasks each episode carries one exact `UpdateOneTask` where
the verifier needs two, after off-trail reads of a task record the
recording never opened; in staff-and-expand `CreateOneCompany` and the
task assignment land but the `UpdateOneCompany` that names the company
never fires. The gap between the two generations is therefore in
multi-entity follow-through, not in reading or single edits.

**Critical read (publication status: IN BAND for Opus 5; Fable 5.1 sits
above it).** Both Opus 5 configs sit inside the 40–80%
frontier-difficulty band; Fable 5.1 on the Claude Code harness scores
83.3%, so a band statement can no longer be made for the newest model
without qualification — the suite still discriminates (two long-horizon
tasks at 0% across both generations, seed variance on create), but the
headline moved above the band. Episode network forensics attribute
the hard-tier failures to genuine agent behavior — uncommitted edits
(create fired, name never persisted, success claimed anyway),
half-completed multi-entity flows at the step cap, and unverified
optimistic UI state — not to harness artifacts: the harness classes found
earlier (wrong-record fallbacks, count-based verifiers, single-route
capture coverage) were fixed and re-measured before this suite. Known
verifier semantics: creating a record is verified by a create mutation;
renaming an existing record to the target name correctly fails.
