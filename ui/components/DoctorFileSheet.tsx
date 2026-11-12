import { useMemo, useState } from 'preact/hooks';
import { APP_VERSION } from '../../app/store';
import type {
  BodyLog,
  DateKey,
  DayLog,
  Decision,
  DoctorVisit,
  Forecast,
  MedicineEntry,
  Profile,
  Verdict,
  WatchItem,
} from '../../core/model/types';
import { buildCycleTableCsv, buildDayTableCsv } from '../../core/report/csv';
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
  bodyLogs?: readonly BodyLog[];
  medicines: readonly MedicineEntry[];
  visits: readonly DoctorVisit[];
  decisions?: readonly Decision[];
  verdicts?: readonly Verdict[];
  watchItems?: readonly WatchItem[];
  forecasts?: readonly Forecast[];
  onDownload: (filename: string, content: string, mimeType: string) => void;
  onDoctorFileCreated?: () => void;
  onClose: () => void;
}

export function DoctorFileSheet({
  open,
  today,
  under18,
  profile,
  dayLogs,
  bodyLogs = [],
  medicines,
  visits,
  decisions = [],
  verdicts = [],
  watchItems = [],
  forecasts = [],
  onDownload,
  onDoctorFileCreated,
  onClose,
}: DoctorFileSheetProps) {
  const [range, setRange] = useState<DoctorFileRange>('3m');
  const [format, setFormat] = useState<DoctorFileFormat>('md');
  const [includeBody, setIncludeBody] = useState(true);
  const [includeNotes, setIncludeNotes] = useState(true);
  const [includeMedicines, setIncludeMedicines] = useState(true);
  const [includeVerdicts, setIncludeVerdicts] = useState(true);
  const [includeIntimacy, setIncludeIntimacy] = useState(false);
  const [worryNote, setWorryNote] = useState('');
  const [exportStatus, setExportStatus] = useState('');

  const output = useMemo(
    () =>
      buildDoctorFile({
        today,
        appVersion: APP_VERSION,
        profile,
        dayLogs,
        bodyLogs,
        medicines,
        visits,
        decisions,
        verdicts,
        watchItems,
        forecasts,
        options: {
          range,
          format,
          includeBody,
          includeNotes,
          includeMedicines,
          includeVerdicts,
          includeIntimacy: under18 ? false : includeIntimacy,
          worryNote,
        },
      }),
    [
      today,
      profile,
      dayLogs,
      bodyLogs,
      medicines,
      visits,
      decisions,
      verdicts,
      watchItems,
      forecasts,
      range,
      format,
      includeBody,
      includeNotes,
      includeMedicines,
      includeVerdicts,
      includeIntimacy,
      worryNote,
      under18,
    ],
  );

  const dayCsv = useMemo(
    () =>
      buildDayTableCsv({
        today,
        dayLogs,
        bodyLogs,
        medicines,
        range,
        includeBody,
        includeNotes,
        includeMedicines,
      }),
    [today, dayLogs, bodyLogs, medicines, range, includeBody, includeNotes, includeMedicines],
  );

  const cycleCsv = useMemo(
    () =>
      buildCycleTableCsv({
        today,
        dayLogs,
        decisions,
      }),
    [today, dayLogs, decisions],
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
              aria-pressed={includeBody}
              onClick={() => setIncludeBody((v) => !v)}
            >
              Body log
            </button>
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
            <button
              type="button"
              class="chip"
              aria-pressed={includeVerdicts}
              onClick={() => setIncludeVerdicts((v) => !v)}
            >
              Verdict history
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
          <div class="pre-preview" role="region" aria-label="Doctor file preview">
            {output.content}
          </div>
        </div>

        <button
          type="button"
          class="btn btn-primary"
          style={{ width: '100%' }}
          onClick={() => {
            onDoctorFileCreated?.();
            onDownload(
              output.filename,
              output.content,
              format === 'md' ? 'text/markdown;charset=utf-8' : 'text/plain;charset=utf-8',
            );
            setExportStatus(`Saved ${output.filename}.`);
          }}
        >
          Save {output.filename}
        </button>

        <div class="btn-row" style={{ marginTop: '10px' }}>
          <button
            type="button"
            class="btn btn-small"
            style={{ flex: '1 1 160px' }}
            onClick={() => {
              onDownload(dayCsv.filename, dayCsv.content, 'text/csv;charset=utf-8');
              setExportStatus(`Saved ${dayCsv.filename}.`);
            }}
          >
            Download Day table (.csv)
          </button>
          <button
            type="button"
            class="btn btn-small"
            style={{ flex: '1 1 160px' }}
            onClick={() => {
              onDownload(cycleCsv.filename, cycleCsv.content, 'text/csv;charset=utf-8');
              setExportStatus(`Saved ${cycleCsv.filename}.`);
            }}
          >
            Download Cycle table (.csv)
          </button>
        </div>

        {exportStatus && (
          <p role="status" class="muted" style={{ marginTop: '10px', marginBottom: 0, fontWeight: 700 }}>
            {exportStatus}
          </p>
        )}
      </div>
    </div>
  );
}
