import { useMemo, useState } from 'preact/hooks';
import { APP_VERSION } from '../../app/store';
import type {
  DateKey,
  DayLog,
  DoctorVisit,
  MedicineEntry,
  Profile,
} from '../../core/model/types';
import {
  buildDoctorFile,
  type DoctorFileFormat,
  type DoctorFileRange,
} from '../../core/report/doctorFile';

interface DoctorFileSheetProps {
  open: boolean;
  today: DateKey;
  under18: boolean;
  profile: Profile | null;
  dayLogs: readonly DayLog[];
  medicines: readonly MedicineEntry[];
  visits: readonly DoctorVisit[];
  onDownload: (filename: string, content: string, mimeType: string) => void;
  onClose: () => void;
}

export function DoctorFileSheet({
  open,
  today,
  under18,
  profile,
  dayLogs,
  medicines,
  visits,
  onDownload,
  onClose,
}: DoctorFileSheetProps) {
  const [range, setRange] = useState<DoctorFileRange>('3m');
  const [format, setFormat] = useState<DoctorFileFormat>('md');
  const [includeNotes, setIncludeNotes] = useState(true);
  const [includeMedicines, setIncludeMedicines] = useState(true);
  const [includeIntimacy, setIncludeIntimacy] = useState(false);
  const [worryNote, setWorryNote] = useState('');

  const output = useMemo(
    () =>
      buildDoctorFile({
        today,
        appVersion: APP_VERSION,
        profile,
        dayLogs,
        medicines,
        visits,
        options: {
          range,
          format,
          includeNotes,
          includeMedicines,
          includeIntimacy: under18 ? false : includeIntimacy,
          worryNote,
        },
      }),
    [
      today,
      profile,
      dayLogs,
      medicines,
      visits,
      range,
      format,
      includeNotes,
      includeMedicines,
      includeIntimacy,
      worryNote,
      under18,
    ],
  );

  if (!open) return null;

  return (
    <div class="sheet-backdrop" role="dialog" aria-modal="true" aria-labelledby="doc-sheet-title">
      <div class="sheet">
        <div class="sheet-handle" />
        <div class="sheet-header">
          <h2 id="doc-sheet-title" class="card-title" style={{ margin: 0 }}>
            Create doctor file
          </h2>
          <button type="button" class="btn btn-small" onClick={onClose}>
            Close
          </button>
        </div>

        <p class="notice-banner">
          This file is plain text so a doctor can read it. Anyone who has this file can read what is
          inside.
        </p>

        <div class="field">
          <span class="field-label">Range</span>
          <div class="chip-group">
            {(
              [
                { value: '3m', label: 'Last 3 months' },
                { value: '6m', label: 'Last 6 months' },
                { value: '12m', label: 'Last 12 months' },
                { value: 'all', label: 'All' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.value}
                type="button"
                class="chip"
                aria-pressed={range === opt.value}
                onClick={() => setRange(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div class="field">
          <span class="field-label">Format</span>
          <div class="chip-group">
            <button
              type="button"
              class="chip"
              aria-pressed={format === 'md'}
              onClick={() => setFormat('md')}
            >
              Markdown (.md)
            </button>
            <button
              type="button"
              class="chip"
              aria-pressed={format === 'txt'}
              onClick={() => setFormat('txt')}
            >
              Plain text (.txt)
            </button>
          </div>
        </div>

        <div class="field">
          <span class="field-label">Include</span>
          <div class="chip-group">
            <button
              type="button"
              class="chip"
              aria-pressed={includeNotes}
              onClick={() => setIncludeNotes((v) => !v)}
            >
              Notes
            </button>
            <button
              type="button"
              class="chip"
              aria-pressed={includeMedicines}
              onClick={() => setIncludeMedicines((v) => !v)}
            >
              Medicines and conditions
            </button>
            {!under18 && (
              <button
                type="button"
                class="chip"
                aria-pressed={includeIntimacy}
                onClick={() => setIncludeIntimacy((v) => !v)}
              >
                Intimacy entries
              </button>
            )}
          </div>
        </div>

        <div class="field">
          <label htmlFor="worry-note">What worries you most? (optional)</label>
          <input
            id="worry-note"
            class="input"
            type="text"
            value={worryNote}
            onInput={(e) => setWorryNote((e.target as HTMLInputElement).value)}
            placeholder="Quoted at the top in your own words"
          />
        </div>

        <div class="field">
          <span class="field-label">Preview ({output.filename})</span>
          <pre class="pre-preview">{output.content}</pre>
        </div>

        <button
          type="button"
          class="btn btn-primary"
          style={{ width: '100%' }}
          onClick={() =>
            onDownload(
              output.filename,
              output.content,
              format === 'md' ? 'text/markdown;charset=utf-8' : 'text/plain;charset=utf-8',
            )
          }
        >
          Save {output.filename}
        </button>
      </div>
    </div>
  );
}
