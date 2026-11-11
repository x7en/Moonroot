import { describe, expect, it } from 'vitest';
import {
  analyzeLifestylePatterns,
  LIFESTYLE_CANDIDATE_PAIRS,
} from '../../core/insights/lifestyle';
import { addDays } from '../../core/model/dates';
import type { BodyLog, DayLog } from '../../core/model/types';

function makeDay(date: string, overrides: Partial<DayLog> = {}): DayLog {
  return {
    date,
    filledFrom: 'live',
    flow: 'none',
    symptoms: [],
    danger: [],
    dangerAnswered: true,
    note: '',
    updatedAt: `${date}T20:00:00+05:00`,
    ...overrides,
  };
}

function makeBody(date: string, overrides: Partial<BodyLog> = {}): BodyLog {
  return {
    date,
    updatedAt: `${date}T20:00:00+05:00`,
    ...overrides,
  };
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('core/insights/lifestyle — non-bleeding gating, statistical safeguards, 60d expiry, and random-data false-discovery check', () => {
  it('tests at most 20 pairs and finds zero patterns in pure random non-bleeding data across realistic synthetic histories', () => {
    expect(LIFESTYLE_CANDIDATE_PAIRS.length).toBeLessThanOrEqual(20);

    const rng = mulberry32(20261110);
    let totalFalsePatterns = 0;

    // 40 independent synthetic people x 70 days each of completely uncorrelated random lifestyle/symptom logs
    for (let person = 0; person < 40; person += 1) {
      const start = '2026-07-01';
      const dayLogs: DayLog[] = [];
      const bodyLogs: BodyLog[] = [];
      for (let d = 0; d < 70; d += 1) {
        const date = addDays(start, d);
        dayLogs.push(
          makeDay(date, {
            flow: 'none',
            pain: { level: Math.floor(rng() * 5), sites: ['lower-middle'] },
            symptoms: rng() < 0.25 ? ['headache'] : [],
            mood: (1 + Math.floor(rng() * 5)) as 1 | 2 | 3 | 4 | 5,
            context: { stress: (1 + Math.floor(rng() * 5)) as 1 | 2 | 3 | 4 | 5 },
          }),
        );
        bodyLogs.push(
          makeBody(date, {
            sleep: { hours: rng() < 0.5 ? 5 : 8, quality: 2 },
            water: { ml: rng() < 0.5 ? 1000 : 2200 },
            meals: {
              pattern: rng() < 0.5 ? 'irregular' : 'regular',
              tags: rng() < 0.4 ? ['caffeine'] : ['balanced'],
            },
            stool: {
              count: 1,
              bristol: (1 + Math.floor(rng() * 7)) as 1 | 2 | 3 | 4 | 5 | 6 | 7,
            },
            exercise: { minutes: rng() < 0.5 ? 0 : 35, effort: 'moderate' },
            energy: (1 + Math.floor(rng() * 5)) as 1 | 2 | 3 | 4 | 5,
          }),
        );
      }
      const res = analyzeLifestylePatterns({
        today: addDays(start, 69),
        dayLogs,
        bodyLogs,
      });
      totalFalsePatterns += res.patterns.length;
    }

    expect(totalFalsePatterns).toBe(0);
  });

  it('excludes bleeding days (flow != none on cause or outcome), fasting days for water/meals, and detects real sleep -> cramps pattern', () => {
    const start = '2026-08-01';
    const dayLogs: DayLog[] = [];
    const bodyLogs: BodyLog[] = [];

    // Create 40 non-bleeding consecutive days with a clean consistent effect:
    // under 6 hours of sleep -> next-day cramps rated ~2 points higher
    for (let d = 0; d < 42; d += 1) {
      const date = addDays(start, d);
      const prevShortSleep = d > 0 && (d - 1) % 2 === 0;
      const todayShortSleep = d % 2 === 0;

      // On days 38..41, make them fasting to ensure water/meal queries skip them
      const isFasting = d >= 38;
      // Inject bleeding on days 10..13 with high cramps after normal sleep to prove bleeding days are excluded!
      const isBleeding = d >= 10 && d <= 13;

      dayLogs.push(
        makeDay(date, {
          flow: isBleeding ? 'heavy' : 'none',
          pain: {
            level: isBleeding ? 9 : prevShortSleep ? 3 : 1,
            sites: ['lower-middle'],
          },
          symptoms: prevShortSleep ? ['cramps'] : [],
        }),
      );
      bodyLogs.push(
        makeBody(date, {
          sleep: { hours: todayShortSleep ? 5 : 8, quality: todayShortSleep ? 1 : 3 },
          water: { ml: isFasting ? 0 : 2000 },
          meals: {
            pattern: isFasting ? 'skipped-some' : 'regular',
            tags: isFasting ? ['fasting'] : ['balanced'],
          },
        }),
      );
    }

    const today = addDays(start, 41);
    const res = analyzeLifestylePatterns({ today, dayLogs, bodyLogs });

    expect(res.patterns.length).toBeGreaterThanOrEqual(1);
    expect(res.patterns.length).toBeLessThanOrEqual(3);
    const sleepCramps = res.patterns.find(
      (p) => p.causeKey === 'sleep' && p.outcomeKey === 'cramps',
    );
    expect(sleepCramps).toBeDefined();
    expect(sleepCramps?.statement).toContain('This is a pattern, not proof of cause.');
    expect(sleepCramps?.statement).toMatch(/On days after under 6 hours of sleep, cramps/);
    // Bleeding days 10..13 and neighbors must NOT enter group counts
    expect((sleepCramps?.groupACount ?? 0) + (sleepCramps?.groupBCount ?? 0)).toBeLessThan(38);
  });

  it('caps visible patterns at 3 and expires patterns after 60 days without support', () => {
    const start = '2026-04-01';
    const dayLogs: DayLog[] = [];
    const bodyLogs: BodyLog[] = [];

    // Days 0..33 (April..May 4): strong real patterns for sleep->cramps, water->headache, meals->energy, stress->mood
    for (let d = 0; d < 34; d += 1) {
      const date = addDays(start, d);
      const exposedToday = d % 2 === 0;
      const exposedPrev = d > 0 && (d - 1) % 2 === 0;
      dayLogs.push(
        makeDay(date, {
          flow: 'none',
          pain: { level: exposedPrev ? 4 : 1, sites: ['lower-middle'] },
          symptoms: exposedPrev ? ['headache'] : [],
          mood: exposedPrev ? 2 : 5,
          context: { stress: exposedToday ? 5 : 1 },
        }),
      );
      bodyLogs.push(
        makeBody(date, {
          sleep: { hours: exposedToday ? 5 : 8, quality: exposedToday ? 1 : 3 },
          water: { ml: exposedToday ? 800 : 2400 },
          meals: { pattern: exposedToday ? 'irregular' : 'regular', tags: [] },
          energy: exposedPrev ? 2 : 5,
        }),
      );
    }

    const activeToday = addDays(start, 35);
    const activeRes = analyzeLifestylePatterns({ today: activeToday, dayLogs, bodyLogs });
    expect(activeRes.patterns.length).toBe(3);

    // 70 days later with NO new supporting logs -> all patterns expire (> 60 days without support)
    const expiredToday = addDays(start, 110);
    const expiredRes = analyzeLifestylePatterns({ today: expiredToday, dayLogs, bodyLogs });
    expect(expiredRes.patterns.length).toBe(0);
  });

  it('detects headache frequency patterns, uses singular "point" for 1-point diffs, and suppresses flip-flopping split halves', () => {
    const start = '2026-08-01';
    const dayLogs: DayLog[] = [];
    const bodyLogs: BodyLog[] = [];

    // 36 days:
    // - caffeine -> next-day headache (strong positive association in both halves)
    // - sleep (6.5h boundary ignored, 5 vs 8 -> mood diff = 1 point in both halves)
    // - exercise -> energy flips direction in 2nd half (must NOT qualify)
    // - water -> cramps all identical pain=1 (zero diff, must NOT qualify)
    for (let d = 0; d < 36; d += 1) {
      const date = addDays(start, d);
      const half1 = d < 18;
      const hadCafToday = d % 2 === 0;
      const hadCafPrev = d > 0 && (d - 1) % 2 === 0;
      const hadExPrev = d > 0 && (d - 1) % 2 === 0;
      const exEnergy = half1 ? (hadExPrev ? 5 : 2) : hadExPrev ? 2 : 5;

      dayLogs.push(
        makeDay(date, {
          flow: 'none',
          pain: { level: 1, sites: ['lower-middle'] },
          symptoms: hadCafPrev ? ['headache'] : [],
          mood: hadCafPrev ? 2 : 3,
          context: { stress: 2 },
        }),
      );
      bodyLogs.push(
        makeBody(date, {
          sleep: { hours: hadCafToday ? 5 : 8, quality: 2 },
          water: { ml: hadCafToday ? 900 : 2100 },
          meals: {
            pattern: 'regular',
            tags: hadCafToday ? ['caffeine'] : ['balanced'],
          },
          exercise: { minutes: d % 2 === 0 ? 30 : 0, effort: 'moderate' },
          energy: exEnergy as 1 | 2 | 3 | 4 | 5,
        }),
      );
    }

    const res = analyzeLifestylePatterns({
      today: addDays(start, 35),
      dayLogs,
      bodyLogs,
    });
    const headachePat = res.patterns.find((p) => p.outcomeKey === 'headache');
    expect(headachePat).toBeDefined();
    expect(headachePat?.statement).toContain('more often');
    expect(res.patterns.some((p) => p.id === 'exercise-energy')).toBe(false);
    expect(res.patterns.some((p) => p.id === 'water-cramps')).toBe(false);

    const moodPat = res.patterns.find((p) => p.outcomeKey === 'mood');
    expect(moodPat?.statement).toContain('1 point lower');
  });
});
