import { describe, expect, it } from 'vitest';
import {
  ASK_QUESTIONS,
  answerAllAskQuestions,
  answerAskQuestion,
} from '../../core/ask/ask';
import { addDays } from '../../core/model/dates';
import type {
  BackupMeta,
  BodyLog,
  DayLog,
  MedicineEntry,
  Profile,
  Verdict,
} from '../../core/model/types';

function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    schemaVersion: 1,
    createdAt: '2026-08-01T10:00:00+05:00',
    birthYear: 1998,
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
    disclaimerAcceptedAt: '2026-08-01T10:00:00+05:00',
    reducedMotion: false,
    haptics: true,
    sound: false,
    ...overrides,
  };
}

function makeDay(date: string, overrides: Partial<DayLog> = {}): DayLog {
  return {
    date,
    filledFrom: 'live',
    flow: 'none',
    pain: { level: 0, sites: [] },
    symptoms: [],
    danger: [],
    dangerAnswered: true,
    note: '',
    updatedAt: `${date}T19:00:00+05:00`,
    ...overrides,
  };
}

describe('core/ask/ask', () => {
  it('defines the exact 10 non-conversational questions in spec order', () => {
    expect(ASK_QUESTIONS.map((q) => q.question)).toEqual([
      'What medicines did I take this week?',
      'When did my last period start, and what day is it now?',
      'What are my longest and shortest cycles?',
      'What did the app flag lately, and why?',
      'How heavy were my last three periods?',
      'How many days did I log this month?',
      'What is my confidence score made of?',
      'Which long-term flags do I have?',
      'What questions could I ask my doctor?',
      'When was my last backup?',
    ]);
  });

  it('explains cleanly what is missing on empty data for every question and never crashes or invents data', () => {
    const today = '2026-11-08';
    const meta: BackupMeta = {
      lastExportAt: null,
      lastAutoBackupAt: null,
      snoozedUntil: null,
      passphraseAsked: false,
    };
    const answers = answerAllAskQuestions({
      today,
      nowIso: `${today}T19:00:00+05:00`,
      profile: makeProfile(),
      dayLogs: [],
      bodyLogs: [],
      decisions: [],
      forecasts: [],
      medicines: [],
      verdicts: [],
      meta,
    });

    expect(answers).toHaveLength(10);
    for (const ans of answers) {
      expect(ans.dateRange.length).toBeGreaterThan(5);
      expect(ans.summary.length).toBeGreaterThan(5);
      expect(ans.missingReason).toBeTruthy();
      expect(ans.hasEnoughData).toBe(false);
      // Must obey copy-lint / non-advice rules
      const fullText = `${ans.summary} ${ans.details.join(' ')} ${ans.missingReason ?? ''}`;
      expect(fullText).not.toMatch(
        /\b(abnormal|overdue|failed|late|missed|safe dose|maximum dose|overdose|you should take|you can take)\b/i,
      );
      expect(fullText).not.toMatch(/\bdiagnos(e|is|ed|ing)\b/i);
    }
  });

  it('answers all 10 fixture questions accurately with date ranges and zero dosing advice', () => {
    const today = '2026-11-08';
    const starts = ['2026-08-05', '2026-09-04', '2026-10-05', '2026-11-05'];
    const dayLogs: DayLog[] = [];
    for (const s of starts) {
      for (let d = 0; d < 4; d += 1) {
        const dt = addDays(s, d);
        dayLogs.push(
          makeDay(dt, {
            flow: s === '2026-10-05' && d === 1 ? 'heavy' : d === 0 ? 'medium' : 'light',
            pain: { level: d === 0 ? 5 : 2, sites: ['lower-middle'] },
            symptoms: d === 0 ? ['cramps'] : [],
          }),
        );
      }
    }
    // Add non-bleeding check-ins this month (November 2026)
    dayLogs.push(makeDay('2026-11-01', { flow: 'none' }));
    dayLogs.push(makeDay('2026-11-02', { flow: 'none' }));
    dayLogs.push(makeDay('2026-11-04', { flow: 'none' }));

    const bodyLogs: BodyLog[] = [
      {
        date: '2026-11-03',
        water: { ml: 1500 },
        sleep: { hours: 7, quality: 3 },
        updatedAt: '2026-11-03T20:00:00+05:00',
      },
      {
        date: '2026-11-08',
        water: { ml: 1750 },
        updatedAt: '2026-11-08T18:00:00+05:00',
      },
    ];

    const medicines: MedicineEntry[] = [
      {
        id: 'med-1',
        date: '2026-11-05',
        kind: 'dose',
        category: 'pain-relief',
        nameShown: 'Ponstan',
        genericName: 'mefenamic acid',
        strengthMg: 250,
        units: 2,
        takenAt: '2026-11-05T10:00:00+05:00',
        note: '',
        updatedAt: '2026-11-05T10:00:00+05:00',
      },
      {
        id: 'med-2',
        date: '2026-11-06',
        kind: 'dose',
        category: 'pain-relief',
        nameShown: 'Ponstan Forte',
        genericName: 'mefenamic acid',
        strengthMg: 500,
        units: 1,
        takenAt: '2026-11-06T12:00:00+05:00',
        note: '',
        updatedAt: '2026-11-06T12:00:00+05:00',
      },
    ];

    const verdicts: Verdict[] = [
      {
        id: 'v-1',
        at: '2026-10-06T12:00:00+05:00',
        kind: 'today',
        level: 'yellow',
        ruleIds: ['YEL-07'],
        title: 'Keep watching',
        reasons: ['Because you logged changing every 2 to 3 hours on a heavy flow day.'],
        rulesetVersion: '1.0',
      },
    ];

    const meta: BackupMeta = {
      lastExportAt: '2026-11-01T16:30:00+05:00',
      lastAutoBackupAt: null,
      snoozedUntil: null,
      passphraseAsked: true,
    };

    const input = {
      today,
      nowIso: `${today}T19:00:00+05:00`,
      profile: makeProfile(),
      dayLogs,
      bodyLogs,
      decisions: [],
      forecasts: [],
      medicines,
      verdicts,
      meta,
    };

    const q1 = answerAskQuestion('medicines-this-week', input);
    expect(q1.hasEnoughData).toBe(true);
    expect(q1.dateRange).toBe('2026-11-02 to 2026-11-08');
    expect(q1.summary).toContain('mefenamic acid');
    expect(q1.summary).toContain('2 dose');
    expect(q1.summary).toContain('1000 mg');
    expect(q1.details.some((d) => d.includes('Same medicine'))).toBe(true);
    expect(q1.details.some((d) => d.includes('Check the pack for the daily limit'))).toBe(true);

    const q2 = answerAskQuestion('last-period-and-day', input);
    expect(q2.hasEnoughData).toBe(true);
    expect(q2.summary).toContain('2026-11-05');
    expect(q2.summary).toContain('day 3');

    const q3 = answerAskQuestion('longest-and-shortest-cycles', input);
    expect(q3.hasEnoughData).toBe(true);
    expect(q3.summary).toContain('31');
    expect(q3.summary).toContain('30');

    const q4 = answerAskQuestion('flagged-lately', input);
    expect(q4.dateRange).toBe('2026-10-10 to 2026-11-08');
    // v-1 is 2026-10-06 which is 33 days before 2026-11-08 -> nothing in 30d window, notes earlier flag cleanly
    expect(q4.summary).toMatch(/No Yellow, Orange, or Red flags/i);

    const q5 = answerAskQuestion('last-three-periods-heavy', input);
    expect(q5.hasEnoughData).toBe(true);
    expect(q5.details).toHaveLength(3);
    expect(q5.summary).toContain('3');

    const q6 = answerAskQuestion('days-logged-this-month', input);
    expect(q6.hasEnoughData).toBe(true);
    expect(q6.dateRange).toBe('2026-11-01 to 2026-11-08');
    // Day logs in Nov: 1,2,4,5,6,7,8 = 7 check-ins; Body logs in Nov: 3,8 (8 total distinct logged days)
    expect(q6.summary).toContain('7');
    expect(q6.summary).toContain('2');

    const q7 = answerAskQuestion('confidence-breakdown', input);
    expect(q7.hasEnoughData).toBe(true);
    expect(q7.summary).toContain('%');
    expect(q7.details.some((d) => d.includes('Completed cycles counted:'))).toBe(true);

    const q8 = answerAskQuestion('standing-flags', input);
    expect(q8.summary).toContain('long-term flags');

    const q9 = answerAskQuestion('doctor-questions', input);
    expect(q9.details.length).toBeGreaterThan(0);

    const q10 = answerAskQuestion('last-backup', input);
    expect(q10.hasEnoughData).toBe(true);
    expect(q10.summary).toContain('2026-11-01');
  });

  it('handles standing flags, recent 30d flags, hormone courses, 40+ BBT no shift, and partial <3 period histories', () => {
    const today = '2026-11-08';
    const dayLogs: DayLog[] = [];
    // Irregular starts triggering STD-01 / STD-02 / STD-05 / ORG-02
    const irregularStarts = ['2026-04-01', '2026-04-22', '2026-06-05', '2026-07-02', '2026-08-25', '2026-09-20', '2026-10-30'];
    for (const s of irregularStarts) {
      dayLogs.push(makeDay(s, { flow: 'heavy', soakedPerHour: true }));
      dayLogs.push(makeDay(addDays(s, 1), { flow: 'medium' }));
    }
    // 42 non-illness BBT logs all flat at 36.4 without thermal shift
    for (let i = 0; i < 42; i += 1) {
      const dt = addDays('2026-08-15', i);
      const existing = dayLogs.find((d) => d.date === dt);
      if (existing) {
        existing.fertility = { bbt: 36.4 };
      } else {
        dayLogs.push(makeDay(dt, { flow: 'none', fertility: { bbt: 36.4 } }));
      }
    }

    const answerDoc = answerAskQuestion('doctor-questions', {
      today,
      nowIso: `${today}T19:00:00+05:00`,
      profile: makeProfile({ onHormones: true }),
      dayLogs,
      bodyLogs: [],
      decisions: [],
      forecasts: [],
      medicines: [
        {
          id: 'course-1',
          date: '2026-10-01',
          kind: 'course',
          category: 'hormone',
          nameShown: 'Combined pill',
          genericName: null,
          strengthMg: null,
          startDate: '2026-10-01',
          stopDate: null,
          note: '',
          updatedAt: '2026-10-01T09:00:00+05:00',
        },
      ],
      verdicts: [
        {
          id: 'recent-org',
          at: '2026-11-02T10:00:00+05:00',
          kind: 'today',
          level: 'orange',
          ruleIds: ['ORG-02'],
          title: 'See a doctor soon',
          reasons: ['Because you logged soaking a pad an hour for 2 hours.'],
          rulesetVersion: '1.0',
        },
      ],
      meta: {
        lastExportAt: null,
        lastAutoBackupAt: '2026-11-06T03:00:00+05:00',
        snoozedUntil: null,
        passphraseAsked: false,
      },
    });
    expect(answerDoc.hasEnoughData).toBe(true);
    expect(answerDoc.details.some((d) => d.includes('40 temperature logs'))).toBe(true);
    expect(answerDoc.details.some((d) => d.includes('hormone medicine'))).toBe(true);

    const flagged = answerAskQuestion('flagged-lately', {
      today,
      nowIso: `${today}T19:00:00+05:00`,
      profile: makeProfile(),
      dayLogs,
      bodyLogs: [],
      decisions: [],
      forecasts: [],
      medicines: [],
      verdicts: [
        {
          id: 'recent-org',
          at: '2026-11-02T10:00:00+05:00',
          kind: 'today',
          level: 'orange',
          ruleIds: ['ORG-02'],
          title: 'See a doctor soon',
          reasons: ['Because you logged soaking a pad an hour for 2 hours.'],
          rulesetVersion: '1.0',
        },
      ],
      meta: {
        lastExportAt: null,
        lastAutoBackupAt: '2026-11-06T03:00:00+05:00',
        snoozedUntil: null,
        passphraseAsked: false,
      },
    });
    expect(flagged.summary).toContain('See a doctor soon');
    expect(flagged.details[0]).toContain('ORG-02');

    const standing = answerAskQuestion('standing-flags', {
      today,
      nowIso: `${today}T19:00:00+05:00`,
      profile: makeProfile(),
      dayLogs,
      bodyLogs: [],
      decisions: [],
      forecasts: [],
      medicines: [],
      verdicts: [],
      meta: {
        lastExportAt: null,
        lastAutoBackupAt: null,
        snoozedUntil: null,
        passphraseAsked: false,
      },
    });
    expect(standing.hasEnoughData).toBe(true);
    expect(standing.details.length).toBeGreaterThan(0);

    const courseOnlyMeds = answerAskQuestion('medicines-this-week', {
      today,
      nowIso: `${today}T19:00:00+05:00`,
      profile: makeProfile(),
      dayLogs: [],
      bodyLogs: [],
      decisions: [],
      forecasts: [],
      medicines: [
        {
          id: 'course-1',
          date: '2026-10-01',
          kind: 'course',
          category: 'hormone',
          nameShown: 'Combined pill',
          genericName: null,
          strengthMg: null,
          startDate: '2026-10-01',
          stopDate: null,
          note: '',
          updatedAt: '2026-10-01T09:00:00+05:00',
        },
      ],
      verdicts: [],
      meta: {
        lastExportAt: null,
        lastAutoBackupAt: '2026-11-06T03:00:00+05:00',
        snoozedUntil: null,
        passphraseAsked: false,
      },
    });
    expect(courseOnlyMeds.hasEnoughData).toBe(true);
    expect(courseOnlyMeds.details[0]).toContain('Combined pill');

    const autoBackupOnly = answerAskQuestion('last-backup', {
      today,
      nowIso: `${today}T19:00:00+05:00`,
      profile: makeProfile(),
      dayLogs: [],
      bodyLogs: [],
      decisions: [],
      forecasts: [],
      medicines: [],
      verdicts: [],
      meta: {
        lastExportAt: null,
        lastAutoBackupAt: '2026-11-06T03:00:00+05:00',
        snoozedUntil: null,
        passphraseAsked: false,
      },
    });
    expect(autoBackupOnly.hasEnoughData).toBe(true);
    expect(autoBackupOnly.summary).toContain('2026-11-06');
  });
});
