import { describe, expect, it } from 'vitest';
import { addDays } from '../../core/model/dates';
import type { DayLog, Decision } from '../../core/model/types';
import { classifyEpisodes } from '../../core/cycles/episodes';
import { deriveCycles } from '../../core/cycles/cycles';

function makeLog(
  date: string,
  flow: DayLog['flow'],
  extra: Partial<DayLog> = {},
): DayLog {
  return {
    date,
    filledFrom: 'live',
    flow,
    symptoms: [],
    danger: [],
    note: '',
    updatedAt: `${date}T20:00:00+05:00`,
    ...extra,
  };
}

describe('Step 2 episode classifier and cycle derivation', () => {
  it('handles empty logs, single log, and ignores future dates after today', () => {
    const empty = classifyEpisodes([], [], '2026-10-30');
    expect(empty.episodes).toEqual([]);
    expect(empty.periodEpisodes).toEqual([]);
    expect(empty.inBetweenSpotting).toEqual([]);

    const cyclesEmpty = deriveCycles(empty, [], '2026-10-30');
    expect(cyclesEmpty.cycles).toEqual([]);
    expect(cyclesEmpty.daysSinceLastPeriodStart).toBeNull();

    const one = classifyEpisodes(
      [
        makeLog('2026-10-30', 'light'),
        makeLog('2026-11-05', 'heavy'), // future, must be ignored relative to today
      ],
      [],
      '2026-10-30',
    );
    expect(one.episodes).toHaveLength(1);
    expect(one.episodes[0]?.kind).toBe('unclear');
    expect(one.episodes[0]?.isOpen).toBe(true);
  });

  it('splits bleeding runs only after 2 consecutive none days or 4+ unlogged days', () => {
    const logs: DayLog[] = [
      // Run 1: heavy, 1 none day (stays same run), 3 unlogged days (stays same run), medium -> ends after 2 none days
      makeLog('2026-10-01', 'heavy'),
      makeLog('2026-10-02', 'none'), // 1 none day: does NOT split
      makeLog('2026-10-03', 'medium'),
      // 3 unlogged days: Oct 4, 5, 6 -> does NOT split
      makeLog('2026-10-07', 'light'),
      // 2 none days: Oct 8, 9 -> SPLITS here!
      makeLog('2026-10-08', 'none'),
      makeLog('2026-10-09', 'none'),
      // Run 2 starts Oct 10 -> 4 unlogged days Oct 11, 12, 13, 14 -> SPLITS here!
      makeLog('2026-10-10', 'medium'),
      makeLog('2026-10-15', 'heavy'),
    ];

    const res = classifyEpisodes(logs, [], '2026-10-30');
    expect(res.episodes).toHaveLength(3);
    expect(res.episodes[0]?.startDate).toBe('2026-10-01');
    expect(res.episodes[0]?.endDate).toBe('2026-10-07');
    expect(res.episodes[0]?.knownBleedingDays).toBe(3); // Oct 1, 3, 7 only (not none, not unlogged)
    expect(res.episodes[0]?.isOpen).toBe(false);

    expect(res.episodes[1]?.startDate).toBe('2026-10-10');
    expect(res.episodes[1]?.endDate).toBe('2026-10-10');
    expect(res.episodes[2]?.startDate).toBe('2026-10-15');
  });

  it('classifies period vs spotting vs unclear, respects 2 light+protection rule, and applies user decisions', () => {
    const logs: DayLog[] = [
      // 2 light days WITHOUT protection -> unclear
      makeLog('2026-08-01', 'light', { protection: 'none' }),
      makeLog('2026-08-02', 'light'),
      makeLog('2026-08-03', 'none'),
      makeLog('2026-08-04', 'none'),

      // 2 light days WITH protection -> period
      makeLog('2026-09-01', 'light', { protection: 'pad' }),
      makeLog('2026-09-02', 'light', { protection: 'liner' }),
      makeLog('2026-09-03', 'none'),
      makeLog('2026-09-04', 'none'),

      // 2 lead-in spotting days + heavy flow, normally starts Sept 22, unless user moves start to Sept 20
      makeLog('2026-09-20', 'spotting'),
      makeLog('2026-09-21', 'spotting'),
      makeLog('2026-09-22', 'heavy'),
      makeLog('2026-09-23', 'medium'),
      makeLog('2026-09-24', 'none'),
      makeLog('2026-09-25', 'none'),

      // Heavy run that user explicitly marks not-a-period -> must NOT count as period
      makeLog('2026-10-10', 'heavy'),
      makeLog('2026-10-11', 'none'),
      makeLog('2026-10-12', 'none'),
    ];

    const noDecisions = classifyEpisodes(logs, [], '2026-10-30');
    expect(noDecisions.episodes[0]?.kind).toBe('unclear');
    expect(noDecisions.episodes[1]?.kind).toBe('period');
    expect(noDecisions.episodes[2]?.kind).toBe('period');
    expect(noDecisions.episodes[2]?.startDate).toBe('2026-09-22'); // default flow start
    expect(noDecisions.episodes[2]?.firstSpotDate).toBe('2026-09-20');
    expect(noDecisions.episodes[2]?.leadInDays).toBe(2);
    expect(noDecisions.episodes[3]?.kind).toBe('period');

    // Now test moving start to first spot + not-a-period decision overriding heavy flow
    const decisions: Decision[] = [
      {
        id: 'd1',
        date: '2026-09-20',
        at: '2026-09-22T12:00:00+05:00',
        kind: 'period-start',
      },
      {
        id: 'd2',
        date: '2026-10-10',
        at: '2026-10-10T18:00:00+05:00',
        kind: 'not-a-period',
      },
    ];
    const withDecisions = classifyEpisodes(logs, decisions, '2026-10-30');
    expect(withDecisions.episodes[2]?.kind).toBe('period');
    expect(withDecisions.episodes[2]?.startDate).toBe('2026-09-20');
    expect(withDecisions.episodes[2]?.leadInDays).toBe(0);
    expect(withDecisions.episodes[3]?.kind).toBe('not-a-period');
    expect(withDecisions.periodEpisodes).toHaveLength(2);
  });

  it('tracks in-between spotting only after 14 days without flow', () => {
    const logs: DayLog[] = [
      // Spotting Sept 1-2 with NO flow in 14 days (through Sept 16) -> counts as in-between spotting by Oct 1
      makeLog('2026-09-01', 'spotting'),
      makeLog('2026-09-02', 'spotting'),
      makeLog('2026-09-03', 'none'),
      makeLog('2026-09-04', 'none'),
      // Spotting Sept 25-26 followed by flow on Oct 5 (9 days later) -> NOT in-between spotting!
      makeLog('2026-09-25', 'spotting'),
      makeLog('2026-09-26', 'spotting'),
      makeLog('2026-09-27', 'none'),
      makeLog('2026-09-28', 'none'),
      makeLog('2026-10-05', 'heavy'),
      makeLog('2026-10-06', 'medium'),
      // Recent spotting Oct 25 -> only 5 days ago, < 14 days elapsed -> NOT yet counted!
      makeLog('2026-10-25', 'spotting'),
      makeLog('2026-10-26', 'none'),
      makeLog('2026-10-27', 'none'),
    ];

    const res = classifyEpisodes(logs, [], '2026-10-30');
    expect(res.inBetweenSpotting).toHaveLength(1);
    expect(res.inBetweenSpotting[0]?.firstDate).toBe('2026-09-01');
  });

  it('derives cycles, flags lengths outside 10..200, respects ignore-in-predictions, approximate, and new-baseline', () => {
    // Starts:
    // 1. 2026-01-01 (len to 2026-01-31 = 30d, normal)
    // 2. 2026-01-31 (len to 2026-02-08 = 8d -> outside 10..200 -> check this date!)
    //    Wait: keep valid pair order cleanly:
    //    2026-01-01 -> 2026-01-09 (8d -> invalid)
    //    2026-01-09 -> 2026-02-08 (30d -> valid, before new-baseline)
    //    2026-02-08 -> 2026-04-09 (60d -> valid, marked ignore-in-predictions)
    //    2026-04-09 -> 2026-05-09 (30d -> approximate, after new-baseline 2026-04-01)
    //    2026-05-09 -> 2026-10-08 (152d -> valid long cycle)
    const starts: Array<{ date: string; approx?: boolean }> = [
      { date: '2026-01-01' },
      { date: '2026-01-09' },
      { date: '2026-02-08' },
      { date: '2026-04-09', approx: true },
      { date: '2026-05-09' },
      { date: '2026-10-08' },
    ];
    const logs: DayLog[] = [];
    for (const s of starts) {
      logs.push(
        makeLog(s.date, 'heavy', {
          filledFrom: s.approx ? 'approximate' : 'live',
        }),
      );
      logs.push(
        makeLog(addDays(s.date, 1), 'medium', {
          filledFrom: s.approx ? 'approximate' : 'live',
        }),
        makeLog(addDays(s.date, 2), 'none'),
        makeLog(addDays(s.date, 3), 'none'),
      );
    }

    const decisions: Decision[] = [
      {
        id: 'dec-ignore',
        date: '2026-02-08',
        at: '2026-04-10T10:00:00+05:00',
        kind: 'ignore-in-predictions',
      },
      {
        id: 'dec-base-old',
        date: '2026-03-01',
        at: '2026-03-01T10:00:00+05:00',
        kind: 'new-baseline',
      },
      {
        id: 'dec-base',
        date: '2026-04-01',
        at: '2026-04-01T10:00:00+05:00',
        kind: 'new-baseline',
      },
    ];

    const classified = classifyEpisodes(logs, decisions, '2026-10-30');
    const derived = deriveCycles(classified, decisions, '2026-10-30');

    expect(derived.cycles).toHaveLength(5);
    expect(derived.cycles[0]?.isValidLength).toBe(false);
    expect(derived.cycles[0]?.dateCheckFlag).toBe('check this date');

    expect(derived.cycles[1]?.isValidLength).toBe(true);
    expect(derived.cycles[1]?.beforeBaseline).toBe(true);

    expect(derived.cycles[2]?.ignoredInPredictions).toBe(true);
    expect(derived.cycles[2]?.beforeBaseline).toBe(true);

    expect(derived.cycles[3]?.approximate).toBe(true);
    expect(derived.cycles[3]?.beforeBaseline).toBe(false);
    expect(derived.cycles[3]?.lengthDays).toBe(30);

    expect(derived.cycles[4]?.lengthDays).toBe(152);
    expect(derived.cycles[4]?.isValidLength).toBe(true);

    // Active valid cycles (excluding <10/>200, ignored, and before new-baseline): only cycles 3 and 4
    expect(derived.activeCycleLengths).toEqual([30, 152]);
    // All valid non-ignored cycles kept in record:
    expect(derived.allValidCycleLengths).toEqual([30, 30, 152]);
    expect(derived.daysSinceLastPeriodStart).toBe(22); // Oct 8 to Oct 30
    expect(derived.openCycle?.startDate).toBe('2026-10-08');
  });

  it('covers period-end gaps, exact 10/200/201 cycle boundaries, spotting streak ending today, and episode indicators', () => {
    const logs: DayLog[] = [
      // Episode 1: heavy + clots + soaked + pain + danger
      makeLog('2026-01-01', 'heavy', {
        soakedPerHour: true,
        changeEvery: 'under-2h',
        flooding: true,
        doubleProtection: true,
        clots: 'large',
        pain: { level: 8, sites: ['lower-middle'], stoppedActivities: true },
        danger: ['dizzy'],
      }),
      makeLog('2026-01-02', 'medium', {
        changeEvery: '2-3h',
        clots: 'small',
      }),
      // period-end decision on 2026-01-03 inside unlogged gap splits Episode 1 from Episode 2
      // Episode 2 starts 2026-01-11 (exact 10d cycle -> valid)
      makeLog('2026-01-11', 'heavy'),
      makeLog('2026-01-12', 'none'),
      makeLog('2026-01-13', 'none'),
      // Episode 3 starts 2026-07-30 (exact 200d from 2026-01-11 -> valid)
      makeLog('2026-07-30', 'heavy'),
      makeLog('2026-07-31', 'none'),
      makeLog('2026-08-01', 'none'),
      // Episode 4 starts 2027-02-16 (201d from 2026-07-30 -> invalid, check this date)
      makeLog('2027-02-16', 'heavy'),
      makeLog('2027-02-17', 'none'),
      makeLog('2027-02-18', 'none'),
      // Spotting streak broken by 1 unlogged day and ending with 2 consecutive days on today 2027-02-26
      makeLog('2027-02-21', 'spotting'),
      makeLog('2027-02-22', 'spotting'),
      makeLog('2027-02-23', 'spotting'),
      makeLog('2027-02-25', 'spotting'),
      makeLog('2027-02-26', 'spotting'),
    ];
    const decisions: Decision[] = [
      {
        id: 'pe1',
        date: '2026-01-03',
        at: '2026-01-03T18:00:00+05:00',
        kind: 'period-end',
      },
    ];
    const classified = classifyEpisodes(logs, decisions, '2027-02-26');
    const first = classified.episodes[0];
    expect(first?.anyStoppedActivities).toBe(true);
    expect(first?.anySoakedPerHour).toBe(true);
    expect(first?.anyUnder2h).toBe(true);
    expect(first?.any2to3h).toBe(true);
    expect(first?.anyFlooding).toBe(true);
    expect(first?.anyDoubleProtection).toBe(true);
    expect(first?.anyLargeClots).toBe(true);
    expect(first?.anySmallClots).toBe(true);
    expect(first?.dangerSignsSeen).toEqual(['dizzy']);
    expect(first?.isOpen).toBe(false);

    expect(classified.currentSpottingStreakDays).toBe(2);
    const lastSpotEp = classified.episodes[classified.episodes.length - 1];
    expect(lastSpotEp?.maxConsecutiveSpottingDays).toBe(3);
    expect(lastSpotEp?.isOpen).toBe(true);

    const derived = deriveCycles(classified, decisions, '2027-02-26');
    expect(derived.cycles.map((c) => [c.lengthDays, c.isValidLength])).toEqual([
      [10, true],
      [200, true],
      [201, false],
    ]);
  });
});
