import type { IDBPDatabase, IDBPTransaction, StoreNames } from 'idb';
import {
  SCHEMA_VERSION,
  type AppSnapshotData,
  type BackupMeta,
  type CompanionState,
  type DayLog,
} from '../core/model/types';

export const STORE_NAMES = [
  'profile',
  'dayLogs',
  'bodyLogs',
  'decisions',
  'forecasts',
  'verdicts',
  'watchItems',
  'visits',
  'medicines',
  'companion',
  'meta',
] as const;

export function defaultCompanionState(): CompanionState {
  return {
    rings: 0,
    stage: 0,
    unlocked: ['dusk', 'dawn', 'high-contrast'],
    badges: [],
    lastRingDate: null,
  };
}

export function defaultBackupMeta(): BackupMeta {
  return {
    lastExportAt: null,
    lastAutoBackupAt: null,
    snoozedUntil: null,
    passphraseAsked: false,
  };
}

type SnapshotMigrator = (input: Record<string, unknown>) => Record<string, unknown>;

/**
 * Pure step migrations[n] turning snapshot schema version n into n + 1.
 */
export const migrations: Record<number, SnapshotMigrator> = {
  0: (input) => {
    const rawProfile = input.profile as Record<string, unknown> | null | undefined;
    const nextProfile = rawProfile
      ? {
          ...rawProfile,
          schemaVersion: 1,
          locale: rawProfile.locale ?? 'en',
          region: rawProfile.region ?? 'PK',
          discreetMode: rawProfile.discreetMode ?? true,
          lock: rawProfile.lock ?? { type: 'none' },
        }
      : null;

    const rawDayLogs = Array.isArray(input.dayLogs) ? (input.dayLogs as DayLog[]) : [];
    const normalizedDayLogs = rawDayLogs.map((log) => ({
      ...log,
      symptoms: Array.isArray(log.symptoms) ? log.symptoms : [],
      danger: Array.isArray(log.danger) ? log.danger : [],
      note: typeof log.note === 'string' ? log.note : '',
      // Deliberately preserve dangerAnswered as-is (do NOT synthesize true on old logs).
    }));

    return {
      profile: nextProfile,
      dayLogs: normalizedDayLogs,
      bodyLogs: Array.isArray(input.bodyLogs) ? input.bodyLogs : [],
      decisions: Array.isArray(input.decisions) ? input.decisions : [],
      forecasts: Array.isArray(input.forecasts) ? input.forecasts : [],
      verdicts: Array.isArray(input.verdicts) ? input.verdicts : [],
      watchItems: Array.isArray(input.watchItems) ? input.watchItems : [],
      visits: Array.isArray(input.visits) ? input.visits : [],
      medicines: Array.isArray(input.medicines) ? input.medicines : [],
      companion: input.companion ?? defaultCompanionState(),
      meta: input.meta ?? defaultBackupMeta(),
    };
  },
};

export function migrateSnapshot(raw: unknown, fromVersion: number): AppSnapshotData {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Backup data is invalid.');
  }
  if (fromVersion > SCHEMA_VERSION) {
    throw new Error(
      'This backup came from a newer version of Moonroot. Update the app before restoring it.',
    );
  }

  let current = { ...(raw as Record<string, unknown>) };
  let v = fromVersion;
  while (v < SCHEMA_VERSION) {
    const step = migrations[v];
    if (!step) {
      throw new Error(`Unsupported backup schema version ${v}.`);
    }
    current = step(current);
    v += 1;
  }

  return {
    profile: (current.profile as AppSnapshotData['profile']) ?? null,
    dayLogs: (current.dayLogs as AppSnapshotData['dayLogs']) ?? [],
    bodyLogs: (current.bodyLogs as AppSnapshotData['bodyLogs']) ?? [],
    decisions: (current.decisions as AppSnapshotData['decisions']) ?? [],
    forecasts: (current.forecasts as AppSnapshotData['forecasts']) ?? [],
    verdicts: (current.verdicts as AppSnapshotData['verdicts']) ?? [],
    watchItems: (current.watchItems as AppSnapshotData['watchItems']) ?? [],
    visits: (current.visits as AppSnapshotData['visits']) ?? [],
    medicines: (current.medicines as AppSnapshotData['medicines']) ?? [],
    companion: (current.companion as CompanionState) ?? defaultCompanionState(),
    meta: (current.meta as BackupMeta) ?? defaultBackupMeta(),
  };
}

/**
 * IndexedDB upgrade hook running inside IDB's single upgrade transaction.
 */
export function runIdbMigrations(
  db: IDBPDatabase<unknown>,
  oldVersion: number,
  _newVersion?: number | null,
  _transaction?: IDBPTransaction<unknown, StoreNames<unknown>[], 'versionchange'>,
): void {
  if (oldVersion < 1) {
    if (!db.objectStoreNames.contains('profile')) {
      db.createObjectStore('profile');
    }
    if (!db.objectStoreNames.contains('dayLogs')) {
      db.createObjectStore('dayLogs', { keyPath: 'date' });
    }
    if (!db.objectStoreNames.contains('bodyLogs')) {
      db.createObjectStore('bodyLogs', { keyPath: 'date' });
    }
    if (!db.objectStoreNames.contains('decisions')) {
      const s = db.createObjectStore('decisions', { keyPath: 'id' });
      s.createIndex('date', 'date');
    }
    if (!db.objectStoreNames.contains('forecasts')) {
      const s = db.createObjectStore('forecasts', { keyPath: 'id' });
      s.createIndex('anchor', 'anchor');
    }
    if (!db.objectStoreNames.contains('verdicts')) {
      const s = db.createObjectStore('verdicts', { keyPath: 'id' });
      s.createIndex('at', 'at');
    }
    if (!db.objectStoreNames.contains('watchItems')) {
      const s = db.createObjectStore('watchItems', { keyPath: 'id' });
      s.createIndex('status', 'status');
    }
    if (!db.objectStoreNames.contains('visits')) {
      const s = db.createObjectStore('visits', { keyPath: 'id' });
      s.createIndex('date', 'date');
    }
    if (!db.objectStoreNames.contains('medicines')) {
      const s = db.createObjectStore('medicines', { keyPath: 'id' });
      s.createIndex('date', 'date');
    }
    if (!db.objectStoreNames.contains('companion')) {
      db.createObjectStore('companion');
    }
    if (!db.objectStoreNames.contains('meta')) {
      db.createObjectStore('meta');
    }
  }
}
