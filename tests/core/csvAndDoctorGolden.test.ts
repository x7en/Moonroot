import { describe, expect, it } from 'vitest';
import { addDays } from '../../core/model/dates';
import type {
  BodyLog,
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

  it('includes Step 4 Part 6 lifestyle patterns, Part 8 30d/90d body averages, Part 9 ovulation + 40+ BBT no-shift note, and STD-01 acne/hair question, while omitting Part 9 when unlogged', () => {
    const today = '2026-10-30';
    // 1. When no ovulation signals logged, Part 9 MUST be omitted
    const f1 = buildRegularFixture();
    const docWithoutOv = buildDoctorFile({
      today: f1.today,
      appVersion: '0.1.0',
      profile: f1.profile,
      dayLogs: f1.dayLogs,
      medicines: f1.medicines,
      visits: f1.visits,
      options: {
        range: '6m',
        format: 'md',
        includeNotes: true,
        includeMedicines: true,
        includeIntimacy: false,
      },
    });
    expect(docWithoutOv.content).toContain('## 8. Body and lifestyle');
    expect(docWithoutOv.content).not.toContain('## 9. Ovulation signals');

    // 2. Full Step 4 Fixture 4: irregular cycles (>8d variation -> STD-01), acne/hair,
    //    36 non-bleeding days with sleep->cramps pattern, and 42 BBT readings with no shift
    const dayLogs: DayLog[] = [];
    const bodyLogs: BodyLog[] = [];
    // 6 cycles spanning >9 days variation -> fires STD-01 cleanly:
    // 2026-03-01 (+22) -> 2026-03-23 (+35) -> 2026-04-27 (+24) -> 2026-05-21 (+36) -> 2026-06-26 (+26) -> 2026-07-22 (+36) -> 2026-08-27
    const starts = [
      '2026-03-01',
      '2026-03-23',
      '2026-04-27',
      '2026-05-21',
      '2026-06-26',
      '2026-07-22',
      '2026-08-27',
    ];
    for (const s of starts) {
      dayLogs.push(day(s, { flow: 'medium' }), day(addDays(s, 1), { flow: 'medium' }));
    }
    // 42 consecutive non-bleeding days from Sep 18 to Oct 29 with alternating short/good sleep
    // driving cramps and stable oscillating BBT (no 3-over-6 shift!)
    for (let i = 0; i < 42; i += 1) {
      const date = addDays('2026-09-18', i);
      const prevShort = i > 0 && (i - 1) % 2 === 0;
      const todayShort = i % 2 === 0;
      dayLogs.push(
        day(date, {
          flow: 'none',
          pain: { level: prevShort ? 4 : 1, sites: ['lower-middle'] },
          symptoms: prevShort ? ['cramps'] : [],
          context: { stress: todayShort ? 4 : 2 },
          fertility: {
            bbt: i % 2 === 0 ? 36.4 : 36.52,
            lh: i === 25 ? 'negative' : undefined,
          },
        }),
      );
      bodyLogs.push({
        date,
        sleep: { hours: todayShort ? 5 : 8, quality: todayShort ? 1 : 3 },
        water: { ml: 2000 },
        meals: { pattern: 'regular', tags: ['balanced'] },
        stool: { count: 1, bristol: 4 },
        exercise: { minutes: 30, effort: 'moderate' },
        energy: 4,
        skin: i === 20 ? { acne: 2, hair: 'shedding' } : undefined,
        updatedAt: `${date}T21:00:00+05:00`,
      });
    }

    const step4Doc = buildDoctorFile({
      today,
      appVersion: '0.1.0',
      profile: baseProfile({
        selfRegularity: 'irregular',
        units: { temperature: 'F', water: 'glasses' },
      }),
      dayLogs,
      bodyLogs,
      medicines: [],
      visits: [],
      options: {
        range: '6m',
        format: 'md',
        includeBody: true,
        includeNotes: true,
        includeMedicines: true,
        includeIntimacy: false,
      },
    });

    expect(step4Doc.content).toContain('## 6. Patterns the app found');
    expect(step4Doc.content).toContain('On days after under 6 hours of sleep');
    expect(step4Doc.content).toContain('This is a pattern, not proof of cause.');
    expect(step4Doc.content).toContain('## 8. Body and lifestyle');
    expect(step4Doc.content).toContain('glasses');
    expect(step4Doc.content).toContain('## 9. Ovulation signals');
    expect(step4Doc.content).toContain('42 non-illness days of basal body temperature logging recorded with no 3-over-6 shift');
    expect(step4Doc.content).toContain('I also notice acne or hair changes. Should my hormone levels be checked?');

    // Verify includeBody: false omits Part 8 and blanks body columns in Day CSV
    const noBodyDoc = buildDoctorFile({
      today,
      appVersion: '0.1.0',
      profile: baseProfile(),
      dayLogs,
      bodyLogs,
      medicines: [],
      visits: [],
      options: {
        range: '6m',
        format: 'md',
        includeBody: false,
        includeNotes: true,
        includeMedicines: true,
        includeIntimacy: false,
      },
    });
    expect(noBodyDoc.content).not.toContain('## 8. Body and lifestyle');

    const noBodyCsv = buildDayTableCsv({
      today,
      dayLogs,
      bodyLogs,
      medicines: [],
      includeBody: false,
    });
    expect(noBodyCsv.content).not.toContain(',2000,');
  });
});

describe('CSV formula injection protection', () => {
  for (const prefix of ['=', '+', '-', '@', '\t', '\r']) {
    it(`prefixes note values beginning with ${JSON.stringify(prefix)}`, () => {
      const today = '2026-10-30';
      const dangerousNote = `${prefix}1+1`;
      const csv = buildDayTableCsv({
        today,
        dayLogs: [day(today, { note: dangerousNote })],
        medicines: [],
        includeBody: false,
        includeMedicines: false,
      });

      expect(csv.content).toContain(`'${dangerousNote}`);
    });
  }
});

describe('CSV vs Doctor File formula rendering', () => {
  it('escapes formula-like notes only for CSV while preserving doctor-readable Markdown', () => {
    const today = '2026-10-30';
    const formulaNotes = ['=SUM(A1)', '+cmd', '-cmd', '@url'];
    const individualLogs = formulaNotes.map((note, index) =>
      day(addDays(today, index - formulaNotes.length), { note }),
    );
    const combinedNote = formulaNotes.join(' / ');
    const dayLogs = [...individualLogs, day(today, { note: combinedNote })];

    const csv = buildDayTableCsv({
      today,
      dayLogs,
      medicines: [],
      includeBody: false,
      includeMedicines: false,
    });
    for (const note of formulaNotes) {
      expect(csv.content).toContain(`,'${note}`);
    }
    expect(csv.content).toContain(`,'${combinedNote}`);

    const doctorFile = buildDoctorFile({
      today,
      appVersion: '0.2.0',
      profile: baseProfile(),
      dayLogs,
      medicines: [],
      visits: [],
      options: {
        range: 'all',
        format: 'md',
        includeNotes: true,
        includeMedicines: false,
        includeIntimacy: false,
      },
    });
    expect(doctorFile.content).toContain(combinedNote);
    for (const note of formulaNotes) {
      expect(doctorFile.content).toContain(note);
      expect(doctorFile.content).not.toContain(`'${note}`);
    }
  });
});
