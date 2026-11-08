# Moonroot Progress

## Current phase
Step 1 — Record complete (awaiting your **go** for Step 2: Check-in intelligence)

## What is complete
- Added `SPEC.md` at the repository root from the final specification (8 November 2026).
- Completed the Step 1 Design Freeze contract in pure TypeScript:
  - `core/model/types.ts` & `core/model/dates.ts`: frozen schema contract (`SCHEMA_VERSION = 1`, `RULESET_VERSION = '1.0'`), `DayLog.dangerAnswered?: boolean`, and pure Gregorian integer date math with no `Date` usage inside `core/`.
  - `core/model/catalogues.ts`: symptom (8 keys), danger-sign (15 keys, 3 oestrogen-gated), and medicine starter (9 entries, names/categories only, zero strengths or dose limits) catalogues.
  - `core/triage/*`: thresholds, 9 question flows, all 46 rules (`RED-01`..`RED-11`, `ORG-01`..`ORG-15`, `YEL-01`..`YEL-09`, `GRN-01`..`GRN-04`, `STD-01`..`STD-07`), 42 case cards (`docs/case-cards.md`), and `docs/clinical-review.md`.
- Completed Step 1 Core, Data, Platform, App, and PWA UI:
  - `core/medicine/totals.ts`: pure daily grouping, range summaries, and same-generic detection without any dose limits or advice.
  - `core/report/doctorFile.ts`: Step 1 `.md` and `.txt` doctor file (Parts 2, 5 whole-range, 10, 12, 3-month daily log table, clinician-review status, disclaimer, and machine-readable JSON block; under-18 intimacy omission).
  - `data/idb.ts`, `data/migrations.ts`, `data/backup.ts`, `data/pin.ts`, `data/regions.json`: IndexedDB storage (`moonroot-db`, 11 stores, `navigator.storage.persist()`), hidden 7-day pre-restore snapshot, SHA-256 + optional PBKDF2/AES-GCM encrypted backups (refusing wrong passphrase, tampered checksums, or newer schema versions), PBKDF2 screen PIN lock, and regional emergency defaults (`PK`: `1122` / `115`).
  - `app/store.ts`, `platform/web.ts`, `ui/*`, `public/icons/*`, `index.html`, `vite.config.ts`: offline-first PWA (`vite-plugin-pwa`, local `@fontsource/fraunces` & `@fontsource/atkinson-hyperlegible`, strict offline CSP), Dusk/Dawn/High-contrast themes, onboarding (6 screens, disclaimer required), Today check-in (1-tap flow glyphs + 5s Undo, pain 0–10, symptoms, danger-sign sheet with **Open Get help** when any sign is ticked, no verdict level yet and `"Records only"` banner visible), Medicine log + `"Same as last time"`, Record timeline + day editor + Doctor file preview/download, 1-tap Get help sheet, Settings (PIN lock, backup & restore, two-step delete), and CI workflow (`.github/workflows/ci.yml`).

## Approved design-freeze additions and medical interpretations (unreviewed)
1. **Data model additions** (`core/model/types.ts`): `'shoulder-tip'` `PainSite`, `pregnancyChance`, `stoolBlood`, `'unsure'` `reliefHelped`, `weightChange`, and `dangerAnswered?: boolean`.
2. **Fever without measured temperature** (`RED-06`, `RED-07`), **lower-belly pain mapping** (`RED-04`, `RED-05`, `RED-07`), **`ORG-01` >7 logged bleeding days**, and **`YEL-02`/`YEL-08` Law 1 fix** remain marked `unreviewed` in `docs/clinical-review.md`, with `CASE-39` preserving the `ORG-14` pain 8–10 question for clinician review.
3. **Step 1 scope boundary**: No triage verdicts (`Green`/`Yellow`/`Orange`/`Red`), question-flow engine, cycle derivation, forecasting, Body metrics, or companion growth are wired yet. Danger-sign ticks save `DayLog.danger` and offer **Open Get help** directly.

## Deviations from SPEC.md and why
- **Git branch name**: Working on session branch `arena/14847b8b-moonroot` rather than `step-1-record` because this Arena session is locked to `arena/14847b8b-moonroot`.
- **GitHub Pages**: Automatic Pages deployment is deferred while repository `x7en/Moonroot` is private; `.github/workflows/ci.yml` already builds with `VITE_BASE: /Moonroot/` and uploads the `dist/` artifact.
- **Playwright in local sandbox**: Local sandbox outbound allowlist permits `registry.npmjs.org` and `github.com` but not Playwright browser CDN downloads; Playwright + axe browser verification will run in GitHub Actions CI, while Vitest + jsdom + `fake-indexeddb` + `axe-core` ran locally.

## Step 1 Gate Verification
- **Typecheck**: `tsc -p tsconfig.core.json --noEmit && tsc -p tsconfig.json --noEmit` — passed (0 errors).
- **Lint & Guardrails**: `eslint .`, `depcruise` (56 modules, 139 dependencies, 0 violations), `lint:copy` (0 violations) — passed.
- **Tests**: `vitest run` — 7 test files, 24/24 tests passed (including IndexedDB persistence across reload, passphrase & unlocked backup restore, wrong-passphrase & tampered-file refusal, medicine totals, under-18 safety, Get help, Doctor file output, PIN lock without health words, and `axe-core` checks).
- **Build**: `npm run build` (`tsc -p tsconfig.build.json` + `vite build`) — passed (`14` PWA precache entries, `170.08 KiB` total, bundled Latin fonts, zero external CDN URLs).

## What is left
- Step 2 (Check-in intelligence): episode classifier, cycle derivation, question-flow engine, full triage rule engine, event cards, watch lists, standing flags, catch-up, exhaustive law tests (including `dangerAnswered`), input-coverage test, 100% coverage on `core/triage` and `core/cycles`, `docs/source-check.md`, and Step 2 doctor file sections.

NEXT ACTION: Test the Step 1 preview and say "go" when ready to begin Step 2 (Check-in intelligence).
