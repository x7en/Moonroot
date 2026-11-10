import {
  SCHEMA_VERSION,
  type AppSnapshotData,
  type BackupFile,
  type LockedBackupFile,
  type Stamp,
  type UnlockedBackupFile,
} from '../core/model/types';
import type { IndexedDBStorage } from './idb';
import { migrateSnapshot } from './migrations';

// Current OWASP 2023+ guidance for PBKDF2-HMAC-SHA256
const PBKDF2_ITERATIONS = 600_000;

function getSubtle(): SubtleCrypto {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error('Browser crypto is unavailable in this environment.');
  }
  return subtle;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i] as number);
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function canonicalStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalStringify(item)).join(',')}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalStringify(obj[k])}`).join(',')}}`;
}

export async function sha256Hex(text: string): Promise<string> {
  const encoded = new TextEncoder().encode(text);
  const digest = await getSubtle().digest('SHA-256', encoded);
  return bytesToHex(new Uint8Array(digest));
}

async function deriveAesKey(
  passphrase: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
  usage: KeyUsage[],
): Promise<CryptoKey> {
  const subtle = getSubtle();
  const baseKey = await subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    usage,
  );
}

export interface CreateBackupOptions {
  appVersion: string;
  exportedAt: Stamp;
  passphrase?: string;
}

export async function createBackupFile(
  data: AppSnapshotData,
  options: CreateBackupOptions,
): Promise<string> {
  const canonicalData = canonicalStringify(data);
  const checksum = await sha256Hex(canonicalData);
  const passphrase = options.passphrase?.trim();

  if (!passphrase) {
    const file: UnlockedBackupFile = {
      format: 'moonroot-backup',
      schemaVersion: SCHEMA_VERSION,
      appVersion: options.appVersion,
      exportedAt: options.exportedAt,
      checksum,
      data,
    };
    return JSON.stringify(file, null, 2);
  }

  const salt = new Uint8Array(new ArrayBuffer(16));
  const iv = new Uint8Array(new ArrayBuffer(12));
  globalThis.crypto.getRandomValues(salt);
  globalThis.crypto.getRandomValues(iv);

  const key = await deriveAesKey(passphrase, salt, PBKDF2_ITERATIONS, ['encrypt']);
  const plaintextBytes = new TextEncoder().encode(canonicalData);
  const encrypted = await getSubtle().encrypt({ name: 'AES-GCM', iv }, key, plaintextBytes);

  const saltB64 = bytesToBase64(salt);
  const ivB64 = bytesToBase64(iv);
  const file: LockedBackupFile = {
    format: 'moonroot-backup',
    schemaVersion: SCHEMA_VERSION,
    appVersion: options.appVersion,
    exportedAt: options.exportedAt,
    checksum,
    encryption: {
      method: 'PBKDF2-AES-GCM',
      hash: 'SHA-256',
      iterations: PBKDF2_ITERATIONS,
      salt: saltB64,
      iv: ivB64,
    },
    iv: ivB64,
    ciphertext: bytesToBase64(new Uint8Array(encrypted)),
  };
  return JSON.stringify(file, null, 2);
}

export interface BackupPreview {
  locked: boolean;
  schemaVersion: number;
  appVersion: string;
  exportedAt: Stamp;
  counts: {
    days: number;
    medicines: number;
    visits: number;
    decisions: number;
  };
}

function parseAndValidateHeader(rawText: string): BackupFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new Error('This file is not valid JSON. Nothing was imported.');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('This file is not a Moonroot backup. Nothing was imported.');
  }
  const obj = parsed as Partial<BackupFile>;
  if (obj.format !== 'moonroot-backup' || typeof obj.schemaVersion !== 'number' || typeof obj.checksum !== 'string') {
    throw new Error('This file is not a valid Moonroot backup. Nothing was imported.');
  }
  if (obj.schemaVersion > SCHEMA_VERSION) {
    throw new Error(
      'This backup came from a newer version of Moonroot. Update the app before restoring it.',
    );
  }
  return obj as BackupFile;
}

function isLockedBackup(file: BackupFile): file is LockedBackupFile {
  return 'ciphertext' in file && 'encryption' in file;
}

export async function inspectBackupFile(rawText: string): Promise<BackupPreview> {
  const file = parseAndValidateHeader(rawText);
  if (isLockedBackup(file)) {
    return {
      locked: true,
      schemaVersion: file.schemaVersion,
      appVersion: file.appVersion,
      exportedAt: file.exportedAt,
      counts: { days: 0, medicines: 0, visits: 0, decisions: 0 },
    };
  }

  const checksum = await sha256Hex(canonicalStringify(file.data));
  if (checksum !== file.checksum) {
    throw new Error('Backup checksum failed. The file may be changed or damaged. Nothing was imported.');
  }

  const data = migrateSnapshot(file.data, file.schemaVersion);
  return {
    locked: false,
    schemaVersion: file.schemaVersion,
    appVersion: file.appVersion,
    exportedAt: file.exportedAt,
    counts: {
      days: data.dayLogs.length,
      medicines: data.medicines.length,
      visits: data.visits.length,
      decisions: data.decisions.length,
    },
  };
}

export interface RestoreBackupOptions {
  storage: IndexedDBStorage;
  passphrase?: string;
  nowIso: Stamp;
}

export async function restoreBackupFile(
  rawText: string,
  options: RestoreBackupOptions,
): Promise<AppSnapshotData> {
  const file = parseAndValidateHeader(rawText);

  let rawData: unknown;
  if (isLockedBackup(file)) {
    const passphrase = options.passphrase?.trim();
    if (!passphrase) {
      throw new Error('Enter the backup passphrase to unlock this file.');
    }
    try {
      const salt = base64ToBytes(file.encryption.salt);
      const iv = base64ToBytes(file.iv || file.encryption.iv);
      const ciphertext = base64ToBytes(file.ciphertext);
      const iterations = file.encryption.iterations || PBKDF2_ITERATIONS;
      const key = await deriveAesKey(passphrase, salt, iterations, ['decrypt']);
      const decrypted = await getSubtle().decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
      const plainJson = new TextDecoder().decode(decrypted);
      rawData = JSON.parse(plainJson);
    } catch {
      throw new Error('Wrong passphrase, or the backup file was changed. Nothing was imported.');
    }
  } else {
    rawData = file.data;
  }

  const computedChecksum = await sha256Hex(canonicalStringify(rawData));
  if (computedChecksum !== file.checksum) {
    throw new Error(
      'Backup checksum failed. The file may be changed or damaged. Nothing was imported.',
    );
  }

  const migrated = migrateSnapshot(rawData, file.schemaVersion);

  // Save a hidden 7-day pre-restore snapshot before replacing existing records.
  const currentData = await options.storage.exportAll();
  if (
    currentData.profile !== null ||
    currentData.dayLogs.length > 0 ||
    currentData.medicines.length > 0
  ) {
    await options.storage.savePreRestoreSnapshot(currentData, options.nowIso);
  }

  await options.storage.replaceAll(migrated);
  return migrated;
}
