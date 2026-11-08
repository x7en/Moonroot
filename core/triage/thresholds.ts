import type { PainSite } from '../model/types';

/**
 * All numeric and categorical thresholds for Moonroot triage rules.
 * Thresholds live ONLY in core/triage.
 * Do not invent, round, or alter any medical number without updating SPEC.md and clinical review.
 */
export const THRESHOLDS = {
  // Bleeding & flow thresholds
  SOAKING_CONSECUTIVE_HOURS_MIN: 2, // RED-01: >= 1 product/hr for >= 2 hours
  CLOT_LARGE_CM: 2.5, // ORG-02: clots bigger than ~2.5 cm (coin)
  PERIOD_DURATION_DAYS_MAX_BEFORE_ORANGE: 7, // ORG-01: > 7 known bleeding days
  HEAVY_FLOW_ANEMIA_DAYS_MIN: 2, // ORG-10: >= 2 heavy flow days with systemic signs

  // Pain thresholds (0-10 scale)
  ANY_PAIN_MIN: 1, // RED-04, RED-05, RED-07 (user decision #3, unreviewed)
  PAIN_FOLLOWUP_MIN: 4, // Pain >= 4 trigger, RED-10, ORG-14, YEL-02
  PAIN_MODERATE_MAX: 7, // ORG-14, YEL-02 (4 to 7)
  SEVERE_EPISODE_PAIN_MIN: 7, // ORG-09: >= 7 or stopped normal activities
  SEVERE_PAIN_MIN: 8, // RED-03, RED-08: >= 8

  // Temperature thresholds (°C)
  TSS_FEVER_C_MIN: 39, // RED-06: >= 39 °C (or felt feverish without measured temp)
  INFECTION_FEVER_C_MIN: 38, // RED-07: >= 38 °C (or felt feverish without measured temp)

  // Spotting & bleeding between periods / after sex
  SPOTTING_WATCH_DAYS_MIN: 3, // YEL-01: 3 to 6 days in a row
  SPOTTING_WATCH_DAYS_MAX: 6,
  SPOTTING_PROLONGED_DAYS_MIN: 7, // ORG-08: 7 or more days in a row
  INTERMENSTRUAL_FOLLOWUP_DAYS: 14, // ORG-07: not followed by flow within 14 days
  INTERMENSTRUAL_WINDOW_DAYS: 90, // ORG-07: 3 months
  INTERMENSTRUAL_COUNT_MIN: 2, // ORG-07: 2 or more times in 3 months
  BLEEDING_AFTER_SEX_WINDOW_DAYS: 90, // ORG-06: 3 months
  BLEEDING_AFTER_SEX_COUNT_MIN: 2, // ORG-06: 2 or more times without pain (or once with pain)

  // Cycle lengths & intervals (days)
  VALID_CYCLE_MIN_DAYS: 10, // Cycle derivation validity lower bound
  VALID_CYCLE_MAX_DAYS: 200, // Cycle derivation validity upper bound
  CYCLE_SHORT_DAYS_LT: 21, // ORG-04, YEL-04, STD-02: < 21 days
  CYCLE_LONG_ADULT_DAYS_GT: 38, // ORG-05, YEL-04, STD-02: > 38 days (>= 3y post-menarche or unknown)
  CYCLE_LONG_ADOLESCENT_DAYS_GT: 45, // ORG-05, YEL-04, STD-02: > 45 days (< 3y post-menarche)
  POST_MENARCHE_ADOLESCENT_YEARS_LT: 3, // < 3 years since first period
  AMENORRHEA_DAYS_MIN: 90, // ORG-03, STD-04: >= 90 days since last period start
  RECENT_CYCLES_WINDOW: 3, // ORG-04, ORG-05, ORG-09, STD-05: last 3 cycles/periods
  RECENT_CYCLES_TRIGGER_COUNT: 2, // 2 of the last 3

  // Pregnancy test & stool blood
  PREG_TEST_RISK_DAYS_MIN: 21, // YEL-03: >= 21 days since risk event
  PREG_TEST_CYCLE_FALLBACK_DAYS: 35, // YEL-03: min(35, medianCycle + 7)
  PREG_TEST_MEDIAN_OFFSET_DAYS: 7, // YEL-03
  PREG_TEST_RECENT_NEGATIVE_DAYS: 14, // YEL-03: no negative test in last 14 days
  NEGATIVE_TEST_RETEST_DAYS_MIN: 7, // YEL-06: repeat test 7+ days after negative test
  NEGATIVE_TEST_DOCTOR_DAYS_MIN: 14, // ORG-13: 14+ days after negative test
  STOOL_BLOOD_DAYS_GT: 2, // ORG-12: > 2 days during period, or any back-passage blood outside period
  DISCHARGE_FOLLOWUP_HOURS: 72, // ORG-15: still present at 72-hour check

  // Standing flags
  STANDING_VARIATION_CYCLES_COUNT: 6, // STD-01, STD-02: last 6 cycles
  STANDING_VARIATION_RANGE_DAYS_GT: 9, // STD-01: longest minus shortest > 9 days
  STANDING_OUTSIDE_BAND_COUNT_MIN: 3, // STD-02: 3 or more of last 6 cycles
  STANDING_YEAR_DAYS: 365, // STD-03, STD-04: last 12 months
  STANDING_PERIODS_PER_YEAR_LT: 9, // STD-03: fewer than 9 periods in 12 months
  STANDING_VARIABILITY_MIN_CYCLES: 8, // STD-07: >= 8 cycles logged
  STANDING_VARIABILITY_S_BELOW: 0.35, // STD-07: consistency S < 0.35

  // Age & watch-list limits
  ADULT_AGE_MIN: 18, // Under 18 or unknown uses neutral pregnancy question + parent/nurse note
  WATCH_LIST_MAX_HOURS: 72,
  WATCH_LIST_MAX_CHECKS: 3,
} as const;

export const LOWER_BELLY_PAIN_SITES: readonly PainSite[] = [
  'lower-middle',
  'left',
  'right',
  'whole-belly',
] as const;

export const ONE_SIDED_PAIN_SITES: readonly PainSite[] = ['left', 'right'] as const;

export const ECTOPIC_PAIN_SITES: readonly PainSite[] = [
  'left',
  'right',
  'shoulder-tip',
] as const;
