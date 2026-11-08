import { openDB, type IDBPDatabase } from 'idb';
import { addDays } from '../core/model/dates';
import {
  SCHEMA_VERSION,
  type AppSnapshotData,
  type BackupMeta,
  type BodyLog,
  type CompanionState,
  type DateKey,
  type DayLog,
  type Decision,
  type DoctorVisit,
  type Forecast,
  type MedicineEntry,
  type MoonrootStorage,
  type Profile,
  type Stamp,
  type Verdict,
  type WatchItem,
} from '../core/model/types';
import {
  defaultBackupMeta,
  defaultCompanionState,
  runIdbMigrations,
  STORE_NAMES,
} from './migrations';

interface PreRestoreRecord {
  savedAt: Stamp;
  expiresDate: DateKey;
  data: AppSnapshotData;
}

const PRE_RESTORE_KEY = 'pre-restore-snapshot';

export function createEmptySnapshot(): AppSnapshotData {
  return {
    profile: null,
    dayLogs: [],
    bodyLogs: [],
    decisions: [],
    forecasts: [],
    verdicts: [],
    watchItems: [],
    visits: [],
    medicines: [],
    companion: defaultCompanionState(),
    meta: defaultBackupMeta(),
  };
}

export class IndexedDBStorage implements MoonrootStorage {
  private readonly dbName: string;
  private dbPromise: Promise<IDBPDatabase<unknown>> | null = null;
  private persistenceRequested = false;

  constructor(dbName = 'moonroot') {
    this.dbName = dbName;
  }

  private async getDb(): Promise<IDBPDatabase<unknown>> {
    if (!this.dbPromise) {
      this.dbPromise = openDB(this.dbName, SCHEMA_VERSION, {
        upgrade(db, oldVersion, newVersion, transaction) {
          runIdbMigrations(db, oldVersion, newVersion, transaction);
        },
      });
    }
    return this.dbPromise;
  }

  private requestPersistentStorage(): void {
    if (this.persistenceRequested) return;
    this.persistenceRequested = true;
    try {
      if (typeof navigator !== 'undefined' && navigator.storage?.persist) {
        void navigator.storage.persist();
      }
    } catch {
      // Ignore if environment does not expose navigator.storage.persist
    }
  }

  async close(): Promise<void> {
    if (!this.dbPromise) return;
    const db = await this.dbPromise;
    db.close();
    this.dbPromise = null;
  }

  async getProfile(): Promise<Profile | null> {
    const db = await this.getDb();
    return ((await db.get('profile', 'me')) as Profile | undefined) ?? null;
  }

  async saveProfile(profile: Profile): Promise<void> {
    const db = await this.getDb();
    await db.put('profile', profile, 'me');
  }

  async getDayLog(date: DateKey): Promise<DayLog | null> {
    const db = await this.getDb();
    return ((await db.get('dayLogs', date)) as DayLog | undefined) ?? null;
  }

  async getAllDayLogs(): Promise<DayLog[]> {
    const db = await this.getDb();
    return (await db.getAll('dayLogs')) as DayLog[];
  }

  async saveDayLog(log: DayLog): Promise<void> {
    const db = await this.getDb();
    await db.put('dayLogs', log);
    this.requestPersistentStorage();
  }

  async deleteDayLog(date: DateKey): Promise<void> {
    const db = await this.getDb();
    await db.delete('dayLogs', date);
  }

  async getAllBodyLogs(): Promise<BodyLog[]> {
    const db = await this.getDb();
    return (await db.getAll('bodyLogs')) as BodyLog[];
  }

  async saveBodyLog(log: BodyLog): Promise<void> {
    const db = await this.getDb();
    await db.put('bodyLogs', log);
  }

  async getAllDecisions(): Promise<Decision[]> {
    const db = await this.getDb();
    return (await db.getAll('decisions')) as Decision[];
  }

  async saveDecision(decision: Decision): Promise<void> {
    const db = await this.getDb();
    await db.put('decisions', decision);
  }

  async deleteDecision(id: string): Promise<void> {
    const db = await this.getDb();
    await db.delete('decisions', id);
  }

  async getAllForecasts(): Promise<Forecast[]> {
    const db = await this.getDb();
    return (await db.getAll('forecasts')) as Forecast[];
  }

  async saveForecast(forecast: Forecast): Promise<void> {
    const db = await this.getDb();
    await db.put('forecasts', forecast);
  }

  async getAllVerdicts(): Promise<Verdict[]> {
    const db = await this.getDb();
    return (await db.getAll('verdicts')) as Verdict[];
  }

  async saveVerdict(verdict: Verdict): Promise<void> {
    const db = await this.getDb();
    await db.put('verdicts', verdict);
  }

  async getAllWatchItems(): Promise<WatchItem[]> {
    const db = await this.getDb();
    return (await db.getAll('watchItems')) as WatchItem[];
  }

  async saveWatchItem(item: WatchItem): Promise<void> {
    const db = await this.getDb();
    await db.put('watchItems', item);
  }

  async getAllVisits(): Promise<DoctorVisit[]> {
    const db = await this.getDb();
    return (await db.getAll('visits')) as DoctorVisit[];
  }

  async saveVisit(visit: DoctorVisit): Promise<void> {
    const db = await this.getDb();
    await db.put('visits', visit);
  }

  async getAllMedicines(): Promise<MedicineEntry[]> {
    const db = await this.getDb();
    return (await db.getAll('medicines')) as MedicineEntry[];
  }

  async saveMedicine(entry: MedicineEntry): Promise<void> {
    const db = await this.getDb();
    await db.put('medicines', entry);
    this.requestPersistentStorage();
  }

  async deleteMedicine(id: string): Promise<void> {
    const db = await this.getDb();
    await db.delete('medicines', id);
  }

  async getCompanion(): Promise<CompanionState> {
    const db = await this.getDb();
    return ((await db.get('companion', 'me')) as CompanionState | undefined) ?? defaultCompanionState();
  }

  async saveCompanion(state: CompanionState): Promise<void> {
    const db = await this.getDb();
    await db.put('companion', state, 'me');
  }

  async getMeta(): Promise<BackupMeta> {
    const db = await this.getDb();
    return ((await db.get('meta', 'me')) as BackupMeta | undefined) ?? defaultBackupMeta();
  }

  async saveMeta(meta: BackupMeta): Promise<void> {
    const db = await this.getDb();
    await db.put('meta', meta, 'me');
  }

  async savePreRestoreSnapshot(data: AppSnapshotData, nowIso: Stamp): Promise<void> {
    const db = await this.getDb();
    const todayKey = nowIso.slice(0, 10);
    const record: PreRestoreRecord = {
      savedAt: nowIso,
      expiresDate: addDays(todayKey, 7),
      data,
    };
    await db.put('meta', record, PRE_RESTORE_KEY);
  }

  async getPreRestoreSnapshot(nowIso: Stamp): Promise<AppSnapshotData | null> {
    const db = await this.getDb();
    const record = (await db.get('meta', PRE_RESTORE_KEY)) as PreRestoreRecord | undefined;
    if (!record) return null;
    const todayKey = nowIso.slice(0, 10);
    if (todayKey > record.expiresDate) {
      await db.delete('meta', PRE_RESTORE_KEY);
      return null;
    }
    return record.data;
  }

  async exportAll(): Promise<AppSnapshotData> {
    const [
      profile,
      dayLogs,
      bodyLogs,
      decisions,
      forecasts,
      verdicts,
      watchItems,
      visits,
      medicines,
      companion,
      meta,
    ] = await Promise.all([
      this.getProfile(),
      this.getAllDayLogs(),
      this.getAllBodyLogs(),
      this.getAllDecisions(),
      this.getAllForecasts(),
      this.getAllVerdicts(),
      this.getAllWatchItems(),
      this.getAllVisits(),
      this.getAllMedicines(),
      this.getCompanion(),
      this.getMeta(),
    ]);

    return {
      profile,
      dayLogs: dayLogs.sort((a, b) => a.date.localeCompare(b.date)),
      bodyLogs: bodyLogs.sort((a, b) => a.date.localeCompare(b.date)),
      decisions: decisions.sort((a, b) => a.date.localeCompare(b.date)),
      forecasts: forecasts.sort((a, b) => a.anchor.localeCompare(b.anchor)),
      verdicts: verdicts.sort((a, b) => a.at.localeCompare(b.at)),
      watchItems: watchItems.sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
      visits: visits.sort((a, b) => a.date.localeCompare(b.date)),
      medicines: medicines.sort((a, b) => a.date.localeCompare(b.date)),
      companion,
      meta,
    };
  }

  async replaceAll(data: AppSnapshotData): Promise<void> {
    const db = await this.getDb();
    const tx = db.transaction([...STORE_NAMES], 'readwrite');
    const existingPreRestore = await tx.objectStore('meta').get(PRE_RESTORE_KEY);

    for (const storeName of STORE_NAMES) {
      await tx.objectStore(storeName).clear();
    }

    if (data.profile) {
      await tx.objectStore('profile').put(data.profile, 'me');
    }
    for (const row of data.dayLogs) {
      await tx.objectStore('dayLogs').put(row);
    }
    for (const row of data.bodyLogs) {
      await tx.objectStore('bodyLogs').put(row);
    }
    for (const row of data.decisions) {
      await tx.objectStore('decisions').put(row);
    }
    for (const row of data.forecasts) {
      await tx.objectStore('forecasts').put(row);
    }
    for (const row of data.verdicts) {
      await tx.objectStore('verdicts').put(row);
    }
    for (const row of data.watchItems) {
      await tx.objectStore('watchItems').put(row);
    }
    for (const row of data.visits) {
      await tx.objectStore('visits').put(row);
    }
    for (const row of data.medicines) {
      await tx.objectStore('medicines').put(row);
    }
    await tx.objectStore('companion').put(data.companion, 'me');
    await tx.objectStore('meta').put(data.meta, 'me');
    if (existingPreRestore) {
      await tx.objectStore('meta').put(existingPreRestore, PRE_RESTORE_KEY);
    }
    await tx.done;
    this.requestPersistentStorage();
  }

  async clearAll(): Promise<void> {
    const db = await this.getDb();
    const tx = db.transaction([...STORE_NAMES], 'readwrite');
    for (const storeName of STORE_NAMES) {
      await tx.objectStore(storeName).clear();
    }
    await tx.done;
  }
}
