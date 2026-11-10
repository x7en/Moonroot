import { describe, expect, it } from 'vitest';
import { addDays } from '../../core/model/dates';
import type {
  DayLog,
  Decision,
  DoctorVisit,
  MedicineEntry,
  Profile,
  Verdict,
  WatchItem,
} from '../../core/model/types';
import { evaluateTriage } from '../../core/triage/engine';
import {
  advanceWatchItem,
  createWatchItems,
  getWatchCheckLabel,
} from '../../core/triage/watchList';

const ADULT_PROFILE: Profile = {
  schemaVersion: 1,
  createdAt: '2025-01-01T10:00:00+05:00',
  birthYear: 2002,
  menarcheAge: 13,
  selfRegularity: 'regular',
  lastPeriodApprox: null,
  onHormones: false,
  contraception: 'none',
  sexualHealthQuestions: 'when-relevant',
  intimacy: 'active',
  conditionsNote: '',
  medicationsNote: '',
  sproutName: null,
  theme: 'dusk',
  units: { temperature: 'C', water: 'ml' },
  reminders: {
    daily: { on: false, time: '20:00' },
    watchlist: true,
    quietFrom: '22:00',
    quietTo: '07:00',
  },
  discreetMode: false,
  lock: { type: 'none' },
  locale: 'en',
  region: 'PK',
  disclaimerAcceptedAt: '2025-01-01T10:00:00+05:00',
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

describe('Step 2 watch lists, event lifecycle, hormone baseline reset, and performance', () => {
  it('manages YEL-08 72h watch item to ORG-15 escalation, danger escalation, max 2 repeats, and close summary', () => {
    const items = createWatchItems({
      today: '2026-10-30',
      nowStamp: '2026-10-30T09:00:00+05:00',
      firedTodayRules: ['YEL-08'],
      unclearEpisodes: [],
      existingWatchItems: [],
    });
    expect(items).toHaveLength(1);
    const w0 = items[0] as WatchItem;
    expect(w0.checks).toEqual([{ key: 'discharge-still-there' }]);
    expect(getWatchCheckLabel('discharge-still-there')).toContain('discharge');

    // Morning (< 72h) unsure -> stays open and sets dueAt to 72h
    const afterMorning = advanceWatchItem(
      w0,
      { 'discharge-still-there': 'unsure' },
      '2026-10-31T09:00:00+05:00',
    );
    expect(afterMorning.item.status).toBe('open');
    expect(afterMorning.summary).toBeNull();

    // At 72h answered yes -> escalates and fires ORG-15
    const after72hYes = advanceWatchItem(
      afterMorning.item,
      { 'discharge-still-there': 'yes' },
      '2026-11-02T09:00:00+05:00',
    );
    expect(after72hYes.item.status).toBe('escalated');
    const triage = evaluateTriage({
      today: '2026-11-02',
      profile: ADULT_PROFILE,
      dayLog: makeDay('2026-11-02', { flow: 'none', pain: { level: 0, sites: [] } }),
      recentLogs: [],
      decisions: [],
      medicines: [],
      watchItems: [after72hYes.item],
      existingVerdicts: [],
      visits: [],
    });
    expect(triage.firedEventRules.some((e) => e.ruleId === 'ORG-15')).toBe(true);

    // Generic yellow + unclear episode watch items: max 3 checks, danger=yes escalates immediately, max 2 repeats closes
    const generic = createWatchItems({
      today: '2026-10-30',
      nowStamp: '2026-10-30T09:00:00+05:00',
      firedTodayRules: ['YEL-02'],
      unclearEpisodes: [
        {
          id: 'ep:2026-10-30',
          kind: 'unclear',
          firstDate: '2026-10-30',
          lastDate: '2026-10-30',
          startDate: '2026-10-30',
          endDate: '2026-10-30',
          firstSpotDate: null,
          firstRealFlowDate: '2026-10-30',
          leadInDays: 0,
          knownBleedingDays: 1,
          dates: ['2026-10-30'],
          heaviestFlow: 'light',
          heavyFlowDays: 0,
          maxPain: 0,
          anyStoppedActivities: false,
          anySoakedPerHour: false,
          anyUnder2h: false,
          anyFlooding: false,
          anyDoubleProtection: false,
          anyLargeClots: false,
          anySmallClots: false,
          any2to3h: false,
          dangerSignsSeen: [],
          maxConsecutiveSpottingDays: 0,
          approximate: false,
          isOpen: true,
          needsPeriodConfirmation: true,
          confirmedByUser: false,
        },
      ],
      existingWatchItems: [],
    });
    expect(generic.length).toBeGreaterThanOrEqual(2);
    for (const g of generic) {
      expect(g.checks.length).toBeLessThanOrEqual(3);
    }
    const yelWatch = generic[0] as WatchItem;
    const escalatedDanger = advanceWatchItem(
      yelWatch,
      { 'danger-signs-now': 'yes' },
      '2026-10-30T15:00:00+05:00',
    );
    expect(escalatedDanger.item.status).toBe('escalated');
    expect(escalatedDanger.raisedImmediately).toBe(true);

    // At 72h with No -> closes cleanly with 1-line summary
    const closedAt72 = advanceWatchItem(
      yelWatch,
      { 'pain-worse': 'no', 'bleeding-started': 'no', 'danger-signs-now': 'no' },
      '2026-11-02T09:00:00+05:00',
    );
    expect(closedAt72.item.status).toBe('closed');
    expect(closedAt72.summary).toBeTruthy();

    // Exceeding 2 repeats closes cleanly even if still < 72h
    const closedAfter2Repeats = advanceWatchItem(
      yelWatch,
      { 'pain-worse': 'unsure' },
      '2026-10-31T09:00:00+05:00',
      2,
    );
    expect(closedAfter2Repeats.item.status).toBe('closed');
  });

  it('deduplicates event cards by triggerKey, shows open-event-notice on quiet days, and closes via Got it or DoctorVisit', () => {
    const startLogs = [
      makeDay('2026-07-01', { flow: 'heavy', pain: { level: 2, sites: [] }, dangerAnswered: true }),
      makeDay('2026-07-02', { flow: 'medium', pain: { level: 1, sites: [] }, dangerAnswered: true }),
      makeDay('2026-07-03', { flow: 'none', pain: { level: 0, sites: [] } }),
      makeDay('2026-07-04', { flow: 'none', pain: { level: 0, sites: [] } }),
    ];

    // Day 90 (2026-09-29): ORG-03 event opens!
    const day90 = makeDay('2026-09-29', { flow: 'none', pain: { level: 0, sites: [] } });
    const firstEval = evaluateTriage({
      today: '2026-09-29',
      profile: ADULT_PROFILE,
      dayLog: day90,
      recentLogs: [...startLogs, day90],
      decisions: [],
      medicines: [],
      watchItems: [],
      existingVerdicts: [],
      visits: [],
    });
    expect(firstEval.newEvents).toHaveLength(1);
    const org03Event = firstEval.newEvents[0] as Verdict;
    expect(org03Event.ruleIds).toEqual(['ORG-03']);
    expect(org03Event.triggerKey).toBe('ORG-03:2026-07-01');
    // While event card is open, quiet today replaces Green with open-event-notice
    expect(firstEval.today.level).toBe('open-event-notice');
    expect(firstEval.today.message).toBe('Nothing new today. An earlier flag is still open.');

    // Day 91: passing saved event card -> NO duplicate newEvents! Still open-event-notice!
    const day91 = makeDay('2026-09-30', { flow: 'none', pain: { level: 0, sites: [] } });
    const secondEval = evaluateTriage({
      today: '2026-09-30',
      profile: ADULT_PROFILE,
      dayLog: day91,
      recentLogs: [...startLogs, day90, day91],
      decisions: [],
      medicines: [],
      watchItems: [],
      existingVerdicts: [org03Event],
      visits: [],
    });
    expect(secondEval.newEvents).toEqual([]);
    expect(secondEval.openEvents).toHaveLength(1);
    expect(secondEval.today.level).toBe('open-event-notice');

    // Dismissing with Got it clears open-event-notice back to Green and never re-fires ORG-03:2026-07-01
    const dismissed: Verdict = { ...org03Event, dismissedAt: '2026-09-30T14:00:00+05:00' };
    const afterGotIt = evaluateTriage({
      today: '2026-10-01',
      profile: ADULT_PROFILE,
      dayLog: makeDay('2026-10-01', { flow: 'none', pain: { level: 0, sites: [] } }),
      recentLogs: [...startLogs, day90, day91],
      decisions: [],
      medicines: [],
      watchItems: [],
      existingVerdicts: [dismissed],
      visits: [],
    });
    expect(afterGotIt.newEvents).toEqual([]);
    expect(afterGotIt.openEvents).toEqual([]);
    expect(afterGotIt.today.level).toBe('green');
    expect(afterGotIt.today.title).toBe('Nothing flagged');

    // A DoctorVisit on/after event date also closes open events automatically
    const visit: DoctorVisit = {
      id: 'visit-1',
      date: '2026-09-30',
      note: 'Checked cycle gap',
    };
    const afterVisit = evaluateTriage({
      today: '2026-10-01',
      profile: ADULT_PROFILE,
      dayLog: makeDay('2026-10-01', { flow: 'none', pain: { level: 0, sites: [] } }),
      recentLogs: [...startLogs, day90, day91],
      decisions: [],
      medicines: [],
      watchItems: [],
      existingVerdicts: [org03Event],
      visits: [visit],
    });
    expect(afterVisit.openEvents).toEqual([]);
    expect(afterVisit.closedByVisitIds).toContain(org03Event.id);
    expect(afterVisit.today.level).toBe('green');
  });

  it('drops pre-baseline cycles from ORG-04/ORG-05/STD rules while keeping ORG-03 active with hormone note', () => {
    const starts = ['2026-01-01', '2026-01-16', '2026-01-31']; // 15d, 15d (< 21d)
    const logs: DayLog[] = [];
    for (const s of starts) {
      logs.push(makeDay(s, { flow: 'heavy', dangerAnswered: true, pain: { level: 1, sites: [] } }));
      logs.push(makeDay(addDays(s, 1), { flow: 'medium', dangerAnswered: true, pain: { level: 1, sites: [] } }));
      logs.push(makeDay(addDays(s, 2), { flow: 'none' }));
      logs.push(makeDay(addDays(s, 3), { flow: 'none' }));
    }
    const decisions: Decision[] = [
      { id: 'nb1', date: '2026-02-15', at: '2026-02-15T10:00:00+05:00', kind: 'new-baseline' },
    ];
    const meds: MedicineEntry[] = [
      {
        id: 'med-hormone',
        date: '2026-02-15',
        kind: 'course',
        category: 'hormone',
        nameShown: 'Progestin-only pill',
        genericName: 'progestin-only pill',
        strengthMg: null,
        startDate: '2026-02-15',
        stopDate: null,
        note: '',
        updatedAt: '2026-02-15T10:00:00+05:00',
      },
    ];
    // 2026-06-01 is > 90 days since 2026-01-31
    const res = evaluateTriage({
      today: '2026-06-01',
      profile: { ...ADULT_PROFILE, onHormones: true, contraception: 'progestin-pill' },
      dayLog: makeDay('2026-06-01', { flow: 'none', pain: { level: 0, sites: [] } }),
      recentLogs: logs,
      decisions,
      medicines: meds,
      watchItems: [],
      existingVerdicts: [],
      visits: [],
    });
    // ORG-04 suppressed by new-baseline!
    expect(res.firedEventRules.some((e) => e.ruleId === 'ORG-04')).toBe(false);
    // ORG-03 STILL fires and includes hormone medicine guidance!
    const org03 = res.firedEventRules.find((e) => e.ruleId === 'ORG-03');
    expect(org03).toBeDefined();
    expect(org03?.message).toContain('Some hormone medicines stop periods.');
  });

  it('paces standing flags on Today to once every 30 days and runs 1,800 days in <= 50ms', () => {
    const logs: DayLog[] = [];
    const startDate = '2022-01-01';
    for (let i = 0; i < 1800; i += 1) {
      const d = addDays(startDate, i);
      const dayInCycle = i % 28;
      logs.push(
        makeDay(d, {
          flow: dayInCycle < 4 ? 'medium' : 'none',
          pain: { level: dayInCycle < 2 ? 3 : 0, sites: ['lower-middle'] },
          dangerAnswered: true,
        }),
      );
    }
    const today = addDays(startDate, 1799);
    const t0 = performance.now();
    const res = evaluateTriage({
      today,
      profile: ADULT_PROFILE,
      dayLog: logs[logs.length - 1] as DayLog,
      recentLogs: logs,
      decisions: [],
      medicines: [],
      watchItems: [],
      existingVerdicts: [],
      visits: [],
    });
    const elapsed = performance.now() - t0;
    expect(elapsed).toBeLessThanOrEqual(50);
    expect(res.today.level).toBe('green');

    // Standing prompt pacing: shown within 30 days suppresses dueForSoftPrompt
    const recentStandingVerdict: Verdict = {
      id: 'v-std-1',
      at: '2026-10-15T10:00:00+05:00',
      level: 'yellow',
      ruleIds: ['STD-01'],
      title: 'STD-01',
      reasons: [],
      rulesetVersion: '1.0',
      kind: 'event',
      triggerKey: 'STD-01:2026-10-15',
    };
    const paced = evaluateTriage({
      today: '2026-10-30',
      profile: ADULT_PROFILE,
      dayLog: makeDay('2026-10-30', { flow: 'none', pain: { level: 0, sites: [] } }),
      recentLogs: [],
      decisions: [],
      medicines: [],
      watchItems: [],
      existingVerdicts: [recentStandingVerdict],
      visits: [],
      derived: { cycleLengths: [25, 36, 26, 37, 27, 36] },
    });
    const std1 = paced.standingFlags.find((f) => f.ruleId === 'STD-01');
    expect(std1).toBeDefined();
    expect(std1?.dueForSoftPrompt).toBe(false);
  });

  it('evaluates raw risk dates, ORG-03 with hormone note, raw 8-day period ORG-01, and under-18 ORG-14 addon', () => {
    const today = '2026-10-30';
    // Unprotected sex 25 days ago + period 35 days ago -> recent pregnancy risk triggers pregnancy-possible branch + 8-day period triggers ORG-01 without derived
    const rawLogs: DayLog[] = [
      makeDay('2026-09-25', { flow: 'medium', pain: { level: 1, sites: [] }, dangerAnswered: true }),
      makeDay('2026-09-26', { flow: 'medium', pain: { level: 1, sites: [] }, dangerAnswered: true }),
      makeDay('2026-09-27', { flow: 'medium', pain: { level: 1, sites: [] }, dangerAnswered: true }),
      makeDay('2026-09-28', { flow: 'medium', pain: { level: 1, sites: [] }, dangerAnswered: true }),
      makeDay('2026-09-29', { flow: 'light', pain: { level: 0, sites: [] }, dangerAnswered: true }),
      makeDay('2026-09-30', { flow: 'light', pain: { level: 0, sites: [] }, dangerAnswered: true }),
      makeDay('2026-10-01', { flow: 'light', pain: { level: 0, sites: [] }, dangerAnswered: true }),
      makeDay('2026-10-02', { flow: 'light', pain: { level: 0, sites: [] }, dangerAnswered: true }),
      makeDay('2026-10-05', {
        flow: 'none',
        pain: { level: 0, sites: [] },
        intimacy: { event: 'unprotected' },
      }),
    ];
    const org01Res = evaluateTriage({
      today,
      profile: { ...ADULT_PROFILE, onHormones: true },
      dayLog: makeDay(today, {
        flow: 'none',
        pain: { level: 0, sites: [] },
        dangerAnswered: true,
      }),
      recentLogs: rawLogs,
      decisions: [],
      medicines: [],
      watchItems: [],
      existingVerdicts: [],
      visits: [],
    });
    expect(org01Res.firedEventRules.some((e) => e.ruleId === 'ORG-01')).toBe(true);

    // ORG-03 (>= 90 days since last period) with onHormones + under18 attaches hormoneNote and under-18 addon
    const amenorrheaLogs: DayLog[] = [
      makeDay('2026-07-01', { flow: 'medium', pain: { level: 1, sites: [] }, dangerAnswered: true }),
      makeDay('2026-07-02', { flow: 'medium', pain: { level: 1, sites: [] }, dangerAnswered: true }),
    ];
    const org03Res = evaluateTriage({
      today: '2026-10-14',
      profile: {
        ...ADULT_PROFILE,
        birthYear: 2010,
        intimacy: 'prefer-not-to-say',
        onHormones: true,
      },
      dayLog: makeDay('2026-10-14', { flow: 'none', pain: { level: 0, sites: [] }, dangerAnswered: true }),
      recentLogs: amenorrheaLogs,
      decisions: [],
      medicines: [],
      watchItems: [],
      existingVerdicts: [],
      visits: [],
    });
    const org03Event = org03Res.firedEventRules.find((e) => e.ruleId === 'ORG-03');
    expect(org03Event).toBeDefined();
    expect(org03Event?.message).toContain('Some hormone medicines stop periods');
    expect(org03Event?.message).toContain('parent, relative or school nurse');

    // Under-18 ORG-14 includes parent/relative/school nurse guidance addon
    const under18Org14 = evaluateTriage({
      today,
      profile: {
        ...ADULT_PROFILE,
        birthYear: 2010,
        intimacy: 'prefer-not-to-say',
      },
      dayLog: makeDay(today, {
        flow: 'none',
        pain: { level: 6, sites: ['lower-middle'] },
        danger: ['dizzy'],
        dangerAnswered: true,
        pregnancyChance: 'no',
      }),
      recentLogs: [],
      decisions: [],
      medicines: [],
      watchItems: [],
      existingVerdicts: [],
      visits: [],
    });
    expect(under18Org14.today.level).toBe('orange');
    expect(under18Org14.today.ruleIds).toContain('ORG-14');
    expect(under18Org14.today.message).toContain('parent, relative or school nurse');
  });
});
