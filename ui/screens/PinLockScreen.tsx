import { useState } from 'preact/hooks';
import type { CompanionStage } from '../../core/model/types';
import { Sprout } from '../companion/Sprout';
import { ScatteredDots } from '../components/ScatteredDots';

interface PinLockScreenProps {
  stage?: CompanionStage;
  rings?: number;
  sproutName?: string | null;
  reducedMotion?: boolean;
  onUnlock: (pin: string) => Promise<boolean>;
}

export function PinLockScreen({
  stage = 0,
  rings = 0,
  sproutName = null,
  reducedMotion = false,
  onUnlock,
}: PinLockScreenProps) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);

  async function handleSubmit(e: Event): Promise<void> {
    e.preventDefault();
    setChecking(true);
    setError('');
    try {
      const ok = await onUnlock(pin);
      if (!ok) {
        setError('PIN did not match. Try again.');
        setPin('');
      }
    } finally {
      setChecking(false);
    }
  }

  return (
    <main class="app-shell" style={{ justifyContent: 'center', paddingBottom: '24px' }}>
      <div class="card dots-backdrop" style={{ textAlign: 'center' }}>
        <ScatteredDots tone="surface" />
        <div class="dots-content">
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '12px' }}>
            <Sprout
              stage={stage}
              mood="calm"
              rings={rings}
              name={sproutName}
              reducedMotion={reducedMotion}
              size={96}
            />
          </div>
          <h1 class="screen-title" style={{ marginBottom: '8px' }}>
            Moonroot
          </h1>
          <p class="muted" style={{ marginTop: 0 }}>
            Enter your PIN to open.
          </p>

          <form onSubmit={(e) => void handleSubmit(e)}>
            <div class="field">
              <label htmlFor="pin-unlock-input" class="sr-only">
                PIN
              </label>
              <input
                id="pin-unlock-input"
                class="input"
                type="password"
                inputMode="numeric"
                autoFocus
                value={pin}
                onInput={(e) => {
                  setPin((e.target as HTMLInputElement).value);
                  setError('');
                }}
                placeholder="PIN"
                style={{ textAlign: 'center', letterSpacing: '0.25em' }}
              />
            </div>

            {error && (
              <p role="alert" style={{ fontWeight: 700 }}>
                {error}
              </p>
            )}

            <button type="submit" class="btn btn-primary" style={{ width: '100%' }} disabled={checking}>
              {checking ? 'Checking...' : 'Unlock'}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
