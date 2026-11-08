# Moonroot Progress

## Current phase
Step 1 — Design Freeze (no app or screen code built yet)

## What is complete
- Added `SPEC.md` at the repository root from the final specification (8 November 2026).
- Completed the Step 1 Design Freeze contract in pure TypeScript:
  - `core/model/types.ts`: all data model types (`SCHEMA_VERSION = 1`, `RULESET_VERSION = '1.0'`), `MoonrootStorage` interface, and `BackupFile` types.
  - `core/model/catalogues.ts`: symptom (8 keys), danger-sign (15 keys), and medicine starter (9 entries, names/categories only, zero strengths or dose limits) catalogues.
  - `core/triage/thresholds.ts`: all numeric and categorical thresholds isolated in `core/triage`.
  - `core/triage/questions.ts`: all 9 question flows, watch-list follow-up schedule, and answer-field mappings.
  - `core/triage/rules.ts`: all 46 rules (`RED-01`..`RED-11`, `ORG-01`..`ORG-15`, `YEL-01`..`YEL-09`, `GRN-01`..`GRN-04`, `STD-01`..`STD-07`) with boundary examples, source keys, and `reviewStatus: 'unreviewed'`.
  - `core/triage/caseCards.ts` and `docs/case-cards.md`: 38 patient case cards covering every Red and Orange rule, 7 near-threshold cases, Law 1 fixes, Law 4 incomplete check, under-18 guidance, and open event card behaviour.
  - `core/triage/exportDoc.ts` and `docs/clinical-review.md`: generated clinical review packet with all rules and medical interpretations marked **unreviewed**.
- Added toolchain and guardrails (`package.json` with pinned exact versions, `tsconfig.core.json` without DOM/Node types for `core/`, `eslint.config.mjs` banning network/clock/DOM access in `core/`, `.dependency-cruiser.cjs` enforcing layer isolation, and `scripts/lint-copy.ts` copy lint).
- Added design-freeze contract tests in `tests/core/designFreeze.test.ts`.

## Approved design-freeze additions and medical interpretations (unreviewed)
1. **Data model additions** (`core/model/types.ts`):
   - Added `'shoulder-tip'` to `PainSite`.
   - Added `pregnancyChance?: 'yes' | 'no' | 'prefer-not-to-say'` and `stoolBlood?: 'none' | 'back-passage' | 'period' | 'unsure'` to `DayLog`.
   - Added `'unsure'` to `DayLog.pain.reliefHelped`.
   - Added `weightChange?: boolean` to `DayLog.context`.
   - Added `dangerAnswered?: boolean` to `DayLog` so skipping the danger-sign screen (`[]` without confirming "None of these") is unambiguously distinguished from answering "None of these" and blocks Green per Law 4.
2. **Fever without a measured temperature** (`RED-06`, `RED-07`): `fever.felt === true` with no `fever.c` counts as fever present (marked `unreviewed / Std`). Measured `fever.c` always controls numeric thresholds when present.
3. **Meaning of "pain" in `RED-04`, `RED-05`, `RED-07`**: `pain.level >= 1` (marked `unreviewed`). Lower belly pain in `RED-07` maps to `lower-middle`, `left`, `right`, or `whole-belly`.
4. **`ORG-01` period duration counting rule**: counts known logged bleeding days (`flow !== 'none'`) > 7 within the confirmed period episode, excluding unlogged days and explicit `none` days (marked `unreviewed / Std`).
5. **`YEL-02` and `YEL-08` Law 1 monotonicity fix**: kept both base Yellow rules active even when non-red warning signs or sub-threshold fever are ticked, so adding a sign never lowers Yellow to Green (flagged for clinical review).
6. **Step 1 danger-sign screen behaviour**: saves `DayLog.danger`, never shows Green or a verdict level, displays the Step 1 records-only notice, and shows a prominent **Open Get help** button whenever any danger sign is checked.

## Deviations from SPEC.md and why
- **Git branch name**: Working on session branch `arena/14847b8b-moonroot` rather than `step-1-record` because this Arena session is locked to `arena/14847b8b-moonroot`.
- **GitHub Pages**: GitHub Pages deferred because repository `x7en/Moonroot` is private; build artifacts remain available from Actions.
- **Playwright in local sandbox**: Local sandbox outbound allowlist permits `registry.npmjs.org` and `github.com` but not Playwright browser CDN downloads; Playwright + axe browser suites will run in GitHub Actions CI.

## What is tested
- `npm run typecheck` (strict TypeScript, pure ES2023 check on `core/`)
- `npm run lint` (ESLint, `dependency-cruiser` layer check, `lint:copy`)
- `npm test` (`tests/core/designFreeze.test.ts`)
- `npm run build` (`tsc -p tsconfig.build.json` on `core/`)

## What is left
- Step 1 Record screens, IndexedDB storage layer (`data/`), passphrase backup/restore, PIN lock, Get help sheet, Step 1 doctor file, PWA shell, and GitHub Actions CI workflow (awaiting your **go** to start building screens).

## Decisions needed from you
- Confirm `dangerAnswered?: boolean` on `DayLog` (added so leaving the danger-sign screen unanswered never collapses into "None of these") and say **go** to start building the Step 1 screens.

NEXT ACTION: Review the design freeze files and say "go" to begin Step 1 screens and storage implementation.
