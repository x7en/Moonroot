import { describe, expect, it } from 'vitest';
import type { DerivedCycle } from '../../core/cycles/cycles';
import {
  buildConfidenceArcGeometry,
  buildCycleBars,
  buildForecastRibbon,
  buildMedicineWeeklySeries,
} from '../../core/graphs/graphs';
import type { DayLog, MedicineEntry } from '../../core/model/types';

function makeCycle(id: string, startDate: string, lengthDays: number): DerivedCycle {
  return {
    id,
    startDate,
    nextStartDate: startDate,
    lengthDays,
    isValidLength: true,
    dateCheckFlag: null,
    ignoredInPredictions: false,
    beforeBaseline: false,
    approximate: false,
    weight: 1,
    countsForHistoryRules: true,
    bleedingDays: 4,
    leadInDays: 0,
    episode: {
      id: `ep-${id}`,
      kind: 'period',
      firstDate: startDate,
      lastDate: startDate,
      startDate,
      endDate: startDate,
      firstSpotDate: null,
      firstRealFlowDate: startDate,
      leadInDays: 0,
      knownBleedingDays: 4,
      dates: [startDate],
      heaviestFlow: 'medium',
      heavyFlowDays: 0,
      maxPain: 2,
      anyStoppedActivities: false,
      anySoakedPerHour: false,
      anyUnder2h: false,
      anyDoubleProtection: false,
      anyFlooding: false,
      anyLargeClots: false,
      anySmallClots: false,
      any2to3h: false,
      dangerSignsSeen: [],
      maxConsecutiveSpottingDays: 0,
      approximate: false,
      isOpen: false,
      needsPeriodConfirmation: false,
      confirmedByUser: true,
    },
  };
}

describe('core/graphs/graphs', () => {
  it('maps confidence 10..95 onto a 240-degree arc cleanly', () => {
    const low = buildConfidenceArcGeometry(10);
    expect(low.clampedScore).toBe(10);
    expect(low.ratio).toBeCloseTo(0, 5);
    expect(low.sweepAngleDeg).toBeCloseTo(0, 5);

    const high = buildConfidenceArcGeometry(95);
    expect(high.clampedScore).toBe(95);
    expect(high.ratio).toBeCloseTo(1, 5);
    expect(high.sweepAngleDeg).toBeCloseTo(240, 5);

    const mid = buildConfidenceArcGeometry(52.5);
    expect(mid.ratio).toBeCloseTo(0.5, 5);
    expect(mid.sweepAngleDeg).toBeCloseTo(120, 5);
  });

  it('builds a 30-day forecast ribbon with flow dot sizes and window bands', () => {
    const today = '2026-11-08';
    const dayLogs: DayLog[] = [
      {
        date: '2026-11-01',
        filledFrom: 'live',
        flow: 'heavy',
        symptoms: [],
        danger: [],
        note: '',
        updatedAt: '2026-11-01T10:00:00+05:00',
      },
      {
        date: '2026-11-02',
        filledFrom: 'live',
        flow: 'spotting',
        symptoms: [],
        danger: [],
        note: '',
        updatedAt: '2026-11-02T10:00:00+05:00',
      },
    ];
    const ribbon = buildForecastRibbon({
      today,
      dayLogs,
      likely: ['2026-11-15', '2026-11-18'],
      possible: ['2026-11-13', '2026-11-21'],
    });
    expect(ribbon).toHaveLength(30);
    expect(ribbon.find((r) => r.date === today)?.isToday).toBe(true);
    const heavyDot = ribbon.find((r) => r.date === '2026-11-01')?.dotRadius ?? 0;
    const spotDot = ribbon.find((r) => r.date === '2026-11-02')?.dotRadius ?? 0;
    expect(heavyDot).toBeGreaterThan(spotDot);
    expect(ribbon.find((r) => r.date === '2026-11-16')?.inLikely).toBe(true);
    expect(ribbon.find((r) => r.date === '2026-11-14')?.inPossible).toBe(true);
  });

  it('builds cycle length bars with median and age band, and aggregates medicine counts per week by generic name', () => {
    const cycles = [
      makeCycle('c1', '2026-08-01', 28),
      makeCycle('c2', '2026-08-29', 30),
      makeCycle('c3', '2026-09-28', 32),
    ];
    const chart = buildCycleBars(cycles, 38);
    expect(chart.bars).toHaveLength(3);
    expect(chart.medianDays).toBe(30);
    expect(chart.ageBandLow).toBe(21);
    expect(chart.ageBandHigh).toBe(38);

    const meds: MedicineEntry[] = [
      {
        id: 'm1',
        date: '2026-11-07',
        kind: 'dose',
        category: 'pain-relief',
        nameShown: 'Ponstan',
        genericName: 'mefenamic acid',
        strengthMg: 250,
        units: 2,
        note: '',
        updatedAt: '2026-11-07T09:00:00+05:00',
      },
      {
        id: 'm2',
        date: '2026-11-08',
        kind: 'dose',
        category: 'pain-relief',
        nameShown: 'Ponstan Forte',
        genericName: 'mefenamic acid',
        strengthMg: 500,
        units: 1,
        note: '',
        updatedAt: '2026-11-08T09:00:00+05:00',
      },
      {
        id: 'm3',
        date: '2026-10-28',
        kind: 'dose',
        category: 'iron-or-supplement',
        nameShown: 'Iron supplement',
        genericName: 'iron',
        strengthMg: null,
        units: 1,
        note: '',
        updatedAt: '2026-10-28T09:00:00+05:00',
      },
    ];
    const weekly = buildMedicineWeeklySeries(meds, '2026-11-08');
    expect(weekly.weeks).toHaveLength(4);
    const mef = weekly.series.find((s) => s.genericName === 'mefenamic acid');
    expect(mef?.counts[3]).toBe(2); // 2 dose entries this week (2026-11-02..2026-11-08)
    expect(mef?.units[3]).toBe(3); // 3 total units
    const iron = weekly.series.find((s) => s.genericName === 'iron');
    expect(iron?.counts[2]).toBe(1); // Previous week (2026-10-26..2026-11-01)

    const emptyBars = buildCycleBars([], 45);
    expect(emptyBars.bars).toEqual([]);
    expect(emptyBars.medianDays).toBeNull();
    expect(emptyBars.ageBandHigh).toBe(45);
  });
});
