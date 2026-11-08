import { describe, expect, it } from 'vitest';
import { addDays } from '../../core/model/dates';
import type {
  DayLog,
  Decision,
  DoctorVisit,
  Forecast,
  MedicineEntry,
  Profile,
  Verdict,
} from '../../core/model/types';
import { buildCycleTableCsv, buildDayTableCsv } from '../../core/report/csv';
import { buildDoctorFile } from '../../core/report/doctorFile';

function baseProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    schemaVersion: 1,
    createdAt: '2026-01-01T08:00:00+05:00',
    birthYear: 1999,
    menarcheAge: 13,
    selfRegularity: 'regular',
    lastPeriodApprox: null,
    onHormones: false,
    contraception: 'none',
    sexualHealthQuestions: 'when-relevant',
    intimacy: 'none',
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
    disclaimerAcceptedAt: '2026-01-01T08:05:00+05:00',
    ...overrides,
  };
}

function day(date: string, overrides: Partial<DayLog> = {}): DayLog {
  return {
    date,
    filledFrom: 'live',
    flow: 'none',
    symptoms: [],
    danger: [],
    dangerAnswered: true,
    note: '',
    updatedAt: `${date}T18:00:00+05:00`,
    ...overrides,
  };
}

function buildRegularFixture(): {
  today: string;
  profile: Profile;
  dayLogs: DayLog[];
  medicines: MedicineEntry[];
  visits: DoctorVisit[];
  decisions: Decision[];
  verdicts: Verdict[];
  forecasts: Forecast[];
} {
  const today = '2026-10-30';
  const starts = ['2026-06-10', '2026-07-08', '2026-08-06', '2026-09-03', '2026-10-02'];
  const dayLogs: DayLog[] = [];
  for (const s of starts) {
    dayLogs.push(
      day(s, {
        flow: 'medium',
        protection: 'pad',
        productsUsed: 4,
        pain: { level: 3, sites: ['lower-middle'] },
        symptoms: ['cramps', 'bloating'],
        mood: 3,
      }),
      day(addDays(s, 1), {
        flow: 'heavy',
        protection: 'pad',
        productsUsed: 5,
        pain: { level: 4, sites: ['lower-middle'] },
        symptoms: ['cramps'],
        note: 'Warm water helped, felt better later',
      }),
      day(addDays(s, 2), { flow: 'light', protection: 'pad', productsUsed: 2 }),
    );
  }
  const medicines: MedicineEntry[] = [
    {
      id: 'reg-m1',
      date: '2026-10-03',
      kind: 'dose',
      category: 'pain-relief',
      nameShown: 'Ponstan',
      genericName: 'mefenamic acid',
      strengthMg: 250,
      units: 2,
      helped: 'yes',
      note: '',
      updatedAt: '2026-10-03T12:00:00+05:00',
    },
  ];
  return {
    today,
    profile: baseProfile({ selfRegularity: 'regular' }),
    dayLogs,
    medicines,
    visits: [],
    decisions: [],
    verdicts: [],
    forecasts: [],
  };
}

function buildLeadInIrregularFixture(): {
  today: string;
  profile: Profile;
  dayLogs: DayLog[];
  medicines: MedicineEntry[];
  visits: DoctorVisit[];
  decisions: Decision[];
  verdicts: Verdict[];
  forecasts: Forecast[];
} {
  const today = '2026-10-30';
  const starts = [
    { start: '2026-03-10', leadOffset: 6 },
    { start: '2026-04-21', leadOffset: 7 },
    { start: '2026-05-23', leadOffset: 6 },
    { start: '2026-07-12', leadOffset: 7 },
    { start: '2026-08-26', leadOffset: 6 },
    { start: '2026-10-18', leadOffset: 7 },
  ];
  const dayLogs: DayLog[] = [];
  for (const item of starts) {
    dayLogs.push(
      day(addDays(item.start, -item.leadOffset), {
        flow: 'spotting',
        pain: { level: 3, sites: ['lower-middle'] },
        symptoms: ['cramps'],
        note: 'Early spotting + cramps',
      }),
      day(item.start, {
        flow: 'heavy',
        protection: 'pad',
        clots: 'small',
        pain: { level: 6, sites: ['lower-middle', 'back'] },
        symptoms: ['cramps', 'tiredness'],
      }),
      day(addDays(item.start, 1), { flow: 'medium', protection: 'pad' }),
    );
  }
  const medicines: MedicineEntry[] = [
    {
      id: 'irreg-m1',
      date: '2026-06-01',
      kind: 'course',
      category: 'hormone',
      nameShown: 'Combined pill',
      genericName: 'combined-hormone',
      strengthMg: null,
      startDate: '2026-06-01',
      stopDate: null,
      note: '',
      updatedAt: '2026-06-01T10:00:00+05:00',
    },
  ];
  const decisions: Decision[] = [
    {
      id: 'irreg-base',
      date: '2026-04-25',
      kind: 'new-baseline',
      note: 'Started hormone course',
      at: '2026-05-01T10:00:00+05:00',
    },
  ];
  return {
    today,
    profile: baseProfile({
      birthYear: 1996,
      selfRegularity: 'irregular',
      onHormones: true,
      conditionsNote: 'Thyroid checked last year',
    }),
    dayLogs,
    medicines,
    visits: [{ id: 'vis-1', date: '2026-10-05', note: 'Follow-up discussed cycles' }],
    decisions,
    verdicts: [],
    forecasts: [],
  };
}

function buildUnder18SparseFixture(): {
  today: string;
  profile: Profile;
  dayLogs: DayLog[];
  medicines: MedicineEntry[];
  visits: DoctorVisit[];
  decisions: Decision[];
  verdicts: Verdict[];
  forecasts: Forecast[];
} {
  const today = '2026-10-30';
  const dayLogs: DayLog[] = [
    day('2026-05-10', { flow: 'medium', filledFrom: 'approximate', note: 'Approx May' }),
    day('2026-05-11', { flow: 'medium', filledFrom: 'approximate' }),
    day('2026-07-02', { flow: 'heavy', clots: 'large', flooding: true, pain: { level: 7, sites: ['lower-middle'], stoppedActivities: true } }),
    day('2026-07-03', { flow: 'heavy', pain: { level: 7, sites: ['lower-middle'], stoppedActivities: true } }),
    day('2026-10-20', {
      flow: 'heavy',
      soakedPerHour: true,
      changeEvery: 'under-2h',
      pain: { level: 8, sites: ['lower-middle'], stoppedActivities: true, reliefHelped: 'no' },
      intimacy: { event: 'protected', bleedingAfter: true, painDuring: true },
      note: 'Hard week at school',
    }),
    day('2026-10-21', { flow: 'medium', symptoms: ['headache', 'tiredness'] }),
  ];
  return {
    today,
    profile: baseProfile({
      birthYear: 2011, // age 15 (under 18 -> no intimacy export ever!)
      menarcheAge: 13,
      selfRegularity: 'unknown',
      intimacy: 'prefer-not-to-say',
    }),
    dayLogs,
    medicines: [],
    visits: [],
    decisions: [],
    verdicts: [],
    forecasts: [],
  };
}

describe('Step 3 golden exports: Doctor file (with Part 6) and Day/Cycle CSV tables across 3 fixture patients', () => {
  it('matches golden snapshots for Fixture 1 (regular adult)', () => {
    const f = buildRegularFixture();
    const doc = buildDoctorFile({
      today: f.today,
      appVersion: '0.1.0',
      profile: f.profile,
      dayLogs: f.dayLogs,
      medicines: f.medicines,
      visits: f.visits,
      decisions: f.decisions,
      verdicts: f.verdicts,
      forecasts: f.forecasts,
      options: {
        range: '6m',
        format: 'md',
        includeNotes: true,
        includeMedicines: true,
        includeIntimacy: false,
      },
    });
    const dayCsv = buildDayTableCsv({
      today: f.today,
      dayLogs: f.dayLogs,
      medicines: f.medicines,
    });
    const cycleCsv = buildCycleTableCsv({
      today: f.today,
      dayLogs: f.dayLogs,
      decisions: f.decisions,
    });

    expect(doc).toMatchSnapshot();
    expect(dayCsv).toMatchSnapshot();
    expect(cycleCsv).toMatchSnapshot();
  });

  it('matches golden snapshots for Fixture 2 (irregular adult with learned lead-in pattern and baseline)', () => {
    const f = buildLeadInIrregularFixture();
    const doc = buildDoctorFile({
      today: f.today,
      appVersion: '0.1.0',
      profile: f.profile,
      dayLogs: f.dayLogs,
      medicines: f.medicines,
      visits: f.visits,
      decisions: f.decisions,
      verdicts: f.verdicts,
      forecasts: f.forecasts,
      options: {
        range: 'all',
        format: 'md',
        includeNotes: true,
        includeMedicines: true,
        includeIntimacy: false,
        worryNote: 'I always cramp a week before flow starts.',
      },
    });
    const dayCsv = buildDayTableCsv({
      today: f.today,
      dayLogs: f.dayLogs,
      medicines: f.medicines,
    });
    const cycleCsv = buildCycleTableCsv({
      today: f.today,
      dayLogs: f.dayLogs,
      decisions: f.decisions,
    });

    expect(doc.content).toContain('## 6. Patterns the app found');
    expect(doc.content).toContain('Lead-in pattern');
    expect(doc.content).toContain('not proof of cause');
    expect(doc).toMatchSnapshot();
    expect(dayCsv).toMatchSnapshot();
    expect(cycleCsv).toMatchSnapshot();
  });

  it('matches golden snapshots for Fixture 3 (under-18 sparse & approximate, hiding notes and intimacy)', () => {
    const f = buildUnder18SparseFixture();
    const doc = buildDoctorFile({
      today: f.today,
      appVersion: '0.1.0',
      profile: f.profile,
      dayLogs: f.dayLogs,
      medicines: f.medicines,
      visits: f.visits,
      decisions: f.decisions,
      verdicts: f.verdicts,
      forecasts: f.forecasts,
      options: {
        range: '6m',
        format: 'txt',
        includeNotes: false,
        includeMedicines: false,
        includeIntimacy: true, // requested true, MUST stay excluded for under-18!
      },
    });
    const dayCsv = buildDayTableCsv({
      today: f.today,
      dayLogs: f.dayLogs,
      medicines: f.medicines,
      includeNotes: false,
      includeMedicines: false,
    });
    const cycleCsv = buildCycleTableCsv({
      today: f.today,
      dayLogs: f.dayLogs,
      decisions: f.decisions,
    });

    expect(doc.content).not.toContain('bleeding after sex');
    expect(doc.content).not.toContain('protected');
    expect(dayCsv.content).not.toContain('bleeding');
    expect(dayCsv.content).not.toContain('protected');
    expect(dayCsv.content).not.toContain('Hard week at school');
    expect(doc).toMatchSnapshot();
    expect(dayCsv).toMatchSnapshot();
    expect(cycleCsv).toMatchSnapshot();
  });
});
