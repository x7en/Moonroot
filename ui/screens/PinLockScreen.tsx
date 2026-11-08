import { useState } from 'preact/hooks';

interface PinLockScreenProps {
  onUnlock: (pin: string) => Promise<boolean>;
}

export function PinLockScreen({ onUnlock }: PinLockScreenProps) {
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
      <div class="card" style={{ textAlign: 'center' }}>
        <img
          src="./icons/moonroot-icon.svg"
          alt="Moonroot"
          width="64"
          height="64"
          style={{ borderRadius: '16px', marginBottom: '12px' }}
        />
        <h1 class="brand-title" style={{ marginBottom: '8px' }}>
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
            <p role="alert" style={{ color: 'var(--level-red)', fontWeight: 700 }}>
              {error}
            </p>
          )}

          <button type="submit" class="btn btn-primary" style={{ width: '100%' }} disabled={checking}>
            {checking ? 'Checking...' : 'Unlock'}
          </button>
        </form>
      </div>
    </main>
  );
}
