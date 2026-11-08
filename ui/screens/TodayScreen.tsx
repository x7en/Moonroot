import { useEffect, useState } from 'preact/hooks';
import { makeEmptyDayLog } from '../../app/store';
import { groupMedicinesForDay } from '../../core/medicine/totals';
import { DANGER_SIGN_CATALOGUE, SYMPTOM_CATALOGUE } from '../../core/model/catalogues';
import { isAdultSexualHealthAllowed, mayContainOestrogen } from '../../core/model/dates';
import type {
  Clots,
  DangerSign,
  DateKey,
  DayLog,
  Flow,
  MedicineEntry,
  PainSite,
  Profile,
  Protection,
  Stamp,
  SymptomKey,
} from '../../core/model/types';
import { DangerSignSheet } from '../components/DangerSignSheet';
import { FLOW_OPTIONS, FlowGlyph } from '../components/FlowGlyphs';
import { MedicineSheet } from '../components/MedicineSheet';

interface TodayScreenProps {
  today: DateKey;
  selectedDate: DateKey;
  nowIso: Stamp;
  profile: Profile;
  dayLog: DayLog | null;
  medicines: readonly MedicineEntry[];
  onChangeDate: (date: DateKey) => void;
  onSaveDayLog: (log: DayLog) => Promise<void>;
  onSaveMedicine: (entry: MedicineEntry) => Promise<void>;
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

export function TodayScreen({
  today,
  selectedDate,
  nowIso,
  profile,
  dayLog,
  medicines,
  onChangeDate,
  onSaveDayLog,
  onSaveMedicine,
  onOpenGetHelp,
}: TodayScreenProps) {
  const [dangerOpen, setDangerOpen] = useState(false);
  const [medicineOpen, setMedicineOpen] = useState(false);

  const current: DayLog = dayLog ?? makeEmptyDayLog(selectedDate, nowIso);
  const [noteDraft, setNoteDraft] = useState<string>(current.note);

  useEffect(() => {
    setNoteDraft(dayLog?.note ?? '');
  }, [selectedDate, dayLog?.note]);
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

  async function patchLog(patch: Partial<DayLog>): Promise<void> {
    const next: DayLog = {
      ...current,
      ...patch,
      date: selectedDate,
      filledFrom:
        current.filledFrom === 'approximate'
          ? 'approximate'
          : selectedDate === today
            ? 'live'
            : 'backfill',
      updatedAt: nowIso,
    };
    await onSaveDayLog(next);
  }

  function handleFlowTap(flow: Flow): void {
    void patchLog({ flow });
  }

  function handlePainLevel(level: number): void {
    void patchLog({
      pain: {
        ...current.pain,
        level,
        sites: current.pain?.sites ?? [],
      },
    });
  }

  function togglePainSite(site: PainSite): void {
    const nextSites = painSites.includes(site)
      ? painSites.filter((s) => s !== site)
      : [...painSites, site];
    void patchLog({
      pain: {
        level: painLevel,
        ...current.pain,
        sites: nextSites,
      },
    });
  }

  function toggleSymptom(key: SymptomKey): void {
    const next = current.symptoms.includes(key)
      ? current.symptoms.filter((s) => s !== key)
      : [...current.symptoms, key];
    void patchLog({ symptoms: next });
  }

  const dangerLabels = current.danger.map(
    (k) => DANGER_SIGN_CATALOGUE.find((item) => item.key === k)?.defaultLabel ?? k,
  );

  return (
    <div>
      <div class="notice-banner" role="status">
        <strong>Records only:</strong> This Step 1 version records your entries only. Warning checks
        start in Step 2.
      </div>

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

            {(current.flow === 'medium' || current.flow === 'heavy') && (
              <>
                <div class="field">
                  <span class="field-label">How often changing product?</span>
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
              Selected: <strong>{dangerLabels.join(', ')}</strong>. You selected a warning sign. If
              you feel very unwell now, open Get help. Full warning checks arrive in the next
              version.
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
                    pain: { ...current.pain, level: painLevel, sites: painSites, sudden: !current.pain?.sudden },
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

        {sexualAllowed && (
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
