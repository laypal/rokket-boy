# Contributing

Thanks for looking. This is a hobby project I work on in short sessions,
often with an AI coding agent driving under a strict set of rules, and
those rules are what keep the codebase pleasant to come back to. Most of
them are enforced by a test, so run the gate and it will tell you.

## The gate

Everything below has to be green before a merge, and CI runs the same
commands on every pull request:

```sh
npm run typecheck   # tsc --noEmit, strict
npm run lint        # eslint .
npm test            # vitest run
npm run build       # typecheck + single-file build, with a size ceiling
```

`npm run test:e2e` (Playwright, real browser) runs in CI on every push to
`main` and is worth running locally before you open a PR that touches
anything the player sees. On Windows, run the gate from a shell whose
working directory uses an uppercase drive letter (`C:\...`); a lowercase
`c:\` cwd makes Vitest lose track of files intermittently, and the only
fix I've found is the casing.

## House rules the code already follows

These are the conventions the tests lock in; they describe how the repo
is built.

- **Content is data.** Interactions, cutscenes and dialogue are
  `ScriptStep[]` arrays in `src/data/dialog/`, run by
  `src/systems/script.ts` through a hooks interface. Adding a chapter
  should mean writing data. If a feature needs a new step type, that is
  a contract change and gets discussed first.
- **Data never imports systems.** `src/data/*` are leaves: types in,
  registries out. `src/systems/*` read them, never the other way round.
  `tests/data-import-lint.test.ts` walks `src/data/` and fails on any
  import that reaches into `systems/` or `engine/`.
- **Gameplay randomness is injected.** Battle and encounter rolls go
  through an `Rng` that tests replace with a seeded one.
  `tests/rng-lint.test.ts` walks `src/` and fails on any `Math.random()`
  outside the documented injection points, so a stray roll cannot creep in.
- **Data lints are tests.** Species, items, shops, maps and scripts each
  have a lint in `tests/` (`mon-data-lint`, `item-data-lint`,
  `shop-data-lint`, `map-lint`, `script-ref-lint`, `content-lint`) that
  checks the data is well-formed, every id resolves and every line of
  dialogue fits the text box. Add to the data and the lint tells you what
  you got wrong.
- **Zero runtime dependencies.** The game ships as one HTML file with
  everything inlined. Tooling and test libraries are fine; adding a
  runtime package needs a recorded decision first.
- **Player saves migrate, they never break.** `src/systems/save.ts` carries
  versioned migrations because saves live in players' browsers. I remove
  one only by an explicit decision, never as a tidy-up.
- **No stray `console.*` in `src/`.** ESLint enforces it (`console.error`
  is allowed on the deliberate error paths, and the build drops every
  console call anyway).

## Where the work is

[ROADMAP.md](ROADMAP.md) is the public view of what's shipped and what's
next, roughly in order. The detailed planning (card decks with specs,
files, a BDD line and a "done when" per card; design specs; playtest
notes; session handoffs) lives in my private working repo, and this
repository is a mirror of the parts that matter to a reader. If you want
to pick something up, open an issue naming the roadmap item and I'll
paste the relevant card so we're working from the same spec.

Two hygiene rules apply to docs as much as code:

- Any file read to orient a session (plans, handoffs, runbooks) gets
  split into an index plus leaves once it passes 400 lines.
- A status change and the code change that caused it land in the same
  commit, so there is never more than one source of truth for a status.

## What isn't here

The agent-harness tier (session handoffs, agent definitions, voice
profiles, my own notes), the working planning docs and my journals (the
narrative changelog, the decision journal, the failed-approaches log) are
not mirrored into this public repository; they read as a diary and they
stay one. Nothing you need in order to build, test or contribute lives
there; if something here references a doc you cannot see, open an issue
and I'll paste the relevant part.

## Pull requests

Branch off `main` (the convention is `f<number>-<slug>`, for example
`f30-side5-training`), keep to one roadmap item or one fix per branch, and
put the raw gate output in the PR description rather than "tests pass".
Only I push to `main`; `main` is protected so that every change comes in
as a pull request, and a push to `main` is a production deploy, so I
merge myself after a playtest. I would rather have a small PR I can play
through in five minutes than a large one I have to schedule.

One mechanical thing to know: this repository is a read-only mirror of my
private working repo, synced automatically after every green build. That
means I don't merge PRs *here*; a merged commit on this mirror would be
overwritten by the next sync. Instead I review your PR here, apply it to
the private repo (with you as author, `Co-authored-by` if I had to adapt
it), merge it there, and the next sync brings it back to this repo. I'll
close your PR with a link to the commit that landed. Same review, same
credit, one extra hop that you don't have to do anything about.
