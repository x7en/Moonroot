import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { SCHEMA_VERSION, type AppSnapshotData } from '../../core/model/types';
import {
  createBackupFile,
  inspectBackupFile,
  restoreBackupFile,
} from '../../data/backup';
import { createEmptySnapshot, IndexedDBStorage } from '../../data/idb';
import { migrateSnapshot } from '../../data/migrations';
import { createPinLock, verifyPin } from '../../data/pin';

function makeSampleSnapshot(): AppSnapshotData {
  const base = createEmptySnapshot();
  base.profile = {
    schemaVersion: SCHEMA_VERSION,
    createdAt: '2026-10-01T09:00:00+05:00',
    birthYear: 2004,
    menarcheAge: 13,
    selfRegularity: 'irregular',
    lastPeriodApprox: '2026-09-15',
    onHormones: false,
    contraception: 'none',
    sexualHealthQuestions: 'when-relevant',
    intimacy: 'prefer-not-to-say',
    conditionsNote: '',
    medicationsNote: '',
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
    disclaimerAcceptedAt: '2026-10-01T09:01:00+05:00',
  };
  base.dayLogs = [
    {
      date: '2026-10-29',
      filledFrom: 'backfill',
      flow: 'medium',
      pain: { level: 2, sites: [] },
      symptoms: [],
      danger: [],
      // deliberately omit dangerAnswered to verify restore keeps it undefined
      note: 'Legacy entry',
      updatedAt: '2026-10-29T10:00:00+05:00',
    },
    {
      date: '2026-10-30',
      filledFrom: 'live',
      flow: 'heavy',
      pain: { level: 3, sites: ['lower-middle'] },
      symptoms: ['cramps'],
      danger: [],
      dangerAnswered: true,
      note: 'Day 1',
      updatedAt: '2026-10-30T10:00:00+05:00',
    },
  ];
  base.medicines = [
    {
      id: 'med-1',
      date: '2026-10-30',
      kind: 'dose',
      category: 'pain-relief',
      nameShown: 'Ponstan',
      genericName: 'mefenamic acid',
      strengthMg: 250,
      units: 2,
      helped: 'yes',
      note: '',
      updatedAt: '2026-10-30T11:00:00+05:00',
    },
  ];
  base.visits = [{ id: 'visit-1', date: '2026-10-20', note: 'Checkup' }];
  return base;
}

describe('data/backup, data/migrations, and data/pin', () => {
  let storage: IndexedDBStorage;

  beforeEach(async () => {
    storage = new IndexedDBStorage(`moonroot-test-backup-${Math.random().toString(36).slice(2)}`);
    await storage.clearAll();
  });

  it('exports and restores an unlocked backup cleanly and checks counts', async () => {
    const sample = makeSampleSnapshot();
    const raw = await createBackupFile(sample, {
      appVersion: '0.1.0',
      exportedAt: '2026-10-30T12:00:00+05:00',
    });

    const preview = await inspectBackupFile(raw);
    expect(preview.locked).toBe(false);
    expect(preview.counts.days).toBe(2);
    expect(preview.counts.medicines).toBe(1);
    expect(preview.counts.visits).toBe(1);

    const restored = await restoreBackupFile(raw, { storage, nowIso: '2026-10-30T13:00:00+05:00' });
    expect(restored.dayLogs).toHaveLength(2);
    const restoredLegacy = restored.dayLogs.find((d) => d.date === '2026-10-29');
    expect(restoredLegacy?.dangerAnswered).toBeUndefined();
    expect(await storage.exportAll()).toEqual(sample);
  });

  it('exports and restores a passphrase-locked backup and refuses wrong passphrase or tampered files', async () => {
    const sample = makeSampleSnapshot();
    const existing = makeSampleSnapshot();
    const targetDay = existing.dayLogs.find((d) => d.date === '2026-10-30');
    if (!targetDay) throw new Error('Expected sample day log');
    existing.dayLogs = [{ ...targetDay, note: 'Keep me untouched' }];
    await storage.replaceAll(existing);

    const lockedRaw = await createBackupFile(sample, {
      appVersion: '0.1.0',
      exportedAt: '2026-10-30T12:00:00+05:00',
      passphrase: 'correct-horse-moonroot',
    });

    const preview = await inspectBackupFile(lockedRaw);
    expect(preview.locked).toBe(true);
    expect(lockedRaw).not.toContain('Day 1');
    expect(lockedRaw).not.toContain('Ponstan');

    // Wrong passphrase is refused and imports nothing
    await expect(
      restoreBackupFile(lockedRaw, {
        storage,
        passphrase: 'wrong-passphrase',
        nowIso: '2026-10-30T13:00:00+05:00',
      }),
    ).rejects.toThrow(/passphrase/i);
    expect((await storage.getDayLog('2026-10-30'))?.note).toBe('Keep me untouched');
    expect(await storage.getAllDayLogs()).toHaveLength(1);

    // Tampered file is refused and imports nothing
    const parsed = JSON.parse(lockedRaw) as { ciphertext: string };
    parsed.ciphertext = `${parsed.ciphertext.slice(0, -4)}AAAA`;
    await expect(
      restoreBackupFile(JSON.stringify(parsed), {
        storage,
        passphrase: 'correct-horse-moonroot',
        nowIso: '2026-10-30T13:00:00+05:00',
      }),
    ).rejects.toThrow();
    expect((await storage.getDayLog('2026-10-30'))?.note).toBe('Keep me untouched');

    // Correct passphrase restores completely
    await restoreBackupFile(lockedRaw, {
      storage,
      passphrase: 'correct-horse-moonroot',
      nowIso: '2026-10-30T13:00:00+05:00',
    });
    expect((await storage.getDayLog('2026-10-30'))?.note).toBe('Day 1');
    expect(await storage.getAllDayLogs()).toHaveLength(2);
  });

  it('refuses an unlocked backup whose checksum fails or whose schemaVersion is newer', async () => {
    const sample = makeSampleSnapshot();
    const raw = await createBackupFile(sample, {
      appVersion: '0.1.0',
      exportedAt: '2026-10-30T12:00:00+05:00',
    });

    const tampered = JSON.parse(raw) as { data: AppSnapshotData; schemaVersion: number };
    const tamperedDay = tampered.data.dayLogs[0];
    if (!tamperedDay) throw new Error('Expected tampered sample day log');
    tamperedDay.note = 'Altered!';
    await expect(
      restoreBackupFile(JSON.stringify(tampered), {
        storage,
        nowIso: '2026-10-30T13:00:00+05:00',
      }),
    ).rejects.toThrow(/checksum|changed|corrupt/i);

    const newer = JSON.parse(raw) as { schemaVersion: number };
    newer.schemaVersion = SCHEMA_VERSION + 1;
    await expect(
      restoreBackupFile(JSON.stringify(newer), {
        storage,
        nowIso: '2026-10-30T13:00:00+05:00',
      }),
    ).rejects.toThrow(/newer version/i);
  });

  it('migrates version 0 fixture to current SCHEMA_VERSION', () => {
    const v0Fixture = {
      profile: {
        schemaVersion: 0,
        createdAt: '2026-09-01T08:00:00+05:00',
        birthYear: 2005,
        menarcheAge: 13,
        selfRegularity: 'unknown',
        lastPeriodApprox: null,
        onHormones: null,
        contraception: null,
        sexualHealthQuestions: 'when-relevant',
        intimacy: null,
        conditionsNote: '',
        medicationsNote: '',
        sproutName: null,
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
        disclaimerAcceptedAt: null,
      },
      dayLogs: [
        {
          date: '2026-09-02',
          filledFrom: 'live',
          flow: 'light',
          symptoms: [],
          danger: [],
          note: '',
          updatedAt: '2026-09-02T09:00:00+05:00',
        },
      ],
    };

    const migrated = migrateSnapshot(v0Fixture, 0);
    expect(migrated.profile?.schemaVersion).toBe(SCHEMA_VERSION);
    expect(migrated.dayLogs).toHaveLength(1);
    expect(migrated.medicines).toEqual([]);
    expect(migrated.companion.stage).toBe(0);
  });

  it('hashes and verifies an optional PIN using PBKDF2 without plain-text storage', async () => {
    const lock = await createPinLock('4829');
    expect(lock.type).toBe('pin');
    expect(lock.hash).toBeDefined();
    expect(lock.salt).toBeDefined();
    expect(lock.hash).not.toContain('4829');

    expect(await verifyPin('4829', lock)).toBe(true);
    expect(await verifyPin('0000', lock)).toBe(false);
  });
});
