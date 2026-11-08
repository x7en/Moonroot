# Moonroot Progress

## Current phase
Step 2 — Check-in intelligence complete (awaiting your **go** for Step 3: Predictions)

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

## Approved design-freeze additions and medical interpretations (unreviewed)
1. **Data model additions** (`core/model/types.ts`): `'shoulder-tip'` `PainSite`, `pregnancyChance`, `stoolBlood`, `'unsure'` `reliefHelped`, `weightChange`, and `dangerAnswered?: boolean`.
2. **Clinical guardrails & interpretations (`unreviewed`)**:
   - Fever without measured temperature (`RED-06`, `RED-07`), lower-belly pain mapping (`RED-04`, `RED-05`, `RED-07`), `ORG-01` > 7 logged bleeding days, neutral-only `RED-04` guardrail, and `ORG-12` back-passage stool blood prompting remain marked `unreviewed` in `docs/clinical-review.md` and `docs/source-check.md`.
   - **`YEL-02` & `ORG-14` Law 1 coverage fix (`changed`, `unreviewed`, `Std`)**: Exhaustive Law 1 (`pain 0..10` every non-excluded combination matches a rule) found that severe pain (`8–10`) with no flow, no sudden onset, no one-sided site, and no pain medicine tried (`none-taken`) previously fell outside `YEL-02` (`4–7`) and `ORG-14` (`4–7`). Per user ruling, both `YEL-02` and `ORG-14` were temporarily extended from `4–7` to `pain >= 4` (`Std` unreviewed safety-preserving fix; `CASE-33` updated to Yellow/`YEL-02` and `CASE-39` updated to Orange/`ORG-14`), while noting in `docs/clinical-review.md` and `docs/source-check.md` that **pain of 8 or more with no pain medicine tried needs a clinician-selected level** (`YEL-02`/`ORG-14` vs higher).

## Deviations from SPEC.md and why
- **Git branch name**: Working on session branch `arena/14847b8b-moonroot` rather than `step-1-record` / `step-2-triage` because this Arena session is locked to `arena/14847b8b-moonroot`.
- **GitHub Pages**: Automatic Pages deployment is deferred while repository `x7en/Moonroot` is private; `.github/workflows/ci.yml` already builds with `VITE_BASE: /Moonroot/` and uploads the `dist/` artifact.
- **Playwright in local sandbox**: Local sandbox outbound allowlist permits `registry.npmjs.org` and `github.com` but not Playwright browser CDN downloads; Playwright + axe browser verification will run in GitHub Actions CI, while Vitest + jsdom + `fake-indexeddb` + `axe-core` ran locally.
- **`YEL-02` & `ORG-14` pain upper cap removed (`4+` instead of `4–7`)**: Required to satisfy exhaustive `Law 1` for `pain >= 8` with `reliefHelped = 'none-taken'` without silently fabricating a new rule; marked `(changed)` / `unreviewed` / `Std` pending clinical sign-off.

## Step 2 Gate Verification
- **Rules & Case Cards Export**: `npm run rules:export` — synced `docs/clinical-review.md` and `docs/case-cards.md`.
- **Typecheck**: `tsc -p tsconfig.core.json --noEmit && tsc -p tsconfig.json --noEmit` — passed (0 errors).
- **Lint & Guardrails**: `eslint .`, `depcruise` (70 modules, 215 dependencies, 0 violations), `lint:copy` (0 violations) — passed.
- **Tests & Coverage**: `vitest run --coverage` — **14/14 test files, 202/202 tests passed**, including all 42 case cards, 112 boundary tests, 5 exhaustive law suites, 5 workflow/1,800-day speed tests, Step 2 Doctor file tests, and Step 1 & Step 2 `axe-core` UI flows; coverage on `core/cycles/**` and `core/triage/**` reached **100% Lines / 100% Functions** (`99.75%` Stmts, `95.31%` Branches).
- **Build**: `npm run build` (`tsc -p tsconfig.build.json` + `vite build`) — passed (`14` PWA precache entries, `295.59 KiB` total).

## What is left
- Step 3 (Predictions): cycle forecasting (`forecasting.ts`), typical window + irregular range bands, `"Why this window"`, period-late calm handling, forecast accuracy calibration, and Today + Record timeline predictions.
- Step 4 (Body & Growth companion): Body metrics + daily ring/companion sprout state machine.
- Step 5 (Localisation): Urdu / Roman Urdu + RTL pass & native review prep.
- Step 6 (Native Android): Capacitor wrapper + Android APK build.
- Step 7 (Launch readiness): Final full-device & accessibility sign-off.

NEXT ACTION: Review the Step 2 preview and clinical review items (`docs/clinical-review.md` & `docs/source-check.md`), then say "go" when ready to begin Step 3 (Predictions).
