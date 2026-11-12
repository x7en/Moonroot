import { useEffect, useRef, useState } from 'preact/hooks';
import type { ReminderPlan } from '../../app/reminders';
import { APP_VERSION, getRegionOptions, type BackupPreview } from '../../app/store';
import { canUseTheme, THEME_CATALOGUE } from '../../core/companion/companion';
import { isUnder18 } from '../../core/model/dates';
import {
  RULESET_VERSION,
  type CompanionState,
  type DateKey,
  type Profile,
} from '../../core/model/types';
import {
  getDiscreetLauncherIcon,
  requestNativeNotificationPermission,
  setDiscreetLauncherIcon,
} from '../../platform/native';
import { readFileText } from '../../platform/web';

interface SettingsScreenProps {
  today: DateKey;
  profile: Profile;
  companion?: CompanionState;
  reminderPlan?: ReminderPlan;
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
  companion = {
    rings: 0,
    stage: 0,
    unlocked: ['dusk', 'dawn', 'high-contrast'],
    badges: [],
    lastRingDate: null,
  },
  reminderPlan,
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
  const [reminderNotice, setReminderNotice] = useState('');
  const [discreetIconOn, setDiscreetIconOn] = useState(false);

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

  useEffect(() => {
    let active = true;
    void getDiscreetLauncherIcon().then((enabled) => {
      if (active) setDiscreetIconOn(enabled);
    });
    return () => {
      active = false;
    };
  }, []);

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

  const displayThemes = [...THEME_CATALOGUE].sort((a, b) => {
    if (a.id === 'dawn') return -1;
    if (b.id === 'dawn') return 1;
    return 0;
  });

  function themeDisplayLabel(opt: (typeof THEME_CATALOGUE)[number]): string {
    if (opt.id === 'dawn') return 'Butter (light)';
    if (opt.id === 'dusk') return 'Night';
    return opt.label;
  }

  return (
    <div>
      <h1 class="screen-title">Settings</h1>

      <section class="card" aria-label="Appearance and units">
        <h2 class="card-title">Appearance and units</h2>
        <div class="field">
          <span class="field-label">Theme</span>
          <div class="chip-group">
            {displayThemes.map((opt) => {
              const unlocked = canUseTheme(opt.id, companion);
              const label = themeDisplayLabel(opt);
              return (
                <button
                  key={opt.id}
                  type="button"
                  class="chip"
                  disabled={!unlocked}
                  aria-pressed={profile.theme === opt.id}
                  title={opt.note}
                  onClick={() => {
                    if (unlocked) void patchProfile({ theme: opt.id });
                  }}
                >
                  {unlocked ? label : `${label} (Stage ${opt.requiredStage})`}
                </button>
              );
            })}
          </div>
          <p class="muted" style={{ margin: '6px 0 0 0' }}>
            Butter (light), Night, Match phone, and High contrast are always unlocked.
          </p>
        </div>

        <div class="field">
          <span class="field-label">Motion and touch</span>
          <div class="chip-group">
            <label class="chip">
              <input
                type="checkbox"
                checked={Boolean(profile.reducedMotion)}
                onChange={(e) =>
                  void patchProfile({ reducedMotion: (e.target as HTMLInputElement).checked })
                }
              />
              <span>Reduce motion</span>
            </label>
            <label class="chip">
              <input
                type="checkbox"
                checked={profile.haptics !== false}
                onChange={(e) =>
                  void patchProfile({ haptics: (e.target as HTMLInputElement).checked })
                }
              />
              <span>Light haptics</span>
            </label>
            <label class="chip">
              <input
                type="checkbox"
                checked={Boolean(profile.sound)}
                onChange={(e) =>
                  void patchProfile({ sound: (e.target as HTMLInputElement).checked })
                }
              />
              <span>Gentle sounds</span>
            </label>
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

      <section class="card" aria-label="Reminders and discreet mode">
        <h2 class="card-title">Reminders and discreet mode</h2>
        <p class="muted" style={{ marginTop: 0 }}>
          Notifications stay hidden from the lock screen and say only &ldquo;Moonroot: a quick
          check-in?&rdquo;. At most one reminder is sent per day.
        </p>

        <div class="field">
          <label class="chip" style={{ width: '100%' }}>
            <input
              type="checkbox"
              checked={profile.reminders.daily.on}
              onChange={(e) => {
                const checked = (e.target as HTMLInputElement).checked;
                setReminderNotice('');
                void patchProfile((prev) => ({
                  reminders: {
                    ...prev.reminders,
                    daily: { ...prev.reminders.daily, on: checked },
                  },
                }));
                if (checked) {
                  void requestNativeNotificationPermission().then((res) => {
                    if (res === 'denied') {
                      setReminderNotice(
                        'Notifications are off in Android settings. Turn them on there to get reminders.',
                      );
                    }
                  });
                }
              }}
            />
            <span>Daily check-in reminder</span>
          </label>
        </div>

        {profile.reminders.daily.on && (
          <div class="field">
            <label htmlFor="set-reminder-time">Preferred reminder time</label>
            <input
              id="set-reminder-time"
              class="input"
              type="time"
              value={profile.reminders.daily.time}
              onInput={(e) => {
                const time = (e.target as HTMLInputElement).value || '20:00';
                void patchProfile((prev) => ({
                  reminders: {
                    ...prev.reminders,
                    daily: { ...prev.reminders.daily, time },
                  },
                }));
              }}
            />
          </div>
        )}

        <div class="field">
          <label class="chip" style={{ width: '100%' }}>
            <input
              type="checkbox"
              checked={profile.reminders.watchlist}
              onChange={(e) => {
                const checked = (e.target as HTMLInputElement).checked;
                void patchProfile((prev) => ({
                  reminders: { ...prev.reminders, watchlist: checked },
                }));
              }}
            />
            <span>Follow-up check-in reminder</span>
          </label>
        </div>

        <div class="btn-row">
          <div class="field" style={{ flex: 1 }}>
            <label htmlFor="set-quiet-from">Quiet hours from</label>
            <input
              id="set-quiet-from"
              class="input"
              type="time"
              value={profile.reminders.quietFrom}
              onInput={(e) => {
                const quietFrom = (e.target as HTMLInputElement).value || '22:00';
                void patchProfile((prev) => ({
                  reminders: { ...prev.reminders, quietFrom },
                }));
              }}
            />
          </div>
          <div class="field" style={{ flex: 1 }}>
            <label htmlFor="set-quiet-to">Quiet hours until</label>
            <input
              id="set-quiet-to"
              class="input"
              type="time"
              value={profile.reminders.quietTo}
              onInput={(e) => {
                const quietTo = (e.target as HTMLInputElement).value || '08:00';
                void patchProfile((prev) => ({
                  reminders: { ...prev.reminders, quietTo },
                }));
              }}
            />
          </div>
        </div>

        {reminderPlan && reminderPlan.cadence !== 'none' && (
          <p class="muted" style={{ marginTop: 0 }}>
            {reminderPlan.droppedToWeekly
              ? 'After 3 unanswered prompts, cadence drops to weekly until your next check-in.'
              : `Scheduled as ${reminderPlan.cadence} at ${reminderPlan.effectiveTime}${
                  reminderPlan.adjustedForQuietHours ? ' (shifted outside quiet hours)' : ''
                }.`}
          </p>
        )}
        {reminderNotice && (
          <p class="muted" role="status" style={{ marginTop: 0 }}>
            {reminderNotice}
          </p>
        )}

        <div class="field" style={{ marginTop: '16px' }}>
          <label class="chip" style={{ width: '100%' }}>
            <input
              type="checkbox"
              checked={profile.discreetMode}
              onChange={(e) =>
                void patchProfile({ discreetMode: (e.target as HTMLInputElement).checked })
              }
            />
            <span>Discreet mode (widget shows leaf only)</span>
          </label>
        </div>

        <div class="field" style={{ marginBottom: 0 }}>
          <label class="chip" style={{ width: '100%' }}>
            <input
              type="checkbox"
              checked={discreetIconOn}
              onChange={(e) => {
                const checked = (e.target as HTMLInputElement).checked;
                setDiscreetIconOn(checked);
                void setDiscreetLauncherIcon(checked);
              }}
            />
            <span>Discreet launcher icon (&ldquo;Garden Notes&rdquo;)</span>
          </label>
          <span class="muted">
            Swaps the Android home-screen app icon and label to a plain leaf called Garden Notes.
          </span>
        </div>
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
          Save backup file (.json)
        </button>
        {backupMessage && <p style={{ marginBottom: '12px' }}>{backupMessage}</p>}

        <div class="field" style={{ marginTop: '18px' }}>
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
              class="btn btn-primary"
              onClick={() => void handleConfirmRestore()}
            >
              Replace data with this backup
            </button>
          </div>
        )}

        {restoreError && (
          <p role="alert" style={{ fontWeight: 700 }}>
            {restoreError}
          </p>
        )}
        {restoreSuccess && (
          <p role="status" style={{ fontWeight: 700 }}>
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
          Companion, ovulation tracking, lifestyle patterns, check-in intelligence, and clinical
          doctor summary run offline on this device.
        </p>
      </section>

      <section class="card" aria-label="Delete all data">
        <h2 class="card-title">Delete all data</h2>
        {deleteStep === 0 ? (
          <button type="button" class="btn btn-bar" onClick={() => setDeleteStep(1)}>
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
                class="btn btn-bar"
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
