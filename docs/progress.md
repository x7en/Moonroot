# Moonroot Progress

## Current phase
Release 1 (Steps 1–3) complete — Step 3 (Predictions) implemented and verified

## What is complete
- Added `SPEC.md` at the repository root from the final specification (8 November 2026).
- Completed Step 1 (Record):
  - Frozen data contract (`core/model/types.ts`, `core/model/dates.ts`, `core/model/catalogues.ts`), `core/medicine/totals.ts`, `data/idb.ts` (`'moonroot'`, 11 stores), `data/migrations.ts`, `data/backup.ts`, `data/pin.ts`, `data/regions.json`, `platform/web.ts`, and offline PWA shell (`vite.config.ts`, local fonts, strict CSP).
- Completed Step 2 (Check-in intelligence):
  - **Episode classifier & cycle derivation** (`core/cycles/episodes.ts`, `core/cycles/cycles.ts`): classifies bleeding episodes (`period` >= 2 days of light/medium/heavy, `unclear` 1-day bleed, `in-between-spotting`, `check-date-spotting`), tracks spotting lead-ins <= 2 days (`firstRealFlowDate`), honors `period-start` / `not-a-period` / `ignore-in-predictions` / `new-baseline` decisions, flags `"check this date"` on >= 10 day gaps inside an episode, and weights `approximate` cycles at `0.5`.
  - **Question-flow & catch-up helpers** (`core/triage/flowEngine.ts`, `core/triage/catchUp.ts`): executes the 9 declarative question flows with `sexual-health-allowed`, `adult-intimacy-allowed`, `pain-8-or-more`, and `after-day-1` gates, enforces `isDangerScreenRequired` (`dangerAnswered`), and generates 2–7 day fast-tap catch-up lists.
  - **46-rule triage engine & watch lists** (`core/triage/engine.ts`, `core/triage/watchList.ts`): evaluates all `RED-01..11`, `ORG-01..15`, `YEL-01..09`, `GRN-01..04`, and `STD-01..07` rules; enforces Law 4 incomplete hold when required answers are missing; enforces neutral-hold `RED-04` / cautious Yellow (`prefer-not-to-say`) / adult-only intimacy gating; creates deduplicated `openEvents` (`Got it` or `DoctorVisit` closure); supports `STD` 30-day soft-prompt pacing; and manages `open -> closed | escalated` watch items (`ORG-15` at 72h, immediate danger escalation, max 2 repeats).
  - **Exhaustive tests & 42 case cards** (`tests/core/episodesAndCycles.test.ts`, `tests/core/questionFlows.test.ts`, `tests/core/triageBoundary.test.ts`, `tests/core/triageCaseCards.test.ts`, `tests/core/triageWorkflows.test.ts`, `tests/core/triageLaws.test.ts`, `tests/core/snapshotHelper.ts`): all 42 executable case cards pass, boundary inputs around every numeric threshold and all 4 exhaustive laws pass (including `dangerAnswered`, `pain 0..10` completeness, neutral pregnancy gating, and under-18 intimacy/care rules), input-coverage verifies every field of `RuleInputField` is exercised by >= 1 rule, and `1,800` days evaluate in <= 50ms.
  - **Clinical documentation** (`docs/clinical-review.md`, `docs/case-cards.md`, `docs/source-check.md`): generated `clinical-review.md` and `case-cards.md` from `core/triage/` via `npm run rules:export`, and added `docs/source-check.md` tracking clinical thresholds as `not checked` + `Std` + `(new)`/`(changed)` review items.
  - **Step 2 Doctor file & UI** (`core/report/doctorFile.ts`, `app/store.ts`, `ui/*`, `tests/core/doctorFile.test.ts`, `tests/ui/step1App.test.tsx`, `tests/ui/step2App.test.tsx`): populated Doctor file Parts 1, 3, 4, per-period Part 5, Part 7, and Part 11 alongside Parts 2, 10, 12, and 3-month table; wired Today verdict card (Red/Orange/Yellow/Green/Incomplete/OpenEvent), `RED-06` removal action, Red **Open Get help**, open event cards (`Got it` & `Log doctor visit today`), watch-list checks, 30-day standing prompt, 2–7d catch-up banner, hormone `"Start predictions fresh from this date?"`, derived cycles + baseline/ignore controls in Record, and `Verdict history` toggle in Doctor file sheet.
- Completed Step 3 (Predictions — finishing Release 1):
  - **Forecast, quantile, confidence, and lead-in engines** (`core/predict/quantiles.ts`, `core/predict/leadIn.ts`, `core/predict/confidence.ts`, `core/predict/forecast.ts`, `core/model/dates.ts` `yearsSinceMenarche`): weighted midpoint-interpolated quantiles with `0.85` recency decay, `approximate` `0.5` weight, `< 8` cycle FIGO (`[25, 28, 30, 33, 37]`) vs ACOG (`< 3y` since menarche `[23, 28, 32, 37, 43]`) priors, conditional `> d` recomputation dropping the likely window when `< 3` tail points remain (`"Day d. The longest gap you logged is M days."`), lead-in pattern detector (`>= 4` offsets, SD `<= 2d`, `>= 60%` followed, retired on `2/3` misses with `"This pattern is not holding."`), no-hindsight frozen forecast reconciliation, and `confidence = min(95, 10 + 30*C + 30*S + 30*T)` starting at `10`.
  - **Simulation gate** (`scripts/sim.ts`, `npm run sim`, wired in `.github/workflows/ci.yml`): simulates `n = 450` per group (Regular, Moderately irregular, Very irregular) x `16` cycles each plus real and random lead-in runs from a fixed seed, enforcing all 6 strict acceptance criteria.
  - **Doctor file Part 6, CSV exporters & golden snapshots** (`core/report/doctorFile.ts`, `core/report/csv.ts`, `tests/core/csvAndDoctorGolden.test.ts`): populated Part 6 (lead-in pattern with counts and non-proof wording) + JSON block, implemented `buildDayTableCsv` (no intimacy fields) and `buildCycleTableCsv`, and added Vitest golden snapshots across 3 fixture patients.
  - **Cycle tab & store/UI integration** (`app/store.ts`, `locales/en.json`, `ui/screens/CycleScreen.tsx`, `ui/screens/TodayScreen.tsx`, `ui/screens/OnboardingScreen.tsx`, `ui/components/DoctorFileSheet.tsx`, `ui/App.tsx`, `tests/ui/step3App.test.tsx`): built text-first Cycle screen (Fraunces 44 confidence meter, measured count, plain-word ranges, 21-day text strip, browsable month calendar, lead-in pattern status, `"Add earlier periods"`, manual start-fresh baseline), Today one-line forecast notice, CSV downloads in Doctor file sheet, and `axe-core` UI verification across themes.

## Approved design-freeze additions and medical interpretations (unreviewed)
1. **Data model additions** (`core/model/types.ts`): `'shoulder-tip'` `PainSite`, `pregnancyChance`, `stoolBlood`, `'unsure'` `reliefHelped`, `weightChange`, and `dangerAnswered?: boolean`.
2. **Clinical guardrails & interpretations (`unreviewed`)**:
   - Fever without measured temperature (`RED-06`, `RED-07`), lower-belly pain mapping (`RED-04`, `RED-05`, `RED-07`), `ORG-01` > 7 logged bleeding days, neutral-only `RED-04` guardrail, and `ORG-12` back-passage stool blood prompting remain marked `unreviewed` in `docs/clinical-review.md` and `docs/source-check.md`.
   - **`YEL-02` & `ORG-14` Law 1 coverage fix (`changed`, `unreviewed`, `Std`)**: Extended `YEL-02` and `ORG-14` to `pain >= 4` (`Std` unreviewed safety-preserving fix) pending clinical sign-off on pain of 8+ with no pain medicine tried.

## Deviations from SPEC.md and why
- **Git branch name**: Working on session branch `arena/14847b8b-moonroot` rather than feature branches because this Arena session is locked to `arena/14847b8b-moonroot`.
- **GitHub Pages**: Automatic Pages deployment is deferred while repository `x7en/Moonroot` is private; `.github/workflows/ci.yml` already builds with `VITE_BASE: /Moonroot/` and uploads the `dist/` artifact.
- **Playwright in local sandbox**: Local sandbox outbound allowlist permits `registry.npmjs.org` and `github.com` but not Playwright browser CDN downloads; Playwright + axe browser verification runs in GitHub Actions CI, while Vitest + jsdom + `fake-indexeddb` + `axe-core` ran locally.
- **`YEL-02` & `ORG-14` pain upper cap removed (`4+` instead of `4–7`)**: Required to satisfy exhaustive `Law 1` for `pain >= 8` with `reliefHelped = 'none-taken'`, marked `(changed)` / `unreviewed` / `Std` pending clinical sign-off.

## Release 1 Gate Verification (Steps 1–3)
- **Simulation Gate**: `npm run sim` — all 6 acceptance criteria passed across 3 x 450 synthetic people x 16 cycles + real/random lead-in simulations.
- **Rules & Case Cards Export**: `npm run rules:export` — `docs/clinical-review.md` and `docs/case-cards.md` up to date.
- **Typecheck**: `tsc -p tsconfig.core.json --noEmit && tsc -p tsconfig.json --noEmit` — passed (0 errors).
- **Lint & Guardrails**: `eslint .`, `depcruise`, `lint:copy` — passed (0 violations).
- **Tests & Coverage**: `vitest run --coverage` — 100% Lines and 100% Functions across `core/triage/**`, `core/cycles/**`, and `core/predict/**`; golden snapshots + Step 1–3 `axe-core` UI tests passed.
- **Build**: `npm run build` — passed.

## What is left (Release 2 — Steps 4 to 7)
- Step 4: Body tab, lifestyle pattern tests, and ovulation tracking (`core/ovulation`, `core/body`).
- Step 5: Companion sprout SVG (`ui/companion/Sprout.tsx`), rings, badges, and theme unlocks.
- Step 6: Graphs screen, Ask your record (`core/ask`), Urdu RTL (`ur.json`), and Android Capacitor shell.
- Step 7: Final clinical review completion, Playwright real-browser E2E + screenshots, and release signing.

NEXT ACTION: Release 1 complete. Awaiting real-world usage data before starting Step 4.
