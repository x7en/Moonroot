import { addDays, diffDays } from '../core/model/dates';
import {
  SCHEMA_VERSION,
  type AppSnapshotData,
  type BackupMeta,
  type DateKey,
  type DayLog,
  type DoctorVisit,
  type MedicineEntry,
  type Profile,
} from '../core/model/types';
import {
  createBackupFile,
  inspectBackupFile,
  restoreBackupFile,
  type BackupPreview,
} from '../data/backup';

export type { BackupPreview };
import { IndexedDBStorage } from '../data/idb';
import { defaultBackupMeta } from '../data/migrations';
import { createPinLock, verifyPin } from '../data/pin';

export { createPinLock };
import regionsData from '../data/regions.json';
import { downloadTextFile, getLocalDateKey, getLocalStamp } from '../platform/web';

export const APP_VERSION = '0.1.0';

export interface RegionEmergencyInfo {
  code: string;
  name: string;
  emergency: Array<{ number: string; label: string; note: string }>;
  mentalHealthLine: string;
}

export function getRegionOptions(): RegionEmergencyInfo[] {
  return Object.entries(regionsData).map(([code, info]) => ({
    code,
    name: info.name,
    emergency: info.emergency,
    mentalHealthLine: info.mentalHealthLine,
  }));
}

export function getRegionEmergencyInfo(regionCode: string): RegionEmergencyInfo {
  const entry =
    (regionsData as Record<string, Omit<RegionEmergencyInfo, 'code'>>)[regionCode] ??
    regionsData.PK;
  return {
    code: regionCode in regionsData ? regionCode : 'PK',
    name: entry.name,
    emergency: entry.emergency,
    mentalHealthLine: entry.mentalHealthLine,
  };
}

export function makeDefaultProfile(nowIso: StampLike = getLocalStamp()): Profile {
  return {
    schemaVersion: SCHEMA_VERSION,
    createdAt: nowIso,
    birthYear: null,
    menarcheAge: null,
    selfRegularity: 'unknown',
    lastPeriodApprox: null,
    onHormones: null,
    contraception: null,
    sexualHealthQuestions: 'when-relevant',
    intimacy: 'prefer-not-to-say',
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
  };
}

type StampLike = string;

export function makeEmptyDayLog(date: DateKey, nowIso: StampLike = getLocalStamp()): DayLog {
  return {
    date,
    filledFrom: date === getLocalDateKey() ? 'live' : 'backfill',
    flow: null,
    symptoms: [],
    danger: [],
    note: '',
    updatedAt: nowIso,
  };
}

export function isBackupOverdue(meta: BackupMeta, dayLogsCount: number, today: DateKey): boolean {
  if (dayLogsCount === 0) return false;
  if (meta.snoozedUntil && meta.snoozedUntil.slice(0, 10) > today) return false;
  if (!meta.lastExportAt) return dayLogsCount >= 3;
  const lastDate = meta.lastExportAt.slice(0, 10);
  return diffDays(lastDate, today) >= 14;
}

export class MoonrootStore {
  readonly storage: IndexedDBStorage;
  snapshot: AppSnapshotData;
  locked = false;

  constructor(storage = new IndexedDBStorage()) {
    this.storage = storage;
    this.snapshot = {
      profile: null,
      dayLogs: [],
      bodyLogs: [],
      decisions: [],
      forecasts: [],
      verdicts: [],
      watchItems: [],
      visits: [],
      medicines: [],
      companion: {
        rings: 0,
        stage: 0,
        unlocked: ['dusk', 'dawn', 'high-contrast'],
        badges: [],
        lastRingDate: null,
      },
      meta: defaultBackupMeta(),
    };
  }

  async init(): Promise<void> {
    this.snapshot = await this.storage.exportAll();
    this.locked = this.snapshot.profile?.lock.type === 'pin';
  }

  async unlockWithPin(pin: string): Promise<boolean> {
    const lock = this.snapshot.profile?.lock;
    if (!lock || lock.type !== 'pin') {
      this.locked = false;
      return true;
    }
    const ok = await verifyPin(pin, lock);
    if (ok) {
      this.locked = false;
    }
    return ok;
  }

  async saveProfile(profile: Profile): Promise<void> {
    await this.storage.saveProfile(profile);
    this.snapshot = { ...this.snapshot, profile };
  }

  async setPin(pin: string | null): Promise<void> {
    if (!this.snapshot.profile) return;
    const lock = pin ? await createPinLock(pin) : { type: 'none' as const };
    await this.saveProfile({ ...this.snapshot.profile, lock });
  }

  getDayLog(date: DateKey): DayLog | null {
    return this.snapshot.dayLogs.find((d) => d.date === date) ?? null;
  }

  async saveDayLog(log: DayLog): Promise<DayLog | null> {
    const previous = this.getDayLog(log.date);
    await this.storage.saveDayLog(log);
    const others = this.snapshot.dayLogs.filter((d) => d.date !== log.date);
    this.snapshot = {
      ...this.snapshot,
      dayLogs: [...others, log].sort((a, b) => a.date.localeCompare(b.date)),
    };
    return previous;
  }

  async restorePreviousDayLog(date: DateKey, previous: DayLog | null): Promise<void> {
    if (previous) {
      await this.saveDayLog(previous);
    } else {
      await this.storage.deleteDayLog(date);
      this.snapshot = {
        ...this.snapshot,
        dayLogs: this.snapshot.dayLogs.filter((d) => d.date !== date),
      };
    }
  }

  async deleteDayLog(date: DateKey): Promise<void> {
    await this.storage.deleteDayLog(date);
    this.snapshot = {
      ...this.snapshot,
      dayLogs: this.snapshot.dayLogs.filter((d) => d.date !== date),
    };
  }

  async saveMedicine(entry: MedicineEntry): Promise<void> {
    await this.storage.saveMedicine(entry);
    const others = this.snapshot.medicines.filter((m) => m.id !== entry.id);
    this.snapshot = {
      ...this.snapshot,
      medicines: [...others, entry].sort((a, b) => a.date.localeCompare(b.date)),
    };
  }

  async deleteMedicine(id: string): Promise<void> {
    await this.storage.deleteMedicine(id);
    this.snapshot = {
      ...this.snapshot,
      medicines: this.snapshot.medicines.filter((m) => m.id !== id),
    };
  }

  async saveVisit(visit: DoctorVisit): Promise<void> {
    await this.storage.saveVisit(visit);
    const others = this.snapshot.visits.filter((v) => v.id !== visit.id);
    this.snapshot = {
      ...this.snapshot,
      visits: [...others, visit].sort((a, b) => a.date.localeCompare(b.date)),
    };
  }

  async exportBackup(passphrase?: string): Promise<{ filename: string; json: string }> {
    const nowIso = getLocalStamp();
    const today = getLocalDateKey();
    const current = await this.storage.exportAll();
    const json = await createBackupFile(current, {
      appVersion: APP_VERSION,
      exportedAt: nowIso,
      passphrase,
    });
    const nextMeta: BackupMeta = {
      ...current.meta,
      lastExportAt: nowIso,
      passphraseAsked: true,
    };
    await this.storage.saveMeta(nextMeta);
    this.snapshot = { ...current, meta: nextMeta };
    return { filename: `moonroot-backup-${today}.json`, json };
  }

  async snoozeBackupNudge(): Promise<void> {
    const snoozeDate = addDays(getLocalDateKey(), 7);
    const nextMeta: BackupMeta = {
      ...this.snapshot.meta,
      snoozedUntil: `${snoozeDate}T00:00:00+00:00`,
    };
    await this.storage.saveMeta(nextMeta);
    this.snapshot = { ...this.snapshot, meta: nextMeta };
  }

  async inspectBackup(rawText: string): Promise<BackupPreview> {
    return inspectBackupFile(rawText);
  }

  async restoreBackup(rawText: string, passphrase?: string): Promise<AppSnapshotData> {
    const restored = await restoreBackupFile(rawText, {
      storage: this.storage,
      passphrase,
      nowIso: getLocalStamp(),
    });
    this.snapshot = restored;
    this.locked = false;
    return restored;
  }

  async deleteAllData(): Promise<void> {
    await this.storage.clearAll();
    this.snapshot = await this.storage.exportAll();
    this.locked = false;
  }

  downloadFile(filename: string, content: string, mimeType?: string): void {
    downloadTextFile(filename, content, mimeType);
  }
}
