import { useEffect, useRef, useState } from 'preact/hooks';
import {
  computeStep3Snapshot,
  getWatchCheckLabel,
  makeEmptyDayLog,
  summarizeWatchItem,
} from '../../app/store';
import { groupMedicinesForDay } from '../../core/medicine/totals';
import { DANGER_SIGN_CATALOGUE, SYMPTOM_CATALOGUE } from '../../core/model/catalogues';
import { isAdultSexualHealthAllowed, mayContainOestrogen } from '../../core/model/dates';
import type {
  Clots,
  DangerSign,
  DateKey,
  DayLog,
  Decision,
  DoctorVisit,
  Flow,
  Forecast,
  MedicineEntry,
  PainSite,
  Profile,
  Protection,
  Stamp,
  StandingFlagId,
  SymptomKey,
  Verdict,
  WatchItem,
} from '../../core/model/types';
import { isAdolescentCycleBand } from '../../core/triage/engine';
import { isNeutralPregnancyQuestionAllowed } from '../../core/triage/flowEngine';
import { DangerSignSheet } from '../components/DangerSignSheet';
import { FLOW_OPTIONS, FlowGlyph } from '../components/FlowGlyphs';
import { MedicineSheet } from '../components/MedicineSheet';
import { formatShortDate } from './CycleScreen';

interface TodayScreenProps {
  today: DateKey;
  selectedDate: DateKey;
  nowIso: Stamp;
  profile: Profile;
  dayLog: DayLog | null;
  dayLogs: readonly DayLog[];
  decisions: readonly Decision[];
  forecasts?: readonly Forecast[];
  medicines: readonly MedicineEntry[];
  verdicts: readonly Verdict[];
  watchItems: readonly WatchItem[];
  visits: readonly DoctorVisit[];
  onChangeDate: (date: DateKey) => void;
  onSaveDayLog: (log: DayLog) => Promise<void>;
  onSaveDecision: (decision: Decision) => Promise<void>;
  onDismissEvent: (verdictId: string) => Promise<void>;
  onDismissStandingPrompt: (
    ruleId: StandingFlagId,
    title: string,
    reason: string,
  ) => Promise<void>;
  onAnswerWatchItem: (
    watchId: string,
    answers: Record<string, 'yes' | 'no' | 'unsure'>,
  ) => Promise<void>;
  onSaveMedicine: (entry: MedicineEntry) => Promise<void>;
  onSaveVisit: (visit: DoctorVisit) => Promise<void>;
  onOpenGetHelp: () => void;
}

const PAIN_SITES: readonly { key: PainSite; label: string }[] = [
  { key: 'lower-middle', label: 'Middle' },
  { key: 'left', label: 'Left' },
  { key: 'right', label: 'Right' },
  { key: 'back', label: 'Back' },
  { key: 'whole-belly', label: 'Whole belly' },
  { key: 'shoulder-tip', label: 'Shoulder tip' },
  { key: 'other', label: 'Other' },
];

function verdictPresentation(level: string): {
  icon: string;
  cssClass: string;
  label: string;
} {
  if (level === 'red') {
    return { icon: '!', cssClass: 'verdict-card verdict-red', label: 'Get care today' };
  }
  if (level === 'orange') {
    return { icon: '▲', cssClass: 'verdict-card verdict-orange', label: 'See a doctor soon' };
  }
  if (level === 'yellow') {
    return { icon: '◐', cssClass: 'verdict-card verdict-yellow', label: 'Keep watching' };
  }
  if (level === 'open-event-notice') {
    return {
      icon: '◈',
      cssClass: 'verdict-card verdict-orange',
      label: 'Nothing new today. An earlier flag is still open.',
    };
  }
  if (level === 'incomplete') {
    return { icon: '◷', cssClass: 'verdict-card verdict-incomplete', label: 'More answers needed' };
  }
  return { icon: '✓', cssClass: 'verdict-card verdict-green', label: 'Nothing flagged' };
}

export function TodayScreen({
  today,
  selectedDate,
  nowIso,
  profile,
  dayLog,
  dayLogs,
  decisions,
  forecasts = [],
  medicines,
  verdicts,
  watchItems,
  visits,
  onChangeDate,
  onSaveDayLog,
  onSaveDecision,
  onDismissEvent,
  onDismissStandingPrompt,
  onAnswerWatchItem,
  onSaveMedicine,
  onSaveVisit,
  onOpenGetHelp,
}: TodayScreenProps) {
  const [dangerOpen, setDangerOpen] = useState(false);
  const [medicineOpen, setMedicineOpen] = useState(false);
  const [catchUpHidden, setCatchUpHidden] = useState(false);
  const [hormonePromptLater, setHormonePromptLater] = useState(false);

  const current: DayLog = dayLog ?? makeEmptyDayLog(selectedDate, nowIso);
  const [noteDraft, setNoteDraft] = useState<string>(current.note);
  const draftRef = useRef<DayLog | null>(null);
  const pendingWritesRef = useRef(0);
  const lastDateRef = useRef<DateKey>(selectedDate);
  const saveChainRef = useRef<Promise<void>>(Promise.resolve());

  if (lastDateRef.current !== selectedDate) {
    lastDateRef.current = selectedDate;
    draftRef.current = null;
  }

  useEffect(() => {
    setNoteDraft(dayLog?.note ?? '');
  }, [selectedDate, dayLog?.note]);

  const step2 = computeStep3Snapshot(
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
      meta: {
        lastExportAt: null,
        lastAutoBackupAt: null,
        passphraseAsked: false,
        snoozedUntil: null,
      },
    },
    selectedDate,
    today,
    nowIso,
  );

  const painLevel = current.pain?.level ?? 0;
  const painSites = current.pain?.sites ?? [];

  const activeHormoneNames = medicines
    .filter(
      (m) =>
        m.kind === 'course' &&
        m.category === 'hormone' &&
        (m.startDate ?? m.date) <= selectedDate &&
        (!m.stopDate || m.stopDate >= selectedDate),
    )
    .map((m) => m.genericName ?? m.nameShown);
  const showOestrogenSigns = mayContainOestrogen(profile, activeHormoneNames);
  const sexualAllowed = isAdultSexualHealthAllowed(profile, today);
  const neutralPregnancyAllowed = isNeutralPregnancyQuestionAllowed(profile);
  const adolescentBand = isAdolescentCycleBand(profile, today);

  const activeFlowIds = new Set(step2.activeFlows.map((f) => f.triggerId));
  const needsPregnancyQuestion =
    neutralPregnancyAllowed &&
    (step2.activeFlows.some((f) =>
      f.questions.some((q) => q.setsFields.includes('dayLog.pregnancyChance')),
    ) ||
      (painLevel >= 1 &&
        (painSites.includes('left') ||
          painSites.includes('right') ||
          painSites.includes('shoulder-tip') ||
          (current.flow !== null && current.flow !== 'none'))));

  const dayMedicineGroups = groupMedicinesForDay(medicines, selectedDate);
  const lastDose =
    [...medicines]
      .filter((m) => m.kind === 'dose')
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null;

  const dangerTriggered =
    current.flow === 'medium' ||
    current.flow === 'heavy' ||
    painLevel >= 4 ||
    current.fever?.felt === true ||
    current.fever?.c !== undefined ||
    current.discharge === 'odour' ||
    current.discharge === 'yellow-green';

  function patchLog(patch: Partial<DayLog>): Promise<void> {
    const base =
      draftRef.current && draftRef.current.date === selectedDate
        ? draftRef.current
        : (dayLog ?? makeEmptyDayLog(selectedDate, nowIso));
    const next: DayLog = {
      ...base,
      ...patch,
      date: selectedDate,
      filledFrom:
        base.filledFrom === 'approximate'
          ? 'approximate'
          : selectedDate === today
            ? 'live'
            : 'backfill',
      updatedAt: nowIso,
    };
    draftRef.current = next;
    pendingWritesRef.current += 1;
    saveChainRef.current = saveChainRef.current
      .then(() => onSaveDayLog(next))
      .finally(() => {
        pendingWritesRef.current -= 1;
        if (pendingWritesRef.current === 0 && draftRef.current === next) {
          draftRef.current = null;
        }
      });
    return saveChainRef.current;
  }

  function togglePainSite(site: PainSite): void {
    const base =
      draftRef.current && draftRef.current.date === selectedDate ? draftRef.current : current;
    const baseSites = base.pain?.sites ?? [];
    const nextSites = baseSites.includes(site)
      ? baseSites.filter((s) => s !== site)
      : [...baseSites, site];
    void patchLog({
      pain: {
        level: base.pain?.level ?? 0,
        ...base.pain,
        sites: nextSites,
      },
    });
  }

  function toggleSymptom(key: SymptomKey): void {
    const base =
      draftRef.current && draftRef.current.date === selectedDate ? draftRef.current : current;
    const next = base.symptoms.includes(key)
      ? base.symptoms.filter((s) => s !== key)
      : [...base.symptoms, key];
    void patchLog({ symptoms: next });
  }

  function handleFlowTap(flow: Flow): void {
    void patchLog({ flow });
  }

  function handlePainLevel(level: number): void {
    const base =
      draftRef.current && draftRef.current.date === selectedDate ? draftRef.current : current;
    void patchLog({
      pain: {
        ...base.pain,
        level,
        sites: base.pain?.sites ?? [],
      },
    });
  }

  const dangerLabels = current.danger.map(
    (k) => DANGER_SIGN_CATALOGUE.find((item) => item.key === k)?.defaultLabel ?? k,
  );

  const verdict = step2.triageSelected.today;
  const verdictUi = verdictPresentation(verdict.level);
  const openEvents = step2.triageToday.openEvents;
  const openWatchItems = watchItems.filter((w) => w.status === 'open');
  const recentClosedWatch =
    watchItems
      .filter((w) => w.status === 'closed' || w.status === 'escalated')
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
  const dueStanding =
    step2.triageToday.standingFlags.find((s) => s.dueForSoftPrompt) ?? null;

  const unclearToConfirm = step2.episodes.unclearEpisodes.find(
    (ep) =>
      !decisions.some(
        (d) =>
          (d.kind === 'period-start' || d.kind === 'not-a-period') &&
          d.date >= ep.firstDate &&
          d.date <= ep.lastDate,
      ),
  );

  const openPeriodWithLeadIn = step2.episodes.periodEpisodes.find(
    (ep) =>
      ep.leadInDays > 0 &&
      ep.firstSpotDate !== null &&
      ep.endDate >= selectedDate &&
      !decisions.some(
        (d) => d.kind === 'period-start' && d.date === ep.firstSpotDate,
      ),
  );

  return (
    <div>
      {dayLog === null &&
      selectedDate === today &&
      openEvents.length === 0 &&
      verdict.level === 'incomplete' ? (
        <section class="card verdict-card verdict-incomplete" aria-label="Today check-in summary">
          <div class="verdict-badge">
            <span class="verdict-icon" aria-hidden="true">
              {verdictUi.icon}
            </span>
            <span>Ready for today&apos;s check-in</span>
          </div>
          <p class="muted" style={{ marginBottom: 0 }}>
            Tap Flow and Pain below (under 10 seconds) to see today&apos;s result.
          </p>
        </section>
      ) : (
        <section
          class={`card ${verdictUi.cssClass}`}
          aria-label="Today verdict"
          role="region"
        >
          <div class="verdict-badge">
            <span class="verdict-icon" aria-hidden="true">
              {verdictUi.icon}
            </span>
            <span>{verdictUi.label}</span>
          </div>

          {verdict.actionPrepend && (
            <p
              class="notice-banner"
              style={{ borderColor: 'var(--level-red)', fontWeight: 700, marginTop: '10px' }}
            >
              {verdict.actionPrepend}
            </p>
          )}

          {verdict.reasons.length > 0 && (
            <p style={{ margin: '8px 0 4px 0', fontWeight: 700 }}>
              {verdict.reasons.join(' ')}
            </p>
          )}
          <p class="muted" style={{ margin: '4px 0 0 0' }}>
            {verdict.message}
          </p>

          {verdict.level === 'green' && adolescentBand && (
            <p class="muted" style={{ margin: '6px 0 0 0' }}>
              Irregular cycles can happen in the first 3 years after a first period.
            </p>
          )}

          {verdict.level === 'red' && (
            <div style={{ marginTop: '10px' }}>
              <button type="button" class="btn btn-danger-solid" onClick={onOpenGetHelp}>
                Open Get help
              </button>
            </div>
          )}
        </section>
      )}

      <p class="notice-banner tabular" aria-label="Forecast summary" style={{ marginBottom: '12px' }}>
        {step2.prediction.likely
          ? `Forecast (${step2.prediction.confidence.score}% confidence): next period likely between ${formatShortDate(step2.prediction.likely[0])} and ${formatShortDate(step2.prediction.likely[1])}.`
          : step2.prediction.droppedLikelyWindow && step2.prediction.daysSinceStart !== null
            ? `Forecast (${step2.prediction.confidence.score}% confidence): Day ${step2.prediction.daysSinceStart}.${step2.prediction.longestGapDays !== null ? ` Longest gap logged is ${step2.prediction.longestGapDays} days.` : ''}`
            : step2.cycles.openCycle
              ? `Forecast (${step2.prediction.confidence.score}% confidence): Day ${step2.cycles.openCycle.daysSinceStart}. Log another cycle to narrow ranges.`
              : 'Confidence 10%. Log your first period to start forecasts.'}
      </p>

      {selectedDate === today && step2.catchUpDays.length >= 2 && !catchUpHidden && (
        <section class="card" aria-label="Catch-up check-in" style={{ borderColor: 'var(--lamp)' }}>
          <div class="btn-row" style={{ justifyContent: 'space-between' }}>
            <h2 class="card-title" style={{ margin: 0 }}>
              Welcome back. Want a 20-second catch-up?
            </h2>
            <button type="button" class="btn btn-small" onClick={() => setCatchUpHidden(true)}>
              Done
            </button>
          </div>
          <p class="muted" style={{ marginTop: '6px' }}>
            Tap flow for recent days, or leave blank if you are not sure.
          </p>
          {step2.catchUpDays.map((d) => {
            const existing = dayLogs.find((l) => l.date === d);
            return (
              <div
                key={d}
                style={{
                  paddingBlock: '8px',
                  borderTop: '1px solid var(--border)',
                }}
              >
                <div class="tabular" style={{ fontWeight: 700, marginBottom: '6px' }}>
                  {d}
                </div>
                <div class="chip-group">
                  {(['none', 'spotting', 'light', 'medium', 'heavy'] as const).map((f) => (
                    <button
                      key={f}
                      type="button"
                      class="chip"
                      aria-pressed={existing?.flow === f}
                      onClick={() =>
                        void onSaveDayLog({
                          ...(existing ?? makeEmptyDayLog(d, nowIso)),
                          date: d,
                          filledFrom: 'approximate',
                          flow: f,
                          pain: existing?.pain ?? { level: 0, sites: [] },
                          dangerAnswered: existing?.dangerAnswered ?? true,
                          updatedAt: nowIso,
                        })
                      }
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </section>
      )}

      {openEvents.map((ev) => (
        <section
          key={ev.id}
          class="card verdict-card verdict-orange"
          aria-label={`Open event ${ev.ruleIds.join(', ')}`}
        >
          <div class="verdict-badge">
            <span class="verdict-icon" aria-hidden="true">
              ▲
            </span>
            <span>
              {ev.title} ({ev.ruleIds.join(', ')})
            </span>
          </div>
          <p style={{ margin: '8px 0 6px 0' }}>{ev.reasons.join(' ')}</p>
          <div class="btn-row">
            <button type="button" class="btn btn-small" onClick={() => void onDismissEvent(ev.id)}>
              Got it
            </button>
            <button
              type="button"
              class="btn btn-small"
              onClick={() =>
                void onSaveVisit({
                  id: `visit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                  date: today,
                  note: `Visit logged for ${ev.ruleIds.join(', ')}`,
                })
              }
            >
              Log doctor visit today
            </button>
          </div>
        </section>
      ))}

      {openWatchItems.map((item) => (
        <section
          key={item.id}
          class="card verdict-card verdict-yellow"
          aria-label="Watch list check"
        >
          <div class="verdict-badge">
            <span class="verdict-icon" aria-hidden="true">
              ◐
            </span>
            <span>Watch list check</span>
          </div>
          <p class="muted" style={{ marginTop: '6px' }}>
            Follow-up due from {item.createdAt.slice(0, 10)}. Answering Yes on a warning sign raises
            it at once.
          </p>
          {item.checks.map((chk) => (
            <div key={chk.key} style={{ marginBottom: '10px' }}>
              <div style={{ fontWeight: 700, marginBottom: '6px' }}>
                {getWatchCheckLabel(chk.key)}
              </div>
              <div class="chip-group">
                {(['yes', 'no', 'unsure'] as const).map((ans) => (
                  <button
                    key={ans}
                    type="button"
                    class="chip"
                    aria-pressed={chk.answer === ans}
                    onClick={() => void onAnswerWatchItem(item.id, { [chk.key]: ans })}
                  >
                    {ans === 'yes' ? 'Yes' : ans === 'no' ? 'No' : 'Not sure'}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </section>
      ))}

      {openWatchItems.length === 0 && recentClosedWatch && (
        <div class="notice-banner" role="status">
          {summarizeWatchItem(recentClosedWatch)}
        </div>
      )}

      {dueStanding && (
        <section class="card" aria-label="Long-term pattern notice">
          <div class="btn-row" style={{ justifyContent: 'space-between' }}>
            <strong>
              {dueStanding.ruleId}: {dueStanding.title}
            </strong>
            <button
              type="button"
              class="btn btn-small"
              onClick={() =>
                void onDismissStandingPrompt(
                  dueStanding.ruleId,
                  dueStanding.title,
                  dueStanding.reason,
                )
              }
            >
              Got it
            </button>
          </div>
          <p class="muted" style={{ margin: '6px 0 0 0' }}>
            {dueStanding.reason}
          </p>
        </section>
      )}

      {activeFlowIds.has('hormone-course-changed') && !hormonePromptLater && (
        <section class="card" aria-label="Start fresh question" style={{ borderColor: 'var(--accent)' }}>
          <h2 class="card-title">Start predictions fresh from this date?</h2>
          <p class="muted" style={{ marginTop: 0 }}>
            Starting or stopping hormone medicine changes bleeding patterns.
          </p>
          <div class="btn-row">
            <button
              type="button"
              class="btn btn-primary btn-small"
              onClick={() =>
                void onSaveDecision({
                  id: `baseline-${selectedDate}-${Date.now()}`,
                  date: selectedDate,
                  kind: 'new-baseline',
                  at: nowIso,
                  note: 'Hormone medicine change',
                })
              }
            >
              Yes
            </button>
            <button type="button" class="btn btn-small" onClick={() => setHormonePromptLater(true)}>
              No
            </button>
            <button type="button" class="btn btn-small" onClick={() => setHormonePromptLater(true)}>
              Later
            </button>
          </div>
        </section>
      )}

      {unclearToConfirm && (
        <section class="card" aria-label="Period confirmation" style={{ borderColor: 'var(--lamp)' }}>
          <h2 class="card-title">Was bleeding from {unclearToConfirm.firstDate} a period?</h2>
          <div class="btn-row">
            <button
              type="button"
              class="btn btn-small btn-primary"
              onClick={() =>
                void onSaveDecision({
                  id: `confirm-${unclearToConfirm.firstDate}-${Date.now()}`,
                  date: unclearToConfirm.firstDate,
                  kind: 'period-start',
                  at: nowIso,
                  note: 'Confirmed period',
                })
              }
            >
              Yes, it was a period
            </button>
            <button
              type="button"
              class="btn btn-small"
              onClick={() =>
                void onSaveDecision({
                  id: `not-period-${unclearToConfirm.firstDate}-${Date.now()}`,
                  date: unclearToConfirm.firstDate,
                  kind: 'not-a-period',
                  at: nowIso,
                  note: 'Not a period',
                })
              }
            >
              No, not a period
            </button>
          </div>
        </section>
      )}

      {openPeriodWithLeadIn && openPeriodWithLeadIn.firstSpotDate && (
        <section class="card" aria-label="Lead-in start confirmation">
          <p style={{ marginTop: 0 }}>
            Spotting came before flow started on {openPeriodWithLeadIn.startDate}. Move cycle start
            to {openPeriodWithLeadIn.firstSpotDate}?
          </p>
          <button
            type="button"
            class="btn btn-small"
            onClick={() =>
              void onSaveDecision({
                id: `spot-start-${openPeriodWithLeadIn.firstSpotDate}-${Date.now()}`,
                date: openPeriodWithLeadIn.firstSpotDate ?? openPeriodWithLeadIn.startDate,
                kind: 'period-start',
                at: nowIso,
                note: 'Moved cycle start to first spotting day',
              })
            }
          >
            Start from {openPeriodWithLeadIn.firstSpotDate}
          </button>
        </section>
      )}

      <section class="card" aria-label="Check-in date">
        <div class="btn-row" style={{ justifyContent: 'space-between' }}>
          <div>
            <h2 class="card-title" style={{ marginBottom: '2px' }}>
              {selectedDate === today ? 'Today' : 'Editing day'}
            </h2>
            <p class="muted tabular" style={{ margin: 0 }}>
              {selectedDate}
            </p>
          </div>
          <div class="field" style={{ marginBottom: 0 }}>
            <label htmlFor="checkin-date-picker" class="sr-only">
              Select date
            </label>
            <input
              id="checkin-date-picker"
              class="input"
              type="date"
              max={today}
              value={selectedDate}
              onInput={(e) => {
                const val = (e.target as HTMLInputElement).value;
                if (val) onChangeDate(val);
              }}
            />
          </div>
        </div>
      </section>

      <section class="card" aria-label="Flow check-in">
        <h2 class="card-title">Flow</h2>
        <div class="flow-grid">
          {FLOW_OPTIONS.map((opt) => {
            const selected = current.flow === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                class="flow-btn"
                aria-pressed={selected}
                aria-label={`${opt.ariaBase}${selected ? ', selected' : ''}`}
                onClick={() => handleFlowTap(opt.value)}
              >
                <FlowGlyph flow={opt.value} selected={selected} />
                <span>{opt.label}</span>
                {selected && (
                  <span aria-hidden="true" style={{ fontSize: '0.75rem' }}>
                    ✓
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {(current.flow === 'spotting' ||
          current.flow === 'light' ||
          current.flow === 'medium' ||
          current.flow === 'heavy') && (
          <div style={{ marginTop: '14px' }}>
            <div class="field">
              <span class="field-label">Protection</span>
              <div class="chip-group">
                {(['none', 'liner', 'pad', 'tampon', 'cup', 'disc'] as Protection[]).map((prot) => (
                  <button
                    key={prot}
                    type="button"
                    class="chip"
                    aria-pressed={current.protection === prot}
                    onClick={() => void patchLog({ protection: prot })}
                  >
                    {prot}
                  </button>
                ))}
              </div>
            </div>

            {current.flow === 'spotting' && activeFlowIds.has('spotting-logged') && (
              <>
                <div class="field">
                  <span class="field-label">Any cramps: none, mild, strong?</span>
                  <div class="chip-group">
                    {(
                      [
                        { label: 'None', level: 0 },
                        { label: 'Mild', level: 2 },
                        { label: 'Strong', level: 5 },
                      ] as const
                    ).map((opt) => (
                      <button
                        key={opt.label}
                        type="button"
                        class="chip"
                        aria-pressed={current.pain !== undefined && painLevel === opt.level}
                        onClick={() => handlePainLevel(opt.level)}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
                {step2.activeFlows
                  .find((f) => f.triggerId === 'spotting-logged')
                  ?.questions.some((q) => q.id === 'spot-more-than-yesterday') && (
                  <div class="field">
                    <span class="field-label">Is it more than yesterday?</span>
                    <div class="chip-group">
                      <button
                        type="button"
                        class="chip"
                        onClick={() => void patchLog({ flow: 'light' })}
                      >
                        Yes (set to light flow)
                      </button>
                      <button
                        type="button"
                        class="chip"
                        aria-pressed={true}
                        onClick={() => void patchLog({ flow: 'spotting' })}
                      >
                        No (stays spotting)
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}

            {(current.flow === 'medium' || current.flow === 'heavy') && (
              <>
                <div class="field">
                  <span class="field-label">How often are you changing a pad or tampon?</span>
                  <div class="chip-group">
                    <button
                      type="button"
                      class="chip"
                      aria-pressed={current.soakedPerHour === true}
                      onClick={() =>
                        void patchLog({
                          soakedPerHour: !current.soakedPerHour,
                          changeEvery: !current.soakedPerHour ? 'under-2h' : current.changeEvery,
                        })
                      }
                    >
                      Every hour for 2+ hours
                    </button>
                    {(
                      [
                        { value: 'under-2h', label: 'Every 1 to 2 hours' },
                        { value: '2-3h', label: 'Every 2 to 3 hours' },
                        { value: 'over-3h', label: 'Less often' },
                      ] as const
                    ).map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        class="chip"
                        aria-pressed={current.changeEvery === opt.value && !current.soakedPerHour}
                        onClick={() =>
                          void patchLog({
                            changeEvery: opt.value,
                            soakedPerHour: false,
                          })
                        }
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div class="field">
                  <span class="field-label">Clots and leaks</span>
                  <div class="chip-group">
                    {(['none', 'small', 'large'] as Clots[]).map((clot) => (
                      <button
                        key={clot}
                        type="button"
                        class="chip"
                        aria-pressed={current.clots === clot}
                        onClick={() => void patchLog({ clots: clot })}
                      >
                        {clot === 'none'
                          ? 'No clots'
                          : clot === 'small'
                            ? 'Small clots'
                            : 'Clots bigger than a coin'}
                      </button>
                    ))}
                    <button
                      type="button"
                      class="chip"
                      aria-pressed={current.flooding === true}
                      onClick={() => void patchLog({ flooding: !current.flooding })}
                    >
                      Flooding
                    </button>
                    <button
                      type="button"
                      class="chip"
                      aria-pressed={current.doubleProtection === true}
                      onClick={() => void patchLog({ doubleProtection: !current.doubleProtection })}
                    >
                      Two products at once
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </section>

      <section class="card" aria-label="Warning signs">
        <h2 class="card-title">Warning signs check</h2>
        <p class="muted" style={{ marginTop: 0 }}>
          {dangerTriggered
            ? 'Based on what you logged today, check "Any of these right now?" below.'
            : 'Open this any time you feel unwell or want to log a warning sign.'}
        </p>

        {current.danger.length > 0 && (
          <div class="notice-banner" style={{ borderColor: 'var(--level-red)' }}>
            <p style={{ marginTop: 0 }}>
              Selected: <strong>{dangerLabels.join(', ')}</strong>. If you feel very unwell now,
              open Get help.
            </p>
            <button type="button" class="btn btn-danger-solid" onClick={onOpenGetHelp}>
              Open Get help
            </button>
          </div>
        )}

        <div class="btn-row">
          <button
            type="button"
            class={dangerTriggered && !current.dangerAnswered ? 'btn btn-lamp' : 'btn'}
            onClick={() => setDangerOpen(true)}
          >
            Any of these right now?
          </button>
          <span class="muted">
            {current.dangerAnswered
              ? current.danger.length === 0
                ? 'Answered: None of these'
                : `Answered: ${current.danger.length} selected`
              : 'Not answered yet'}
          </span>
        </div>
      </section>

      <section class="card" aria-label="Pain">
        <div class="btn-row" style={{ justifyContent: 'space-between' }}>
          <h2 class="card-title" style={{ margin: 0 }}>
            Pain
          </h2>
          <span class="tabular" style={{ fontWeight: 700 }}>
            {current.pain ? `${current.pain.level} / 10` : 'Not answered'}
          </span>
        </div>

        <div class="chip-group" style={{ marginBlock: '10px' }}>
          {[
            { label: 'None (0)', val: 0 },
            { label: 'Mild (2)', val: 2 },
            { label: 'Strong (5)', val: 5 },
            { label: 'Severe (8)', val: 8 },
          ].map((stop) => (
            <button
              key={stop.val}
              type="button"
              class="chip"
              aria-pressed={current.pain !== undefined && painLevel === stop.val}
              onClick={() => handlePainLevel(stop.val)}
            >
              {stop.label}
            </button>
          ))}
        </div>

        <div class="field">
          <label htmlFor="pain-slider">Exact pain level (0 to 10)</label>
          <input
            id="pain-slider"
            type="range"
            min="0"
            max="10"
            step="1"
            value={painLevel}
            onInput={(e) => handlePainLevel(Number((e.target as HTMLInputElement).value))}
            style={{ width: '100%', minHeight: '48px' }}
          />
        </div>

        {current.pain && painLevel > 0 && (
          <>
            <div class="field">
              <span class="field-label">Where is the pain?</span>
              <div class="chip-group">
                {PAIN_SITES.map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    class="chip"
                    aria-pressed={painSites.includes(s.key)}
                    onClick={() => togglePainSite(s.key)}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            <div class="chip-group" style={{ marginBottom: '12px' }}>
              <button
                type="button"
                class="chip"
                aria-pressed={current.pain.sudden === true}
                onClick={() =>
                  void patchLog({
                    pain: {
                      ...current.pain,
                      level: painLevel,
                      sites: painSites,
                      sudden: !current.pain?.sudden,
                    },
                  })
                }
              >
                Started suddenly
              </button>
              <button
                type="button"
                class="chip"
                aria-pressed={current.pain.stoppedActivities === true}
                onClick={() =>
                  void patchLog({
                    pain: {
                      ...current.pain,
                      level: painLevel,
                      sites: painSites,
                      stoppedActivities: !current.pain?.stoppedActivities,
                    },
                  })
                }
              >
                Stopped daily activities
              </button>
            </div>

            {painLevel >= 8 && (
              <div class="field">
                <span class="field-label">Has pain medicine helped?</span>
                <div class="chip-group">
                  {(
                    [
                      { value: 'yes', label: 'Yes' },
                      { value: 'no', label: 'No' },
                      { value: 'none-taken', label: 'I have not taken any' },
                      { value: 'unsure', label: 'Not sure' },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      class="chip"
                      aria-pressed={current.pain?.reliefHelped === opt.value}
                      onClick={() =>
                        void patchLog({
                          pain: {
                            ...current.pain,
                            level: painLevel,
                            sites: painSites,
                            reliefHelped: opt.value,
                          },
                        })
                      }
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </section>

      {needsPregnancyQuestion && (
        <section class="card" aria-label="Pregnancy question">
          <h2 class="card-title">Is there any chance you could be pregnant?</h2>
          <div class="chip-group">
            {(
              [
                { value: 'yes', label: 'Yes' },
                { value: 'no', label: 'No' },
                { value: 'prefer-not-to-say', label: 'Prefer not to say' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.value}
                type="button"
                class="chip"
                aria-pressed={current.pregnancyChance === opt.value}
                onClick={() => void patchLog({ pregnancyChance: opt.value })}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </section>
      )}

      {activeFlowIds.has('many-days-no-period') && (
        <section class="card" aria-label="No period yet check">
          <h2 class="card-title">No period yet. Has anything changed lately?</h2>
          <div class="chip-group">
            {(
              [
                { key: 'illness', label: 'Illness' },
                { key: 'travel', label: 'Travel' },
                { key: 'weightChange', label: 'Weight change' },
                { key: 'medicationChange', label: 'New medicine' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.key}
                type="button"
                class="chip"
                aria-pressed={current.context?.[opt.key] === true}
                onClick={() =>
                  void patchLog({
                    context: {
                      ...current.context,
                      [opt.key]: !current.context?.[opt.key],
                    },
                  })
                }
              >
                {opt.label}
              </button>
            ))}
            <button
              type="button"
              class="chip"
              aria-pressed={current.context?.stress === 3}
              onClick={() =>
                void patchLog({
                  context: {
                    ...current.context,
                    stress: current.context?.stress === 3 ? undefined : 3,
                  },
                })
              }
            >
              Stress
            </button>
          </div>
        </section>
      )}

      <section class="card" aria-label="Medicines today">
        <div class="btn-row" style={{ justifyContent: 'space-between', marginBottom: '8px' }}>
          <h2 class="card-title" style={{ margin: 0 }}>
            Medicines
          </h2>
          <button type="button" class="btn btn-primary btn-small" onClick={() => setMedicineOpen(true)}>
            Add medicine
          </button>
        </div>

        {dayMedicineGroups.length === 0 ? (
          <p class="muted" style={{ margin: 0 }}>
            No as-needed medicines logged for {selectedDate}.
          </p>
        ) : (
          <div>
            {dayMedicineGroups.map((group) => (
              <div key={group.key} style={{ marginBottom: '8px' }}>
                <p style={{ margin: 0 }}>
                  Today: {group.genericName ?? group.shownNames.join(', ')}, {group.doseCount}{' '}
                  {group.doseCount === 1 ? 'dose' : 'doses'}
                  {group.totalMg > 0 ? `, ${group.totalMg} mg from the strengths you entered` : ''}
                  {group.dosesWithoutStrength > 0
                    ? ` (${group.dosesWithoutStrength} strength not given)`
                    : ''}
                  . Check the pack for the daily limit.
                </p>
                {group.sameMedicineFlag && (
                  <p class="muted" style={{ margin: '2px 0 0 0' }}>
                    Same medicine: {group.shownNames.join(' and ')} are both {group.genericName}.
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section class="card" aria-label="Symptoms and notes">
        <h2 class="card-title">Symptoms</h2>
        <div class="chip-group" style={{ marginBottom: '14px' }}>
          {SYMPTOM_CATALOGUE.map((sym) => (
            <button
              key={sym.key}
              type="button"
              class="chip"
              aria-pressed={current.symptoms.includes(sym.key)}
              onClick={() => toggleSymptom(sym.key)}
            >
              {sym.defaultLabel}
            </button>
          ))}
        </div>

        <div class="field">
          <span class="field-label">Discharge (optional)</span>
          <div class="chip-group">
            {(['none', 'clear', 'white', 'yellow-green', 'brown', 'odour', 'other'] as const).map(
              (d) => (
                <button
                  key={d}
                  type="button"
                  class="chip"
                  aria-pressed={current.discharge === d}
                  onClick={() => void patchLog({ discharge: current.discharge === d ? undefined : d })}
                >
                  {d}
                </button>
              ),
            )}
          </div>
        </div>

        <div class="field">
          <span class="field-label">Blood seen in stool (optional)</span>
          <div class="chip-group">
            {(
              [
                { value: 'none', label: 'None' },
                { value: 'period', label: 'Period' },
                { value: 'back-passage', label: 'Back passage' },
                { value: 'unsure', label: 'Not sure' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.value}
                type="button"
                class="chip"
                aria-pressed={current.stoolBlood === opt.value}
                onClick={() =>
                  void patchLog({
                    stoolBlood: current.stoolBlood === opt.value ? undefined : opt.value,
                  })
                }
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {sexualAllowed && (
          <>
            <div class="field">
              <span class="field-label">Pregnancy test today (optional)</span>
              <div class="chip-group">
                {(['negative', 'positive', 'unclear'] as const).map((res) => (
                  <button
                    key={res}
                    type="button"
                    class="chip"
                    aria-pressed={current.test?.result === res}
                    onClick={() =>
                      void patchLog({
                        test:
                          current.test?.result === res
                            ? undefined
                            : { kind: 'pregnancy', result: res },
                      })
                    }
                  >
                    {res}
                  </button>
                ))}
              </div>
            </div>

            <div class="field">
              <span class="field-label">Intimacy today (adult optional)</span>
              <div class="chip-group">
                {(['protected', 'unprotected', 'unsure'] as const).map((ev) => (
                  <button
                    key={ev}
                    type="button"
                    class="chip"
                    aria-pressed={current.intimacy?.event === ev}
                    onClick={() =>
                      void patchLog({
                        intimacy:
                          current.intimacy?.event === ev
                            ? undefined
                            : {
                                event: ev,
                                bleedingAfter: current.intimacy?.bleedingAfter,
                                painDuring: current.intimacy?.painDuring,
                              },
                      })
                    }
                  >
                    {ev}
                  </button>
                ))}
                {current.intimacy && (
                  <>
                    <button
                      type="button"
                      class="chip"
                      aria-pressed={current.intimacy.bleedingAfter === true}
                      onClick={() =>
                        void patchLog({
                          intimacy: {
                            event: current.intimacy?.event ?? 'protected',
                            bleedingAfter: !current.intimacy?.bleedingAfter,
                            painDuring: current.intimacy?.painDuring,
                          },
                        })
                      }
                    >
                      Bleeding after
                    </button>
                    <button
                      type="button"
                      class="chip"
                      aria-pressed={current.intimacy.painDuring === true}
                      onClick={() =>
                        void patchLog({
                          intimacy: {
                            event: current.intimacy?.event ?? 'protected',
                            bleedingAfter: current.intimacy?.bleedingAfter,
                            painDuring: !current.intimacy?.painDuring,
                          },
                        })
                      }
                    >
                      Pain during
                    </button>
                  </>
                )}
              </div>
            </div>
          </>
        )}

        <div class="field" style={{ marginBottom: 0 }}>
          <label htmlFor="day-note-input">Note (for you and your doctor file only)</label>
          <textarea
            id="day-note-input"
            class="textarea"
            value={noteDraft}
            onInput={(e) => setNoteDraft((e.target as HTMLTextAreaElement).value)}
            onBlur={() => {
              if (noteDraft !== current.note) {
                void patchLog({ note: noteDraft });
              }
            }}
            placeholder="Write anything else you want to remember"
          />
          {noteDraft !== current.note && (
            <button
              type="button"
              class="btn btn-small"
              style={{ marginTop: '8px', alignSelf: 'flex-start' }}
              onClick={() => void patchLog({ note: noteDraft })}
            >
              Save note
            </button>
          )}
        </div>
      </section>

      <DangerSignSheet
        key={`${selectedDate}-${dangerOpen}`}
        open={dangerOpen}
        initialDanger={current.danger}
        initialAnswered={Boolean(current.dangerAnswered)}
        initialFever={current.fever}
        showOestrogenSigns={showOestrogenSigns}
        tempUnit={profile.units.temperature}
        onSave={({ danger, dangerAnswered, fever }) =>
          void patchLog({ danger: danger as DangerSign[], dangerAnswered, fever })
        }
        onOpenGetHelp={() => {
          setDangerOpen(false);
          onOpenGetHelp();
        }}
        onClose={() => setDangerOpen(false)}
      />

      <MedicineSheet
        key={`${selectedDate}-${medicineOpen}`}
        open={medicineOpen}
        date={selectedDate}
        nowIso={nowIso}
        lastDose={lastDose}
        onSave={(entry) => void onSaveMedicine(entry)}
        onClose={() => setMedicineOpen(false)}
      />
    </div>
  );
}
