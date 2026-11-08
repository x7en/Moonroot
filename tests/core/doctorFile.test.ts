import { describe, expect, it } from 'vitest';
import type { DayLog, DoctorVisit, MedicineEntry, Profile } from '../../core/model/types';
import { buildDoctorFile } from '../../core/report/doctorFile';

const ADULT_PROFILE: Profile = {
  schemaVersion: 1,
  createdAt: '2026-10-01T08:00:00+05:00',
  birthYear: 2004,
  menarcheAge: 13,
  selfRegularity: 'irregular',
  lastPeriodApprox: '2026-09-01',
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
  disclaimerAcceptedAt: '2026-10-01T08:01:00+05:00',
};

const LOGS: DayLog[] = [
  {
    date: '2026-10-28',
    filledFrom: 'live',
    flow: 'heavy',
    protection: 'pad',
    clots: 'small',
    pain: { level: 7, sites: ['lower-middle'], stoppedActivities: true },
    symptoms: ['cramps', 'tiredness'],
    danger: [],
    dangerAnswered: true,
    mood: 2,
    note: 'Stayed home due to pain',
    updatedAt: '2026-10-28T20:00:00+05:00',
  },
  {
    date: '2026-10-30',
    filledFrom: 'live',
    flow: 'medium',
    protection: 'pad',
    pain: { level: 4, sites: ['lower-middle'] },
    symptoms: ['cramps'],
    danger: [],
    dangerAnswered: true,
    intimacy: { event: 'protected', bleedingAfter: false, painDuring: false },
    test: { kind: 'pregnancy', result: 'negative' },
    note: 'Feeling calmer',
    updatedAt: '2026-10-30T19:00:00+05:00',
  },
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
];

const VISITS: DoctorVisit[] = [{ id: 'v1', date: '2026-10-20', note: 'Routine check' }];

describe('core/report/doctorFile (Step 1 parts: 2, 5, 10, 12 + Daily log table)', () => {
  it('builds Markdown and plain text exports with Step 1 sections and machine-readable JSON', () => {
    const md = buildDoctorFile({
      today: '2026-10-30',
      appVersion: '0.1.0',
      profile: ADULT_PROFILE,
      dayLogs: LOGS,
      medicines: MEDICINES,
      visits: VISITS,
      options: {
        range: '3m',
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
    expect(md.content).toContain('## 2. Profile');
    expect(md.content).toContain('## 5. Pain and symptoms');
    expect(md.content).toContain('## 10. Tests, medicines and visits');
    expect(md.content).toContain('## 12. Data quality');
    expect(md.content).toContain('## Daily log (last 3 months)');
    expect(md.content).toContain('## Machine-readable data');
    expect(md.content).toContain('mefenamic acid');
    expect(md.content).toContain('Routine check');
    expect(md.content).toContain('not yet clinician reviewed');
    expect(md.content).not.toContain('intimacy');

    const txt = buildDoctorFile({
      today: '2026-10-30',
      appVersion: '0.1.0',
      profile: ADULT_PROFILE,
      dayLogs: LOGS,
      medicines: MEDICINES,
      visits: VISITS,
      options: {
        range: '3m',
        format: 'txt',
        includeNotes: false,
        includeMedicines: false,
        includeIntimacy: false,
      },
    });

    expect(txt.filename).toBe('moonroot-doctor-2026-10-30.txt');
    expect(txt.content).not.toContain('<!--');
    expect(txt.content).not.toContain('Stayed home due to pain');
    expect(txt.content).not.toContain('mefenamic acid');
  });

  it('never exports intimacy data for under-18 or unknown birthYear even if requested', () => {
    const minorProfile: Profile = { ...ADULT_PROFILE, birthYear: 2010 };
    const result = buildDoctorFile({
      today: '2026-10-30',
      appVersion: '0.1.0',
      profile: minorProfile,
      dayLogs: LOGS,
      medicines: MEDICINES,
      visits: VISITS,
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
    expect(result.content).not.toContain('Intimacy');
  });
});
