import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { SCHEMA_VERSION, type DayLog, type MedicineEntry, type Profile } from '../../core/model/types';
import { IndexedDBStorage } from '../../data/idb';

describe('data/idb persistence across close and reopen', () => {
  it('persists profile, day logs, medicines, and pre-restore snapshot across reopening', async () => {
    const dbName = `moonroot-reopen-${Math.random().toString(36).slice(2)}`;
    const s1 = new IndexedDBStorage(dbName);

    const profile: Profile = {
      schemaVersion: SCHEMA_VERSION,
      createdAt: '2026-10-01T08:00:00+05:00',
      birthYear: 2004,
      menarcheAge: 13,
      selfRegularity: 'irregular',
      lastPeriodApprox: '2026-09-10',
      onHormones: false,
      contraception: 'none',
      sexualHealthQuestions: 'when-relevant',
      intimacy: 'prefer-not-to-say',
      conditionsNote: '',
      medicationsNote: '',
      sproutName: 'Leafy',
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

    const log: DayLog = {
      date: '2026-10-30',
      filledFrom: 'live',
      flow: 'medium',
      pain: { level: 4, sites: ['lower-middle'] },
      symptoms: ['cramps'],
      danger: [],
      dangerAnswered: true,
      note: 'Persisted across close',
      updatedAt: '2026-10-30T10:00:00+05:00',
    };

    const med: MedicineEntry = {
      id: 'm-1',
      date: '2026-10-30',
      kind: 'dose',
      category: 'pain-relief',
      nameShown: 'Ponstan',
      genericName: 'mefenamic acid',
      strengthMg: 250,
      units: 1,
      helped: 'yes',
      note: '',
      updatedAt: '2026-10-30T11:00:00+05:00',
    };

    await s1.saveProfile(profile);
    await s1.saveDayLog(log);
    await s1.saveMedicine(med);
    await s1.close();

    // Reopen fresh instance against the same IndexedDB database
    const s2 = new IndexedDBStorage(dbName);
    const loadedProfile = await s2.getProfile();
    const loadedLog = await s2.getDayLog('2026-10-30');
    const loadedMeds = await s2.getAllMedicines();

    expect(loadedProfile?.sproutName).toBe('Leafy');
    expect(loadedLog?.note).toBe('Persisted across close');
    expect(loadedLog?.dangerAnswered).toBe(true);
    expect(loadedMeds).toHaveLength(1);
    expect(loadedMeds[0]?.nameShown).toBe('Ponstan');

    await s2.savePreRestoreSnapshot(await s2.exportAll(), '2026-10-30T12:00:00+05:00');
    expect(await s2.getPreRestoreSnapshot('2026-11-05T12:00:00+05:00')).not.toBeNull();
    expect(await s2.getPreRestoreSnapshot('2026-11-07T12:00:00+05:00')).toBeNull();
    await s2.close();
  });
});
