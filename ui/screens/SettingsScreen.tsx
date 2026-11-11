import { useEffect, useRef, useState } from 'preact/hooks';
import { APP_VERSION, getRegionOptions, type BackupPreview } from '../../app/store';
import { isUnder18 } from '../../core/model/dates';
import { RULESET_VERSION, type DateKey, type Profile } from '../../core/model/types';
import { readFileText } from '../../platform/web';

interface SettingsScreenProps {
  today: DateKey;
  profile: Profile;
  onSaveProfile: (profile: Profile) => Promise<void>;
  onSetPin: (pin: string | null) => Promise<void>;
  onExportBackup: (passphrase?: string) => Promise<{ filename: string; json: string }>;
  onInspectBackup: (rawText: string) => Promise<BackupPreview>;
  onRestoreBackup: (rawText: string, passphrase?: string) => Promise<void>;
  onDownloadFile: (filename: string, content: string, mimeType: string) => void;
  onDeleteAll: () => Promise<void>;
}

export function SettingsScreen({
  today,
  profile,
  onSaveProfile,
  onSetPin,
  onExportBackup,
  onInspectBackup,
  onRestoreBackup,
  onDownloadFile,
  onDeleteAll,
}: SettingsScreenProps) {
  const [birthYear, setBirthYear] = useState(
    profile.birthYear !== null ? String(profile.birthYear) : '',
  );
  const [conditionsNote, setConditionsNote] = useState(profile.conditionsNote);
  const [medicationsNote, setMedicationsNote] = useState(profile.medicationsNote);
  const [sproutName, setSproutName] = useState(profile.sproutName ?? '');
  const [newPin, setNewPin] = useState('');
  const [pinStatus, setPinStatus] = useState('');

  const [exportPassphrase, setExportPassphrase] = useState('');
  const [exportConfirmNoPass, setExportConfirmNoPass] = useState(false);
  const [backupMessage, setBackupMessage] = useState('');

  const [restoreRawText, setRestoreRawText] = useState('');
  const [restorePreview, setRestorePreview] = useState<BackupPreview | null>(null);
  const [restorePassphrase, setRestorePassphrase] = useState('');
  const [restoreError, setRestoreError] = useState('');
  const [restoreSuccess, setRestoreSuccess] = useState('');

  const [deleteStep, setDeleteStep] = useState<0 | 1>(0);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  const draftRef = useRef<Profile | null>(null);
  const pendingWritesRef = useRef(0);
  const saveChainRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    if (pendingWritesRef.current === 0) {
      draftRef.current = null;
    }
  }, [profile]);

  function patchProfile(
    updater: Partial<Profile> | ((prev: Profile) => Partial<Profile>),
  ): Promise<void> {
    const base = draftRef.current ?? profile;
    const patch = typeof updater === 'function' ? updater(base) : updater;
    const next: Profile = { ...base, ...patch };
    draftRef.current = next;
    pendingWritesRef.current += 1;
    const run = saveChainRef.current.then(async () => {
      try {
        await onSaveProfile(next);
      } finally {
        pendingWritesRef.current -= 1;
        if (pendingWritesRef.current === 0 && draftRef.current === next) {
          draftRef.current = null;
        }
      }
    });
    saveChainRef.current = run;
    return run;
  }

  const regions = getRegionOptions();
  const under18 = isUnder18(profile, today);

  function saveTextProfileChanges(): void {
    const parsedYear =
      birthYear.trim() !== '' && Number.isFinite(Number(birthYear)) ? Number(birthYear) : null;
    void patchProfile((prev) => ({
      birthYear: parsedYear,
      conditionsNote: conditionsNote.trim(),
      medicationsNote: medicationsNote.trim(),
      sproutName: sproutName.trim() || null,
      intimacy:
        parsedYear === null || Number(today.slice(0, 4)) - parsedYear < 18
          ? 'prefer-not-to-say'
          : prev.intimacy,
    }));
  }

  async function handleSavePin(): Promise<void> {
    if (newPin.trim().length < 4) {
      setPinStatus('Enter at least 4 digits.');
      return;
    }
    await onSetPin(newPin.trim());
    setNewPin('');
    setPinStatus('PIN lock saved.');
  }

  async function handleExport(): Promise<void> {
    setBackupMessage('');
    const pass = exportPassphrase.trim();
    if (!pass && !exportConfirmNoPass) {
      setBackupMessage(
        'Anyone who has an unlocked backup file can read it. Enter a passphrase above or check "Export without passphrase" below.',
      );
      return;
    }
    const result = await onExportBackup(pass || undefined);
    onDownloadFile(result.filename, result.json, 'application/json;charset=utf-8');
    setExportPassphrase('');
    setExportConfirmNoPass(false);
    setBackupMessage(
      pass
        ? `Saved passphrase-locked backup ${result.filename}.`
        : `Saved unlocked backup ${result.filename}.`,
    );
  }

  async function handlePickBackupFile(e: Event): Promise<void> {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    setRestoreError('');
    setRestoreSuccess('');
    setRestorePreview(null);
    setRestorePassphrase('');
    if (!file) return;

    try {
      const text = await readFileText(file);
      const preview = await onInspectBackup(text);
      setRestoreRawText(text);
      setRestorePreview(preview);
    } catch (err) {
      setRestoreRawText('');
      setRestorePreview(null);
      setRestoreError(err instanceof Error ? err.message : 'Could not read backup file.');
    }
  }

  async function handleConfirmRestore(): Promise<void> {
    if (!restoreRawText) return;
    setRestoreError('');
    setRestoreSuccess('');
    try {
      await onRestoreBackup(
        restoreRawText,
        restorePreview?.locked ? restorePassphrase : undefined,
      );
      setRestoreSuccess('Backup restored on this device.');
      setRestoreRawText('');
      setRestorePreview(null);
      setRestorePassphrase('');
    } catch (err) {
      setRestoreError(err instanceof Error ? err.message : 'Could not restore backup.');
    }
  }

  return (
    <div>
      <section class="card" aria-label="Appearance and units">
        <h2 class="card-title">Appearance and units</h2>
        <div class="field">
          <span class="field-label">Theme</span>
          <div class="chip-group">
            {(
              [
                { value: 'dusk', label: 'Dusk (night)' },
                { value: 'dawn', label: 'Dawn (day)' },
                { value: 'high-contrast', label: 'High contrast' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.value}
                type="button"
                class="chip"
                aria-pressed={profile.theme === opt.value}
                onClick={() => void patchProfile({ theme: opt.value })}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div class="field">
          <span class="field-label">Temperature unit</span>
          <div class="chip-group">
            {(['C', 'F'] as const).map((unit) => (
              <button
                key={unit}
                type="button"
                class="chip"
                aria-pressed={profile.units.temperature === unit}
                onClick={() =>
                  void patchProfile((prev) => ({
                    units: { ...prev.units, temperature: unit },
                  }))
                }
              >
                °{unit}
              </button>
            ))}
          </div>
        </div>

        <div class="field">
          <span class="field-label">Water unit</span>
          <div class="chip-group">
            {(
              [
                { value: 'ml', label: 'ml' },
                { value: 'glasses', label: 'glasses (250 ml)' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.value}
                type="button"
                class="chip"
                aria-pressed={profile.units.water === opt.value}
                onClick={() =>
                  void patchProfile((prev) => ({
                    units: { ...prev.units, water: opt.value },
                  }))
                }
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div class="field">
          <label htmlFor="settings-region">Emergency numbers region</label>
          <select
            id="settings-region"
            class="select"
            value={profile.region}
            onChange={(e) =>
              void patchProfile({ region: (e.target as HTMLSelectElement).value })
            }
          >
            {regions.map((r) => (
              <option key={r.code} value={r.code}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section class="card" aria-label="Profile details">
        <h2 class="card-title">Profile</h2>
        <div class="field">
          <label htmlFor="set-birth-year">Birth year</label>
          <input
            id="set-birth-year"
            class="input"
            type="number"
            inputMode="numeric"
            value={birthYear}
            onInput={(e) => setBirthYear((e.target as HTMLInputElement).value)}
            onBlur={saveTextProfileChanges}
          />
        </div>
        <div class="field">
          <span class="field-label">Hormone medicine</span>
          <div class="chip-group">
            {(
              [
                { value: true, label: 'Yes' },
                { value: false, label: 'No' },
                { value: null, label: 'Not sure' },
              ] as const
            ).map((opt) => (
              <button
                key={String(opt.value)}
                type="button"
                class="chip"
                aria-pressed={profile.onHormones === opt.value}
                onClick={() => void patchProfile({ onHormones: opt.value })}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        {!under18 && (
          <div class="field">
            <span class="field-label">Pregnancy questions</span>
            <div class="chip-group">
              {(['when-relevant', 'off'] as const).map((opt) => (
                <button
                  key={opt}
                  type="button"
                  class="chip"
                  aria-pressed={profile.sexualHealthQuestions === opt}
                  onClick={() =>
                    void patchProfile({ sexualHealthQuestions: opt })
                  }
                >
                  {opt === 'when-relevant' ? 'When relevant' : 'Off'}
                </button>
              ))}
            </div>
          </div>
        )}
        <div class="field">
          <label htmlFor="set-conditions">Conditions note</label>
          <input
            id="set-conditions"
            class="input"
            type="text"
            value={conditionsNote}
            onInput={(e) => setConditionsNote((e.target as HTMLInputElement).value)}
            onBlur={saveTextProfileChanges}
          />
        </div>
        <div class="field">
          <label htmlFor="set-meds-note">Regular medicines note</label>
          <input
            id="set-meds-note"
            class="input"
            type="text"
            value={medicationsNote}
            onInput={(e) => setMedicationsNote((e.target as HTMLInputElement).value)}
            onBlur={saveTextProfileChanges}
          />
        </div>
        <div class="field">
          <label htmlFor="set-sprout-name">Sprout name</label>
          <input
            id="set-sprout-name"
            class="input"
            type="text"
            value={sproutName}
            onInput={(e) => setSproutName((e.target as HTMLInputElement).value)}
            onBlur={saveTextProfileChanges}
          />
        </div>
        <button type="button" class="btn btn-small" onClick={saveTextProfileChanges}>
          Save profile text
        </button>
      </section>

      <section class="card" aria-label="PIN lock">
        <h2 class="card-title">Screen PIN lock</h2>
        <p class="muted" style={{ marginTop: 0 }}>
          Status: {profile.lock.type === 'pin' ? 'PIN lock on' : 'No PIN lock'}. A PIN is a screen
          lock on this phone, not file encryption.
        </p>
        <div class="field">
          <label htmlFor="set-pin-input">Set or change PIN (4+ digits)</label>
          <input
            id="set-pin-input"
            class="input"
            type="password"
            inputMode="numeric"
            value={newPin}
            onInput={(e) => {
              setNewPin((e.target as HTMLInputElement).value);
              setPinStatus('');
            }}
          />
        </div>
        <div class="btn-row">
          <button type="button" class="btn" onClick={() => void handleSavePin()}>
            Save PIN
          </button>
          {profile.lock.type === 'pin' && (
            <button
              type="button"
              class="btn"
              onClick={() => {
                void onSetPin(null);
                setPinStatus('PIN lock removed.');
              }}
            >
              Remove PIN
            </button>
          )}
        </div>
        {pinStatus && <p style={{ marginBottom: 0 }}>{pinStatus}</p>}
      </section>

      <section class="card" aria-label="Backup and restore">
        <h2 class="card-title">Backup and restore</h2>
        <p class="muted" style={{ marginTop: 0 }}>
          Locking your backup with a passphrase is recommended. If you forget that passphrase, the
          backup cannot be recovered. Anyone who has an unlocked backup file can read it.
        </p>

        <div class="field">
          <label htmlFor="backup-passphrase">Backup passphrase (recommended)</label>
          <input
            id="backup-passphrase"
            class="input"
            type="password"
            value={exportPassphrase}
            onInput={(e) => {
              setExportPassphrase((e.target as HTMLInputElement).value);
              setBackupMessage('');
            }}
            placeholder="Choose a passphrase you will remember"
          />
        </div>
        <label class="chip" style={{ width: '100%', marginBottom: '10px' }}>
          <input
            type="checkbox"
            checked={exportConfirmNoPass}
            onChange={(e) => setExportConfirmNoPass((e.target as HTMLInputElement).checked)}
          />
          <span>Export without passphrase (anyone with the file can read it)</span>
        </label>
        <button type="button" class="btn btn-primary" onClick={() => void handleExport()}>
          Export backup JSON
        </button>
        {backupMessage && <p style={{ marginBottom: '12px' }}>{backupMessage}</p>}

        <hr style={{ border: 'none', borderTop: '1px solid var(--border)', marginBlock: '16px' }} />

        <div class="field">
          <label htmlFor="restore-file-input">Restore from backup file (.json)</label>
          <input
            id="restore-file-input"
            class="input"
            type="file"
            accept=".json,application/json"
            onChange={(e) => void handlePickBackupFile(e)}
          />
        </div>

        {restorePreview && (
          <div class="notice-banner">
            <p style={{ marginTop: 0 }}>
              {restorePreview.locked
                ? `Encrypted backup exported at ${restorePreview.exportedAt}.`
                : `Backup from ${restorePreview.exportedAt}: ${restorePreview.counts.days} days, ${restorePreview.counts.medicines} medicines, ${restorePreview.counts.visits} visits.`}
            </p>
            {restorePreview.locked && (
              <div class="field">
                <label htmlFor="restore-passphrase">Enter backup passphrase</label>
                <input
                  id="restore-passphrase"
                  class="input"
                  type="password"
                  value={restorePassphrase}
                  onInput={(e) => setRestorePassphrase((e.target as HTMLInputElement).value)}
                />
              </div>
            )}
            <button
              type="button"
              class="btn btn-lamp"
              onClick={() => void handleConfirmRestore()}
            >
              Replace data with this backup
            </button>
          </div>
        )}

        {restoreError && (
          <p role="alert" style={{ color: 'var(--level-red)', fontWeight: 700 }}>
            {restoreError}
          </p>
        )}
        {restoreSuccess && (
          <p role="status" style={{ color: 'var(--level-green)', fontWeight: 700 }}>
            {restoreSuccess}
          </p>
        )}
      </section>

      <section class="card" aria-label="About Moonroot">
        <h2 class="card-title">About</h2>
        <p style={{ marginTop: 0 }}>
          Moonroot {APP_VERSION} · Ruleset {RULESET_VERSION}
        </p>
        <p class="muted">
          Ruleset status: Not yet reviewed by a clinician. This app tracks and sorts urgency. It
          does not diagnose.
        </p>
        <p class="muted" style={{ marginBottom: 0 }}>
          Step 2 build: check-in intelligence, cycle derivation, watch checks and clinical review
          doctor summary active on-device.
        </p>
      </section>

      <section class="card" aria-label="Delete all data">
        <h2 class="card-title">Delete all data</h2>
        {deleteStep === 0 ? (
          <button type="button" class="btn btn-danger-solid" onClick={() => setDeleteStep(1)}>
            Delete all data
          </button>
        ) : (
          <div>
            <p>
              This erases every log, medicine, visit and setting on this device. Type{' '}
              <strong>DELETE</strong> to confirm.
            </p>
            <div class="field">
              <label htmlFor="delete-confirm-input">Type DELETE</label>
              <input
                id="delete-confirm-input"
                class="input"
                type="text"
                value={deleteConfirmText}
                onInput={(e) => setDeleteConfirmText((e.target as HTMLInputElement).value)}
              />
            </div>
            <div class="btn-row">
              <button
                type="button"
                class="btn"
                onClick={() => {
                  setDeleteStep(0);
                  setDeleteConfirmText('');
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                class="btn btn-danger-solid"
                disabled={deleteConfirmText.trim() !== 'DELETE'}
                onClick={() => void onDeleteAll()}
              >
                Confirm delete everything
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
