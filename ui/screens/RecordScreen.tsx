import { useState } from 'preact/hooks';
import { computeStep2Snapshot, isBackupOverdue } from '../../app/store';
import type {
  BackupMeta,
  DateKey,
  DayLog,
  Decision,
  DoctorVisit,
  MedicineEntry,
  Profile,
  Stamp,
  Verdict,
  WatchItem,
} from '../../core/model/types';

interface RecordScreenProps {
  today: DateKey;
  nowIso: Stamp;
  profile: Profile;
  dayLogs: readonly DayLog[];
  decisions: readonly Decision[];
  medicines: readonly MedicineEntry[];
  verdicts: readonly Verdict[];
  watchItems: readonly WatchItem[];
  visits: readonly DoctorVisit[];
  meta: BackupMeta;
  onEditDay: (date: DateKey) => void;
  onSaveDecision: (decision: Decision) => Promise<void>;
  onDeleteDecision: (id: string) => Promise<void>;
  onDeleteMedicine: (id: string) => Promise<void>;
  onSaveVisit: (visit: DoctorVisit) => Promise<void>;
  onDismissEvent: (verdictId: string) => Promise<void>;
  onOpenDoctorFile: () => void;
  onQuickExportBackup: () => void;
  onSnoozeBackup: () => Promise<void>;
}

export function RecordScreen({
  today,
  nowIso,
  profile,
  dayLogs,
  decisions,
  medicines,
  verdicts,
  watchItems,
  visits,
  meta,
  onEditDay,
  onSaveDecision,
  onDeleteDecision,
  onDeleteMedicine,
  onSaveVisit,
  onDismissEvent,
  onOpenDoctorFile,
  onQuickExportBackup,
  onSnoozeBackup,
}: RecordScreenProps) {
  const [pastDate, setPastDate] = useState<string>(today);
  const [visitDate, setVisitDate] = useState<string>(today);
  const [visitNote, setVisitNote] = useState<string>('');
  const [baselineDate, setBaselineDate] = useState<string>(today);

  const step2 = computeStep2Snapshot(
    {
      profile,
      dayLogs: [...dayLogs],
      bodyLogs: [],
      decisions: [...decisions],
      forecasts: [],
      verdicts: [...verdicts],
      watchItems: [...watchItems],
      visits: [...visits],
      medicines: [...medicines],
      companion: {
        rings: 0,
        stage: 0,
        unlocked: ['dusk', 'dawn', 'high-contrast'],
        badges: [],
        lastRingDate: null,
      },
      meta,
    },
    today,
    today,
    nowIso,
  );

  const sortedDays = [...dayLogs].sort((a, b) => b.date.localeCompare(a.date));
  const sortedMeds = [...medicines].sort((a, b) => b.date.localeCompare(a.date));
  const sortedVisits = [...visits].sort((a, b) => b.date.localeCompare(a.date));
  const sortedVerdicts = [...verdicts].sort((a, b) => b.at.localeCompare(a.at));
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

  async function toggleIgnoreCycle(startDate: DateKey, currentlyIgnored: boolean): Promise<void> {
    if (currentlyIgnored) {
      const match = decisions.find(
        (d) => d.kind === 'ignore-in-predictions' && d.date === startDate,
      );
      if (match) await onDeleteDecision(match.id);
      return;
    }
    await onSaveDecision({
      id: `ignore-${startDate}-${Date.now()}`,
      date: startDate,
      kind: 'ignore-in-predictions',
      at: nowIso,
      note: 'Excluded from prediction weights',
    });
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
              <span class="tabular">{dayLogs.length}</span> days ·{' '}
              <span class="tabular">{step2.cycles.cycles.length}</span> cycles ·{' '}
              <span class="tabular">{medicines.length}</span> medicines
            </p>
          </div>
          <button type="button" class="btn btn-primary" onClick={onOpenDoctorFile}>
            Create doctor file
          </button>
        </div>
      </section>

      <section class="card" aria-label="Derived cycles">
        <h2 class="card-title">Derived cycles</h2>
        {step2.cycles.openCycle && (
          <p style={{ marginTop: 0 }}>
            Current cycle started <strong class="tabular">{step2.cycles.openCycle.startDate}</strong>{' '}
            (day <strong class="tabular">{step2.cycles.openCycle.daysSinceStart}</strong>).
          </p>
        )}

        {step2.cycles.cycles.length === 0 ? (
          <p class="muted" style={{ marginTop: 0 }}>
            Log two period starts to derive cycle lengths here.
          </p>
        ) : (
          [...step2.cycles.cycles]
            .reverse()
            .slice(0, 12)
            .map((c) => (
              <div
                key={c.id}
                class="btn-row"
                style={{
                  justifyContent: 'space-between',
                  paddingBlock: '8px',
                  borderBottom: '1px solid var(--border)',
                }}
              >
                <div>
                  <div class="tabular">
                    <strong>{c.startDate}</strong> · {c.lengthDays} days ({c.bleedingDays} bleeding days)
                  </div>
                  <div class="muted">
                    {c.beforeBaseline ? 'before the change · ' : ''}
                    {c.dateCheckFlag ? `${c.dateCheckFlag} · ` : ''}
                    {c.approximate ? 'approximate · ' : ''}
                    {c.leadInDays > 0 ? `${c.leadInDays}d spotting lead-in` : 'no lead-in spotting'}
                  </div>
                </div>
                <button
                  type="button"
                  class="chip"
                  aria-pressed={c.ignoredInPredictions}
                  onClick={() => void toggleIgnoreCycle(c.startDate, c.ignoredInPredictions)}
                >
                  {c.ignoredInPredictions ? 'Ignored' : 'Ignore cycle'}
                </button>
              </div>
            ))
        )}

        <div class="field" style={{ marginTop: '12px', marginBottom: 0 }}>
          <label htmlFor="baseline-date-input">Start fresh marker (after hormone change)</label>
          <div class="btn-row">
            <input
              id="baseline-date-input"
              class="input"
              type="date"
              max={today}
              value={baselineDate}
              onInput={(e) => setBaselineDate((e.target as HTMLInputElement).value)}
              style={{ flex: '1 1 180px' }}
            />
            <button
              type="button"
              class="btn btn-small"
              onClick={() =>
                void onSaveDecision({
                  id: `baseline-${baselineDate || today}-${Date.now()}`,
                  date: baselineDate || today,
                  kind: 'new-baseline',
                  at: nowIso,
                  note: 'Start fresh marker set in Record',
                })
              }
            >
              Set start fresh
            </button>
          </div>
          {step2.cycles.newBaselineDate && (
            <p class="muted" style={{ marginBottom: 0 }}>
              Active baseline date: <strong class="tabular">{step2.cycles.newBaselineDate}</strong>
            </p>
          )}
        </div>
      </section>

      {step2.triageToday.standingFlags.length > 0 && (
        <section class="card" aria-label="Standing history flags">
          <h2 class="card-title">Standing patterns</h2>
          {step2.triageToday.standingFlags.map((flag) => (
            <div key={flag.ruleId} style={{ paddingBlock: '6px', borderTop: '1px solid var(--border)' }}>
              <strong>
                {flag.ruleId}: {flag.title}
              </strong>
              <p class="muted" style={{ margin: '4px 0 0 0' }}>
                {flag.reason} {flag.message}
              </p>
            </div>
          ))}
        </section>
      )}

      {sortedVerdicts.length > 0 && (
        <section class="card" aria-label="Verdict and flag history">
          <h2 class="card-title">Flag history</h2>
          {sortedVerdicts.slice(0, 10).map((v) => (
            <div
              key={v.id}
              class="btn-row"
              style={{
                justifyContent: 'space-between',
                paddingBlock: '8px',
                borderBottom: '1px solid var(--border)',
              }}
            >
              <div>
                <div class="tabular">
                  <strong>{v.at.slice(0, 10)}</strong> · {v.title} ({v.ruleIds.join(', ') || v.level})
                </div>
                <div class="muted">
                  {v.reasons.join(' ')}
                  {v.closedByVisit
                    ? ' · Closed by doctor visit'
                    : v.dismissedAt
                      ? ` · Got it (${v.dismissedAt.slice(0, 10)})`
                      : v.kind === 'event'
                        ? ' · Open'
                        : ''}
                </div>
              </div>
              {v.kind === 'event' && !v.dismissedAt && !v.closedByVisit && (
                <button
                  type="button"
                  class="btn btn-small"
                  onClick={() => void onDismissEvent(v.id)}
                >
                  Got it
                </button>
              )}
            </div>
          ))}
        </section>
      )}

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
