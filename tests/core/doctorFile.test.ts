import { describe, expect, it } from 'vitest';
import type {
  DayLog,
  Decision,
  DoctorVisit,
  MedicineEntry,
  Profile,
  Verdict,
} from '../../core/model/types';
import { buildDoctorFile } from '../../core/report/doctorFile';

const ADULT_PROFILE: Profile = {
  schemaVersion: 1,
  createdAt: '2026-06-01T08:00:00+05:00',
  birthYear: 2004,
  menarcheAge: 13,
  selfRegularity: 'irregular',
  lastPeriodApprox: '2026-06-01',
  onHormones: false,
  contraception: 'none',
  sexualHealthQuestions: 'when-relevant',
  intimacy: 'active',
  conditionsNote: 'Tired sometimes',
  medicationsNote: 'Iron tablet',
  sproutName: 'Pip',
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
  disclaimerAcceptedAt: '2026-06-01T08:01:00+05:00',
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
    updatedAt: `${date}T19:00:00+05:00`,
    ...overrides,
  };
}

const STEP2_LOGS: DayLog[] = [
  // Period 1: July 1..4 (30-day cycle)
  makeDay('2026-07-01', { flow: 'heavy', clots: 'large', pain: { level: 8, sites: ['lower-middle'], stoppedActivities: true }, symptoms: ['cramps'] }),
  makeDay('2026-07-02', { flow: 'heavy', pain: { level: 7, sites: ['lower-middle'], stoppedActivities: true }, symptoms: ['cramps', 'tiredness'] }),
  makeDay('2026-07-03', { flow: 'medium', pain: { level: 4, sites: ['lower-middle'] } }),
  // Period 2: July 31..Aug 3 (42-day cycle)
  makeDay('2026-07-30', { flow: 'spotting' }),
  makeDay('2026-07-31', { flow: 'heavy', pain: { level: 8, sites: ['lower-middle'], stoppedActivities: true }, symptoms: ['cramps'] }),
  makeDay('2026-08-01', { flow: 'medium', pain: { level: 5, sites: ['lower-middle'] } }),
  // Between-period spotting in August
  makeDay('2026-08-15', { flow: 'spotting', note: 'Mid cycle spot' }),
  // Period 3: Sept 11..14 (49-day cycle)
  makeDay('2026-09-11', { flow: 'heavy', soakedPerHour: true, changeEvery: 'under-2h', pain: { level: 6, sites: ['lower-middle'] } }),
  makeDay('2026-09-12', { flow: 'heavy', pain: { level: 5, sites: ['lower-middle'] }, danger: ['unusual-tiredness'] }),
  // Non-period stool blood in October
  makeDay('2026-10-15', { flow: 'none', stoolBlood: 'back-passage' }),
  // Period 4: Oct 28..30
  makeDay('2026-10-28', {
    flow: 'heavy',
    protection: 'pad',
    clots: 'small',
    pain: { level: 7, sites: ['lower-middle'], stoppedActivities: true },
    symptoms: ['cramps', 'tiredness'],
    note: 'Stayed home due to pain',
  }),
  makeDay('2026-10-30', {
    flow: 'medium',
    protection: 'pad',
    pain: { level: 4, sites: ['lower-middle'] },
    symptoms: ['cramps'],
    intimacy: { event: 'protected', bleedingAfter: true, painDuring: false },
    test: { kind: 'pregnancy', result: 'negative' },
    note: 'Feeling calmer',
  }),
];

const MEDICINES: MedicineEntry[] = [
  {
    id: 'm1',
    date: '2026-10-28',
    kind: 'dose',
    category: 'pain-relief',
    nameShown: 'Ponstan',
    genericName: 'mefenamic acid',
    strengthMg: 250,
    units: 2,
    helped: 'yes',
    note: '',
    updatedAt: '2026-10-28T10:00:00+05:00',
  },
  {
    id: 'm2',
    date: '2026-09-01',
    kind: 'course',
    category: 'hormone',
    nameShown: 'Combined pill',
    genericName: 'combined-hormone',
    strengthMg: null,
    startDate: '2026-09-01',
    stopDate: null,
    note: '',
    updatedAt: '2026-09-01T10:00:00+05:00',
  },
];

const DECISIONS: Decision[] = [
  {
    id: 'dec-base',
    date: '2026-08-15',
    kind: 'new-baseline',
    note: 'Hormone change',
    at: '2026-09-01T10:00:00+05:00',
  },
];

const VISITS: DoctorVisit[] = [{ id: 'v1', date: '2026-10-20', note: 'Routine check' }];
const VERDICTS: Verdict[] = [
  {
    id: 'ev-1',
    at: '2026-09-12T08:00:00+05:00',
    kind: 'event',
    level: 'orange',
    ruleIds: ['ORG-02'],
    title: 'See a doctor soon',
    triggerKey: 'ORG-02:2026-09-11',
    reasons: ['Heavy flow signs logged'],
    rulesetVersion: '1.0',
    dismissedAt: '2026-09-13T08:00:00+05:00',
  },
];

describe('core/report/doctorFile (Step 2 parts: 1, 2, 3, 4, 5 per-period, 7, 10, 11, 12 + Daily log)', () => {
  it('builds Step 2 Markdown and plain text exports with all Step 2 parts, questions, and machine-readable JSON', () => {
    const md = buildDoctorFile({
      today: '2026-10-30',
      appVersion: '0.1.0',
      profile: ADULT_PROFILE,
      dayLogs: STEP2_LOGS,
      medicines: MEDICINES,
      visits: VISITS,
      decisions: DECISIONS,
      verdicts: VERDICTS,
      options: {
        range: '6m',
        format: 'md',
        includeNotes: true,
        includeMedicines: true,
        includeIntimacy: false,
        worryNote: 'I never know when it will start.',
      },
    });

    expect(md.filename).toBe('moonroot-doctor-2026-10-30.md');
    expect(md.content).toContain('For an AI assistant reading this file');
    expect(md.content).toContain('# Menstrual health summary');
    expect(md.content).toContain('In her words: "I never know when it will start."');
    expect(md.content).toContain('## 1. At a glance');
    expect(md.content).toContain('## 2. Profile');
    expect(md.content).toContain('## 3. Cycle history');
    expect(md.content).toContain('## 4. Bleeding detail');
    expect(md.content).toContain('## 5. Pain and symptoms');
    expect(md.content).toContain('## 7. Flags raised');
    expect(md.content).toContain('## 10. Tests, medicines and visits');
    expect(md.content).toContain('## 11. Questions to ask');
    expect(md.content).toContain('## 12. Data quality');
    expect(md.content).toContain('## Daily log (last 3 months)');
    expect(md.content).toContain('## Machine-readable data');
    expect(md.content).toContain('before the change');
    expect(md.content).toContain('Pain per period:');
    expect(md.content).toContain('Could my iron be low, and should I have a blood count?');
    expect(md.content).toContain('I take Ponstan for pain');
    expect(md.content).toContain('I started Combined pill on 2026-09-01');
    expect(md.content).toContain('I saw blood in my stool');
    expect(md.content).toContain('mefenamic acid');
    expect(md.content).toContain('Routine check');
    expect(md.content).toContain('not yet clinician reviewed');
    expect(md.content).not.toContain('[intimacy:');
    expect(md.content).not.toContain('Bleeding after sex (included by preference)');

    const txt = buildDoctorFile({
      today: '2026-10-30',
      appVersion: '0.1.0',
      profile: ADULT_PROFILE,
      dayLogs: STEP2_LOGS,
      medicines: MEDICINES,
      visits: VISITS,
      decisions: DECISIONS,
      verdicts: VERDICTS,
      options: {
        range: '3m',
        format: 'txt',
        includeNotes: false,
        includeMedicines: false,
        includeIntimacy: false,
        includeVerdicts: false,
      },
    });

    expect(txt.filename).toBe('moonroot-doctor-2026-10-30.txt');
    expect(txt.content).not.toContain('<!--');
    expect(txt.content).not.toContain('7. Flags raised');
    expect(txt.content).not.toContain('Stayed home due to pain');
    expect(txt.content).not.toContain('mefenamic acid');
  });

  it('never exports intimacy data or bleeding-after-sex details for under-18 or unknown birthYear even if requested', () => {
    const minorProfile: Profile = { ...ADULT_PROFILE, birthYear: 2010 };
    const result = buildDoctorFile({
      today: '2026-10-30',
      appVersion: '0.1.0',
      profile: minorProfile,
      dayLogs: STEP2_LOGS,
      medicines: MEDICINES,
      visits: VISITS,
      decisions: DECISIONS,
      verdicts: VERDICTS,
      options: {
        range: 'all',
        format: 'md',
        includeNotes: true,
        includeMedicines: true,
        includeIntimacy: true,
      },
    });

    expect(result.content).not.toContain('protected');
    expect(result.content).not.toContain('bleedingAfter');
    expect(result.content).not.toContain('Bleeding after sex');
    expect(result.content).not.toContain('or after sex');
    expect(result.content).not.toContain('Intimacy');
  });
});
