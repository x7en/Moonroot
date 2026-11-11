import { useState } from 'preact/hooks';
import { computeStep3Snapshot } from '../../app/store';
import { addDays, daysInMonth, formatDateKey, parseDateKey } from '../../core/model/dates';
import type {
  BackupMeta,
  DateKey,
  DayLog,
  Decision,
  DoctorVisit,
  Forecast,
  MedicineEntry,
  Profile,
  Stamp,
  Verdict,
  WatchItem,
} from '../../core/model/types';

interface CycleScreenProps {
  today: DateKey;
  nowIso: Stamp;
  profile: Profile;
  dayLogs: readonly DayLog[];
  decisions: readonly Decision[];
  forecasts: readonly Forecast[];
  medicines: readonly MedicineEntry[];
  verdicts: readonly Verdict[];
  watchItems: readonly WatchItem[];
  visits: readonly DoctorVisit[];
  meta: BackupMeta;
  onEditDay: (date: DateKey) => void;
  onSaveApproximatePeriod: (startDate: DateKey, durationDays: number) => Promise<void>;
  onSaveDecision: (decision: Decision) => Promise<void>;
  onDeleteDecision: (id: string) => Promise<void>;
}

const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

export function formatShortDate(date: DateKey): string {
  const { day, month } = parseDateKey(date);
  return `${day} ${MONTH_NAMES[month - 1] ?? String(month)}`;
}

function mondayFirstWeekday(year: number, month: number, day: number): number {
  const offsets = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4];
  let y = year;
  if (month < 3) y -= 1;
  const sunZero =
    (y +
      Math.floor(y / 4) -
      Math.floor(y / 100) +
      Math.floor(y / 400) +
      (offsets[month - 1] ?? 0) +
      day) %
    7;
  return (sunZero + 6) % 7;
}

export function CycleScreen({
  today,
  nowIso,
  profile,
  dayLogs,
  decisions,
  forecasts,
  medicines,
  verdicts,
  watchItems,
  visits,
  meta,
  onEditDay,
  onSaveApproximatePeriod,
  onSaveDecision,
  onDeleteDecision,
}: CycleScreenProps) {
  const parsedToday = parseDateKey(today);
  const [viewYear, setViewYear] = useState(parsedToday.year);
  const [viewMonth, setViewMonth] = useState(parsedToday.month);
  const [browsedDate, setBrowsedDate] = useState<DateKey>(today);

  const [backfillOpen, setBackfillOpen] = useState(false);
  const [backfillStart, setBackfillStart] = useState<DateKey>(addDays(today, -35));
  const [backfillDuration, setBackfillDuration] = useState('4');
  const [backfillNote, setBackfillNote] = useState('');

  const [baselineInput, setBaselineInput] = useState<DateKey>(today);
  const [waysOpen, setWaysOpen] = useState(false);

  const step3 = computeStep3Snapshot(
    {
      profile,
      dayLogs: [...dayLogs],
      bodyLogs: [],
      decisions: [...decisions],
      forecasts: [...forecasts],
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

  const { prediction, cycles } = step3;
  const { confidence, leadIn, ovulation } = prediction;

  const logByDate = new Map(dayLogs.map((l) => [l.date, l]));
  const browsedLog = logByDate.get(browsedDate) ?? null;

  const totalDays = daysInMonth(viewYear, viewMonth);
  const leadingBlanks = mondayFirstWeekday(viewYear, viewMonth, 1);

  function prevMonth(): void {
    if (viewMonth === 1) {
      setViewYear((y) => y - 1);
      setViewMonth(12);
    } else {
      setViewMonth((m) => m - 1);
    }
  }

  function nextMonth(): void {
    if (viewMonth === 12) {
      setViewYear((y) => y + 1);
      setViewMonth(1);
    } else {
      setViewMonth((m) => m + 1);
    }
  }

  async function handleAddApproxPeriod(e: Event): Promise<void> {
    e.preventDefault();
    if (!backfillStart || backfillStart > today) return;
    const daysNum = Number(backfillDuration);
    const dur = Number.isFinite(daysNum) ? Math.max(1, Math.min(10, Math.round(daysNum))) : 4;
    await onSaveApproximatePeriod(backfillStart, dur);
    setBackfillNote(`Saved approximate period starting ${backfillStart} (counted at half weight).`);
    setBackfillStart(addDays(backfillStart, -28));
  }

  async function handleSetBaseline(e: Event): Promise<void> {
    e.preventDefault();
    if (!baselineInput || baselineInput > today) return;
    await onSaveDecision({
      id: `baseline-${baselineInput}-${Date.now()}`,
      date: baselineInput,
      kind: 'new-baseline',
      at: nowIso,
      note: 'Started predictions fresh from Cycle tab',
    });
  }

  async function handleClearBaseline(): Promise<void> {
    const existing = decisions.filter((d) => d.kind === 'new-baseline');
    for (const d of existing) {
      await onDeleteDecision(d.id);
    }
  }

  const upcomingRibbonDates = Array.from({ length: 21 }, (_, idx) => addDays(today, idx));

  return (
    <div>
      <section class="card" aria-label="Confidence meter">
        <span class="field-label">Confidence</span>
        <div class="confidence-hero tabular" aria-label={`Confidence ${confidence.score} percent`}>
          {confidence.score}%
        </div>

        {confidence.effectiveCycles === 0 && !cycles.openCycle ? (
          <div>
            <p style={{ margin: '6px 0 4px 0', fontWeight: 700 }}>Log your first period to start.</p>
            <p class="muted" style={{ margin: 0 }}>
              Each period you log tightens your ranges. Your cycle windows, track record, and
              patterns unlock as you log.
            </p>
            <div class="btn-row" style={{ marginTop: '12px' }}>
              <button type="button" class="btn btn-primary" onClick={() => onEditDay(today)}>
                Log on Today
              </button>
              <button
                type="button"
                class="btn"
                onClick={() => setBackfillOpen(true)}
              >
                Add earlier periods
              </button>
            </div>
          </div>
        ) : (
          <div>
            {prediction.likelyWidthDays !== null ? (
              <p class="muted tabular" style={{ margin: '2px 0 6px 0' }}>
                Likely window {prediction.likelyWidthDays} days wide
              </p>
            ) : prediction.droppedLikelyWindow && prediction.daysSinceStart !== null ? (
              <p class="muted tabular" style={{ margin: '2px 0 6px 0' }}>
                Day {prediction.daysSinceStart}.{' '}
                {prediction.longestGapDays !== null
                  ? `The longest gap you logged is ${prediction.longestGapDays} days.`
                  : 'Waiting for more cycle data.'}
              </p>
            ) : (
              <p class="muted" style={{ margin: '2px 0 6px 0' }}>
                Ranges adjust as more cycle starts are logged.
              </p>
            )}

            {confidence.resolvedCount >= 2 && (
              <p class="tabular" style={{ margin: '6px 0 0 0', fontWeight: 600 }}>
                Past possible windows held the real start in {confidence.hitCount} of the last{' '}
                {confidence.resolvedCount}.
              </p>
            )}

            {confidence.highVariabilityNote && (
              <p class="notice-banner" style={{ marginTop: '10px', marginBottom: 0 }}>
                Your cycles vary a lot, so ranges stay wide. That limit comes from the cycles, not
                from how you log.
              </p>
            )}
          </div>
        )}
      </section>

      <section class="card" aria-label="Next period forecast">
        <h2 class="card-title">Next period in words</h2>
        {!prediction.anchor ? (
          <p class="muted" style={{ margin: 0 }}>
            Log your first period start to see personal next-period ranges.
          </p>
        ) : prediction.droppedLikelyWindow && prediction.possible ? (
          <div>
            <p style={{ margin: '0 0 6px 0', fontWeight: 700 }}>
              Day {prediction.daysSinceStart}.{' '}
              {prediction.longestGapDays !== null
                ? `The longest gap you logged is ${prediction.longestGapDays} days.`
                : ''}
            </p>
            <p class="muted" style={{ margin: 0 }}>
              Possible window extends through {formatShortDate(prediction.possible[1])}.
            </p>
          </div>
        ) : (
          <div>
            {prediction.likely && (
              <p style={{ margin: '0 0 4px 0', fontWeight: 700 }}>
                Your next period is likely between {formatShortDate(prediction.likely[0])} and{' '}
                {formatShortDate(prediction.likely[1])}.
              </p>
            )}
            {prediction.possible && (
              <p class="muted" style={{ margin: '0 0 4px 0' }}>
                Possible window: {formatShortDate(prediction.possible[0])} to{' '}
                {formatShortDate(prediction.possible[1])}
                {prediction.peak ? ` · Midpoint around ${formatShortDate(prediction.peak)}` : ''}.
              </p>
            )}
            {prediction.priorUsed !== 'none' && (
              <p class="muted" style={{ margin: '4px 0 0 0' }}>
                Includes general starting estimate ({prediction.priorUsed}) while fewer than 8
                cycles are logged.
              </p>
            )}
            <div class="forecast-strip" aria-label="Next 21 days text strip">
              {upcomingRibbonDates.map((d) => {
                const inLikely =
                  prediction.likely !== null &&
                  d >= prediction.likely[0] &&
                  d <= prediction.likely[1];
                const inPossible =
                  prediction.possible !== null &&
                  d >= prediction.possible[0] &&
                  d <= prediction.possible[1];
                const cls = [
                  'ribbon-cell',
                  'tabular',
                  d === today ? 'ribbon-cell-today' : '',
                  inLikely ? 'ribbon-cell-likely' : inPossible ? 'ribbon-cell-possible' : '',
                ]
                  .filter(Boolean)
                  .join(' ');
                return (
                  <span
                    key={d}
                    class={cls}
                    title={`${d}${inLikely ? ' (likely)' : inPossible ? ' (possible)' : ''}`}
                  >
                    {parseDateKey(d).day}
                  </span>
                );
              })}
            </div>
          </div>
        )}
      </section>

      <section class="card" aria-label="Lead-in pattern">
        <h2 class="card-title">Lead-in pattern</h2>
        {leadIn.status === 'learned' && leadIn.offsetRangeDays && leadIn.medianOffsetDays !== null ? (
          <div>
            <p style={{ margin: '0 0 4px 0' }}>
              Spotting or cramps (3+) appeared {leadIn.offsetRangeDays[0]} to{' '}
              {leadIn.offsetRangeDays[1]} days before flow in {leadIn.cyclesWithSignal} cycles.
            </p>
            {leadIn.activeSignalDate && leadIn.likely ? (
              <p style={{ margin: 0, fontWeight: 700 }}>
                Signal logged on {formatShortDate(leadIn.activeSignalDate)} — period likely{' '}
                {formatShortDate(leadIn.likely[0])} to {formatShortDate(leadIn.likely[1])}.
              </p>
            ) : (
              <p class="muted" style={{ margin: 0 }}>
                When a pre-flow signal appears, the forecast narrows using your offsets.
              </p>
            )}
          </div>
        ) : leadIn.status === 'retired' ? (
          <p style={{ margin: 0, fontWeight: 700 }}>This pattern is not holding.</p>
        ) : leadIn.status === 'unreliable' ? (
          <p class="muted" style={{ margin: 0 }}>
            Pre-flow spotting or cramps appeared without flow within 14 days too often (
            {leadIn.followedSignalEvents} of {leadIn.totalSignalEvents} signals followed), so it is
            ignored.
          </p>
        ) : (
          <p class="muted" style={{ margin: 0 }}>
            Tracks pre-flow spotting or cramps (3+) across cycles. Needs 4 consistent cycles (
            {leadIn.cyclesWithSignal} of 4 so far).
          </p>
        )}
      </section>

      <section class="card" aria-label="Ovulation estimate">
        <h2 class="card-title">Ovulation</h2>
        <p class="notice-banner" style={{ marginTop: 0 }}>
          This app is not a contraception method.
        </p>

        {ovulation.current.status === 'none' ? (
          <div>
            <p style={{ margin: '0 0 6px 0', fontWeight: 700 }}>{ovulation.current.message}</p>
            <p class="muted" style={{ margin: 0 }}>
              {profile.selfRegularity === 'irregular' || confidence.highVariabilityNote
                ? 'With very irregular cycles it often stays at not enough signals yet, and a doctor has better ways to check.'
                : 'Log morning temperature, LH strips, or cervical mucus on Today. The app never guesses ovulation from calendar dates alone.'}
            </p>
          </div>
        ) : (
          <div>
            <p style={{ margin: '0 0 6px 0', fontWeight: 700 }}>
              {ovulation.current.status === 'confirmed' ? 'Confirmed' : 'Probable'} ovulation
              estimate around{' '}
              {ovulation.current.ovulationDate
                ? formatShortDate(ovulation.current.ovulationDate)
                : ''}
            </p>
            <p class="muted" style={{ margin: '0 0 6px 0' }}>
              {ovulation.current.message}
            </p>
            {prediction.basis === 'ovulation' && (
              <p class="muted" style={{ margin: '0 0 6px 0' }}>
                Next-period window above uses this confirmed ovulation estimate.
              </p>
            )}
          </div>
        )}

        {ovulation.lutealSummary !== null && (
          <p class="tabular muted" style={{ margin: '6px 0 0 0' }}>
            Learned luteal length ({ovulation.lutealSummary.count} confirmed cycles): typical{' '}
            {ovulation.lutealSummary.q50} days (10th to 90th percentile{' '}
            {ovulation.lutealSummary.q10} to {ovulation.lutealSummary.q90} days).
          </p>
        )}

        <div class="btn-row" style={{ marginTop: '12px' }}>
          <button type="button" class="btn btn-small" onClick={() => onEditDay(today)}>
            Log ovulation signals
          </button>
          <button type="button" class="btn btn-small" onClick={() => setWaysOpen(true)}>
            Ways to find out
          </button>
        </div>
      </section>

      {waysOpen && (
        <div
          class="sheet-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="ways-sheet-title"
        >
          <div class="sheet">
            <div class="sheet-handle" />
            <div class="sheet-header">
              <h2 id="ways-sheet-title" class="card-title" style={{ margin: 0 }}>
                Ways to find out
              </h2>
              <button type="button" class="btn btn-small" onClick={() => setWaysOpen(false)}>
                Close
              </button>
            </div>
            <p class="notice-banner">This app is not a contraception method.</p>
            <p style={{ margin: '0 0 10px 0' }}>
              <strong>Cervical mucus (free):</strong> look for clear, slippery, watery or
              egg-white mucus. Ovulation is likely within 1 to 2 days after the last peak day.
            </p>
            <p style={{ margin: '0 0 10px 0' }}>
              <strong>Morning temperature (thermometer):</strong> take your temperature before
              getting out of bed after steady sleep. A small sustained shift shows ovulation after it
              happens. Days when you have an illness or fever are skipped.
            </p>
            <p style={{ margin: '0 0 10px 0' }}>
              <strong>LH urine strips (costs money):</strong> a positive strip shows a hormone
              surge, meaning ovulation is likely within 24 to 36 hours.
            </p>
            <p class="muted" style={{ margin: 0 }}>
              With very irregular cycles it often says not enough signals yet, and a doctor has
              better ways to check.
            </p>
          </div>
        </div>
      )}

      <section class="card" aria-label="Month calendar">
        <div class="btn-row" style={{ justifyContent: 'space-between', marginBottom: '12px' }}>
          <button
            type="button"
            class="btn btn-small"
            aria-label="Previous month"
            onClick={prevMonth}
          >
            Prev
          </button>
          <h2 class="card-title tabular" style={{ margin: 0 }}>
            {MONTH_NAMES[viewMonth - 1]} {viewYear}
          </h2>
          <button
            type="button"
            class="btn btn-small"
            aria-label="Next month"
            onClick={nextMonth}
          >
            Next
          </button>
        </div>

        <div class="calendar-grid" aria-label={`${MONTH_NAMES[viewMonth - 1]} ${viewYear} calendar`}>
          {WEEKDAYS.map((wd) => (
            <div key={wd} class="calendar-weekday" aria-hidden="true">
              {wd}
            </div>
          ))}
          {Array.from({ length: leadingBlanks }, (_, idx) => (
            <div key={`blank-${idx}`} aria-hidden="true" />
          ))}
          {Array.from({ length: totalDays }, (_, idx) => {
            const dayNum = idx + 1;
            const dateKey = formatDateKey(viewYear, viewMonth, dayNum);
            const log = logByDate.get(dateKey);
            const hasFlow =
              log?.flow === 'light' || log?.flow === 'medium' || log?.flow === 'heavy';
            const hasSpotting = log?.flow === 'spotting';
            const inLikely =
              prediction.likely !== null &&
              dateKey >= prediction.likely[0] &&
              dateKey <= prediction.likely[1];
            const inPossible =
              prediction.possible !== null &&
              dateKey >= prediction.possible[0] &&
              dateKey <= prediction.possible[1];

            const cls = [
              'calendar-day',
              'tabular',
              dateKey === today ? 'calendar-day-today' : '',
              hasFlow ? 'calendar-day-flow' : '',
              inLikely ? 'calendar-day-likely' : inPossible ? 'calendar-day-possible' : '',
            ]
              .filter(Boolean)
              .join(' ');

            const statusParts: string[] = [dateKey];
            if (dateKey === today) statusParts.push('today');
            if (log?.flow) statusParts.push(`${log.flow} flow`);
            if (inLikely) statusParts.push('likely window');
            else if (inPossible) statusParts.push('possible window');

            return (
              <button
                key={dateKey}
                type="button"
                class={cls}
                aria-pressed={browsedDate === dateKey}
                aria-label={statusParts.join(', ')}
                onClick={() => setBrowsedDate(dateKey)}
              >
                <span>{dayNum}</span>
                {hasFlow && <span class="calendar-dot" aria-hidden="true" />}
                {hasSpotting && <span class="calendar-dot-spot" aria-hidden="true" />}
              </button>
            );
          })}
        </div>

        <div
          style={{
            marginTop: '12px',
            paddingTop: '12px',
            borderTop: '1px solid var(--border)',
          }}
        >
          <p class="tabular" style={{ margin: '0 0 6px 0' }}>
            <strong>{browsedDate}</strong>:{' '}
            {browsedLog
              ? `flow ${browsedLog.flow ?? 'unlogged'}${browsedLog.pain ? `, pain ${browsedLog.pain.level}/10` : ''}${browsedLog.filledFrom === 'approximate' ? ' (approximate)' : ''}`
              : 'No entry logged'}
          </p>
          {browsedDate <= today && (
            <button
              type="button"
              class="btn btn-small"
              onClick={() => onEditDay(browsedDate)}
            >
              Open {browsedDate} on Today
            </button>
          )}
        </div>
      </section>

      <section class="card" aria-label="Add earlier periods">
        <div class="btn-row" style={{ justifyContent: 'space-between' }}>
          <h2 class="card-title" style={{ margin: 0 }}>
            Add earlier periods
          </h2>
          <button
            type="button"
            class="btn btn-small"
            aria-expanded={backfillOpen}
            onClick={() => setBackfillOpen((v) => !v)}
          >
            {backfillOpen ? 'Hide' : 'Add earlier periods'}
          </button>
        </div>
        <p class="muted" style={{ marginTop: '6px' }}>
          Earlier cycles entered from memory count at half weight and never replace daily entries.
        </p>

        {backfillOpen && (
          <form onSubmit={(e) => void handleAddApproxPeriod(e)}>
            <div class="field">
              <label htmlFor="approx-start-date">Period start date</label>
              <input
                id="approx-start-date"
                class="input"
                type="date"
                max={today}
                value={backfillStart}
                onInput={(e) => setBackfillStart((e.target as HTMLInputElement).value)}
              />
            </div>
            <div class="field">
              <label htmlFor="approx-duration">Approximate bleeding days</label>
              <input
                id="approx-duration"
                class="input"
                type="number"
                min="1"
                max="10"
                inputMode="numeric"
                value={backfillDuration}
                onInput={(e) => setBackfillDuration((e.target as HTMLInputElement).value)}
              />
            </div>
            <button type="submit" class="btn btn-primary">
              Save approximate period
            </button>
            {backfillNote && (
              <p class="muted" style={{ marginTop: '8px', marginBottom: 0 }}>
                {backfillNote}
              </p>
            )}
          </form>
        )}
      </section>

      <section class="card" aria-label="Start predictions fresh">
        <h2 class="card-title">Start predictions fresh</h2>
        <p class="muted" style={{ marginTop: 0 }}>
          {cycles.newBaselineDate
            ? `Active baseline: ${cycles.newBaselineDate}. Earlier cycles stay in your record labelled "before the change".`
            : 'Use this if a hormone medicine change or other shift makes older cycles a poor guide.'}
        </p>
        <form onSubmit={(e) => void handleSetBaseline(e)} class="btn-row">
          <label htmlFor="cycle-baseline-date" class="sr-only">
            Start-fresh date
          </label>
          <input
            id="cycle-baseline-date"
            class="input"
            type="date"
            max={today}
            value={baselineInput}
            style={{ flex: '1 1 160px' }}
            onInput={(e) => setBaselineInput((e.target as HTMLInputElement).value)}
          />
          <button type="submit" class="btn btn-small">
            Start fresh from date
          </button>
          {cycles.newBaselineDate && (
            <button
              type="button"
              class="btn btn-small"
              onClick={() => void handleClearBaseline()}
            >
              Clear marker
            </button>
          )}
        </form>
      </section>
    </div>
  );
}
