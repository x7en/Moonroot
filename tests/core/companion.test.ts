import { describe, expect, it } from 'vitest';
import {
  ALWAYS_AVAILABLE_THEMES,
  BADGE_DEFINITIONS,
  STAGE_DEFINITIONS,
  TAP_MESSAGES,
  THEME_CATALOGUE,
  awardCompanionRing,
  buildWeeklyReviewSummary,
  canUseTheme,
  deriveSproutMood,
  getStageDefinition,
  isSundayEvening,
  pickTapMessage,
  reconcileCompanionState,
  stageForRings,
  weekdayFromDateKey,
} from '../../core/companion/companion';
import { addDays } from '../../core/model/dates';
import type { BodyLog, CompanionState, DayLog } from '../../core/model/types';

function makeCompanion(overrides: Partial<CompanionState> = {}): CompanionState {
  return {
    rings: 0,
    stage: 0,
    unlocked: ['dusk', 'dawn', 'high-contrast'],
    badges: [],
    lastRingDate: null,
    ...overrides,
  };
}

function makeDay(date: string, flow: DayLog['flow'] = 'none'): DayLog {
  return {
    date,
    filledFrom: 'live',
    flow,
    pain: { level: 0, sites: [] },
    symptoms: [],
    danger: [],
    dangerAnswered: true,
    note: '',
    updatedAt: `${date}T19:00:00+05:00`,
  };
}

function makeBody(date: string): BodyLog {
  return {
    date,
    water: { ml: 1500 },
    updatedAt: `${date}T19:00:00+05:00`,
  };
}

describe('core/companion/companion', () => {
  it('maps the 7 stages cleanly and reaches stage 6 (Moonflower) in 75 days at 2 rings/day', () => {
    expect(STAGE_DEFINITIONS.map((s) => [s.stage, s.name, s.minRings])).toEqual([
      [0, 'Seed', 0],
      [1, 'Sprout', 3],
      [2, 'Seedling', 10],
      [3, 'Young plant', 25],
      [4, 'Budding', 50],
      [5, 'Blooming', 90],
      [6, 'Moonflower', 150],
    ]);

    expect(stageForRings(0)).toBe(0);
    expect(stageForRings(2)).toBe(0);
    expect(stageForRings(3)).toBe(1);
    expect(stageForRings(9)).toBe(1);
    expect(stageForRings(10)).toBe(2);
    expect(stageForRings(24)).toBe(2);
    expect(stageForRings(25)).toBe(3);
    expect(stageForRings(49)).toBe(3);
    expect(stageForRings(50)).toBe(4);
    expect(stageForRings(89)).toBe(4);
    expect(stageForRings(90)).toBe(5);
    expect(stageForRings(149)).toBe(5);
    expect(stageForRings(150)).toBe(6);
    expect(getStageDefinition(6).name).toBe('Moonflower');

    let state = makeCompanion();
    for (let day = 0; day < 75; day += 1) {
      const date = addDays('2026-08-01', day);
      state = awardCompanionRing(state, 'checkin', date).next;
      state = awardCompanionRing(state, 'body', date).next;
    }
    expect(state.rings).toBe(150);
    expect(state.stage).toBe(6);
    expect(state.unlocked).toContain('meadow');
    expect(state.unlocked).toContain('ocean');
    expect(state.unlocked).toContain('rose');
    expect(state.unlocked).toContain('midnight');
  });

  it('enforces +1 per distinct source and hard-caps daily rings at 2 per calendar day', () => {
    let state = makeCompanion();
    const today = '2026-11-08';

    // 1. Check-in (even with flow: 'none' or 'unsure') -> +1
    const r1 = awardCompanionRing(state, 'checkin', today);
    expect(r1.awarded).toBe(1);
    expect(r1.next.rings).toBe(1);
    state = r1.next;

    // Repeated check-in same day -> +0
    const r1Repeat = awardCompanionRing(state, 'checkin', today);
    expect(r1Repeat.awarded).toBe(0);
    expect(r1Repeat.next.rings).toBe(1);

    // 2. Body log same day -> +1 (total 2)
    const r2 = awardCompanionRing(state, 'body', today);
    expect(r2.awarded).toBe(1);
    expect(r2.next.rings).toBe(2);
    state = r2.next;

    // 3. Follow-up & weekly review same day -> capped at 2!
    const r3 = awardCompanionRing(state, 'followup', today);
    expect(r3.awarded).toBe(0);
    expect(r3.next.rings).toBe(2);

    const r4 = awardCompanionRing(r3.next, 'weekly-review', today);
    expect(r4.awarded).toBe(0);
    expect(r4.next.rings).toBe(2);

    // Next calendar day unlocks fresh daily cap of 2 and promotes stage 0 -> 1 at 3 rings
    const tomorrow = '2026-11-09';
    const nextDay = awardCompanionRing(r4.next, 'checkin', tomorrow);
    expect(nextDay.awarded).toBe(1);
    expect(nextDay.next.rings).toBe(3);
    expect(nextDay.next.stage).toBe(1);
    expect(nextDay.stageChanged).toBe(true);
  });

  it('never decreases rings, lowers stage, revokes badges, or locks unlocked themes', () => {
    const rich = makeCompanion({
      rings: 55,
      stage: 4,
      unlocked: ['dusk', 'dawn', 'high-contrast', 'meadow', 'ocean'],
      badges: ['first-light', 'three-this-week', 'body-scan'],
      lastRingDate: '2026-10-01',
      lastCheckInDate: '2026-10-01',
    });

    // Even after deleting logs / passing empty snapshot 30 days later, nothing drops
    const reconciled = reconcileCompanionState({
      companion: rich,
      today: '2026-11-01',
      dayLogs: [],
      bodyLogs: [],
      completedCycleCount: 0,
      hasPattern: false,
      meta: {
        lastExportAt: null,
        lastAutoBackupAt: null,
        snoozedUntil: null,
        passphraseAsked: false,
      },
    });

    expect(reconciled.rings).toBe(55);
    expect(reconciled.stage).toBe(4);
    expect(reconciled.unlocked).toEqual(expect.arrayContaining(['dusk', 'dawn', 'high-contrast', 'meadow', 'ocean']));
    expect(reconciled.badges).toEqual(expect.arrayContaining(['first-light', 'three-this-week', 'body-scan']));
  });

  it('derives all 4 sprout moods (calm, bright, sleepy, welcome) accurately without wilting', () => {
    // Default new user -> calm
    expect(
      deriveSproutMood({
        today: '2026-11-08',
        dayLogs: [],
        companion: makeCompanion(),
      }),
    ).toBe('calm');

    // Checked in today without sleepy trigger -> bright
    expect(
      deriveSproutMood({
        today: '2026-11-08',
        dayLogs: [makeDay('2026-11-08', 'unsure')],
        companion: makeCompanion({ lastCheckInDate: '2026-11-08' }),
      }),
    ).toBe('bright');

    // Checked in 1 or 2 days ago, not today -> calm
    expect(
      deriveSproutMood({
        today: '2026-11-08',
        dayLogs: [makeDay('2026-11-06')],
        companion: makeCompanion({ lastCheckInDate: '2026-11-06' }),
      }),
    ).toBe('calm');

    // 3 or more days away -> sleepy
    expect(
      deriveSproutMood({
        today: '2026-11-08',
        dayLogs: [makeDay('2026-11-05')],
        companion: makeCompanion({ lastCheckInDate: '2026-11-05' }),
      }),
    ).toBe('sleepy');

    // First check-in back after 3+ days -> awardCompanionRing sets welcomeDate -> welcome
    const sleepyState = makeCompanion({
      rings: 4,
      stage: 1,
      lastCheckInDate: '2026-11-04',
    });
    const back = awardCompanionRing(sleepyState, 'checkin', '2026-11-08');
    expect(back.next.welcomeDate).toBe('2026-11-08');
    expect(
      deriveSproutMood({
        today: '2026-11-08',
        dayLogs: [makeDay('2026-11-04'), makeDay('2026-11-08')],
        companion: back.next,
      }),
    ).toBe('welcome');

    // Day after welcome -> normal bright check-in
    const dayAfter = awardCompanionRing(back.next, 'checkin', '2026-11-09');
    expect(
      deriveSproutMood({
        today: '2026-11-09',
        dayLogs: [makeDay('2026-11-04'), makeDay('2026-11-08'), makeDay('2026-11-09')],
        companion: dayAfter.next,
      }),
    ).toBe('bright');
  });

  it('keeps accessibility themes unlocked at stage 0 and unlocks cosmetic themes at stages 3..6', () => {
    const s0 = makeCompanion({ rings: 0, stage: 0 });
    for (const t of ALWAYS_AVAILABLE_THEMES) {
      expect(canUseTheme(t, s0)).toBe(true);
    }
    expect(canUseTheme('auto', s0)).toBe(true);
    expect(canUseTheme('meadow', s0)).toBe(false);
    expect(canUseTheme('ocean', s0)).toBe(false);
    expect(canUseTheme('rose', s0)).toBe(false);
    expect(canUseTheme('midnight', s0)).toBe(false);

    expect(THEME_CATALOGUE.filter((t) => !t.alwaysAvailable).map((t) => [t.id, t.requiredStage])).toEqual([
      ['meadow', 3],
      ['ocean', 4],
      ['rose', 5],
      ['midnight', 6],
    ]);
  });

  it('earns all 8 permanent badges when criteria are met', () => {
    expect(BADGE_DEFINITIONS).toHaveLength(8);
    const days: DayLog[] = [];
    for (let i = 0; i < 30; i += 1) {
      days.push(makeDay(addDays('2026-10-01', i), i % 3 === 0 ? 'light' : 'none'));
    }
    const bodies: BodyLog[] = [0, 1, 2, 3, 4].map((i) => makeBody(addDays('2026-10-20', i)));

    const reconciled = reconcileCompanionState({
      companion: makeCompanion({ doctorFileCreated: true }),
      today: '2026-11-08',
      dayLogs: days,
      bodyLogs: bodies,
      completedCycleCount: 1,
      hasPattern: true,
      meta: {
        lastExportAt: '2026-11-02T10:00:00+05:00',
        lastAutoBackupAt: null,
        snoozedUntil: null,
        passphraseAsked: true,
      },
    });

    expect(reconciled.badges).toEqual(
      expect.arrayContaining([
        'first-light',
        'three-this-week',
        'first-full-cycle',
        'record-keeper',
        'backed-up',
        'body-scan',
        'pattern-found',
        'steady-roots',
      ]),
    );
  });

  it('computes Sunday evening weekly review availability and summary cleanly', () => {
    // 2026-11-08 is Sunday
    expect(weekdayFromDateKey('2026-11-08')).toBe(0);
    expect(weekdayFromDateKey('2026-11-09')).toBe(1);
    expect(isSundayEvening('2026-11-08', '2026-11-08T18:30:00+05:00')).toBe(true);
    expect(isSundayEvening('2026-11-08', '2026-11-08T15:59:00+05:00')).toBe(false);
    expect(isSundayEvening('2026-11-07', '2026-11-07T20:00:00+05:00')).toBe(false);

    const summary = buildWeeklyReviewSummary({
      today: '2026-11-08',
      dayLogs: [makeDay('2026-11-02'), makeDay('2026-11-05'), makeDay('2026-11-08')],
      companion: makeCompanion({ lastWeeklyConfidence: 22 }),
      confidenceScore: 34,
      patternText: 'On days after under 6 hours of sleep, cramps were rated 2 points higher.',
    });

    expect(summary.daysCheckedInThisWeek).toBe(3);
    expect(summary.confidenceDelta).toBe(12);
    expect(summary.patternText).toContain('sleep');
  });

  it('keeps tap messages gentle and free of health or shame wording', () => {
    expect(TAP_MESSAGES.length).toBeGreaterThanOrEqual(4);
    for (const msg of TAP_MESSAGES) {
      expect(msg).not.toMatch(/\b(period|flow|pain|cramp|cycle|doctor|missed|streak|lost|late|failed)\b/i);
    }
    expect(pickTapMessage(0)).toBe(TAP_MESSAGES[0]);
    expect(pickTapMessage(TAP_MESSAGES.length)).toBe(TAP_MESSAGES[0]);
  });
});
