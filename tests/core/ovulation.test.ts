import { describe, expect, it } from 'vitest';
import { deriveCycles } from '../../core/cycles/cycles';
import { classifyEpisodes } from '../../core/cycles/episodes';
import { addDays } from '../../core/model/dates';
import type { DayLog, Decision, Profile } from '../../core/model/types';
import { analyzeOvulation } from '../../core/ovulation/ovulation';
import { computeLivePrediction } from '../../core/predict/forecast';

const ADULT_PROFILE: Profile = {
  schemaVersion: 1,
  createdAt: '2026-01-01T08:00:00+05:00',
  birthYear: 1998,
  menarcheAge: 13,
  selfRegularity: 'irregular',
  lastPeriodApprox: null,
  onHormones: false,
  contraception: 'none',
  sexualHealthQuestions: 'when-relevant',
  intimacy: 'active',
  conditionsNote: '',
  medicationsNote: '',
  sproutName: 'Fern',
  theme: 'dusk',
  units: { temperature: 'C', water: 'ml' },
  reminders: {
    daily: { on: false, time: '20:00' },
    watchlist: true,
    quietFrom: '22:00',
    quietTo: '08:00',
  },
  discreetMode: true,
  lock: { type: 'none' },
  locale: 'en',
  region: 'PK',
  disclaimerAcceptedAt: '2026-01-01T08:01:00+05:00',
};

function makeDay(date: string, overrides: Partial<DayLog> = {}): DayLog {
  return {
    date,
    filledFrom: 'live',
    flow: 'none',
    symptoms: [],
    danger: [],
    dangerAnswered: true,
    note: '',
    updatedAt: `${date}T08:00:00+05:00`,
    ...overrides,
  };
}

function makePeriod(startDate: string): DayLog[] {
  return [
    makeDay(startDate, { flow: 'medium' }),
    makeDay(addDays(startDate, 1), { flow: 'medium' }),
  ];
}

describe('core/ovulation — BBT 3-over-6, LH, mucus, agreement, luteal learning, and 40+ days no-shift flag', () => {
  it('returns none with "Not enough signals to estimate ovulation" when no ovulation signals exist (never guesses from calendar)', () => {
    const start = '2026-09-01';
    const logs = [...makePeriod(start), makeDay('2026-09-15')];
    const today = '2026-09-18';
    const ep = classifyEpisodes(logs, [], today);
    const cyc = deriveCycles(ep, [], today);

    const res = analyzeOvulation({ today, dayLogs: logs, cycles: cyc });
    expect(res.current.status).toBe('none');
    expect(res.current.ovulationDate).toBeNull();
    expect(res.current.message).toBe('Not enough signals to estimate ovulation');
    expect(res.fortyPlusTempDaysNoShift).toBe(false);
    expect(res.anySignalLogged).toBe(false);
  });

  it('detects 3-over-6 BBT shift, sets ovulation on day before rise, skips illness days, and handles 0.2C float boundary', () => {
    const start = '2026-09-01';
    const logs: DayLog[] = [...makePeriod(start)];
    // Baseline 6 days (Sep 8..13) at 36.4..36.5
    const baselineTemps = [36.4, 36.45, 36.5, 36.4, 36.5, 36.42];
    for (let i = 0; i < baselineTemps.length; i += 1) {
      logs.push(
        makeDay(addDays('2026-09-08', i), {
          fertility: { bbt: baselineTemps[i] },
        }),
      );
    }
    // Illness spike on Sep 14 (37.8C) must be skipped and NOT trigger a shift or spoil baseline
    logs.push(
      makeDay('2026-09-14', {
        fertility: { bbt: 37.8 },
        context: { illness: true },
      }),
    );
    // 3 consecutive readings above max baseline (36.5): third is 36.70 (exact +0.20 C floating boundary)
    logs.push(
      makeDay('2026-09-15', { fertility: { bbt: 36.55 } }),
      makeDay('2026-09-16', { fertility: { bbt: 36.62 } }),
      makeDay('2026-09-17', { fertility: { bbt: 36.7 } }),
    );
    const today = '2026-09-18';
    const cyc = deriveCycles(classifyEpisodes(logs, [], today), [], today);
    const res = analyzeOvulation({ today, dayLogs: logs, cycles: cyc });

    expect(res.current.status).toBe('probable');
    expect(res.current.bbtShift?.shiftStartDate).toBe('2026-09-15');
    expect(res.current.bbtShift?.ovulationDate).toBe('2026-09-14');
    expect(res.current.ovulationDate).toBe('2026-09-14');
    expect(res.anySignalLogged).toBe(true);
  });

  it('requires third reading >= baseline + 0.2C (rejects 0.19C rise) and marks 40+ BBT days without shift for doctor file only', () => {
    const start = '2026-08-01';
    const logs: DayLog[] = [...makePeriod(start)];
    for (let i = 0; i < 42; i += 1) {
      // Hovering slightly above/around 36.4..36.55 -> never >= max6 + 0.2 for 3 consecutive
      const temp = i % 2 === 0 ? 36.4 : 36.52;
      logs.push(makeDay(addDays('2026-08-03', i), { fertility: { bbt: temp } }));
    }
    const today = '2026-09-16';
    const cyc = deriveCycles(classifyEpisodes(logs, [], today), [], today);
    const res = analyzeOvulation({ today, dayLogs: logs, cycles: cyc });

    expect(res.current.bbtShift).toBeNull();
    expect(res.current.status).toBe('none');
    expect(res.fortyPlusTempDaysNoShift).toBe(true);
    expect(res.bbtDaysWithoutShift).toBe(42);
  });

  it('confirms ovulation when 2 signals agree within 5 days, learns luteal length after 2 confirmed cycles, and drives basis: ovulation forecasts', () => {
    // 3 completed cycles + 1 open cycle:
    // Cycle 1: 2026-05-01 -> 2026-06-05 (confirmed ov 2026-05-22 => 14d luteal)
    // Cycle 2: 2026-06-05 -> 2026-07-17 (confirmed ov 2026-07-05 => 12d luteal)
    // Cycle 3: 2026-07-17 -> 2026-09-01 (confirmed ov 2026-08-16 => 16d luteal)
    // Open Cycle 4: starts 2026-09-01, confirmed ov 2026-09-16
    const logs: DayLog[] = [];
    const cycleSpecs = [
      { start: '2026-05-01', ovTarget: '2026-05-22' },
      { start: '2026-06-05', ovTarget: '2026-07-05' },
      { start: '2026-07-17', ovTarget: '2026-08-16' },
      { start: '2026-09-01', ovTarget: '2026-09-16' },
    ];

    for (const spec of cycleSpecs) {
      logs.push(...makePeriod(spec.start));
      // Mucus peak 1 day before ovTarget -> mucus estimate = ovTarget
      logs.push(
        makeDay(addDays(spec.ovTarget, -1), {
          fertility: { lh: 'positive', mucus: 'egg-white' },
        }),
      );
      // BBT 6 baseline + 3 shift starting ovTarget + 1 => BBT estimate = ovTarget
      for (let b = -6; b < 0; b += 1) {
        logs.push(
          makeDay(addDays(spec.ovTarget, 1 + b), {
            fertility: { bbt: 36.3 },
          }),
        );
      }
      logs.push(
        makeDay(addDays(spec.ovTarget, 1), { fertility: { bbt: 36.5 } }),
        makeDay(addDays(spec.ovTarget, 2), { fertility: { bbt: 36.55 } }),
        makeDay(addDays(spec.ovTarget, 3), { fertility: { bbt: 36.65 } }),
      );
    }

    const today = '2026-09-20';
    const cyc = deriveCycles(classifyEpisodes(logs, [], today), [], today);
    const ov = analyzeOvulation({ today, dayLogs: logs, cycles: cyc });

    expect(ov.learnedLutealLengths).toEqual([14, 12, 16]);
    expect(ov.lutealSummary).not.toBeNull();
    expect(ov.lutealSummary?.count).toBe(3);
    expect(ov.current.status).toBe('confirmed');
    expect(ov.current.ovulationDate).toBe('2026-09-16');

    const pred = computeLivePrediction({
      today,
      profile: ADULT_PROFILE,
      cycles: cyc,
      dayLogs: logs,
      decisions: [],
      existingForecasts: [],
    });
    expect(pred.basis).toBe('ovulation');
    expect(pred.forecast?.basis).toBe('ovulation');
    // Luteal range from [14, 12, 16] sits around [12..16] from 2026-09-16 -> 2026-09-28 .. 2026-10-02
    expect(pred.possible?.[0]).toBe('2026-09-28');
    expect(pred.possible?.[1]).toBe('2026-10-02');
  });

  it('uses 10 to 16 day default luteal range when < 2 confirmed cycles exist yet, and respects ignore-in-predictions / new-baseline', () => {
    const logs: DayLog[] = [
      ...makePeriod('2026-07-01'),
      makeDay('2026-07-15', { fertility: { lh: 'positive', mucus: 'watery' } }),
      ...makePeriod('2026-08-01'),
      makeDay('2026-08-14', { fertility: { lh: 'positive', mucus: 'egg-white' } }),
      ...makePeriod('2026-09-01'),
      makeDay('2026-09-15', { fertility: { lh: 'positive', mucus: 'egg-white' } }),
    ];
    const decisions: Decision[] = [
      {
        id: 'base',
        date: '2026-08-25',
        kind: 'new-baseline',
        at: '2026-08-25T10:00:00+05:00',
      },
    ];
    const today = '2026-09-17';
    const cyc = deriveCycles(classifyEpisodes(logs, decisions, today), decisions, today);
    const pred = computeLivePrediction({
      today,
      profile: ADULT_PROFILE,
      cycles: cyc,
      dayLogs: logs,
      decisions,
      existingForecasts: [],
    });

    // Baseline excludes July & Aug cycles -> < 2 learned luteal lengths -> 10..16d default from 2026-09-16
    expect(pred.ovulation.learnedLutealLengths).toEqual([]);
    expect(pred.basis).toBe('ovulation');
    expect(pred.possible).toEqual(['2026-09-26', '2026-10-02']);
    expect(pred.peak).toBe('2026-09-29');
  });

  it('stays probable when two signals disagree by more than 5 days, and respects BBT fallback + already-past luteal fallback', () => {
    const start = '2026-08-01';
    const logs: DayLog[] = [
      ...makePeriod(start),
      // Early positive LH on Aug 10 (estimate Aug 11)
      makeDay('2026-08-10', { fertility: { lh: 'positive' } }),
      // BBT baseline Aug 15..20, shift Aug 21..23 (ovulation Aug 20 -> 9 days apart from LH!)
      makeDay('2026-08-15', { fertility: { bbt: 36.4 } }),
      makeDay('2026-08-16', { fertility: { bbt: 36.45 } }),
      makeDay('2026-08-17', { fertility: { bbt: 36.42 } }),
      makeDay('2026-08-18', { fertility: { bbt: 36.44 } }),
      makeDay('2026-08-19', { fertility: { bbt: 36.41 } }),
      makeDay('2026-08-20', { fertility: { bbt: 36.45 } }),
      makeDay('2026-08-21', { fertility: { bbt: 36.55 } }),
      makeDay('2026-08-22', { fertility: { bbt: 36.6 } }),
      makeDay('2026-08-23', { fertility: { bbt: 36.7 } }),
    ];
    const today = '2026-08-25';
    const cyc = deriveCycles(classifyEpisodes(logs, [], today), [], today);
    const ov = analyzeOvulation({ today, dayLogs: logs, cycles: cyc });

    expect(ov.current.status).toBe('probable');
    expect(ov.current.ovulationDate).toBe('2026-08-20');
    expect(ov.current.message).toContain('more than 5 days apart');
  });
});
