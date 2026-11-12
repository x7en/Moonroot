import { useState } from 'preact/hooks';
import { MEDICINE_CATALOGUE } from '../../core/model/catalogues';
import type { DateKey, MedicineEntry, Stamp } from '../../core/model/types';

interface MedicineSheetProps {
  open: boolean;
  date: DateKey;
  nowIso: Stamp;
  lastDose: MedicineEntry | null;
  onSave: (entry: MedicineEntry) => void;
  onClose: () => void;
}

export function MedicineSheet({
  open,
  date,
  nowIso,
  lastDose,
  onSave,
  onClose,
}: MedicineSheetProps) {
  const [kind, setKind] = useState<MedicineEntry['kind']>('dose');
  const [category, setCategory] = useState<MedicineEntry['category']>('pain-relief');
  const [nameShown, setNameShown] = useState<string>('');
  const [genericName, setGenericName] = useState<string | null>(null);
  const [strengthInput, setStrengthInput] = useState<string>('');
  const [unitsInput, setUnitsInput] = useState<string>('1');
  const [helped, setHelped] = useState<MedicineEntry['helped'] | undefined>(undefined);
  const [stopDate, setStopDate] = useState<string>('');
  const [note, setNote] = useState<string>('');
  const [error, setError] = useState<string>('');

  if (!open) return null;

  function pickStarter(item: (typeof MEDICINE_CATALOGUE)[number]): void {
    setKind(item.defaultKind);
    setCategory(item.category);
    setNameShown(item.nameShown);
    setGenericName(item.genericName);
    setError('');
  }

  function handleRepeatLastDose(): void {
    if (!lastDose) return;
    const entry: MedicineEntry = {
      id: `med-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      date,
      kind: 'dose',
      category: lastDose.category,
      nameShown: lastDose.nameShown,
      genericName: lastDose.genericName,
      strengthMg: lastDose.strengthMg,
      takenAt: nowIso,
      units: lastDose.units ?? 1,
      note: lastDose.note,
      updatedAt: nowIso,
    };
    onSave(entry);
    onClose();
  }

  function handleSubmit(e: Event): void {
    e.preventDefault();
    const cleanName = nameShown.trim();
    if (!cleanName) {
      setError('Pick or type a medicine name first.');
      return;
    }

    const strength =
      strengthInput.trim() !== '' && Number.isFinite(Number(strengthInput))
        ? Number(strengthInput)
        : null;
    const units =
      kind === 'dose' && unitsInput.trim() !== '' && Number.isFinite(Number(unitsInput))
        ? Math.max(1, Number(unitsInput))
        : undefined;

    const entry: MedicineEntry = {
      id: `med-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      date,
      kind,
      category,
      nameShown: cleanName,
      genericName: genericName?.trim() ? genericName.trim() : null,
      strengthMg: strength,
      ...(kind === 'dose' ? { takenAt: nowIso, units, helped } : {}),
      ...(kind === 'course'
        ? { startDate: date, stopDate: stopDate.trim() ? stopDate.trim() : null }
        : {}),
      note: note.trim(),
      updatedAt: nowIso,
    };

    onSave(entry);
    onClose();
  }

  return (
    <div class="sheet-backdrop" role="dialog" aria-modal="true" aria-labelledby="med-sheet-title">
      <form class="sheet" onSubmit={handleSubmit}>
        <div class="sheet-handle" />
        <div class="sheet-header">
          <h2 id="med-sheet-title" class="card-title" style={{ margin: 0 }}>
            Add medicine
          </h2>
          <button type="button" class="btn btn-small" onClick={onClose}>
            Close
          </button>
        </div>

        <p class="muted" style={{ marginTop: 0 }}>
          Moonroot records only what you enter. Check the pack for the daily limit.
        </p>

        {lastDose && (
          <div style={{ marginBottom: '12px' }}>
            <button type="button" class="btn btn-primary" onClick={handleRepeatLastDose}>
              Same as last time ({lastDose.nameShown}
              {lastDose.units ? ` x${lastDose.units}` : ''})
            </button>
          </div>
        )}

        <div class="field">
          <span class="field-label">Starter list</span>
          <div class="chip-group">
            {MEDICINE_CATALOGUE.map((item) => (
              <button
                key={item.id}
                type="button"
                class="chip"
                aria-pressed={nameShown === item.nameShown}
                onClick={() => pickStarter(item)}
              >
                {item.nameShown}
              </button>
            ))}
          </div>
        </div>

        <div class="field">
          <label htmlFor="med-name">Medicine name</label>
          <input
            id="med-name"
            class="input"
            type="text"
            value={nameShown}
            onInput={(e) => {
              setNameShown((e.target as HTMLInputElement).value);
              setError('');
            }}
            placeholder="Type or pick a medicine name"
          />
        </div>

        <div class="btn-row" style={{ marginBottom: '12px' }}>
          <button
            type="button"
            class="chip"
            aria-pressed={kind === 'dose'}
            onClick={() => setKind('dose')}
          >
            Taken when needed
          </button>
          <button
            type="button"
            class="chip"
            aria-pressed={kind === 'course'}
            onClick={() => setKind('course')}
          >
            Regular course
          </button>
        </div>

        <div class="field">
          <label htmlFor="med-category">Type</label>
          <select
            id="med-category"
            class="select"
            value={category}
            onChange={(e) =>
              setCategory((e.target as HTMLSelectElement).value as MedicineEntry['category'])
            }
          >
            <option value="pain-relief">Pain relief</option>
            <option value="hormone">Hormone medicine</option>
            <option value="iron-or-supplement">Iron or supplement</option>
            <option value="other">Other</option>
          </select>
        </div>

        <div class="field">
          <label htmlFor="med-strength">Strength printed on pack (optional)</label>
          <input
            id="med-strength"
            class="input"
            type="number"
            min="0"
            step="any"
            inputMode="decimal"
            value={strengthInput}
            onInput={(e) => setStrengthInput((e.target as HTMLInputElement).value)}
            placeholder="Copy number from your pack"
          />
        </div>

        {kind === 'dose' ? (
          <>
            <div class="field">
              <label htmlFor="med-units">How many tablets, capsules or measures</label>
              <input
                id="med-units"
                class="input"
                type="number"
                min="1"
                step="1"
                inputMode="numeric"
                value={unitsInput}
                onInput={(e) => setUnitsInput((e.target as HTMLInputElement).value)}
              />
            </div>

            <div class="field">
              <span class="field-label">Did it help? (optional)</span>
              <div class="chip-group">
                {(['yes', 'a-little', 'no', 'unsure'] as const).map((choice) => (
                  <button
                    key={choice}
                    type="button"
                    class="chip"
                    aria-pressed={helped === choice}
                    onClick={() => setHelped(helped === choice ? undefined : choice)}
                  >
                    {choice === 'yes'
                      ? 'Yes'
                      : choice === 'a-little'
                        ? 'A little'
                        : choice === 'no'
                          ? 'No'
                          : 'Not sure'}
                  </button>
                ))}
              </div>
            </div>
          </>
        ) : (
          <div class="field">
            <label htmlFor="med-stop-date">Stop date (optional, leave empty if ongoing)</label>
            <input
              id="med-stop-date"
              class="input"
              type="date"
              value={stopDate}
              onInput={(e) => setStopDate((e.target as HTMLInputElement).value)}
            />
          </div>
        )}

        <div class="field">
          <label htmlFor="med-note">Note (optional)</label>
          <input
            id="med-note"
            class="input"
            type="text"
            value={note}
            onInput={(e) => setNote((e.target as HTMLInputElement).value)}
            placeholder="Optional note"
          />
        </div>

        {error && (
          <p role="alert" style={{ fontWeight: 700 }}>
            {error}
          </p>
        )}

        <button type="submit" class="btn btn-primary" style={{ width: '100%' }}>
          Save medicine
        </button>
      </form>
    </div>
  );
}
