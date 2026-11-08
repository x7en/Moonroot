import { useState } from 'preact/hooks';
import { isBackupOverdue } from '../../app/store';
import type {
  BackupMeta,
  DateKey,
  DayLog,
  DoctorVisit,
  MedicineEntry,
} from '../../core/model/types';

interface RecordScreenProps {
  today: DateKey;
  dayLogs: readonly DayLog[];
  medicines: readonly MedicineEntry[];
  visits: readonly DoctorVisit[];
  meta: BackupMeta;
  onEditDay: (date: DateKey) => void;
  onDeleteMedicine: (id: string) => Promise<void>;
  onSaveVisit: (visit: DoctorVisit) => Promise<void>;
  onOpenDoctorFile: () => void;
  onQuickExportBackup: () => void;
  onSnoozeBackup: () => Promise<void>;
}

export function RecordScreen({
  today,
  dayLogs,
  medicines,
  visits,
  meta,
  onEditDay,
  onDeleteMedicine,
  onSaveVisit,
  onOpenDoctorFile,
  onQuickExportBackup,
  onSnoozeBackup,
}: RecordScreenProps) {
  const [pastDate, setPastDate] = useState<string>(today);
  const [visitDate, setVisitDate] = useState<string>(today);
  const [visitNote, setVisitNote] = useState<string>('');

  const sortedDays = [...dayLogs].sort((a, b) => b.date.localeCompare(a.date));
  const sortedMeds = [...medicines].sort((a, b) => b.date.localeCompare(a.date));
  const sortedVisits = [...visits].sort((a, b) => b.date.localeCompare(a.date));
  const backupOverdue = isBackupOverdue(meta, dayLogs.length, today);

  async function handleAddVisit(e: Event): Promise<void> {
    e.preventDefault();
    if (!visitDate.trim()) return;
    await onSaveVisit({
      id: `visit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      date: visitDate,
      note: visitNote.trim(),
    });
    setVisitNote('');
  }

  return (
    <div>
      {backupOverdue && (
        <section class="card" aria-label="Backup reminder" style={{ borderColor: 'var(--lamp)' }}>
          <h2 class="card-title">Backup reminder</h2>
          <p class="muted" style={{ marginTop: 0 }}>
            Save a private backup file in case your phone is lost or cleared.
          </p>
          <div class="btn-row">
            <button type="button" class="btn btn-lamp" onClick={onQuickExportBackup}>
              Save backup in Settings
            </button>
            <button type="button" class="btn btn-small" onClick={() => void onSnoozeBackup()}>
              Remind later
            </button>
          </div>
        </section>
      )}

      <section class="card" aria-label="Doctor summary">
        <div class="btn-row" style={{ justifyContent: 'space-between' }}>
          <div>
            <h2 class="card-title" style={{ marginBottom: '2px' }}>
              Record
            </h2>
            <p class="muted" style={{ margin: 0 }}>
              <span class="tabular">{dayLogs.length}</span> days logged ·{' '}
              <span class="tabular">{medicines.length}</span> medicines
            </p>
          </div>
          <button type="button" class="btn btn-primary" onClick={onOpenDoctorFile}>
            Create doctor file
          </button>
        </div>
      </section>

      <section class="card" aria-label="Timeline">
        <h2 class="card-title">Timeline</h2>
        <div class="btn-row" style={{ marginBottom: '12px' }}>
          <label htmlFor="past-day-picker" class="sr-only">
            Pick a day to log or edit
          </label>
          <input
            id="past-day-picker"
            class="input"
            type="date"
            max={today}
            value={pastDate}
            onInput={(e) => setPastDate((e.target as HTMLInputElement).value)}
            style={{ flex: '1 1 180px' }}
          />
          <button type="button" class="btn" onClick={() => onEditDay(pastDate || today)}>
            Open day
          </button>
        </div>

        {sortedDays.length === 0 ? (
          <p class="muted">No days logged yet. Tap Today below to start.</p>
        ) : (
          sortedDays.map((log) => (
            <button
              key={log.date}
              type="button"
              class="timeline-row"
              onClick={() => onEditDay(log.date)}
            >
              <div class="btn-row" style={{ justifyContent: 'space-between', width: '100%' }}>
                <strong class="tabular">{log.date}</strong>
                <span>{log.flow ?? 'no flow set'}</span>
              </div>
              <span class="muted">
                Pain {log.pain ? `${log.pain.level}/10` : '—'} · Symptoms {log.symptoms.length}
                {log.danger.length > 0 ? ` · Warning signs ${log.danger.length}` : ''}
                {log.note ? ` · ${log.note.slice(0, 60)}` : ''}
              </span>
            </button>
          ))
        )}
      </section>

      <section class="card" aria-label="Medicines history">
        <h2 class="card-title">Medicines history</h2>
        {sortedMeds.length === 0 ? (
          <p class="muted" style={{ margin: 0 }}>
            No medicines logged yet.
          </p>
        ) : (
          sortedMeds.map((med) => (
            <div
              key={med.id}
              class="btn-row"
              style={{
                justifyContent: 'space-between',
                paddingBlock: '8px',
                borderBottom: '1px solid var(--border)',
              }}
            >
              <div>
                <div class="tabular">
                  <strong>{med.nameShown}</strong> · {med.date}
                </div>
                <div class="muted">
                  {med.kind === 'course'
                    ? `Course${med.stopDate ? ` until ${med.stopDate}` : ' (ongoing)'}`
                    : `Dose${med.units ? ` x${med.units}` : ''}`}
                  {med.strengthMg !== null ? ` · ${med.strengthMg} mg` : ''}
                  {med.helped ? ` · helped: ${med.helped}` : ''}
                </div>
              </div>
              <button
                type="button"
                class="btn btn-small"
                aria-label={`Remove ${med.nameShown} on ${med.date}`}
                onClick={() => void onDeleteMedicine(med.id)}
              >
                Remove
              </button>
            </div>
          ))
        )}
      </section>

      <section class="card" aria-label="Doctor visits">
        <h2 class="card-title">Doctor visits</h2>
        <form onSubmit={(e) => void handleAddVisit(e)} style={{ marginBottom: '12px' }}>
          <div class="field">
            <label htmlFor="visit-date">Visit date</label>
            <input
              id="visit-date"
              class="input"
              type="date"
              max={today}
              value={visitDate}
              onInput={(e) => setVisitDate((e.target as HTMLInputElement).value)}
            />
          </div>
          <div class="field">
            <label htmlFor="visit-note">Visit note (optional)</label>
            <input
              id="visit-note"
              class="input"
              type="text"
              value={visitNote}
              onInput={(e) => setVisitNote((e.target as HTMLInputElement).value)}
              placeholder="What you discussed or tests ordered"
            />
          </div>
          <button type="submit" class="btn">
            Save doctor visit
          </button>
        </form>

        {sortedVisits.length === 0 ? (
          <p class="muted" style={{ margin: 0 }}>
            No doctor visits logged yet.
          </p>
        ) : (
          sortedVisits.map((v) => (
            <div key={v.id} style={{ paddingBlock: '6px', borderTop: '1px solid var(--border)' }}>
              <strong class="tabular">{v.date}</strong>
              {v.note ? <div class="muted">{v.note}</div> : null}
            </div>
          ))
        )}
      </section>
    </div>
  );
}
