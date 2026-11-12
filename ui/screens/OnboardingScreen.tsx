import { useState } from 'preact/hooks';
import { createPinLock, makeDefaultProfile } from '../../app/store';
import { isUnder18 } from '../../core/model/dates';
import type { DateKey, Profile } from '../../core/model/types';
import { requestNativeNotificationPermission } from '../../platform/native';
import { ScatteredDots } from '../components/ScatteredDots';

interface OnboardingScreenProps {
  today: DateKey;
  nowIso: string;
  onComplete: (profile: Profile) => Promise<void>;
}

export function OnboardingScreen({ today, nowIso, onComplete }: OnboardingScreenProps) {
  const [step, setStep] = useState(1);
  const [accepted, setAccepted] = useState(false);
  const [birthYear, setBirthYear] = useState('');
  const [menarcheAge, setMenarcheAge] = useState('');
  const [dontRememberMenarche, setDontRememberMenarche] = useState(false);
  const [sproutName, setSproutName] = useState('');
  const [selfRegularity, setSelfRegularity] = useState<Profile['selfRegularity']>('unknown');
  const [lastPeriodApprox, setLastPeriodApprox] = useState('');
  const [onHormones, setOnHormones] = useState<Profile['onHormones']>(null);
  const [conditionsNote, setConditionsNote] = useState('');
  const [sexualSetting, setSexualSetting] = useState<'when-relevant' | 'off' | 'prefer-not-to-say'>(
    'when-relevant',
  );
  const [dailyReminderOn, setDailyReminderOn] = useState(false);
  const [dailyReminderTime, setDailyReminderTime] = useState('20:00');
  const [discreetMode, setDiscreetMode] = useState(true);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const [saving, setSaving] = useState(false);

  const parsedBirthYear =
    birthYear.trim() !== '' && Number.isFinite(Number(birthYear)) ? Number(birthYear) : null;
  const under18 = isUnder18({ birthYear: parsedBirthYear }, today);

  async function finish(): Promise<void> {
    if (pinInput.trim() !== '' && pinInput.trim().length < 4) {
      setPinError('PIN must be at least 4 digits, or leave empty to skip.');
      return;
    }
    setSaving(true);
    try {
      const profile = makeDefaultProfile(nowIso);
      profile.disclaimerAcceptedAt = nowIso;
      profile.birthYear = parsedBirthYear;
      profile.menarcheAge =
        !dontRememberMenarche && menarcheAge.trim() !== '' && Number.isFinite(Number(menarcheAge))
          ? Number(menarcheAge)
          : null;
      profile.sproutName = sproutName.trim() || null;
      profile.selfRegularity = selfRegularity;
      profile.lastPeriodApprox = lastPeriodApprox.trim() || null;
      profile.onHormones = onHormones;
      profile.conditionsNote = conditionsNote.trim();
      profile.discreetMode = discreetMode;
      profile.reminders.daily = { on: dailyReminderOn, time: dailyReminderTime };

      if (under18) {
        profile.sexualHealthQuestions = sexualSetting === 'off' ? 'off' : 'when-relevant';
        profile.intimacy = 'prefer-not-to-say';
      } else if (sexualSetting === 'off') {
        profile.sexualHealthQuestions = 'off';
        profile.intimacy = 'none';
      } else if (sexualSetting === 'prefer-not-to-say') {
        profile.sexualHealthQuestions = 'when-relevant';
        profile.intimacy = 'prefer-not-to-say';
      } else {
        profile.sexualHealthQuestions = 'when-relevant';
        profile.intimacy = 'active';
      }

      if (pinInput.trim().length >= 4) {
        profile.lock = await createPinLock(pinInput.trim());
      }

      if (dailyReminderOn) {
        await requestNativeNotificationPermission();
      }

      await onComplete(profile);
    } finally {
      setSaving(false);
    }
  }

  return (
    <main class="card dots-backdrop" aria-label="Onboarding">
      {step === 1 && <ScatteredDots tone="surface" />}
      <div class="dots-content">
        {step === 1 && (
          <div>
            <h1 class="screen-title">Welcome to Moonroot</h1>
            <p>Everything stays on this phone. No account, no cloud sync, no internet needed.</p>
            <p class="notice-banner">
              Private on-device check-in intelligence: entries stay on this phone and are sorted locally.
            </p>
            <label class="chip" style={{ width: '100%', marginBottom: '16px' }}>
              <input
                type="checkbox"
                checked={accepted}
                onChange={(e) => setAccepted((e.target as HTMLInputElement).checked)}
              />
              <span>This app tracks and sorts urgency. It does not diagnose.</span>
            </label>
            <button
              type="button"
              class="btn btn-primary"
              style={{ width: '100%' }}
              disabled={!accepted}
              onClick={() => setStep(2)}
            >
              Continue
            </button>
          </div>
        )}

        {step === 2 && (
          <div>
            <h1 class="screen-title">About you</h1>
          <p class="muted">You can skip any of these and change them later in Settings.</p>
          <div class="field">
            <label htmlFor="onb-birth-year">Birth year (optional)</label>
            <input
              id="onb-birth-year"
              class="input"
              type="number"
              min="1940"
              max="2026"
              inputMode="numeric"
              value={birthYear}
              onInput={(e) => setBirthYear((e.target as HTMLInputElement).value)}
              placeholder="e.g. 2004"
            />
          </div>
          <div class="field">
            <label htmlFor="onb-menarche">Age at first period (optional)</label>
            <input
              id="onb-menarche"
              class="input"
              type="number"
              min="7"
              max="25"
              inputMode="numeric"
              disabled={dontRememberMenarche}
              value={menarcheAge}
              onInput={(e) => setMenarcheAge((e.target as HTMLInputElement).value)}
              placeholder="e.g. 13"
            />
            <label class="chip" style={{ marginTop: '6px' }}>
              <input
                type="checkbox"
                checked={dontRememberMenarche}
                onChange={(e) => setDontRememberMenarche((e.target as HTMLInputElement).checked)}
              />
              <span>I do not remember</span>
            </label>
          </div>
          <div class="field">
            <label htmlFor="onb-sprout">Name your sprout (optional)</label>
            <input
              id="onb-sprout"
              class="input"
              type="text"
              value={sproutName}
              onInput={(e) => setSproutName((e.target as HTMLInputElement).value)}
              placeholder="e.g. Pip"
            />
          </div>
          <div class="btn-row">
            <button type="button" class="btn" onClick={() => setStep(1)}>
              Back
            </button>
            <button type="button" class="btn btn-primary" onClick={() => setStep(3)}>
              Next
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div>
          <h1 class="screen-title">Your cycles</h1>
          <div class="field">
            <span class="field-label">How do your cycles usually feel?</span>
            <div class="chip-group">
              {(
                [
                  { value: 'regular', label: 'Regular' },
                  { value: 'irregular', label: 'Irregular' },
                  { value: 'unknown', label: 'Not sure' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  class="chip"
                  aria-pressed={selfRegularity === opt.value}
                  onClick={() => setSelfRegularity(opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <div class="field">
            <label htmlFor="onb-last-period">Last period start, approximate (optional)</label>
            <input
              id="onb-last-period"
              class="input"
              type="date"
              value={lastPeriodApprox}
              onInput={(e) => setLastPeriodApprox((e.target as HTMLInputElement).value)}
            />
          </div>
          <div class="btn-row">
            <button type="button" class="btn" onClick={() => setStep(2)}>
              Back
            </button>
            <button type="button" class="btn" onClick={() => { setLastPeriodApprox(''); setStep(4); }}>
              Not sure / Skip
            </button>
            <button type="button" class="btn btn-primary" onClick={() => setStep(4)}>
              Next
            </button>
          </div>
        </div>
      )}

      {step === 4 && (
        <div>
          <h1 class="screen-title">Health context</h1>
          <div class="field">
            <span class="field-label">Are you taking any hormone medicine?</span>
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
                  aria-pressed={onHormones === opt.value}
                  onClick={() => setOnHormones(opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <div class="field">
            <label htmlFor="onb-conditions">Conditions note (optional)</label>
            <input
              id="onb-conditions"
              class="input"
              type="text"
              value={conditionsNote}
              onInput={(e) => setConditionsNote((e.target as HTMLInputElement).value)}
              placeholder="For your own record and doctor file"
            />
          </div>
          <div class="field">
            <span class="field-label">Pregnancy questions</span>
            {under18 ? (
              <p class="muted" style={{ marginTop: 0 }}>
                Since you are under 18, only a neutral pregnancy question can appear.
              </p>
            ) : (
              <div class="chip-group">
                {(
                  [
                    { value: 'when-relevant', label: 'When relevant' },
                    { value: 'prefer-not-to-say', label: 'Prefer not to say' },
                    { value: 'off', label: 'Off' },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    class="chip"
                    aria-pressed={sexualSetting === opt.value}
                    onClick={() => setSexualSetting(opt.value)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div class="btn-row">
            <button type="button" class="btn" onClick={() => setStep(3)}>
              Back
            </button>
            <button type="button" class="btn btn-primary" onClick={() => setStep(5)}>
              Next
            </button>
          </div>
        </div>
      )}

      {step === 5 && (
        <div>
          <h1 class="screen-title">Reminders and privacy</h1>
          <label class="chip" style={{ width: '100%', marginBottom: '12px' }}>
            <input
              type="checkbox"
              checked={dailyReminderOn}
              onChange={(e) => setDailyReminderOn((e.target as HTMLInputElement).checked)}
            />
            <span>Daily check-in reminder (no health words on lock screen)</span>
          </label>
          {dailyReminderOn && (
            <div class="field">
              <label htmlFor="onb-rem-time">Reminder time</label>
              <input
                id="onb-rem-time"
                class="input"
                type="time"
                value={dailyReminderTime}
                onInput={(e) => setDailyReminderTime((e.target as HTMLInputElement).value)}
              />
            </div>
          )}
          <label class="chip" style={{ width: '100%', marginBottom: '12px' }}>
            <input
              type="checkbox"
              checked={discreetMode}
              onChange={(e) => setDiscreetMode((e.target as HTMLInputElement).checked)}
            />
            <span>Discreet mode (no health words in notifications or widget)</span>
          </label>
          <div class="field">
            <label htmlFor="onb-pin">Optional PIN lock (4+ digits)</label>
            <input
              id="onb-pin"
              class="input"
              type="password"
              inputMode="numeric"
              value={pinInput}
              onInput={(e) => {
                setPinInput((e.target as HTMLInputElement).value);
                setPinError('');
              }}
              placeholder="Leave blank for no PIN"
            />
            <span class="muted">
              A PIN is a screen lock on this phone, not file encryption.
            </span>
          </div>
          {pinError && (
            <p role="alert" style={{ fontWeight: 700 }}>
              {pinError}
            </p>
          )}
          <div class="btn-row">
            <button type="button" class="btn" onClick={() => setStep(4)}>
              Back
            </button>
            <button type="button" class="btn btn-primary" onClick={() => setStep(6)}>
              Next
            </button>
          </div>
        </div>
      )}

      {step === 6 && (
        <div>
          <h1 class="screen-title">Ready to record</h1>
          <p
            class="tabular"
            style={{
              fontWeight: 700,
              fontSize: '1.5rem',
              margin: '8px 0',
              color: 'var(--text)',
            }}
          >
            10%
          </p>
          <p>Each period you log tightens your ranges.</p>
          <p class="notice-banner">
            Your daily logs, safety checks, cycle ranges, backups and doctor file all stay on this
            phone.
          </p>
          <div class="btn-row">
            <button type="button" class="btn" onClick={() => setStep(5)}>
              Back
            </button>
            <button
              type="button"
              class="btn btn-primary"
              disabled={saving}
              onClick={() => void finish()}
            >
              {saving ? 'Saving...' : 'Start journaling'}
            </button>
          </div>
        </div>
      )}
      </div>
    </main>
  );
}
