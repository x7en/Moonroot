import { describe, expect, it } from 'vitest';
import type { DayLog, MedicineEntry, Profile } from '../../core/model/types';
import {
  getActiveQuestionFlows,
  getVisibleDangerSigns,
  isDangerScreenRequired,
} from '../../core/triage/flowEngine';
import { getCatchUpDays } from '../../core/triage/catchUp';

const ADULT_PROFILE: Pick<
  Profile,
  'birthYear' | 'onHormones' | 'contraception' | 'sexualHealthQuestions' | 'intimacy'
> = {
  birthYear: 2002,
  onHormones: false,
  contraception: 'none',
  sexualHealthQuestions: 'when-relevant',
  intimacy: 'active',
};

const UNDER_18_PROFILE: Pick<
  Profile,
  'birthYear' | 'onHormones' | 'contraception' | 'sexualHealthQuestions' | 'intimacy'
> = {
  ...ADULT_PROFILE,
  birthYear: 2010,
  intimacy: 'prefer-not-to-say',
};

function makeDay(date: string, extra: Partial<DayLog> = {}): DayLog {
  return {
    date,
    filledFrom: 'live',
    flow: 'none',
    symptoms: [],
    danger: [],
    note: '',
    updatedAt: `${date}T12:00:00+05:00`,
    ...extra,
  };
}

describe('Step 2 question flows, oestrogen danger gating, and catch-up', () => {
  it('detects when the danger-sign screen is required', () => {
    expect(isDangerScreenRequired(makeDay('2026-10-30', { flow: 'none', pain: { level: 0, sites: [] } }))).toBe(false);
    expect(isDangerScreenRequired(makeDay('2026-10-30', { flow: 'light', pain: { level: 2, sites: [] } }))).toBe(false);
    expect(isDangerScreenRequired(makeDay('2026-10-30', { flow: 'medium' }))).toBe(true);
    expect(isDangerScreenRequired(makeDay('2026-10-30', { flow: 'heavy' }))).toBe(true);
    expect(isDangerScreenRequired(makeDay('2026-10-30', { flow: 'none', pain: { level: 4, sites: [] } }))).toBe(true);
    expect(isDangerScreenRequired(makeDay('2026-10-30', { flow: 'light', pain: { level: 4, sites: [] } }))).toBe(false);
    expect(isDangerScreenRequired(makeDay('2026-10-30', { fever: { felt: true } }))).toBe(true);
    expect(isDangerScreenRequired(makeDay('2026-10-30', { discharge: 'odour' }))).toBe(true);
    expect(isDangerScreenRequired(makeDay('2026-10-30', { danger: ['dizzy'] }))).toBe(true);
  });

  it('gates the 3 oestrogen danger signs strictly to combined pill or unknown hormone medicine', () => {
    const offSigns = getVisibleDangerSigns(ADULT_PROFILE, []);
    expect(offSigns.some((s) => s.oestrogenOnly)).toBe(false);

    const progestinOnlySigns = getVisibleDangerSigns(
      { ...ADULT_PROFILE, onHormones: true, contraception: 'progestin-pill' },
      ['Progestin-only pill'],
    );
    expect(progestinOnlySigns.some((s) => s.oestrogenOnly)).toBe(false);

    const combinedSigns = getVisibleDangerSigns(
      { ...ADULT_PROFILE, onHormones: true, contraception: 'combined-pill' },
      [],
    );
    expect(combinedSigns.filter((s) => s.oestrogenOnly).map((s) => s.key)).toEqual([
      'leg-pain-or-swelling',
      'severe-headache',
      'vision-change',
    ]);

    const activeHormoneCourseSigns = getVisibleDangerSigns(ADULT_PROFILE, ['Combined pill']);
    expect(activeHormoneCourseSigns.some((s) => s.oestrogenOnly)).toBe(true);
  });

  it('activates spotting questions respecting day 1 vs day 2 and privacy/age gates', () => {
    const day1 = getActiveQuestionFlows({
      today: '2026-10-30',
      profile: ADULT_PROFILE,
      dayLog: makeDay('2026-10-30', { flow: 'spotting' }),
      recentLogs: [makeDay('2026-10-30', { flow: 'spotting' })],
      activeCycleLengths: [28],
      daysSinceLastPeriodStart: 14,
      medicines: [],
      decisions: [],
    });
    const spotFlowDay1 = day1.find((f) => f.triggerId === 'spotting-logged');
    expect(spotFlowDay1?.questions.map((q) => q.id)).toEqual([
      'spot-protection',
      'spot-cramps',
      'spot-pregnancy',
    ]);

    // Day 2 spotting with sexualHealthQuestions=off drops spot-pregnancy and shows spot-more-than-yesterday
    const day2Off = getActiveQuestionFlows({
      today: '2026-10-30',
      profile: { ...ADULT_PROFILE, sexualHealthQuestions: 'off' },
      dayLog: makeDay('2026-10-30', { flow: 'spotting' }),
      recentLogs: [
        makeDay('2026-10-29', { flow: 'spotting' }),
        makeDay('2026-10-30', { flow: 'spotting' }),
      ],
      activeCycleLengths: [28],
      daysSinceLastPeriodStart: 14,
      medicines: [],
      decisions: [],
    });
    const spotFlowDay2 = day2Off.find((f) => f.triggerId === 'spotting-logged');
    expect(spotFlowDay2?.questions.map((q) => q.id)).toEqual([
      'spot-protection',
      'spot-cramps',
      'spot-more-than-yesterday',
    ]);
  });

  it('caps pain-4-plus-no-flow at 4 normally and allows 5th reliefHelped question at pain >= 8', () => {
    const pain5 = getActiveQuestionFlows({
      today: '2026-10-30',
      profile: ADULT_PROFILE,
      dayLog: makeDay('2026-10-30', { flow: 'none', pain: { level: 5, sites: [] } }),
      recentLogs: [],
      activeCycleLengths: [28],
      daysSinceLastPeriodStart: 12,
      medicines: [],
      decisions: [],
    });
    const flow5 = pain5.find((f) => f.triggerId === 'pain-4-plus-no-flow');
    expect(flow5?.questions).toHaveLength(4);
    expect(flow5?.questions.some((q) => q.id === 'pain-relief-helped')).toBe(false);

    const pain8 = getActiveQuestionFlows({
      today: '2026-10-30',
      profile: UNDER_18_PROFILE,
      dayLog: makeDay('2026-10-30', { flow: 'none', pain: { level: 8, sites: [] } }),
      recentLogs: [],
      activeCycleLengths: [28],
      daysSinceLastPeriodStart: 12,
      medicines: [],
      decisions: [],
    });
    const flow8 = pain8.find((f) => f.triggerId === 'pain-4-plus-no-flow');
    // Under-18 still gets neutral pregnancy question when sexualHealthQuestions='when-relevant' and intimacy!='none'
    expect(flow8?.questions).toHaveLength(5);
    expect(flow8?.questions.map((q) => q.id)).toContain('pain-relief-helped');
    expect(flow8?.questions.map((q) => q.id)).toContain('pain-pregnancy');
  });

  it('triggers many-days-no-period at most every 14d, hormone change, fever, discharge, stool blood, and adult-only intimacy', () => {
    const meds: MedicineEntry[] = [
      {
        id: 'h1',
        date: '2026-10-30',
        kind: 'course',
        category: 'hormone',
        nameShown: 'Combined pill',
        genericName: 'combined pill',
        strengthMg: null,
        startDate: '2026-10-30',
        stopDate: null,
        note: '',
        updatedAt: '2026-10-30T09:00:00+05:00',
      },
    ];
    const activeAdult = getActiveQuestionFlows({
      today: '2026-10-30',
      profile: ADULT_PROFILE,
      dayLog: makeDay('2026-10-30', {
        flow: 'heavy',
        fever: { felt: true },
        discharge: 'odour',
        stoolBlood: 'unsure',
        intimacy: { event: 'protected', bleedingAfter: true },
      }),
      recentLogs: [],
      activeCycleLengths: [28, 30, 32, 34],
      daysSinceLastPeriodStart: 40,
      lastNoPeriodQuestionDate: '2026-10-16', // 14 days ago -> shows
      medicines: meds,
      decisions: [],
    });
    expect(activeAdult.map((f) => f.triggerId)).toEqual([
      'medium-or-heavy-flow',
      'many-days-no-period',
      'bleeding-or-pain-after-sex',
      'fever-logged',
      'blood-in-stool',
      'odour-or-yellow-green-discharge',
      'hormone-course-changed',
    ]);

    // Under-18 never sees adult intimacy follow-up; 13d cooldown blocks many-days-no-period; baseline decision satisfies hormone change
    const blockedUnder18 = getActiveQuestionFlows({
      today: '2026-10-30',
      profile: UNDER_18_PROFILE,
      dayLog: makeDay('2026-10-30', {
        flow: 'none',
        intimacy: { event: 'protected', bleedingAfter: true },
      }),
      recentLogs: [],
      activeCycleLengths: [],
      daysSinceLastPeriodStart: 40,
      lastNoPeriodQuestionDate: '2026-10-17', // 13 days ago -> skipped
      medicines: meds,
      decisions: [
        {
          id: 'nb1',
          date: '2026-10-30',
          at: '2026-10-30T09:05:00+05:00',
          kind: 'new-baseline',
        },
      ],
    });
    expect(blockedUnder18).toEqual([]);
  });

  it('computes catch-up days only when 2 or more unlogged days exist, capped at 7 days', () => {
    // Brand new user with 0 prior logs: no catch-up
    expect(getCatchUpDays([], '2026-10-30')).toEqual([]);
    // Missed 0 or 1 day: no catch-up
    expect(getCatchUpDays([makeDay('2026-10-29')], '2026-10-30')).toEqual([]);
    expect(getCatchUpDays([makeDay('2026-10-28')], '2026-10-30')).toEqual([]); // only Oct 29 missed (1 day)
    // Missed 2 days (Oct 28, Oct 29): shows 2 rows
    expect(getCatchUpDays([makeDay('2026-10-27')], '2026-10-30')).toEqual([
      '2026-10-28',
      '2026-10-29',
    ]);
    // Missed 12 days: capped at 7 days ending yesterday
    expect(getCatchUpDays([makeDay('2026-10-01')], '2026-10-30')).toEqual([
      '2026-10-23',
      '2026-10-24',
      '2026-10-25',
      '2026-10-26',
      '2026-10-27',
      '2026-10-28',
      '2026-10-29',
    ]);
  });
});
