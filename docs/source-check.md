# Moonroot Clinical Source & Threshold Check

- **Ruleset version**: `1.0`
- **Status summary**: **All lines marked `not checked`** — none of the primary guidelines or external reference URLs could be opened in the isolated build sandbox (outbound internet is restricted to package registries and GitHub), and every `Std`, `(new)`, `(changed)`, or `(user-decision)` row awaits formal clinical review before Moonroot leaves a personal circle.
- **Reviewer instruction**: Verify each primary threshold below against its cited guideline (ACOG Committee Opinion No. 651, FIGO 2018 PALM-COEIN / Munro et al., NICE NG88, NHS ectopic pregnancy, NI Direct TSS, MSD/Merck, and local Rescue 1122 / Edhi sources) and mark each line `verified`, `not found`, or `conflicting`.

## Primary & Secondary External Reference Status

| Source | Target Document / URL | Status | Notes |
| --- | --- | --- | --- |
| ACOG primary | ACOG Committee Opinion No. 651 (*Menstruation in Girls and Adolescents: Using the Menstrual Cycle as a Vital Sign*) | `not checked` | Primary opinion not opened in sandbox; secondary summaries cited in `SPEC.md` must be checked directly. |
| FIGO 2018 primary | Munro et al., *International Journal of Gynecology & Obstetrics* (2018) | `not checked` | Primary paper not opened in sandbox; numbers taken from `SPEC.md` summary of MSD Manual table. |
| NICE NG88 primary | NICE guideline NG88 (*Heavy menstrual bleeding: assessment and management*) | `not checked` | Primary guideline not opened in sandbox. |
| Secondary ACOG / FIGO / Merck / NHS / NI Direct / Healthline web pages | Contemporary OB/GYN, MDedge, MSD Manual, NHS 111 Wales, NHS ectopic, NI Direct TSS, Healthline | `not checked` | Outbound HTTP to external medical domains disabled in sandbox; clinical reviewer must confirm primary documents. |
| Pakistan Emergency Numbers | Rescue `1122` and Edhi `115` (Karachi, Islamabad, Lahore, Quetta, Peshawar) | `not checked` | Confirm active dispatch numbers for the user's city against official local government / Rescue 1122 sources before release. |
| Pakistan Mental-Health Line | `regions.json` -> `PK.mentalHealthLine` (`""`) | `not checked` | Left empty intentionally per `SPEC.md` until a local mental-health helpline is verified directly. |

## Threshold-by-Threshold Verification Log (`core/triage/thresholds.ts`)

| Rule / Engine | Field / Constant | Threshold Value | Source Key | Status | Verification Note |
| --- | --- | --- | --- | --- | --- |
| `RED-01` | `SOAKING_CONSECUTIVE_HOURS_MIN` | `>= 1` product/hr for `>= 2` consecutive hours | ACOG, Healthline | `not checked` | Confirm exact soaking rate & consecutive hour criteria against primary ACOG/NICE guidance. |
| `RED-02` | `flow` + shock/cardiorespiratory danger signs | `medium` or `heavy` flow with `dizzy`, `fainted`, `short-of-breath`, or `chest-pain` | Healthline | `not checked` | Confirm against emergency triage / primary HMB red-flag guidance. |
| `RED-03` | `SEVERE_PAIN_MIN` + sudden + danger | sudden belly pain `>= 8/10` with `dizzy`, `fainted`, `nausea`, or `very-pale` | NHS ectopic | `not checked` | Confirm against NHS ectopic red-flag wording. |
| `RED-04` | `ANY_PAIN_MIN` + site/bleeding + pregnancy | pain `>= 1/10` with one-sided/shoulder-tip pain or bleeding/brown discharge when pregnancy possible/positive | NHS ectopic, `Std` (`user-decision`) | `not checked` | `pain >= 1`, `shoulder-tip` site, and cautious neutral hold on `prefer-not-to-say` are unreviewed `Std` decisions. |
| `RED-05` | Positive pregnancy test + pain/bleeding | positive test with bleeding or pain `>= 1/10` | NHS ectopic, `Std` | `not checked` | Confirm `pain >= 1` threshold with clinician. |
| `RED-06` | `TSS_FEVER_C_MIN` + tampon/cup | tampon/cup + fever `>= 39 °C` (or `felt: true` fallback) or rash/GI/neuro danger signs | NI Direct TSS, `Std` | `not checked` | Confirm against NI Direct TSS guidance and confirm whether menstrual `disc` should also be included. |
| `RED-07` | `INFECTION_FEVER_C_MIN` + belly pain or discharge | fever `>= 38 °C` (or `felt: true` fallback) + lower belly pain (`>= 1`) or smelly/yellow-green discharge | `Std` | `not checked` | Standard practice threshold; clinician confirmation required. |
| `RED-08` | `SEVERE_PAIN_MIN` + `reliefHelped` | pain `>= 8/10` with `reliefHelped` = `no` or `unsure` | `Std` | `not checked` | Standard practice; open clinical decision required for pain `>= 8` when `reliefHelped = 'none-taken'`. |
| `RED-09` | Catch-all acute danger signs (`new`) | any of `fainted`, `chest-pain`, `short-of-breath`, `confused` regardless of flow/pain | `Std` | `not checked` | Added 8 Nov 2026 (`Std`); confirm scope of safety-net signs in clinical review. |
| `RED-10` | `PAIN_FOLLOWUP_MIN` + sudden one-sided + vomiting (`new`) | sudden `left`/`right` pain `>= 4/10` with `vomiting` | `Std` | `not checked` | Added 8 Nov 2026 (`Std`); confirm threshold in clinical review. |
| `RED-11` | Oestrogen hormone + VTE/neuro signs (`new`) | oestrogen-containing hormone + `leg-pain-or-swelling`, `severe-headache`, or `vision-change` | `Std` | `not checked` | Added 8 Nov 2026 (`Std`); confirm sign wording and hormone-group inclusion. |
| `ORG-01` | `PERIOD_DURATION_DAYS_MAX_BEFORE_ORANGE` | `> 7` known logged bleeding days in one period | ACOG, NHS Wales, `Std` | `not checked` | Confirm primary source and confirm whether extreme duration becomes Red. |
| `ORG-02` | `CLOT_LARGE_CM` & heavy signs | soaking `> 1` every `1-2h`, two products at once, flooding, or clots `> ~2.5 cm` | ACOG, NHS Wales, FIGO | `not checked` | Primary ACOG/FIGO/NHS sources not opened in sandbox. |
| `ORG-03` | `AMENORRHEA_DAYS_MIN` | `>= 90` days since last period start (remains active after hormone baseline) | ACOG, Merck | `not checked` | Primary ACOG 651 / Merck sources not opened in sandbox. |
| `ORG-04` | `CYCLE_SHORT_DAYS_LT` (`RECENT_CYCLES_TRIGGER_COUNT`/`WINDOW`) | `2` of last `3` cycles `< 21` days | ACOG | `not checked` | Primary ACOG 651 source not opened in sandbox. |
| `ORG-05` | `CYCLE_LONG_ADOLESCENT_DAYS_GT` / `CYCLE_LONG_ADULT_DAYS_GT` | `2` of last `3` cycles `> 45` days (`< 3` years post-menarche) or `> 38` days (`>= 3` years or unknown) | ACOG, FIGO | `not checked` | Primary ACOG 651 / FIGO 2018 sources not opened in sandbox. |
| `ORG-06` | `BLEEDING_AFTER_SEX_COUNT_MIN` / `WINDOW_DAYS` | `>= 2` bleeding-after-sex events in `90` days, or `>= 1` with pain | NHS Wales | `not checked` | Primary NHS Wales source not opened in sandbox. |
| `ORG-07` | `INTERMENSTRUAL_FOLLOWUP_DAYS` / `WINDOW_DAYS` / `COUNT_MIN` | `>= 2` spotting events in `90` days not followed by flow within `14` days | NHS Wales | `not checked` | Primary NHS Wales source not opened in sandbox. |
| `ORG-08` | `SPOTTING_PROLONGED_DAYS_MIN` | `>= 7` consecutive days of spotting | `Std` | `not checked` | Standard practice threshold awaiting clinician sign-off. |
| `ORG-09` | `SEVERE_EPISODE_PAIN_MIN` | pain `>= 7/10` or `stoppedActivities` in `2` of last `3` periods | NHS Wales | `not checked` | Primary NHS Wales source not opened in sandbox. |
| `ORG-10` | `HEAVY_FLOW_ANEMIA_DAYS_MIN` | `>= 2` heavy days with `unusual-tiredness`, `very-pale`, or `breathless-on-effort` | NHS Wales | `not checked` | Primary NHS Wales source not opened in sandbox. |
| `ORG-11` | Positive test without bleeding or pain | positive pregnancy test + `flow` not bleeding + `pain === 0` | `Std` | `not checked` | Standard practice rule awaiting clinician sign-off. |
| `ORG-12` | `STOOL_BLOOD_DAYS_GT` | `back-passage` blood outside a period, or `> 2` days during a period | `Std` | `not checked` | Standard practice rule; `unsure` intentionally does not fire `ORG-12` alone. |
| `ORG-13` | `NEGATIVE_TEST_DOCTOR_DAYS_MIN` | `>= 14` days after negative test with no period when pregnancy possible | `Std` | `not checked` | Standard practice interval awaiting clinician sign-off. |
| `ORG-14` | `PAIN_FOLLOWUP_MIN` + dizziness/nausea/pale (`changed`) | pain `>= 4/10` with `dizzy`, `nausea`, or `very-pale` and `flow === 'none'` | `Std` | `not checked` | Temporary `Std` Law 1 fix removed upper limit `7`; clinician must confirm level for pain `>= 8` when `reliefHelped = 'none-taken'`. |
| `ORG-15` | `DISCHARGE_FOLLOWUP_HOURS` (`new`) | smelly or yellow-green discharge still present (`yes`) at `72h` check | `Std` | `not checked` | Added 8 Nov 2026 (`Std`); confirm 72-hour escalation interval. |
| `YEL-01` | `SPOTTING_WATCH_DAYS_MIN..MAX` | `3` to `6` consecutive days of spotting | `Std` | `not checked` | Standard practice threshold awaiting clinician sign-off. |
| `YEL-02` | `PAIN_FOLLOWUP_MIN` (`changed`) | pain/cramps `>= 4/10` with `flow === 'none'` | `Std` | `not checked` | Temporary `Std` Law 1 fix removed upper limit `7` and allows co-occurring non-red signs; clinician must confirm pain `>= 8` with `none-taken`. |
| `YEL-03` | `PREG_TEST_RISK_DAYS_MIN`, `CYCLE_FALLBACK_DAYS`, `RECENT_NEGATIVE_DAYS` | `>= 21` days since risk event, `>= min(35, median + 7)` days since period start, no negative test in `14` days | `Std` | `not checked` | `21`-day post-risk interval explicitly flagged in `SPEC.md` for clinical review. |
| `YEL-04` | Short/long single cycle | `1` cycle `< 21` days or `>` upper age band (`45` / `38`) | ACOG, FIGO | `not checked` | Primary ACOG 651 / FIGO 2018 sources not opened in sandbox. |
| `YEL-05` | First post-coital spotting without pain | `1` bleeding-after-sex event without pain | NHS Wales | `not checked` | Primary NHS Wales source not opened in sandbox. |
| `YEL-06` | `NEGATIVE_TEST_RETEST_DAYS_MIN` | `>= 7` days after negative test with no period when pregnancy possible | `Std` | `not checked` | Standard practice repeat-test interval awaiting clinician sign-off. |
| `YEL-07` | Moderate-heavy signs below Orange | `changeEvery === '2-3h'` or `clots === 'small'` | NHS Wales | `not checked` | Primary NHS Wales source not opened in sandbox. |
| `YEL-08` | Unchecked smelly/yellow-green discharge (`new`) | `discharge` in `['odour', 'yellow-green']` without fever `>= 38 °C` | `Std` | `not checked` | Added 8 Nov 2026 (`Std`); confirm watch prompt & 72h follow-up. |
| `YEL-09` | Pain during sex without bleeding (`new`) | `intimacy.painDuring === true` without bleeding after (adult only) | `Std` | `not checked` | Added 8 Nov 2026 (`Std`); confirm clinical framing. |
| `GRN-01`..`GRN-04` | Complete day & context reassurance (`GRN-01` `changed`) | All required answers present, no rule above fired, no open event cards (`GRN-01`); context signs (`GRN-04`) | App / `Std` | `not checked` | App-design / `Std` ruleset awaiting clinical review. |
| `STD-01` | `STANDING_VARIATION_CYCLES_COUNT` & `RANGE_DAYS_GT` | Last `6` cycle lengths differ by `> 9` days (`max - min`) | FIGO | `not checked` | Primary FIGO 2018 cycle variation regularity limit (7–9 days) not opened in sandbox. |
| `STD-02` | `STANDING_OUTSIDE_BAND_COUNT_MIN` / `6` | `>= 3` of last `6` cycles outside age band (`< 21` or `> 45`/`> 38`) | ACOG, FIGO | `not checked` | Primary ACOG 651 / FIGO 2018 sources not opened in sandbox. |
| `STD-03` | `STANDING_PERIODS_PER_YEAR_LT` / `STANDING_YEAR_DAYS` | `< 9` periods in `365` days (when logging history spans `>= 365` days) | Merck | `not checked` | Primary MSD/Merck source not opened in sandbox. |
| `STD-04` | `AMENORRHEA_DAYS_MIN` in `365`d | Any gap `>= 90` days in last `365` days | ACOG | `not checked` | Primary ACOG 651 source not opened in sandbox. |
| `STD-05` | Repeated heavy/prolonged/painful periods | `ORG-01`, `ORG-02`, or `ORG-09` in `>= 2` of last `3` periods | ACOG, NHS Wales, FIGO | `not checked` | Primary ACOG / NHS Wales / FIGO sources not opened in sandbox. |
| `STD-06` | Recurring intermenstrual / post-coital bleeding | Recurring intermenstrual spotting (`ORG-07` / `>= 2`) or bleeding after sex (`ORG-06` / `>= 2`) | NHS Wales | `not checked` | Primary NHS Wales source not opened in sandbox. |
| `STD-07` | `STANDING_VARIABILITY_MIN_CYCLES` & `S_BELOW` | `>= 8` cycles logged with consistency `S < 0.35` | App (`This app`) | `not checked` | Internal prediction-confidence calibration threshold; confirm user wording in review. |
| Cycles | `VALID_CYCLE_MIN_DAYS`..`MAX_DAYS`, `WATCH_LIST_MAX_HOURS`/`CHECKS`, `ADULT_AGE_MIN` | `10..200` valid cycle days; `72`h / max `3` watch checks; adult `>= 18` | App / `Std` | `not checked` | App-design / legal safety defaults awaiting clinical review. |
