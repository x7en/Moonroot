import { useState } from 'preact/hooks';
import { DANGER_SIGN_CATALOGUE } from '../../core/model/catalogues';
import type { DangerSign } from '../../core/model/types';

interface DangerSignSheetProps {
  open: boolean;
  initialDanger: DangerSign[];
  initialAnswered: boolean;
  initialFever?: { c?: number; felt?: boolean };
  showOestrogenSigns: boolean;
  tempUnit: 'C' | 'F';
  onSave: (result: {
    danger: DangerSign[];
    dangerAnswered: boolean;
    fever?: { c?: number; felt?: boolean };
  }) => void;
  onOpenGetHelp: () => void;
  onClose: () => void;
}

function toDisplayTemp(c: number | undefined, unit: 'C' | 'F'): string {
  if (c === undefined) return '';
  if (unit === 'C') return String(c);
  return ((c * 9) / 5 + 32).toFixed(1);
}

function toCelsius(val: string, unit: 'C' | 'F'): number | undefined {
  const trimmed = val.trim();
  if (!trimmed) return undefined;
  const num = Number(trimmed);
  if (!Number.isFinite(num)) return undefined;
  if (unit === 'C') return Number(num.toFixed(1));
  return Number((((num - 32) * 5) / 9).toFixed(1));
}

export function DangerSignSheet({
  open,
  initialDanger,
  initialAnswered,
  initialFever,
  showOestrogenSigns,
  tempUnit,
  onSave,
  onOpenGetHelp,
  onClose,
}: DangerSignSheetProps) {
  const [selected, setSelected] = useState<DangerSign[]>(initialDanger);
  const [answered, setAnswered] = useState<boolean>(initialAnswered);
  const [feltFever, setFeltFever] = useState<boolean>(Boolean(initialFever?.felt));
  const [tempInput, setTempInput] = useState<string>(toDisplayTemp(initialFever?.c, tempUnit));

  if (!open) return null;

  const visibleSigns = DANGER_SIGN_CATALOGUE.filter(
    (item) => !item.oestrogenOnly || showOestrogenSigns,
  );

  function buildFever(): { c?: number; felt?: boolean } | undefined {
    const c = toCelsius(tempInput, tempUnit);
    if (c === undefined && !feltFever) return undefined;
    return {
      ...(c !== undefined ? { c } : {}),
      ...(feltFever ? { felt: true } : {}),
    };
  }

  function toggleSign(sign: DangerSign): void {
    const exists = selected.includes(sign);
    const next = exists ? selected.filter((s) => s !== sign) : [...selected, sign];
    setSelected(next);
    setAnswered(next.length > 0 ? true : answered);
  }

  function handleNoneOfThese(): void {
    setSelected([]);
    setAnswered(true);
    onSave({
      danger: [],
      dangerAnswered: true,
      fever: buildFever(),
    });
    onClose();
  }

  function handleSave(): void {
    const nextAnswered = selected.length > 0 ? true : answered;
    onSave({
      danger: selected,
      dangerAnswered: nextAnswered,
      fever: buildFever(),
    });
    onClose();
  }

  return (
    <div class="sheet-backdrop" role="dialog" aria-modal="true" aria-labelledby="danger-sheet-title">
      <div class="sheet">
        <div class="sheet-handle" />
        <div class="sheet-header">
          <h2 id="danger-sheet-title" class="card-title" style={{ margin: 0 }}>
            Any of these right now?
          </h2>
          <button type="button" class="btn btn-small" onClick={onClose}>
            Back
          </button>
        </div>

        <p class="muted" style={{ marginTop: 0 }}>
          If you are not sure, pick the closest one.
        </p>

        <div class="chip-group" style={{ marginBottom: '14px' }}>
          {visibleSigns.map((item) => {
            const active = selected.includes(item.key);
            return (
              <button
                key={item.key}
                type="button"
                class="chip chip-danger"
                aria-pressed={active}
                onClick={() => toggleSign(item.key)}
              >
                {item.defaultLabel}
              </button>
            );
          })}
        </div>

        <div class="card">
          <div class="btn-row" style={{ marginBottom: '10px' }}>
            <button
              type="button"
              class="chip"
              aria-pressed={feltFever}
              onClick={() => setFeltFever((v) => !v)}
            >
              Fever or feeling feverish
            </button>
          </div>
          <div class="field" style={{ marginBottom: 0 }}>
            <label htmlFor="danger-temp-input">Measured temperature in °{tempUnit} (optional)</label>
            <input
              id="danger-temp-input"
              class="input"
              type="number"
              step="0.1"
              inputMode="decimal"
              value={tempInput}
              onInput={(e) => setTempInput((e.target as HTMLInputElement).value)}
              placeholder={tempUnit === 'C' ? 'e.g. 38.2' : 'e.g. 100.8'}
            />
          </div>
        </div>

        {selected.length > 0 && (
          <div class="notice-banner" style={{ borderColor: 'var(--level-red)' }}>
            <p style={{ marginTop: 0 }}>
              You selected a warning sign. If you feel very unwell now, open Get help. Full warning
              checks arrive in the next version.
            </p>
            <button
              type="button"
              class="btn btn-danger-solid"
              onClick={() => {
                onSave({
                  danger: selected,
                  dangerAnswered: true,
                  fever: buildFever(),
                });
                onOpenGetHelp();
              }}
            >
              Open Get help
            </button>
          </div>
        )}

        <p class="muted">
          This version records your log only. Warning checks start in Step 2.
        </p>

        <div class="btn-row">
          <button type="button" class="btn btn-primary" onClick={handleNoneOfThese}>
            None of these
          </button>
          <button type="button" class="btn" onClick={handleSave}>
            Save warning signs
          </button>
        </div>
      </div>
    </div>
  );
}
